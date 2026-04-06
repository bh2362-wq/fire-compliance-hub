import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface JobInput {
  visit_type: string;
  notes: string | null;
  visit_date: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { jobs, siteName, siteAddress } = (await req.json()) as {
      jobs: JobInput[];
      siteName: string;
      siteAddress?: string;
    };

    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({ error: "No jobs provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const jobDescriptions = jobs
      .map((j, i) => `Job ${i + 1}: Type: ${j.visit_type}, Date: ${j.visit_date}, Description: ${j.notes || "No description provided"}`)
      .join("\n");

    const systemPrompt = `You are an expert fire and security safety engineer producing RAMS (Risk Assessment and Method Statement) documents compliant with UK Health & Safety regulations including CDM 2015 and BS standards.

Given a list of jobs/visits for a site, produce a comprehensive combined RAMS document covering ALL the work described.

Return ONLY valid JSON with this exact structure:
{
  "title": "Brief RAMS title covering all work",
  "hazards": [
    {
      "id": "<unique-uuid>",
      "hazard": "Description of hazard",
      "who_affected": "Who is at risk",
      "existing_controls": "Current controls in place",
      "likelihood": 2,
      "severity": 3,
      "risk_level": "Medium",
      "additional_controls": "Extra measures to reduce risk",
      "residual_likelihood": 1,
      "residual_severity": 2,
      "residual_risk": "Low"
    }
  ],
  "method_statements": [
    {
      "step_number": 1,
      "description": "Detailed step description",
      "responsible_person": "Role responsible",
      "equipment_required": "Tools/equipment needed"
    }
  ],
  "ppe_requirements": ["Safety Boots", "Hard Hat", "Hi-Vis Vest", ...],
  "emergency_procedures": "Emergency procedures text",
  "site_specific_hazards": "Site-specific hazards text"
}

RULES:
- Likelihood and severity are 1-5 scale. Risk levels: 1-4=Low, 5-9=Medium, 10-15=High, 16-25=Very High
- Residual risk should always be lower than initial risk
- Include ALL relevant hazards for the types of work described (electrical, working at height, manual handling, etc.)
- Method statements should be practical step-by-step instructions covering all jobs
- PPE must match the work types. Choose from: Safety Boots, Hard Hat, Hi-Vis Vest, Safety Glasses, Ear Protection, Dust Mask, Gloves, Face Shield, Fall Protection Harness, Knee Pads
- Use proper UK fire safety and H&S terminology
- Be thorough but practical - this is a real working document
- Generate unique UUIDs for each hazard id`;

    const userPrompt = `Generate a combined RAMS document for the following jobs at ${siteName}${siteAddress ? `, ${siteAddress}` : ""}:

${jobDescriptions}`;

    const response = await fetch("https://api.lovable.dev/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI API error: ${response.status} - ${errorText}`);
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content returned from AI");
    }

    const ramsData = JSON.parse(content);

    return new Response(JSON.stringify(ramsData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("RAMS generation error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to generate RAMS" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
