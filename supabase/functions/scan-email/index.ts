// scan-email — rewritten to use Anthropic directly (no Lovable gateway dependency)
// Supports PDF attachments passed as base64 from the inbox browser

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PdfAttachment {
  name: string;
  contentBytes: string; // base64
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { emailContent, mode, pdfAttachments = [] } = await req.json() as {
      emailContent: string;
      mode: "quote" | "visit" | "bulk_visits";
      pdfAttachments?: PdfAttachment[];
    };

    if (!emailContent || typeof emailContent !== "string" || emailContent.length > 200000) {
      return err("Invalid email content", 400);
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) return err("ANTHROPIC_API_KEY not configured", 500);

    // ── System prompts (unchanged from original) ──────────────────────────────

    const systemPrompt = mode === "bulk_visits"
      ? `You are an AI assistant for a fire safety engineering company. Analyse the email which contains MULTIPLE jobs/visits for the same customer. Extract:
- company_name: The customer/company name
- contact_name: Main contact person
- contact_email: Contact email
- contact_phone: Contact phone
- visits: An array of individual visit objects, each containing:
  - site_name: The site or building name
  - site_address: Full address of the site
  - site_city: City
  - site_postcode: Postcode
  - visit_date: The date for this visit (YYYY-MM-DD format)
  - visit_type: One of: quarterly_service, biannual_service, annual_inspection, emergency, remedial, supply_only
  - description: What work is needed at this visit
  - notes: Any additional notes

CRITICAL RULES:
- Every single line item, job, or piece of work mentioned MUST be its own separate visit entry.
- If the email lists 10 jobs, return 10 visit entries. Never merge jobs.
- Do not summarise or group entries. Extract every single one individually.
Return ONLY valid JSON. Use null for unknown fields. visits must always be an array.`

      : mode === "visit"
      ? `You are an AI assistant for a fire safety engineering company. Analyse the email and extract structured data to create a site visit. Extract:
- sender_name, sender_email, company_name, contact_name, contact_phone, contact_email
- site_name, site_address, site_city, site_postcode
- visit_type: one of: quarterly_service, biannual_service, annual_inspection, emergency, remedial, supply_only
- urgency: low, medium, or high
- preferred_date: any date mentioned (YYYY-MM-DD)
- client_po_number: the client's PO/order number authorising the work (NOT a contract or site reference)
- description: summary of what work is needed
- notes: additional notes or context
Return ONLY valid JSON. Use null for unknown fields.`

      : `You are an AI assistant for a fire safety engineering company. Analyse the email and any attached documents to extract structured data for a quotation. If a PDF is attached, read it carefully — it may contain device lists, schedules of quantities, or scope of works.

Extract:
- sender_name, sender_email, company_name, contact_name, contact_phone, contact_email
- site_name, site_address, site_city, site_postcode
- scope_summary: professional summary of the full scope of works
- job_requirements: array of { description, estimated_quantity, unit } for EVERY line item or device type identified. Be specific — if the document lists "12 x optical detectors" and "4 x VADs" those are two separate entries. Extract ALL items.
- special_requirements: special access, working hours, or equipment
- rams_considerations: health and safety considerations
- urgency: low, medium, or high
- preferred_date: any dates or deadlines mentioned (YYYY-MM-DD)
- notes: any additional context

Return ONLY valid JSON. Use null for unknown fields. job_requirements must always be an array.`;

    // ── Build message content (email + optional PDFs) ──────────────────────────

    const userText = `Please analyse this email${pdfAttachments.length > 0 ? ` and the ${pdfAttachments.length} attached document${pdfAttachments.length > 1 ? "s" : ""}` : ""} and extract the relevant information:\n\n${emailContent}`;

    // Content array: text first, then PDF documents
    type ContentBlock =
      | { type: "text"; text: string }
      | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string }; title?: string };

    const content: ContentBlock[] = [{ type: "text", text: userText }];

    for (const pdf of pdfAttachments) {
      if (!pdf.contentBytes) continue;
      // Strip data URI prefix if present
      const b64 = pdf.contentBytes.includes(",") ? pdf.contentBytes.split(",")[1] : pdf.contentBytes;
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: b64 },
        title: pdf.name,
      });
    }

    // ── Call Anthropic ─────────────────────────────────────────────────────────

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      if (response.status === 429) return err("Rate limit — try again shortly", 429);
      if (response.status === 401) return err("Invalid Anthropic API key", 401);
      console.error("Anthropic error:", response.status, errText);
      return err(`Claude API error: ${errText.slice(0, 200)}`, 500);
    }

    const aiData = await response.json();
    const rawText: string = aiData.content
      ?.filter((c: { type: string }) => c.type === "text")
      ?.map((c: { text: string }) => c.text)
      ?.join("\n")
      ?.trim() || "";

    if (!rawText) return err("No response from AI", 500);

    // ── Parse JSON from response ───────────────────────────────────────────────

    let extracted: unknown;
    try {
      // Try direct parse first
      const codeBlock = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = codeBlock ? codeBlock[1].trim() : rawText;
      extracted = JSON.parse(jsonStr);
    } catch {
      // Fallback: find JSON object in the text
      const match = rawText.match(/\{[\s\S]*\}/);
      if (!match) return err("Could not extract JSON from AI response", 422);
      try {
        extracted = JSON.parse(match[0]);
      } catch {
        return err("AI returned malformed JSON", 422);
      }
    }

    return new Response(
      JSON.stringify({ success: true, data: extracted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("scan-email error:", msg);
    return err(msg, 500);
  }
});

function err(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
