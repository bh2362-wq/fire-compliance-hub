import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { DisabledRefugeWizard } from "@/features/disabledRefugeReport/DisabledRefugeWizard";
import type { DisabledRefugeAsset } from "@/features/disabledRefugeReport/useDisabledRefugeDraft";
import { writeRecentContext } from "@/services/recentContextService";

interface VisitRow {
  id: string;
  visit_type: string;
  visit_date: string;
  site_id: string;
  job_number?: string | null;
  site?: { id: string; name: string } | null;
}

export default function DisabledRefugeReportCapture() {
  const { visitId } = useParams<{ visitId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [visit, setVisit] = useState<VisitRow | null>(null);
  const [assets, setAssets] = useState<DisabledRefugeAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const visitIdValid =
    !!visitId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(visitId);

  useEffect(() => {
    if (!visitIdValid) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: visitData, error: visitErr } = await supabase
          .from("service_visits")
          .select("id, visit_type, visit_date, site_id, job_number, site:sites(id, name)")
          .eq("id", visitId!)
          .maybeSingle();
        if (visitErr || !visitData) throw new Error(visitErr?.message ?? "Visit not found");

        const { data: assetData, error: assetErr } = await supabase
          .from("site_assets")
          .select("id, item_name, manufacturer, model, location")
          .eq("site_id", visitData.site_id)
          .eq("asset_type", "disabled_refuge")
          .order("created_at", { ascending: true });
        if (assetErr) throw assetErr;

        if (cancelled) return;
        const loadedVisit = visitData as VisitRow;
        setVisit(loadedVisit);
        writeRecentContext("job", {
          id: loadedVisit.id,
          label: loadedVisit.job_number || loadedVisit.site?.name || "Disabled refuge report",
          subtitle: loadedVisit.site?.name || "Disabled refuge report",
          href: `/dashboard/visits/${loadedVisit.id}/disabled-refuge-report/capture`,
        });
        if (loadedVisit.site?.name) {
          writeRecentContext("site", {
            id: loadedVisit.site_id,
            label: loadedVisit.site.name,
            subtitle: "From disabled refuge report",
            href: `/dashboard/sites/${loadedVisit.site_id}`,
          });
        }
        setAssets((assetData ?? []) as DisabledRefugeAsset[]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visitId, visitIdValid]);

  if (!visitIdValid) {
    return (
      <div className="max-w-md mx-auto p-6 text-center space-y-4">
        <p className="text-sm font-medium">This disabled-refuge report URL is malformed.</p>
        <p className="text-xs text-muted-foreground">
          Open a report from the Reports or Visits page — don't navigate to the route pattern directly.
        </p>
        <Button onClick={() => navigate("/dashboard/reports")} variant="outline">
          Go to Reports
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !visit) {
    return (
      <div className="max-w-md mx-auto p-6 text-center space-y-4">
        <p className="text-sm text-muted-foreground">{error ?? "Could not load this visit."}</p>
        <Button onClick={() => navigate(-1)} variant="outline">Go back</Button>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <p className="text-sm text-muted-foreground">
          You must be signed in to capture a disabled-refuge report.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DisabledRefugeWizard
        visit={visit}
        assets={assets}
        userId={user.id}
        onCompleted={() => {
          toast({ title: "Returning to reports" });
          navigate("/dashboard/reports");
        }}
      />
    </div>
  );
}
