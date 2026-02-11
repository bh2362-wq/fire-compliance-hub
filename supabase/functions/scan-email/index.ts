import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { emailContent, mode } = await req.json();

    if (!emailContent || typeof emailContent !== 'string' || emailContent.length > 50000) {
      return new Response(
        JSON.stringify({ error: 'Invalid email content' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'AI not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = mode === 'visit'
      ? `You are an AI assistant for a fire safety engineering company. Analyse the email and extract structured data to create a site visit. Extract:
- sender_name: The name of the person who sent the email
- sender_email: Their email address
- company_name: The company/customer name
- contact_name: The main contact person mentioned
- contact_phone: Any phone number mentioned
- contact_email: The contact email
- site_name: The site or building name if mentioned
- site_address: Full address of the site if mentioned
- site_city: City
- site_postcode: Postcode
- visit_type: One of: quarterly_service, biannual_service, annual_inspection, emergency, remedial, supply_only
- urgency: low, medium, high
- preferred_date: Any date mentioned for the visit
- description: A summary of what work is needed
- notes: Any additional notes or context

Return ONLY valid JSON with these fields. Use null for any fields you cannot determine.`
      : `You are an AI assistant for a fire safety engineering company. Analyse the email and extract structured data to create a quotation / scope of works. Extract:
- sender_name: The name of the person who sent the email
- sender_email: Their email address  
- company_name: The company/customer name
- contact_name: The main contact person mentioned
- contact_phone: Any phone number mentioned
- contact_email: The contact email
- site_name: The site or building name if mentioned
- site_address: Full address of the site if mentioned
- site_city: City
- site_postcode: Postcode
- scope_summary: A professional summary of the scope of works
- job_requirements: An array of objects with { description: string, estimated_quantity: number, unit: string } for each line item/requirement identified
- special_requirements: Any special access, equipment, or considerations mentioned
- rams_considerations: Health and safety considerations for RAMS (risk assessments)
- urgency: low, medium, high
- preferred_date: Any dates or deadlines mentioned
- notes: Any additional notes or context

Return ONLY valid JSON with these fields. Use null for any fields you cannot determine. For job_requirements, always return an array even if empty.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Please analyse this email and extract the relevant information:\n\n${emailContent}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_email_data",
            description: "Extract structured data from the email",
            parameters: {
              type: "object",
              properties: {
                sender_name: { type: "string", nullable: true },
                sender_email: { type: "string", nullable: true },
                company_name: { type: "string", nullable: true },
                contact_name: { type: "string", nullable: true },
                contact_phone: { type: "string", nullable: true },
                contact_email: { type: "string", nullable: true },
                site_name: { type: "string", nullable: true },
                site_address: { type: "string", nullable: true },
                site_city: { type: "string", nullable: true },
                site_postcode: { type: "string", nullable: true },
                ...(mode === 'visit' ? {
                  visit_type: { type: "string", nullable: true },
                  urgency: { type: "string", nullable: true },
                  preferred_date: { type: "string", nullable: true },
                  description: { type: "string", nullable: true },
                  notes: { type: "string", nullable: true },
                } : {
                  scope_summary: { type: "string", nullable: true },
                  job_requirements: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        description: { type: "string" },
                        estimated_quantity: { type: "number" },
                        unit: { type: "string" },
                      },
                      required: ["description"],
                    },
                  },
                  special_requirements: { type: "string", nullable: true },
                  rams_considerations: { type: "string", nullable: true },
                  urgency: { type: "string", nullable: true },
                  preferred_date: { type: "string", nullable: true },
                  notes: { type: "string", nullable: true },
                }),
              },
              required: ["sender_name"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_email_data" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded, please try again shortly.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits required. Please add funds in Settings.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      return new Response(JSON.stringify({ error: 'AI processing failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    let extracted;
    if (toolCall?.function?.arguments) {
      extracted = typeof toolCall.function.arguments === 'string' 
        ? JSON.parse(toolCall.function.arguments) 
        : toolCall.function.arguments;
    } else {
      // Fallback: try to parse from content
      const content = aiData.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extracted = JSON.parse(jsonMatch[0]);
      } else {
        return new Response(JSON.stringify({ error: 'Could not extract data from email' }), {
          status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ success: true, data: extracted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('scan-email error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
