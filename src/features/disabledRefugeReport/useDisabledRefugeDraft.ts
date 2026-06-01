import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  initializeDisabledRefugeChecklists,
  DisabledRefugeChecklistData,
} from "@/components/reports/MultiDisabledRefugeChecklist";
import { getDefaultDisabledRefugeChecklist } from "@/services/disabledRefugeChecklistService";

export interface DisabledRefugeAsset {
  id: string;
  item_name: string;
  manufacturer?: string | null;
  model?: string | null;
  location?: string | null;
}

// Flat view of the report shape used by the wizard steps. Mirrors the
// columns + notes-JSON layout the DisabledRefugeReportDialog already
// writes so both surfaces interoperate during the migration.
export interface DisabledRefugeDraft {
  id: string;
  report_number: string | null;
  engineer_name: string;
  client_name: string;
  units: DisabledRefugeChecklistData[];
  system_condition: string;
  defects_found: string;
  recommendations: string;
  work_carried_out: string;
  parts_used: string;
  additional_notes: string;
  engineer_signature: string;
  engineer_sign_date: string | null;
  engineer_sign_time: string;
  customer_not_present: boolean;
  customer_signature: string;
  customer_sign_date: string | null;
  customer_sign_time: string;
  status: "draft" | "completed" | "locked";
  is_locked: boolean;
}

function defaultDraft(id: string): DisabledRefugeDraft {
  return {
    id,
    report_number: null,
    engineer_name: "",
    client_name: "",
    units: [],
    system_condition: "",
    defects_found: "",
    recommendations: "",
    work_carried_out: "",
    parts_used: "",
    additional_notes: "",
    engineer_signature: "",
    engineer_sign_date: null,
    engineer_sign_time: "",
    customer_not_present: false,
    customer_signature: "",
    customer_sign_date: null,
    customer_sign_time: "",
    status: "draft",
    is_locked: false,
  };
}

/**
 * Fetch-or-create the disabled-refuge service-report row for this visit.
 * Mirrors useServiceReportDraft's shape (loading / saving / patch /
 * refetch) but stores fields across both the service_reports columns
 * and the notes JSON in the same layout the legacy dialog uses, so the
 * two surfaces remain interoperable until the dialog is retired.
 */
export function useDisabledRefugeDraft(
  visit: { id: string; site_id: string; visit_date: string },
  assets: DisabledRefugeAsset[],
  userId: string,
) {
  const [draft, setDraft] = useState<DisabledRefugeDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchOrCreate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: existing } = await supabase
        .from("service_reports")
        .select("*")
        .eq("visit_id", visit.id)
        .like("notes", '%"report_type":"disabled_refuge"%')
        .maybeSingle();

      let row = existing;
      if (!row) {
        const initialUnits = initializeDisabledRefugeChecklists(assets);
        const notesJson = JSON.stringify({
          report_type: "disabled_refuge",
          asset_ids: assets.map((a) => a.id),
          units: initialUnits,
        });
        const checklist = JSON.parse(JSON.stringify(getDefaultDisabledRefugeChecklist()));
        const { data: created, error: insertErr } = await supabase
          .from("service_reports")
          .insert({
            visit_id: visit.id,
            site_id: visit.site_id,
            created_by: userId,
            report_date: visit.visit_date,
            checklist,
            notes: notesJson,
            status: "draft",
          })
          .select("*")
          .single();
        if (insertErr) throw insertErr;
        row = created;
      }

      const r = row as Record<string, unknown>;
      let notesData: Record<string, unknown> = {};
      try {
        notesData = JSON.parse((r.notes as string) || "{}");
      } catch {
        notesData = {};
      }

      const units = Array.isArray(notesData.units) && notesData.units.length > 0
        ? (notesData.units as DisabledRefugeChecklistData[])
        : initializeDisabledRefugeChecklists(assets);

      setDraft({
        id: r.id as string,
        report_number: (r.report_number as string | null) ?? null,
        engineer_name: (r.engineer_name as string | null) ?? "",
        client_name: (r.client_name as string | null) ?? "",
        units,
        system_condition: (r.system_condition as string | null) ?? "",
        defects_found: (r.defects_found as string | null) ?? "",
        recommendations: (r.recommendations as string | null) ?? "",
        work_carried_out: (r.work_carried_out as string | null) ?? "",
        parts_used: (r.parts_used as string | null) ?? "",
        additional_notes: (notesData.additional_notes as string) ?? "",
        engineer_signature: (notesData.engineerSignature as string) ?? "",
        engineer_sign_date: (notesData.engineerSignDate as string | null) ?? null,
        engineer_sign_time: (notesData.engineerSignTime as string) ?? "",
        customer_not_present: Boolean(notesData.customerNotPresent),
        customer_signature: (notesData.customerSignature as string) ?? "",
        customer_sign_date: (notesData.customerSignDate as string | null) ?? null,
        customer_sign_time: (notesData.customerSignTime as string) ?? "",
        status: ((r.status as string) ?? "draft") as DisabledRefugeDraft["status"],
        is_locked: r.status === "completed" || r.status === "locked",
      });
    } catch (e) {
      console.error("useDisabledRefugeDraft fetch-or-create failed:", e);
      const err = e instanceof Error ? e : new Error(String((e as { message?: string })?.message ?? e));
      setError(err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visit.id, visit.site_id, userId, assets.map((a) => a.id).join(",")]);

  useEffect(() => {
    void fetchOrCreate();
  }, [fetchOrCreate]);

  /**
   * Write a subset of fields back to service_reports + notes JSON.
   * Functional setState so concurrent patches (typing + signing in the
   * same tick) compose onto the latest state — same pattern as the
   * C&E draft hook's bug fix.
   */
  const patch = useCallback(
    async (updates: Partial<DisabledRefugeDraft>) => {
      let nextRef: DisabledRefugeDraft | null = null;
      setDraft((prev) => {
        if (!prev) return prev;
        nextRef = { ...prev, ...updates };
        return nextRef;
      });
      if (!nextRef) return;
      setSaving(true);
      try {
        const n = nextRef as DisabledRefugeDraft;
        const notesJson = JSON.stringify({
          report_type: "disabled_refuge",
          asset_ids: assets.map((a) => a.id),
          units: n.units,
          additional_notes: n.additional_notes,
          engineerSignature: n.engineer_signature,
          engineerSignDate: n.engineer_sign_date,
          engineerSignTime: n.engineer_sign_time,
          customerNotPresent: n.customer_not_present,
          customerSignature: n.customer_signature,
          customerSignDate: n.customer_sign_date,
          customerSignTime: n.customer_sign_time,
        });
        const { error: updErr } = await supabase
          .from("service_reports")
          .update({
            engineer_name: n.engineer_name,
            client_name: n.client_name,
            system_condition: n.system_condition,
            defects_found: n.defects_found,
            recommendations: n.recommendations,
            work_carried_out: n.work_carried_out,
            parts_used: n.parts_used,
            notes: notesJson,
          })
          .eq("id", n.id);
        if (updErr) throw updErr;
      } catch (e) {
        setError(e as Error);
      } finally {
        setSaving(false);
      }
    },
    [assets],
  );

  const complete = useCallback(async (): Promise<void> => {
    if (!draft) return;
    setSaving(true);
    try {
      const { error: updErr } = await supabase
        .from("service_reports")
        .update({ status: "completed" })
        .eq("id", draft.id);
      if (updErr) throw updErr;
      setDraft((prev) => (prev ? { ...prev, status: "completed", is_locked: true } : prev));
    } catch (e) {
      setError(e as Error);
      throw e;
    } finally {
      setSaving(false);
    }
  }, [draft]);

  return { draft, loading, saving, error, patch, complete, refetch: fetchOrCreate };
}
