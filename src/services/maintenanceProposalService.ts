import { supabase } from "@/integrations/supabase/client";

export type MaintenanceProposalStatus =
  | "draft"
  | "sent"
  | "customer_accepted"
  | "declined"
  | "expired";

export interface MaintenanceProposal {
  id: string;
  proposal_number: string;
  customer_id: string | null;
  site_id: string | null;
  status: MaintenanceProposalStatus;
  title: string | null;
  introduction: string | null;
  scope: string[] | null;
  annual_fee: number | null;
  payment_terms: string | null;
  vat_rate: number | null;
  callout_charge: number | null;
  ooh_callout_charge: number | null;
  parts_markup_percent: number | null;
  service_visits_per_year: number | null;
  ppm_interval_months: number | null;
  sla_tier: string | null;
  fault_response_hours: number | null;
  ooh_response_hours: number | null;
  valid_until: string | null;
  acceptance_token: string | null;
  client_accepted_at: string | null;
  accepted_by_name: string | null;
  client_acceptance_signature: string | null;
  client_po_number: string | null;
  client_declined_at: string | null;
  client_decline_reason: string | null;
  latest_docx_path: string | null;
  latest_pdf_path: string | null;
  notes: string | null;
  locked_at: string | null;
  locked_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceProposalWithRefs extends MaintenanceProposal {
  customer_name: string | null;
  site_name: string | null;
}

export async function listMaintenanceProposals(): Promise<{
  proposals: MaintenanceProposalWithRefs[];
  error: Error | null;
}> {
  // Join customer + site names so the list page renders without an N+1
  // round-trip per row.
  const { data, error } = await supabase
    .from("maintenance_proposals")
    .select("*, customer:customers(id, name), site:sites(id, name)")
    .order("created_at", { ascending: false });
  if (error) return { proposals: [], error };
  const proposals: MaintenanceProposalWithRefs[] = (data ?? []).map((row: any) => ({
    ...row,
    customer_name: row.customer?.name ?? null,
    site_name: row.site?.name ?? null,
  }));
  return { proposals, error: null };
}

export async function getMaintenanceProposal(
  id: string,
): Promise<{ proposal: MaintenanceProposalWithRefs | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("maintenance_proposals")
    .select("*, customer:customers(id, name, contact_name, contact_email), site:sites(id, name, address)")
    .eq("id", id)
    .maybeSingle();
  if (error) return { proposal: null, error };
  if (!data) return { proposal: null, error: null };
  const row = data as any;
  return {
    proposal: {
      ...row,
      customer_name: row.customer?.name ?? null,
      site_name: row.site?.name ?? null,
    },
    error: null,
  };
}

export interface CreateMaintenanceProposalData {
  customer_id?: string | null;
  site_id?: string | null;
  title?: string | null;
  annual_fee?: number | null;
  service_visits_per_year?: number | null;
  ppm_interval_months?: number | null;
  sla_tier?: string | null;
  fault_response_hours?: number | null;
  valid_until?: string | null;
  notes?: string | null;
}

export async function createMaintenanceProposal(
  payload: CreateMaintenanceProposalData,
): Promise<{ proposal: MaintenanceProposal | null; error: Error | null }> {
  // Auto-generate the proposal_number via the collision-retry RPC.
  const { data: proposalNumber, error: numErr } = await supabase.rpc(
    "get_next_maintenance_proposal_number",
  );
  if (numErr) return { proposal: null, error: numErr };
  if (!proposalNumber) {
    return {
      proposal: null,
      error: new Error("Proposal number generator returned no value"),
    };
  }
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("maintenance_proposals")
    .insert({
      proposal_number: proposalNumber as string,
      status: "draft",
      created_by: user?.id ?? null,
      ...payload,
    })
    .select("*")
    .single();
  if (error) return { proposal: null, error };
  return { proposal: data as MaintenanceProposal, error: null };
}

export async function updateMaintenanceProposal(
  id: string,
  patch: Partial<MaintenanceProposal>,
): Promise<{ error: Error | null }> {
  // Invalidate the cached DOCX / PDF on every save — same contract
  // PR #232 wired into quotations. Any change could affect the
  // rendered output; safer to regenerate next download than serve
  // a stale doc.
  const { error } = await supabase
    .from("maintenance_proposals")
    .update({ ...patch, latest_docx_path: null, latest_pdf_path: null })
    .eq("id", id);
  return { error };
}

export async function deleteMaintenanceProposal(
  id: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from("maintenance_proposals")
    .delete()
    .eq("id", id);
  return { error };
}
