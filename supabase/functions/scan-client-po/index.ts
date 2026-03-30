const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const contentType = req.headers.get("content-type") || "";
    let fileText = "";
    let fileName = "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      if (!file) throw new Error("No file provided");
      fileName = file.name;

      // For PDFs, read as text (AI will handle extraction from the raw content)
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      
      // Convert to base64 for AI processing
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      fileText = btoa(binary);
    } else {
      const body = await req.json();
      fileText = body.text || "";
      fileName = body.fileName || "unknown";
    }

    if (!fileText) {
      return new Response(JSON.stringify({ error: "No content to process" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are an expert at extracting structured data from purchase orders (POs) sent by clients/customers.

Extract the following fields from the purchase order content. If a field cannot be found, return null for that field.

Return a JSON object using the tool provided with these fields:
- customer_name: The company/client who issued the PO
- site_address: The site/location where work is to be carried out
- site_name: A short name for the site (building name, etc.)
- po_number: The client's purchase order number/reference
- scope_of_work: Description of the work to be done (combine all line items into a comprehensive description)
- visit_type: Best match from: quarterly_service, biannual_service, annual_inspection, emergency, remedial, supply_only (default to 'remedial' if unclear)
- contact_name: Person who raised the PO
- contact_email: Email from the PO
- contact_phone: Phone number from the PO
- special_instructions: Any special access, safety, or scheduling requirements
- asset_descriptions: Array of equipment/assets mentioned. The "type" MUST be one of: fire, aspirator, gas_suppression, room_integrity, fire_curtain, disabled_refuge, emergency_lighting, intruder_alarm, nurse_call. (e.g. [{name: "Fire Alarm Panel", type: "fire", manufacturer: "Advanced", model: "MxPro 5"}])
- frequency: Service frequency if mentioned. Must be one of: 1m (monthly), 3m (quarterly), 6m (bi-annual), 12m (annual). Default null if not clear.
- estimated_value: Total value/amount on the PO if visible (number or null)`;

    const isPdf = fileName.toLowerCase().endsWith(".pdf");

    const messages: any[] = [
      { role: "system", content: systemPrompt },
    ];

    if (isPdf) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: `Extract all purchase order details from this PDF document named "${fileName}". Parse every field you can find.` },
          {
            type: "image_url",
            image_url: { url: `data:application/pdf;base64,${fileText}` },
          },
        ],
      });
    } else {
      // For text-based content
      const decodedText = atob(fileText);
      messages.push({
        role: "user",
        content: `Extract all purchase order details from this document named "${fileName}":\n\n${decodedText}`,
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        tools: [
          {
            type: "function",
            function: {
              name: "extract_po_data",
              description: "Extract structured purchase order data",
              parameters: {
                type: "object",
                properties: {
                  customer_name: { type: "string", nullable: true },
                  site_address: { type: "string", nullable: true },
                  site_name: { type: "string", nullable: true },
                  po_number: { type: "string", nullable: true },
                  scope_of_work: { type: "string", nullable: true },
                  visit_type: {
                    type: "string",
                    enum: ["quarterly_service", "biannual_service", "annual_inspection", "emergency", "remedial", "supply_only"],
                  },
                  contact_name: { type: "string", nullable: true },
                  contact_email: { type: "string", nullable: true },
                  contact_phone: { type: "string", nullable: true },
                  special_instructions: { type: "string", nullable: true },
                  asset_descriptions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        type: { type: "string", enum: ["fire", "aspirator", "gas_suppression", "room_integrity", "fire_curtain", "disabled_refuge", "emergency_lighting", "intruder_alarm", "nurse_call"] },
                        manufacturer: { type: "string", nullable: true },
                        model: { type: "string", nullable: true },
                      },
                      required: ["name", "type"],
                    },
                  },
                  frequency: { type: "string", enum: ["1m", "3m", "6m", "12m"], nullable: true },
                  estimated_value: { type: "number", nullable: true },
                },
                required: ["customer_name", "po_number", "scope_of_work", "visit_type"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_po_data" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits required. Please add credits in Settings." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI processing failed (${response.status})`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      throw new Error("AI failed to extract PO data");
    }

    const extractedData = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ success: true, data: extractedData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("scan-client-po error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
