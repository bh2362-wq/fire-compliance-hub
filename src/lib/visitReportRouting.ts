// Maps a visit's visit_type to the report it should produce by default.
// Keeps the existing per-report buttons available — this just answers
// "what's the obvious default for this kind of visit?" so an admin
// doesn't have to know which of seven generators to pick.
//
// Rationale per the operational rules:
//   maintenance (quarterly/biannual/annual)  → Service Report (BS 5839 checklist)
//   reactive   (remedial/emergency)          → Callout Report
//   install                                   → Modification Certificate
//   supply_only / subcontract                 → no automatic default

export type VisitType =
  | "quarterly_service"
  | "biannual_service"
  | "annual_inspection"
  | "remedial"
  | "emergency"
  | "supply_only"
  | "subcontract"
  | "installation"   // not yet a CHECK-allowed value; mapping is future-proofed
  | (string & {});   // permit unknowns so we don't crash on legacy data

export type ReportKind = "service_report" | "callout_report" | "modification_cert";

export interface ReportRecommendation {
  kind: ReportKind | null;
  label: string;
  reason: string;
}

const RECOMMENDATIONS: Record<string, ReportRecommendation> = {
  quarterly_service: {
    kind: "service_report",
    label: "Service Report (BS 5839-1 checklist)",
    reason: "Routine maintenance visit — full activity checklist + battery tests.",
  },
  biannual_service: {
    kind: "service_report",
    label: "Service Report (BS 5839-1 checklist)",
    reason: "Routine maintenance visit — full activity checklist + battery tests.",
  },
  annual_inspection: {
    kind: "service_report",
    label: "Service Report (BS 5839-1 checklist)",
    reason: "Annual inspection — full activity checklist + battery tests.",
  },
  remedial: {
    kind: "callout_report",
    label: "Callout Report",
    reason: "Reactive attendance — fault narrative, response time and SLA.",
  },
  emergency: {
    kind: "callout_report",
    label: "Callout Report",
    reason: "Reactive attendance — fault narrative, response time and SLA.",
  },
  installation: {
    kind: "modification_cert",
    label: "Modification Certificate",
    reason: "Install / modification work — records the system change and sign-off.",
  },
};

export function recommendReport(visitType?: string | null): ReportRecommendation {
  if (!visitType) {
    return {
      kind: null,
      label: "No default report",
      reason: "Set a visit type to get a recommendation.",
    };
  }
  return (
    RECOMMENDATIONS[visitType] ?? {
      kind: null,
      label: "No default report",
      reason:
        "This visit type doesn't have an automatic report. Pick one from the Actions menu if needed.",
    }
  );
}
