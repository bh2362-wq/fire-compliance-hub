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
  po_number: string | null;
  frequency: string | null;
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
  po_number?: string | null;
  frequency?: string | null;
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
  { value: "fire", label: "Fire" },
  { value: "aspirator", label: "Aspirator" },
  { value: "gas_suppression", label: "Gas Suppression" },
  { value: "room_integrity", label: "Room Integrity" },
  { value: "fire_curtain", label: "Fire Curtain" },
  { value: "disabled_refuge", label: "Disabled Refuge" },
  { value: "emergency_lighting", label: "Emergency Lighting" },
  { value: "intruder_alarm", label: "Intruder Alarm" },
  { value: "nurse_call", label: "Nurse Call" },
] as const;

export const SERVICE_FREQUENCIES = [
  { value: "1m", label: "Monthly" },
  { value: "3m", label: "Quarterly" },
  { value: "6m", label: "Bi-Annual" },
  { value: "12m", label: "Annual" },
] as const;

export function getServiceTypeLabel(value: string): string {
  return SERVICE_TYPES.find((t) => t.value === value)?.label || value;
}

export function getFrequencyLabel(value: string): string {
  return SERVICE_FREQUENCIES.find((f) => f.value === value)?.label || value;
}
