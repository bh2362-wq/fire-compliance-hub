import { supabase } from "@/integrations/supabase/client";

// Reads / writes the callout-metadata columns added to service_visits in
// Migration B. Used by the "Callout details" section on VisitEditDialog.
//
// Types declared explicitly rather than Pick<ServiceVisitsRow, …>: the
// autogen types.ts hasn't been re-run since Migration B, so the new
// columns aren't visible there yet. Shape matches the migration.

export type Priority = "p1" | "p2" | "p3" | "ooh" | "weekend";
export type CommercialClassification = "ppm" | "chargeable" | "quote_required";
export type ReportMethod = "phone" | "email" | "portal" | "arc";

export const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "p1", label: "P1 — Immediate (4hr)" },
  { value: "p2", label: "P2 — Urgent (24hr)" },
  { value: "p3", label: "P3 — Next visit" },
  { value: "ooh", label: "Out of hours" },
  { value: "weekend", label: "Weekend" },
];

export const COMMERCIAL_CLASSIFICATIONS: {
  value: CommercialClassification;
  label: string;
}[] = [
  { value: "ppm", label: "PPM (included)" },
  { value: "chargeable", label: "Chargeable" },
  { value: "quote_required", label: "Quote required" },
];

export const REPORT_METHODS: { value: ReportMethod; label: string }[] = [
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "portal", label: "Portal" },
  { value: "arc", label: "ARC" },
];

export interface FaultDetails {
  reported?: string | null;
  on_arrival?: string | null;
  found?: string | null;
  action_taken?: string | null;
}

export interface VisitCallout {
  priority: Priority | null;
  commercial_classification: CommercialClassification | null;
  call_received_at: string | null;
  reported_by: string | null;
  report_method: ReportMethod | null;
  engineer_assigned_at: string | null;
  affected_zones: string[] | null;
  affected_loops: string[] | null;
  arc_notified_at: string | null;
  fault_details: FaultDetails | null;
}

const SELECT_COLS =
  "priority,commercial_classification,call_received_at,reported_by," +
  "report_method,engineer_assigned_at,affected_zones,affected_loops," +
  "arc_notified_at,fault_details";

export async function getVisitCallout(
  visitId: string,
): Promise<VisitCallout | null> {
  const { data, error } = await supabase
    .from("service_visits")
    .select(SELECT_COLS)
    .eq("id", visitId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as VisitCallout | null) ?? null;
}

export async function updateVisitCallout(
  visitId: string,
  patch: Partial<VisitCallout>,
): Promise<void> {
  const { error } = await supabase
    .from("service_visits")
    .update(patch as never)
    .eq("id", visitId);
  if (error) throw error;
}
