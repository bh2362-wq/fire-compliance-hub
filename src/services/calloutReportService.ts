import { supabase } from "@/integrations/supabase/client";
import type { CalloutReportInput } from "@/lib/calloutReportPdfGenerator";
import {
  PRIORITIES,
  COMMERCIAL_CLASSIFICATIONS,
} from "./visitCalloutService";

// Loader for the Callout Report — fetches the visit + its Migration B
// callout columns + site (with Migration A system info) + customer +
// the latest service_report row (for system status / parts / sigs).
//
// Wide untyped selects + casts: the autogen types.ts hasn't been
// regenerated since A or B landed, so the new columns aren't visible
// there yet. The loader is the boundary; downstream consumers see the
// strongly typed CalloutReportInput.

const priorityLabel = (p?: string | null): string | null =>
  PRIORITIES.find((x) => x.value === p)?.label ?? null;

const commercialLabel = (c?: string | null): string | null =>
  COMMERCIAL_CLASSIFICATIONS.find((x) => x.value === c)?.label ?? null;

interface FaultDetailsRow {
  reported?: string | null;
  on_arrival?: string | null;
  found?: string | null;
  action_taken?: string | null;
}

export async function buildCalloutReportInput(
  visitId: string,
): Promise<CalloutReportInput> {
  // Visit + callout columns + site/customer joins. Plenty of new
  // columns are referenced — we cast the result through unknown since
  // the autogen Row type doesn't list them yet.
  const { data: visitData, error: visitErr } = await supabase
    .from("service_visits")
    .select(
      `id, visit_date, engineer_id, job_number,
       arrived_at, departed_at,
       priority, commercial_classification, call_received_at, reported_by,
       report_method, engineer_assigned_at, affected_zones, affected_loops,
       arc_notified_at, fault_details,
       sites!inner(
         name, address, city, postcode,
         panel_make_model, bs5839_category, num_zones, num_loops, arc_connected,
         customer_id,
         customers(name, contact_name, contact_email, contact_phone)
       )`,
    )
    .eq("id", visitId)
    .single();
  if (visitErr) throw visitErr;
  if (!visitData) throw new Error("Visit not found");

  // Optional companion service_report — provides system_status, parts,
  // outstanding works, and the captured signatures + their dates if the
  // engineer has completed it.
  const { data: reportData } = await supabase
    .from("service_reports")
    .select(
      "system_status, parts_used, outstanding_works, engineer_signature, engineer_name, engineer_sign_date, client_signature, client_name, client_sign_date",
    )
    .eq("visit_id", visitId)
    .maybeSingle();

  // Engineer name — prefer the one the engineer typed on the service
  // report; fall back to their profile full_name.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = visitData as any;
  let engineerName: string | null = reportData?.engineer_name ?? null;
  if (!engineerName && v.engineer_id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", v.engineer_id)
      .maybeSingle();
    engineerName = (profile?.full_name as string | null) ?? null;
  }

  const site = v.sites ?? {};
  const customer = site.customers ?? {};
  const fault = (v.fault_details ?? null) as FaultDetailsRow | null;

  // Ref: BHO-CO-<job_number> if present, else BHO-CO-<short id> so the
  // file always has a sensible name even for un-numbered visits.
  const ref = v.job_number
    ? `BHO-CO-${v.job_number}`
    : `BHO-CO-${String(visitId).slice(0, 8)}`;

  return {
    ref,
    visitDate: v.visit_date,
    priority: v.priority,
    priorityLabel: priorityLabel(v.priority),
    commercialClassification: v.commercial_classification,
    commercialLabel: commercialLabel(v.commercial_classification),

    customer: {
      name: customer.name ?? "—",
      contactName: customer.contact_name,
      contactEmail: customer.contact_email,
      contactPhone: customer.contact_phone,
    },
    site: {
      name: site.name ?? "—",
      address: site.address,
      city: site.city,
      postcode: site.postcode,
    },
    engineerName,

    panelMakeModel: site.panel_make_model,
    bs5839Category: site.bs5839_category,
    numZones: site.num_zones,
    numLoops: site.num_loops,

    affectedZones: v.affected_zones,
    affectedLoops: v.affected_loops,
    arcConnected: site.arc_connected,

    callReceivedAt: v.call_received_at,
    reportedBy: v.reported_by,
    reportMethod: v.report_method,
    engineerAssignedAt: v.engineer_assigned_at,
    arrivedAt: v.arrived_at,
    departedAt: v.departed_at,
    arcNotifiedAt: v.arc_notified_at,

    fault: fault
      ? {
          reported: fault.reported ?? null,
          onArrival: fault.on_arrival ?? null,
          found: fault.found ?? null,
          actionTaken: fault.action_taken ?? null,
        }
      : null,

    systemStatus: reportData?.system_status ?? null,
    partsUsed: reportData?.parts_used ?? null,
    outstandingWorks: reportData?.outstanding_works ?? null,

    engineerSignature: reportData?.engineer_signature ?? null,
    engineerSignDate: reportData?.engineer_sign_date ?? null,
    clientSignature: reportData?.client_signature ?? null,
    clientName: reportData?.client_name ?? null,
    clientSignDate: reportData?.client_sign_date ?? null,
  };
}
