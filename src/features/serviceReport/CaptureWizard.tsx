import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Visit } from "@/hooks/useVisits";
import { ServiceReport, BS5839Checklist } from "@/services/serviceReportService";
import { useServiceReportDraft } from "./useServiceReportDraft";
import { listDefects, type SiteDefect } from "@/services/defectService";
import { supabase } from "@/integrations/supabase/client";
import { WizardShell, WizardLoadingState } from "@/features/_shared/WizardShell";
import { SystemStep } from "./steps/SystemStep";
import { DevicesStep } from "./steps/DevicesStep";
import { ChecklistStep } from "./steps/ChecklistStep";
import { FindingsStep } from "./steps/FindingsStep";
import { DepartureStep } from "./steps/DepartureStep";
import { SignOffStep } from "./steps/SignOffStep";
import { useLiveDefectAnalysis } from "./useLiveDefectAnalysis";
import { LiveDefectQuotePanel } from "./LiveDefectQuotePanel";

// Feature flag — keep the AI quote panel off by default in production. Flip
// `VITE_BS5839_AI_QUOTE=true` in the build env (or set the localStorage key
// `bho:bs5839-ai-quote=1` at runtime) to enable it for the wizard.
function isAiQuoteEnabled(): boolean {
  if (typeof window !== "undefined") {
    try {
      if (window.localStorage.getItem("bho:bs5839-ai-quote") === "1") return true;
    } catch {
      /* ignore storage access errors (private mode etc.) */
    }
  }
  return import.meta.env.VITE_BS5839_AI_QUOTE === "true";
}

interface Props {
  visit: Visit;
  userId: string;
  onCompleted?: (report: ServiceReport) => void;
}

const STEP_LABELS = [
  "System",
  "Devices",
  "Checklist",
  "Findings",
  "Departure",
  "Sign-off",
];

export function CaptureWizard({ visit, userId, onCompleted }: Props) {
  const { toast } = useToast();
  const { report, loading, saving, patch, refetch } = useServiceReportDraft(
    visit.id,
    visit.site_id,
    userId,
  );
  const [stepIdx, setStepIdx] = useState(0);
  const [completing, setCompleting] = useState(false);

  const aiQuoteEnabled = isAiQuoteEnabled();

  // Lightweight site + customer fetch so the AI panel has context. Only
  // hits the DB when the AI panel is enabled to keep regular wizard loads
  // unaffected.
  const [siteInfo, setSiteInfo] = useState<{
    name: string;
    address: string | null;
    occupancy_type: string | null;
    customer_id: string | null;
  } | null>(null);
  useEffect(() => {
    if (!aiQuoteEnabled) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("sites")
        .select("name, address, occupancy_type, customer_id")
        .eq("id", visit.site_id)
        .maybeSingle();
      if (cancelled || !data) return;
      setSiteInfo({
        name: data.name ?? "",
        address: data.address ?? null,
        occupancy_type: (data as { occupancy_type?: string | null }).occupancy_type ?? null,
        customer_id: data.customer_id ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [aiQuoteEnabled, visit.site_id]);

  // Poll defects for this visit every 10s while the AI panel is on so the
  // analyser sees new defects shortly after the engineer logs them in
  // DefectsStep (no realtime channel needed for the first cut).
  const [defects, setDefects] = useState<SiteDefect[]>([]);
  useEffect(() => {
    if (!aiQuoteEnabled || !report) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const all = await listDefects({ siteId: visit.site_id });
        if (cancelled) return;
        setDefects(all.filter((d) => d.visit_id === visit.id || d.report_id === report.id));
      } catch {
        /* swallow — analyser tolerates an empty list */
      }
    };
    void refresh();
    const t = setInterval(refresh, 10000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [aiQuoteEnabled, visit.id, visit.site_id, report]);

  const analysisHook = useLiveDefectAnalysis(
    report,
    defects,
    siteInfo ?? { name: "" },
    { enabled: aiQuoteEnabled && !!siteInfo },
  );

  // Auto-capture arrival_time on first load if not already set.
  useEffect(() => {
    if (report && !report.arrival_time) {
      void patch({ arrival_time: new Date().toISOString() });
    }
    // run once per report identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.id]);

  const handleComplete = async () => {
    if (!report) return;
    setCompleting(true);
    try {
      const next = await new Promise<ServiceReport>((resolve, reject) => {
        patch({
          status: "completed",
          departure_time: report.departure_time ?? new Date().toISOString(),
        })
          .then(() => refetch().then(() => resolve(report)).catch(reject))
          .catch(reject);
      });
      toast({ title: "Service report completed" });
      onCompleted?.(next);
    } catch (e) {
      toast({
        title: "Could not complete",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setCompleting(false);
    }
  };

  if (loading || !report) {
    return <WizardLoadingState />;
  }

  // Adapter so steps with focused signatures still go through `patch`.
  const patchScalars = (updates: Partial<ServiceReport>) => {
    void patch(updates);
  };
  const patchChecklist = (next: BS5839Checklist) => {
    void patch({ checklist: next });
  };

  return (
    <>
      <WizardShell
        stepLabels={STEP_LABELS}
        stepIdx={stepIdx}
        setStepIdx={setStepIdx}
        saving={saving}
      >
        {stepIdx === 0 && (
          <SystemStep visit={visit} report={report} onPatch={patchScalars} siteId={visit.site_id} />
        )}
        {stepIdx === 1 && <DevicesStep visitId={visit.id} siteId={visit.site_id} />}
        {stepIdx === 2 && (
          <ChecklistStep checklist={report.checklist} onChange={patchChecklist} />
        )}
        {stepIdx === 3 && (
          <FindingsStep
            report={report}
            onPatch={patchScalars}
            siteId={visit.site_id}
            visitId={visit.id}
            reportId={report.id}
          />
        )}
        {stepIdx === 4 && <DepartureStep report={report} onPatch={patchScalars} />}
        {stepIdx === 5 && (
          <SignOffStep
            report={report}
            onPatch={patchScalars}
            onComplete={handleComplete}
            completing={completing}
          />
        )}
      </WizardShell>

      {aiQuoteEnabled && siteInfo && (
        <LiveDefectQuotePanel
          analysis={analysisHook.analysis}
          loading={analysisHook.loading}
          error={analysisHook.error}
          paused={analysisHook.paused}
          setPaused={analysisHook.setPaused}
          refresh={analysisHook.refresh}
          usage={analysisHook.usage}
          siteId={visit.site_id}
          visitId={visit.id}
          reportId={report.id}
          customerId={siteInfo.customer_id}
          userId={userId}
          siteName={siteInfo.name}
        />
      )}
    </>
  );
}
