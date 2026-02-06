import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const COMPANIES_HOUSE_BASE = "https://api.company-information.service.gov.uk";

interface CompaniesHouseRequest {
  action: "search" | "company" | "officers" | "filing-history" | "charges";
  company_number?: string;
  query?: string;
  customer_id?: string;
}

async function chFetch(path: string, apiKey: string) {
  const credentials = btoa(`${apiKey}:`);
  const res = await fetch(`${COMPANIES_HOUSE_BASE}${path}`, {
    headers: { Authorization: `Basic ${credentials}` },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Companies House API error: ${res.status} - ${text}`);
    throw new Error(`Companies House API error: ${res.status}`);
  }

  return res.json();
}

function assessRisk(company: any, officers: any[], filingHistory: any[], charges: any): {
  risk_level: string;
  risk_factors: string[];
} {
  const factors: string[] = [];
  let score = 0;

  // Company status checks
  if (company.company_status !== "active") {
    factors.push(`Company status: ${company.company_status}`);
    score += 3;
  }

  // Accounts overdue
  if (company.accounts?.overdue) {
    factors.push("Accounts are overdue");
    score += 2;
  }

  // Confirmation statement overdue
  if (company.confirmation_statement?.overdue) {
    factors.push("Confirmation statement is overdue");
    score += 1;
  }

  // Has charges (loans/mortgages)
  if (charges?.total_count > 0) {
    const unsatisfied = charges.items?.filter((c: any) =>
      c.status === "outstanding" || c.status === "part-satisfied"
    ).length || 0;
    if (unsatisfied > 0) {
      factors.push(`${unsatisfied} outstanding charge(s) registered`);
      score += 1;
    }
  }

  // Insolvency history
  if (company.has_insolvency_history) {
    factors.push("Company has insolvency history");
    score += 3;
  }

  // Has been liquidated
  if (company.has_been_liquidated) {
    factors.push("Company has been liquidated previously");
    score += 3;
  }

  // Recent officer resignations (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const recentResignations = officers.filter((o) => {
    if (!o.resigned_on) return false;
    return new Date(o.resigned_on) > sixMonthsAgo;
  });
  if (recentResignations.length > 0) {
    factors.push(`${recentResignations.length} officer(s) resigned in last 6 months`);
    score += 1;
  }

  // Late filings
  const lateFilings = filingHistory.filter((f: any) =>
    f.description?.toLowerCase().includes("late")
  );
  if (lateFilings.length > 0) {
    factors.push(`${lateFilings.length} late filing(s) found`);
    score += 1;
  }

  // Company age - newer companies are riskier
  if (company.date_of_creation) {
    const created = new Date(company.date_of_creation);
    const yearsOld = (Date.now() - created.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (yearsOld < 1) {
      factors.push("Company less than 1 year old");
      score += 2;
    } else if (yearsOld < 2) {
      factors.push("Company less than 2 years old");
      score += 1;
    }
  }

  // No positive factors noted
  if (factors.length === 0) {
    factors.push("No risk factors identified");
  }

  let risk_level = "low";
  if (score >= 5) risk_level = "critical";
  else if (score >= 3) risk_level = "high";
  else if (score >= 1) risk_level = "medium";

  return { risk_level, risk_factors: factors };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("COMPANIES_HOUSE_API_KEY");
    if (!apiKey) {
      throw new Error("COMPANIES_HOUSE_API_KEY not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const { action, company_number, query, customer_id }: CompaniesHouseRequest = await req.json();

    console.log(`Companies House request: action=${action}, company_number=${company_number}, query=${query}`);

    if (action === "search") {
      if (!query) throw new Error("Search query is required");

      const data = await chFetch(`/search/companies?q=${encodeURIComponent(query)}&items_per_page=10`, apiKey);

      return new Response(JSON.stringify({ results: data.items || [] }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (action === "company") {
      if (!company_number) throw new Error("Company number is required");

      // Fetch company profile, officers, filing history, and charges in parallel
      const [company, officersData, filingData, chargesData] = await Promise.all([
        chFetch(`/company/${company_number}`, apiKey),
        chFetch(`/company/${company_number}/officers?items_per_page=20`, apiKey).catch(() => ({ items: [] })),
        chFetch(`/company/${company_number}/filing-history?items_per_page=10`, apiKey).catch(() => ({ items: [] })),
        chFetch(`/company/${company_number}/charges`, apiKey).catch(() => ({ items: [], total_count: 0 })),
      ]);

      const officers = officersData.items || [];
      const filingHistory = filingData.items || [];

      // Assess risk
      const { risk_level, risk_factors } = assessRisk(company, officers, filingHistory, chargesData);

      const result = {
        company_number: company.company_number,
        company_name: company.company_name,
        company_status: company.company_status,
        company_type: company.type,
        date_of_creation: company.date_of_creation,
        registered_address: company.registered_office_address || null,
        sic_codes: company.sic_codes || [],
        accounts_overdue: company.accounts?.overdue || false,
        accounts_next_due: company.accounts?.next_due || null,
        accounts_last_made_up: company.accounts?.last_accounts?.made_up_to || null,
        confirmation_statement_overdue: company.confirmation_statement?.overdue || false,
        confirmation_statement_next_due: company.confirmation_statement?.next_due || null,
        has_charges: (chargesData.total_count || 0) > 0,
        has_insolvency_history: company.has_insolvency_history || false,
        officers: officers.slice(0, 10).map((o: any) => ({
          name: o.name,
          role: o.officer_role,
          appointed_on: o.appointed_on,
          resigned_on: o.resigned_on,
          nationality: o.nationality,
        })),
        filing_history: filingHistory.slice(0, 5).map((f: any) => ({
          date: f.date,
          type: f.type,
          description: f.description,
          category: f.category,
        })),
        risk_level,
        risk_factors,
        raw_data: company,
      };

      // If customer_id provided, cache the result
      if (customer_id) {
        console.log(`Caching credit check for customer ${customer_id}`);

        // Update customer's company_number
        await supabase
          .from("customers")
          .update({ company_number })
          .eq("id", customer_id);

        // Upsert credit check (latest per customer)
        const { error: upsertError } = await supabase
          .from("credit_checks")
          .upsert(
            {
              customer_id,
              company_number: result.company_number,
              company_name: result.company_name,
              company_status: result.company_status,
              company_type: result.company_type,
              date_of_creation: result.date_of_creation,
              registered_address: result.registered_address,
              sic_codes: result.sic_codes,
              accounts_overdue: result.accounts_overdue,
              accounts_next_due: result.accounts_next_due,
              accounts_last_made_up: result.accounts_last_made_up,
              confirmation_statement_overdue: result.confirmation_statement_overdue,
              confirmation_statement_next_due: result.confirmation_statement_next_due,
              has_charges: result.has_charges,
              has_insolvency_history: result.has_insolvency_history,
              officers: result.officers,
              filing_history: result.filing_history,
              risk_level: result.risk_level,
              risk_factors: result.risk_factors,
              raw_data: result.raw_data,
              checked_at: new Date().toISOString(),
              checked_by: user.id,
            },
            { onConflict: "customer_id" }
          );

        if (upsertError) {
          console.error("Failed to cache credit check:", upsertError);
          // Don't throw - still return the data
        }
      }

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error: any) {
    console.error("Error in companies-house function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: error.message === "Unauthorized" ? 401 : 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
