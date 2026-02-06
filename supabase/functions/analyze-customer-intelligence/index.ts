import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) throw new Error("Unauthorized");

    const { companiesHouseData, xeroData, customerName } = await req.json();

    if (!companiesHouseData) {
      throw new Error("Companies House data is required");
    }

    console.log(`Generating AI analysis for: ${customerName}`);

    // Build the prompt
    const prompt = buildAnalysisPrompt(companiesHouseData, xeroData, customerName);

    // Call Lovable AI Gateway
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a UK business credit analyst. Provide concise, professional financial analysis. 
Use plain English suitable for a business owner assessing whether to extend credit to a customer.
Structure your response with clear sections using headers.
Do NOT use markdown formatting - use plain text only.
Keep each section brief (2-4 sentences).
Focus on actionable insights and comparisons to typical UK companies of similar age and type.`,
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI Gateway error:", errText);
      throw new Error("Failed to generate AI analysis");
    }

    const aiResult = await aiResponse.json();
    const analysis = aiResult.choices?.[0]?.message?.content || "Unable to generate analysis.";

    console.log("AI analysis generated successfully");

    return new Response(
      JSON.stringify({ analysis }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in analyze-customer-intelligence:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: error.message === "Unauthorized" ? 401 : 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

function buildAnalysisPrompt(ch: any, xero: any, name: string): string {
  const analysis = ch.full_analysis || {};
  const accountAnalysis = analysis.account_analysis || {};

  let prompt = `Analyze the financial standing of "${name}" (Company No: ${ch.company_number}).

COMPANIES HOUSE DATA:
- Status: ${ch.company_status}
- Type: ${ch.company_type}
- Incorporated: ${ch.date_of_creation || "Unknown"}
- SIC Codes: ${(ch.sic_codes || []).join(", ") || "None"}
- Risk Level: ${ch.risk_level}
- Risk Factors: ${(ch.risk_factors || []).join("; ") || "None"}
- Positive Factors: ${(ch.positive_factors || []).join("; ") || "None"}

ACCOUNTS FILING HISTORY:
- Total account filings: ${accountAnalysis.totalAccountFilings || 0}
- Latest account type: ${accountAnalysis.latestAccountType || "Unknown"}
- Company size indicator: ${accountAnalysis.sizeIndicator || "Unknown"}
- Late filing years: ${(accountAnalysis.lateFilingYears || []).join(", ") || "None"}
- Has shown growth: ${accountAnalysis.hasGrown ? "Yes" : "No"}
`;

  // Add yearly breakdown
  if (accountAnalysis.yearlyAccounts?.length > 0) {
    prompt += "\nYEARLY ACCOUNTS BREAKDOWN:\n";
    accountAnalysis.yearlyAccounts.slice(0, 10).forEach((y: any) => {
      prompt += `- ${y.year}: ${y.accountType} accounts${y.isLate ? " (LATE)" : ""}\n`;
    });
  }

  // Charges
  if (analysis.charges?.length > 0) {
    prompt += `\nCHARGES/MORTGAGES: ${analysis.charges.length} registered\n`;
    analysis.charges.forEach((c: any) => {
      prompt += `- ${c.status}: ${c.description} (created: ${c.created_on || "unknown"})\n`;
    });
  }

  // Officers
  if (analysis.officer_count) {
    prompt += `\nOFFICERS: ${analysis.officer_count.active} active, ${analysis.officer_count.resigned} resigned\n`;
  }

  // Add Xero data if available
  if (xero) {
    prompt += `\nPAYMENT DATA (from your invoicing system):
- Outstanding invoices: ${xero.invoiceCount || 0}
- Total outstanding: £${(xero.totalOutstanding || 0).toFixed(2)}
- Total overdue: £${(xero.totalOverdue || 0).toFixed(2)}
- Overdue invoices: ${xero.overdueCount || 0}
- Average days to pay: ${xero.averageDaysToPayEstimate || "N/A"}
- Payment trend: ${xero.paymentTrend || "N/A"}
`;
  }

  prompt += `\nPlease provide:
1. EXECUTIVE SUMMARY - One paragraph overview of this company's financial health
2. FILING ANALYSIS - What their account types and filing patterns tell us about company size and growth
3. PEER COMPARISON - How this company compares to typical UK ${ch.company_type || "limited"} companies of ${ch.date_of_creation ? "this age" : "similar standing"}
4. CREDIT RECOMMENDATION - Whether to extend credit and any suggested limits or terms
5. KEY WATCHPOINTS - Top 3 things to monitor going forward`;

  return prompt;
}

serve(handler);
