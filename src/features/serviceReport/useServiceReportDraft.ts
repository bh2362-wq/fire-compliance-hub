import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  ServiceReport,
  BS5839Checklist,
  getDefaultChecklist,
  getServiceReport,
  createServiceReport,
  updateServiceReport,
} from "@/services/serviceReportService";
import { getDraftByVisit, queueMutation, saveDraft } from "@/lib/offlineQueue";
import { runSync } from "@/lib/syncWorker";

// useServiceReportDraft — loads (or creates) the service_reports row for a
// given visit and exposes a partial-update API used by each wizard step.
//
// Persistence model:
//   * Online: patches go straight to Supabase via updateServiceReport.
//   * Offline / on transient error: the patch is queued in IndexedDB and
//     applied to a local draft mirror so the wizard remains responsive and
//     survives a refresh. The sync worker drains the queue on reconnect.

export interface ServiceReportDraftState {
  report: ServiceReport | null;
  loading: boolean;
  saving: boolean;
  error: Error | null;
}

export interface ServiceReportDraftApi extends ServiceReportDraftState {
  patch: (updates: Partial<Omit<ServiceReport, "checklist">> & { checklist?: BS5839Checklist }) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useServiceReportDraft(
  visitId: string | undefined,
  siteId: string | undefined,
  userId: string | undefined,
): ServiceReportDraftApi {
  const { toast } = useToast();
  const [state, setState] = useState<ServiceReportDraftState>({
    report: null,
    loading: true,
    saving: false,
    error: null,
  });

  const load = useCallback(async () => {
    if (!visitId || !siteId || !userId) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      let report = await getServiceReport(visitId);
      if (!report) {
        report = await createServiceReport(visitId, siteId, userId, {
          checklist: getDefaultChecklist(),
        });
      }
      // Mirror the freshly-loaded server state to the local draft store so a
      // subsequent offline reload has something to render.
      void saveDraft({ reportId: report.id, visitId, report, updatedAt: Date.now() }).catch(() => {});
      setState({ report, loading: false, saving: false, error: null });
    } catch (e) {
      // Network-down fallback: render whatever we had cached for this visit.
      const draft = await getDraftByVisit(visitId).catch(() => null);
      if (draft) {
        setState({ report: draft.report, loading: false, saving: false, error: null });
        toast({
          title: "Working offline",
          description: "Showing your last saved copy of this report.",
        });
        return;
      }
      setState({ report: null, loading: false, saving: false, error: e as Error });
      toast({
        title: "Could not load service report",
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  }, [visitId, siteId, userId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch: ServiceReportDraftApi["patch"] = useCallback(
    async (updates) => {
      const current = state.report;
      if (!current) return;

      // Optimistic local update so the UI stays responsive on flaky mobile data.
      const optimistic: ServiceReport = {
        ...current,
        ...updates,
        checklist: updates.checklist ?? current.checklist,
      };
      setState((s) => (s.report ? { ...s, saving: true, report: optimistic } : s));
      // Mirror to local draft store immediately so a refresh doesn't lose work.
      if (visitId) {
        void saveDraft({
          reportId: current.id,
          visitId,
          report: optimistic,
          updatedAt: Date.now(),
        }).catch(() => {});
      }

      const goOfflinePath = async (errMsg?: string) => {
        await queueMutation({ kind: "report-patch", reportId: current.id, updates }).catch(() => {});
        setState((s) => ({ ...s, saving: false, error: null }));
        if (errMsg) {
          toast({
            title: "Saved offline",
            description: "Will sync when the connection returns.",
          });
        }
      };

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await goOfflinePath();
        return;
      }

      try {
        const next = await updateServiceReport(current.id, updates);
        setState((s) => ({ ...s, report: next, saving: false, error: null }));
        if (visitId) {
          void saveDraft({
            reportId: next.id,
            visitId,
            report: next,
            updatedAt: Date.now(),
          }).catch(() => {});
        }
        // Take the opportunity to drain anything else still queued.
        void runSync();
      } catch (e) {
        // Network/timeout: keep the optimistic UI, queue the mutation, surface a tip.
        await goOfflinePath((e as Error).message);
      }
    },
    [state.report, toast, visitId],
  );

  return {
    ...state,
    patch,
    refetch: load,
  };
}
