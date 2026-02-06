import { supabase } from "@/integrations/supabase/client";

export interface CreditCheck {
  id: string;
  customer_id: string;
  company_number: string;
  company_name: string | null;
  company_status: string | null;
  company_type: string | null;
  date_of_creation: string | null;
  registered_address: Record<string, any> | null;
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
  risk_factors: any[];
  checked_at: string;
  checked_by: string;
  created_at: string;
  updated_at: string;
}

export interface CompanySearchResult {
  company_number: string;
  title: string;
  company_status: string;
  company_type: string;
  date_of_creation: string;
  address_snippet: string;
}

export async function searchCompanies(query: string): Promise<CompanySearchResult[]> {
  const { data, error } = await supabase.functions.invoke("companies-house", {
    body: { action: "search", query },
  });

  if (error) throw new Error(error.message);
  if (data.error) throw new Error(data.error);

  return (data.results || []).map((r: any) => ({
    company_number: r.company_number,
    title: r.title,
    company_status: r.company_status,
    company_type: r.company_type,
    date_of_creation: r.date_of_creation,
    address_snippet: r.address_snippet || "",
  }));
}

export async function runCreditCheck(
  companyNumber: string,
  customerId?: string
): Promise<CreditCheck | any> {
  const { data, error } = await supabase.functions.invoke("companies-house", {
    body: { action: "company", company_number: companyNumber, customer_id: customerId },
  });

  if (error) throw new Error(error.message);
  if (data.error) throw new Error(data.error);

  return data;
}

export async function getCachedCreditCheck(customerId: string): Promise<CreditCheck | null> {
  const { data, error } = await supabase
    .from("credit_checks")
    .select("*")
    .eq("customer_id", customerId)
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error fetching cached credit check:", error);
    return null;
  }

  return data as CreditCheck | null;
}

export async function getCreditChecksForCustomers(customerIds: string[]): Promise<Record<string, CreditCheck>> {
  if (customerIds.length === 0) return {};

  const { data, error } = await supabase
    .from("credit_checks")
    .select("*")
    .in("customer_id", customerIds)
    .order("checked_at", { ascending: false });

  if (error) {
    console.error("Error fetching credit checks:", error);
    return {};
  }

  // Keep only latest per customer
  const map: Record<string, CreditCheck> = {};
  (data || []).forEach((check) => {
    const cc = check as unknown as CreditCheck;
    if (!map[cc.customer_id]) {
      map[cc.customer_id] = cc;
    }
  });

  return map;
}

export const RISK_LEVEL_CONFIG: Record<string, { label: string; color: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  low: { label: "Low Risk", color: "text-green-600", variant: "default" },
  medium: { label: "Medium", color: "text-yellow-600", variant: "secondary" },
  high: { label: "High Risk", color: "text-orange-600", variant: "destructive" },
  critical: { label: "Critical", color: "text-red-600", variant: "destructive" },
  unknown: { label: "Not Checked", color: "text-muted-foreground", variant: "outline" },
};
