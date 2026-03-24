import { supabase } from "@/integrations/supabase/client";

export interface RamsActivity {
  id: string;
  activity_key: string;
  activity_name: string;
  category: string;
  british_standard: string | null;
  description: string | null;
  hazards: any[];
  method_statements: any[];
  ppe_requirements: string[];
  emergency_procedures: string | null;
  default_site_hazards: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerRamsRequirement {
  id: string;
  customer_id: string;
  site_id: string | null;
  requirement_type: string;
  title: string;
  description: string | null;
  is_mandatory: boolean;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface RamsAcknowledgement {
  id: string;
  rams_document_id: string;
  engineer_id: string;
  acknowledged_at: string;
  signature: string | null;
  ip_address: string | null;
  notes: string | null;
}

// Activity Library
export async function getRamsActivities(): Promise<RamsActivity[]> {
  const { data, error } = await supabase
    .from("rams_activity_library")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return (data || []).map((d: any) => ({
    ...d,
    hazards: Array.isArray(d.hazards) ? d.hazards : [],
    method_statements: Array.isArray(d.method_statements) ? d.method_statements : [],
    ppe_requirements: Array.isArray(d.ppe_requirements) ? d.ppe_requirements : [],
  }));
}

export async function getRamsActivityByKey(key: string): Promise<RamsActivity | null> {
  const { data, error } = await supabase
    .from("rams_activity_library")
    .select("*")
    .eq("activity_key", key)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    hazards: Array.isArray(data.hazards) ? data.hazards : [],
    method_statements: Array.isArray(data.method_statements) ? data.method_statements : [],
    ppe_requirements: Array.isArray(data.ppe_requirements) ? data.ppe_requirements : [],
  } as RamsActivity;
}

// Customer RAMS Requirements
export async function getCustomerRamsRequirements(customerId: string, siteId?: string): Promise<CustomerRamsRequirement[]> {
  let query = supabase
    .from("customer_rams_requirements")
    .select("*")
    .eq("customer_id", customerId)
    .order("sort_order");

  if (siteId) {
    query = query.or(`site_id.is.null,site_id.eq.${siteId}`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createCustomerRamsRequirement(
  req: Omit<CustomerRamsRequirement, "id" | "created_at" | "updated_at">
): Promise<CustomerRamsRequirement> {
  const { data, error } = await supabase
    .from("customer_rams_requirements")
    .insert(req)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCustomerRamsRequirement(
  id: string,
  updates: Partial<CustomerRamsRequirement>
): Promise<CustomerRamsRequirement> {
  const { id: _, created_at, updated_at, ...rest } = updates as any;
  const { data, error } = await supabase
    .from("customer_rams_requirements")
    .update(rest)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCustomerRamsRequirement(id: string): Promise<void> {
  const { error } = await supabase.from("customer_rams_requirements").delete().eq("id", id);
  if (error) throw error;
}

// RAMS Acknowledgements
export async function getRamsAcknowledgements(ramsDocumentId: string): Promise<RamsAcknowledgement[]> {
  const { data, error } = await supabase
    .from("rams_acknowledgements")
    .select("*")
    .eq("rams_document_id", ramsDocumentId)
    .order("acknowledged_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function acknowledgeRams(
  ramsDocumentId: string,
  engineerId: string,
  signature?: string,
  notes?: string
): Promise<RamsAcknowledgement> {
  const { data, error } = await supabase
    .from("rams_acknowledgements")
    .insert({
      rams_document_id: ramsDocumentId,
      engineer_id: engineerId,
      signature: signature || null,
      notes: notes || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Visit type to activity key mapping
export const VISIT_TYPE_ACTIVITY_MAP: Record<string, string> = {
  quarterly_service: "fire_alarm_service",
  biannual_service: "fire_alarm_service",
  annual_inspection: "fire_alarm_inspection",
  emergency: "fire_alarm_emergency",
  remedial: "fire_alarm_remedial",
};

// Requirement types
export const REQUIREMENT_TYPES = [
  { value: "contractor_induction", label: "Contractor Induction" },
  { value: "permit_to_work", label: "Permit to Work Required" },
  { value: "site_rules", label: "Site-Specific Rules" },
  { value: "access_restriction", label: "Access Restrictions" },
  { value: "ppe_additional", label: "Additional PPE Required" },
  { value: "asbestos", label: "Asbestos Information" },
  { value: "working_hours", label: "Working Hours Restriction" },
  { value: "parking", label: "Parking / Vehicle Access" },
  { value: "escort_required", label: "Escort Required" },
  { value: "dbs_check", label: "DBS Check Required" },
  { value: "other", label: "Other" },
];
