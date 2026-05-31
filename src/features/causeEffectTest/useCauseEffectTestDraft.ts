import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Top-level draft row shape. Matches the columns added in
// 20260528172000_cause_effect_audibility_report.sql. Kept as a hand-typed
// interface (rather than Pick<Database['public']['Tables']…>) because the
// supabase types haven't been regenerated yet.
export interface CauseEffectTestReport {
  id: string;
  visit_id: string;
  site_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;

  report_number: string | null;
  report_date: string | null;
  engineer_name: string | null;
  client_name: string | null;

  sound_meter_make_model: string | null;
  sound_meter_serial: string | null;
  sound_meter_cal_due: string | null;
  sound_meter_cal_on_file: boolean | null;

  general_observations: string | null;
  bs5839_compliant: boolean | null;
  remedial_timeframe: string | null;
  next_service_due: string | null;

  engineer_signature: string | null;
  client_signature: string | null;
  client_sign_name: string | null;
  client_sign_position: string | null;

  status: "draft" | "completed" | "locked";
  notes: string | null;
}

/**
 * Fetch-or-create the draft ce_audibility_reports row for this visit, then
 * expose a patch() that writes back. Mirrors the pattern in
 * useServiceReportDraft.ts so the wizard chrome can stay identical.
 *
 * Offline queueing isn't wired up in this skeleton — patches that fail
 * surface in the toast via the caller. Once the steps are filled in we
 * can copy the IndexedDB-queue path from useServiceReportDraft if needed.
 */
export function useCauseEffectTestDraft(visitId: string, siteId: string, userId: string) {
  const [report, setReport] = useState<CauseEffectTestReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  const fetchOrCreate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Try to load an existing draft.
      const { data: existing, error: selErr } = await (supabase as any)
        .from("ce_audibility_reports")
        .select("*")
        .eq("visit_id", visitId)
        .maybeSingle();
      if (selErr) throw selErr;

      if (existing) {
        setReport(existing as CauseEffectTestReport);
        return;
      }

      const { data: created, error: insErr } = await (supabase as any)
        .from("ce_audibility_reports")
        .insert({
          visit_id: visitId,
          site_id: siteId,
          created_by: userId,
          report_date: new Date().toISOString().slice(0, 10),
          status: "draft",
        })
        .select("*")
        .single();
      if (insErr) throw insErr;
      setReport(created as CauseEffectTestReport);
    } catch (e) {
      console.error("ce_audibility_reports fetch-or-create failed:", e);
      // Supabase PostgrestError isn't a real Error subclass — wrap so
      // the .message dig-out in the wizard catches a usable string.
      const err =
        e instanceof Error
          ? e
          : new Error(
              e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string"
                ? (e as { message: string }).message
                : JSON.stringify(e),
            );
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [visitId, siteId, userId]);

  useEffect(() => {
    void fetchOrCreate();
  }, [fetchOrCreate]);

  const patch = useCallback(
    async (updates: Partial<CauseEffectTestReport>) => {
      const id = report?.id;
      if (!id) return;
      setSaving(true);
      // Functional setState — when two patches fire in the same tick
      // (e.g. typing the client name and signing the pad before React
      // commits a re-render), a non-functional `{ ...report, ...updates }`
      // would build from the stale closure snapshot and the second call
      // would wipe the first. Composing onto `prev` keeps both changes.
      setReport((prev) => (prev ? { ...prev, ...updates } : prev));
      const op = (async () => {
        try {
          const { error: updErr } = await (supabase as any)
            .from("ce_audibility_reports")
            .update(updates)
            .eq("id", id);
          if (updErr) throw updErr;
        } catch (e) {
          setError(e as Error);
        } finally {
          setSaving(false);
        }
      })();
      inFlight.current = op;
      return op;
    },
    [report?.id],
  );

  return { report, loading, saving, error, patch, refetch: fetchOrCreate };
}
