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

function frequencyToMonths(freq: string | null): number {
  switch (freq) {
    case "1m": return 1;
    case "3m": return 3;
    case "6m": return 6;
    case "12m": return 12;
    default: return 3;
  }
}

function visitTypeForFrequency(months: number): string {
  if (months <= 3) return "quarterly_service";
  if (months <= 6) return "biannual_service";
  return "annual_inspection";
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function fmt(d: Date): string {
  return d.toISOString().split("T")[0];
}

export async function generateVisitsFromContract(
  contract: ServiceContract
): Promise<{ created: number; skipped: number }> {
  const months = frequencyToMonths(contract.frequency);
  const visitType = visitTypeForFrequency(months);

  const start = contract.contract_start ? new Date(contract.contract_start) : new Date();
  const end = contract.contract_end
    ? new Date(contract.contract_end)
    : addMonths(start, 12);

  // Build candidate visit dates from start through end at the given frequency
  const dates: string[] = [];
  let cursor = new Date(start);
  // Cap at 60 visits to avoid runaway loops
  let safety = 0;
  while (cursor <= end && safety < 60) {
    dates.push(fmt(cursor));
    cursor = addMonths(cursor, months);
    safety++;
  }

  if (dates.length === 0) return { created: 0, skipped: 0 };

  // Find existing visits for this site of the same type on these dates
  const { data: existing, error: existErr } = await supabase
    .from("visits")
    .select("visit_date")
    .eq("site_id", contract.site_id)
    .eq("visit_type", visitType)
    .in("visit_date", dates);

  if (existErr) throw existErr;

  const existingSet = new Set((existing || []).map((v: any) => v.visit_date));
  const toCreate = dates.filter((d) => !existingSet.has(d));

  if (toCreate.length === 0) {
    return { created: 0, skipped: dates.length };
  }

  const rows = toCreate.map((d) => ({
    site_id: contract.site_id,
    visit_date: d,
    visit_type: visitType,
    status: "scheduled",
    notes: contract.po_number
      ? `Auto-generated from service contract. PO: ${contract.po_number}`
      : "Auto-generated from service contract.",
  }));

  const { error: insErr } = await supabase.from("visits").insert(rows);
  if (insErr) throw insErr;

  return { created: toCreate.length, skipped: dates.length - toCreate.length };
}

export const SERVICE_TYPES = [
  { value: "fire", label: "Fire Alarm" },
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
