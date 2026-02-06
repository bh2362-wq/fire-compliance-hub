import { supabase } from "@/integrations/supabase/client";

export interface FullAnalysisResult {
  company_number: string;
  company_name: string;
  company_status: string;
  company_type: string;
  date_of_creation: string | null;
  registered_address: any;
  sic_codes: string[];
  accounts_overdue: boolean;
  accounts_next_due: string | null;
  accounts_last_made_up: string | null;
  confirmation_statement_overdue: boolean;
  confirmation_statement_next_due: string | null;
  has_charges: boolean;
  has_insolvency_history: boolean;
  officers: any[];
  filing_history: any[];
  risk_level: string;
  risk_factors: string[];
  positive_factors: string[];
  checked_at: string;
  full_analysis: {
    account_analysis: {
      yearlyAccounts: Array<{
        year: string;
        accountType: string;
        isLate: boolean;
        filings: any[];
      }>;
      typeProgression: string[];
      lateFilingYears: string[];
      totalAccountFilings: number;
      latestAccountType: string;
      sizeIndicator: string;
      hasGrown: boolean;
    };
    categorized_filings: {
      accounts: any[];
      confirmation_statements: any[];
      annual_returns: any[];
      other: any[];
    };
    charges: Array<{
      status: string;
      created_on: string | null;
      delivered_on: string | null;
      satisfied_on: string | null;
      description: string;
    }>;
    total_filings: number;
    officer_count: {
      active: number;
      resigned: number;
      total: number;
    };
  };
}

export async function runFullAnalysis(
  companyNumber: string,
  customerId?: string
): Promise<FullAnalysisResult> {
  const { data, error } = await supabase.functions.invoke("companies-house", {
    body: { action: "full-analysis", company_number: companyNumber, customer_id: customerId },
  });

  if (error) throw new Error(error.message);
  if (data.error) throw new Error(data.error);
  return data;
}

export async function generateAIAnalysis(
  companiesHouseData: FullAnalysisResult,
  xeroData?: any,
  customerName?: string
): Promise<string> {
  const { data, error } = await supabase.functions.invoke("analyze-customer-intelligence", {
    body: { companiesHouseData, xeroData, customerName },
  });

  if (error) throw new Error(error.message);
  if (data.error) throw new Error(data.error);
  return data.analysis;
}

export async function saveSharedReport(
  customerId: string,
  reportData: any,
  generatedBy: string
): Promise<{ shareToken: string; id: string }> {
  const { data, error } = await supabase
    .from("customer_intelligence_reports")
    .insert({
      customer_id: customerId,
      report_data: reportData,
      generated_by: generatedBy,
    })
    .select("id, share_token")
    .single();

  if (error) throw new Error(error.message);
  return { shareToken: data.share_token, id: data.id };
}

export async function getSharedReport(shareToken: string) {
  const { data, error } = await supabase
    .from("customer_intelligence_reports")
    .select("*")
    .eq("share_token", shareToken)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}
