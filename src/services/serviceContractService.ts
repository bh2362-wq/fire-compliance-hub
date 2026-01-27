import { supabase } from "@/integrations/supabase/client";

export interface ServiceContract {
  id: string;
  site_id: string;
  service_type: string;
  description: string | null;
  unit_price: number;
  included_visits: number | null;
  contract_start: string | null;
  contract_end: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceContractInsert {
  site_id: string;
  service_type: string;
  description?: string | null;
  unit_price: number;
  included_visits?: number | null;
  contract_start?: string | null;
  contract_end?: string | null;
  notes?: string | null;
}

export async function getServiceContracts(siteId: string): Promise<ServiceContract[]> {
  const { data, error } = await supabase
    .from("site_service_contracts")
    .select("*")
    .eq("site_id", siteId)
    .order("service_type", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function upsertServiceContract(contract: ServiceContractInsert): Promise<ServiceContract> {
  const { data, error } = await supabase
    .from("site_service_contracts")
    .upsert(contract, { onConflict: "site_id,service_type" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteServiceContract(id: string): Promise<void> {
  const { error } = await supabase
    .from("site_service_contracts")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export const SERVICE_TYPES = [
  { value: "quarterly_service", label: "Quarterly Service" },
  { value: "annual_inspection", label: "Annual Inspection" },
  { value: "emergency", label: "Emergency Call-out" },
  { value: "remedial", label: "Remedial Works" },
] as const;

export function getServiceTypeLabel(value: string): string {
  return SERVICE_TYPES.find((t) => t.value === value)?.label || value;
}
