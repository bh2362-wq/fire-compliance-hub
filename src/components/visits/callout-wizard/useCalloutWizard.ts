import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getVisitCallout,
  updateVisitCallout,
  type VisitCallout,
  type FaultDetails,
} from "@/services/visitCalloutService";

// Combined load/save layer for the 6-step callout wizard. The wizard
// reads from three places and writes back to two:
//
//   service_visits — callout-intake columns + fault_details JSONB
//   service_reports — materials, departure narrative, signatures
//   callout_photos — §2 evidence frames (loaded lazily by Step 2)
//
// service_reports may not exist yet on a pure-callout visit (no routine
// service was filled out). saveServiceReportFields() upserts on
// (visit_id) so the first Save from Step 2 onwards lazily creates the
// row; later steps update in place.

export interface ServiceReportFields {
  arrival_time: string | null;
  departure_time: string | null;
  system_status: "fully_operational" | "advisory_only" | "partial_operation" | "not_operational" | null;
  isolation_details: string | null;
  work_carried_out: string | null;
  defects_found: string | null;
  parts_used: string | null;
  labour_hours: number | null;
  mileage_miles: number | null;
  recommendations: string | null;
  notes: string | null;
  engineer_name: string | null;
  engineer_signature: string | null;
  client_sign_name: string | null;
  client_sign_position: string | null;
  client_signature: string | null;
}

export interface CustomerSnapshot {
  name: string | null;
  contact_name: string | null;
}

const REPORT_COLS =
  "id, visit_id, site_id, arrival_time, departure_time, system_status, " +
  "isolation_details, work_carried_out, defects_found, parts_used, " +
  "labour_hours, mileage_miles, recommendations, notes, " +
  "engineer_name, engineer_signature, " +
  "client_sign_name, client_sign_position, client_signature";

const EMPTY_VISIT: Partial<VisitCallout> = {};
const EMPTY_REPORT: ServiceReportFields = {
  arrival_time: null,
  departure_time: null,
  system_status: null,
  isolation_details: null,
  work_carried_out: null,
  defects_found: null,
  parts_used: null,
  labour_hours: null,
  mileage_miles: null,
  recommendations: null,
  notes: null,
  engineer_name: null,
  engineer_signature: null,
  client_sign_name: null,
  client_sign_position: null,
  client_signature: null,
};

interface VisitContext {
  site_id: string | null;
  // Cached id of the service_reports row for this visit (if any). Set
  // on initial load if the row already exists; populated after the
  // first save creates it. Lets subsequent saves take the update
  // branch without re-querying for the id.
  report_id: string | null;
}

export interface CalloutWizardState {
  loading: boolean;
  saving: boolean;
  visit: Partial<VisitCallout>;
  fault: FaultDetails;
  report: ServiceReportFields;
  customer: CustomerSnapshot;
  patchVisit: (p: Partial<VisitCallout>) => void;
  patchFault: (p: Partial<FaultDetails>) => void;
  patchReport: (p: Partial<ServiceReportFields>) => void;
  save: () => Promise<void>;
}

export function useCalloutWizard(visitId: string): CalloutWizardState {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [visit, setVisit] = useState<Partial<VisitCallout>>(EMPTY_VISIT);
  const [fault, setFault] = useState<FaultDetails>({});
  const [report, setReport] = useState<ServiceReportFields>(EMPTY_REPORT);
  const [customer, setCustomer] = useState<CustomerSnapshot>({
    name: null,
    contact_name: null,
  });
  const [ctx, setCtx] = useState<VisitContext>({
    site_id: null,
    report_id: null,
  });

  useEffect(() => {
    let aborted = false;
    (async () => {
      setLoading(true);
      try {
        const v = await getVisitCallout(visitId);
        if (!aborted && v) {
          setVisit(v);
          setFault(v.fault_details ?? {});
        }

        // Pull site_id + customer for the Step 6 sign-off fallback.
        // Engineer's typed name/company wins; customer auto-fills when
        // those fields are blank (same fallthrough as PR #128 §9).
        const { data: visitRow } = await supabase
          .from("service_visits")
          .select("site_id, sites(customer_id, customers(name, contact_name))")
          .eq("id", visitId)
          .maybeSingle();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vr = visitRow as any;
        if (!aborted && vr) {
          const c = vr.sites?.customers ?? {};
          setCustomer({
            name: c.name ?? null,
            contact_name: c.contact_name ?? null,
          });
          setCtx((prev) => ({ ...prev, site_id: vr.site_id ?? null }));
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: r } = await (supabase as any)
          .from("service_reports")
          .select(REPORT_COLS)
          .eq("visit_id", visitId)
          .maybeSingle();
        if (!aborted && r) {
          setCtx((prev) => ({ ...prev, report_id: r.id ?? null }));
          setReport({
            arrival_time: r.arrival_time ?? null,
            departure_time: r.departure_time ?? null,
            system_status: r.system_status ?? null,
            isolation_details: r.isolation_details ?? null,
            work_carried_out: r.work_carried_out ?? null,
            defects_found: r.defects_found ?? null,
            parts_used: r.parts_used ?? null,
            labour_hours: r.labour_hours ?? null,
            mileage_miles: r.mileage_miles ?? null,
            recommendations: r.recommendations ?? null,
            notes: r.notes ?? null,
            engineer_name: r.engineer_name ?? null,
            engineer_signature: r.engineer_signature ?? null,
            client_sign_name: r.client_sign_name ?? null,
            client_sign_position: r.client_sign_position ?? null,
            client_signature: r.client_signature ?? null,
          });
        }
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [visitId]);

  const patchVisit = useCallback(
    (p: Partial<VisitCallout>) => setVisit((s) => ({ ...s, ...p })),
    [],
  );
  const patchFault = useCallback(
    (p: Partial<FaultDetails>) => setFault((s) => ({ ...s, ...p })),
    [],
  );
  const patchReport = useCallback(
    (p: Partial<ServiceReportFields>) => setReport((s) => ({ ...s, ...p })),
    [],
  );

  const save = useCallback(async () => {
    setSaving(true);
    try {
      // Strip empty strings from the fault narrative before persist —
      // PDF/DOCX generators print "—" for null, and an empty string
      // would print as a blank line.
      const cleanFault: FaultDetails = {};
      (Object.keys(fault) as (keyof FaultDetails)[]).forEach((k) => {
        const v = (fault[k] ?? "").trim();
        if (v.length > 0) cleanFault[k] = v;
      });

      await updateVisitCallout(visitId, {
        ...visit,
        fault_details: Object.keys(cleanFault).length > 0 ? cleanFault : null,
      });

      // service_reports has no UNIQUE on visit_id, so we can't upsert
      // on that column. Branch manually: update by id if we already
      // know it, else insert and stash the new id so subsequent saves
      // skip the insert path.
      if (ctx.report_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("service_reports")
          .update(report)
          .eq("id", ctx.report_id);
        if (error) throw error;
      } else {
        if (!ctx.site_id) {
          throw new Error("Cannot create service report — visit has no site");
        }
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id;
        if (!uid) throw new Error("Not signed in");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: inserted, error } = await (supabase as any)
          .from("service_reports")
          .insert({
            visit_id: visitId,
            site_id: ctx.site_id,
            created_by: uid,
            ...report,
          })
          .select("id")
          .single();
        if (error) throw error;
        setCtx((prev) => ({ ...prev, report_id: inserted.id }));
      }
    } finally {
      setSaving(false);
    }
  }, [visitId, visit, fault, report, ctx.site_id, ctx.report_id]);

  return {
    loading,
    saving,
    visit,
    fault,
    report,
    customer,
    patchVisit,
    patchFault,
    patchReport,
    save,
  };
}
