import { supabase } from "@/integrations/supabase/client";

export interface Subcontractor {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postcode: string | null;
  specializations: string[];
  insurance_expiry: string | null;
  insurance_document_url: string | null;
  day_rate: number | null;
  hourly_rate: number | null;
  notes: string | null;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// Use type-cast helper since types may not have regenerated yet
const from = (table: string) => supabase.from(table as any);

export async function fetchSubcontractors(): Promise<Subcontractor[]> {
  const { data, error } = await from("subcontractors")
    .select("*")
    .order("company_name");

  if (error) throw error;
  return (data || []) as unknown as Subcontractor[];
}

export async function fetchActiveSubcontractors(): Promise<Subcontractor[]> {
  const { data, error } = await from("subcontractors")
    .select("*")
    .eq("status", "active")
    .order("company_name");

  if (error) throw error;
  return (data || []) as unknown as Subcontractor[];
}

export async function createSubcontractor(
  sub: Partial<Subcontractor>,
  userId: string
): Promise<Subcontractor> {
  const { data, error } = await from("subcontractors")
    .insert({
      company_name: sub.company_name!,
      contact_name: sub.contact_name || null,
      email: sub.email || null,
      phone: sub.phone || null,
      address: sub.address || null,
      city: sub.city || null,
      postcode: sub.postcode || null,
      specializations: sub.specializations || [],
      insurance_expiry: sub.insurance_expiry || null,
      day_rate: sub.day_rate || null,
      hourly_rate: sub.hourly_rate || null,
      notes: sub.notes || null,
      status: sub.status || "active",
      created_by: userId,
    })
    .select()
    .single();

  if (error) throw error;
  return data as unknown as Subcontractor;
}

export async function updateSubcontractor(
  id: string,
  sub: Partial<Subcontractor>
): Promise<Subcontractor> {
  const { data, error } = await from("subcontractors")
    .update(sub)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as Subcontractor;
}

export async function deleteSubcontractor(id: string): Promise<void> {
  const { error } = await from("subcontractors")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export const SPECIALIZATION_OPTIONS = [
  { value: "fire_alarm", label: "Fire Alarm" },
  { value: "emergency_lighting", label: "Emergency Lighting" },
  { value: "intruder_alarm", label: "Intruder Alarm" },
  { value: "cctv", label: "CCTV" },
  { value: "access_control", label: "Access Control" },
  { value: "nurse_call", label: "Nurse Call" },
  { value: "disabled_refuge", label: "Disabled Refuge" },
  { value: "gas_suppression", label: "Gas Suppression" },
  { value: "aspirating", label: "ASD / Aspirating" },
  { value: "electrical", label: "Electrical" },
  { value: "plumbing", label: "Plumbing" },
  { value: "general", label: "General Maintenance" },
];
