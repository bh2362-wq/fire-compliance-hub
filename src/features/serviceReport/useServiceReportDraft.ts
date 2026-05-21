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

// useServiceReportDraft — loads (or creates) the service_reports row for a
// given visit and exposes a partial-update API used by each wizard step.
//
// Persistence model: every step calls `patch(...)` with the fields it owns
// and we round-trip them through updateServiceReport on the next idle moment.
// Child records (defects, battery tests) are managed by their own services
// and the wizard re-fetches the draft after they change.

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
      setState({ report, loading: false, saving: false, error: null });
    } catch (e) {
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
      setState((s) =>
        s.report
          ? {
              ...s,
              saving: true,
              report: { ...s.report, ...updates, checklist: updates.checklist ?? s.report.checklist },
            }
          : s,
      );

      try {
        const next = await updateServiceReport(current.id, updates);
        setState((s) => ({ ...s, report: next, saving: false, error: null }));
      } catch (e) {
        // Roll back to the server's last known good copy.
        setState((s) => ({ ...s, saving: false, error: e as Error }));
        toast({
          title: "Save failed",
          description: (e as Error).message,
          variant: "destructive",
        });
        await load();
      }
    },
    [state.report, toast, load],
  );

  return {
    ...state,
    patch,
    refetch: load,
  };
}
