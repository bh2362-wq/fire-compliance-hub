import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { WorkReportWizard } from "@/features/workReport/WorkReportWizard";
import type { WorkReportVisit } from "@/features/workReport/useWorkReportDraft";

interface SiteRow {
  name: string | null;
  address: string | null;
  city: string | null;
  postcode: string | null;
  contact_name: string | null;
}

function buildFullAddress(s: SiteRow | null): string {
  if (!s) return "";
  return [s.address, s.city, s.postcode].filter(Boolean).join(", ");
}

export default function WorkReportCapture() {
  const { visitId } = useParams<{ visitId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [visit, setVisit] = useState<WorkReportVisit | null>(null);
  const [site, setSite] = useState<SiteRow | null>(null);
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
        const { data: visitRow, error: visitErr } = await supabase
          .from("service_visits")
          .select("id, visit_type, visit_date, site_id, job_number, notes")
          .eq("id", visitId!)
          .maybeSingle();
        if (visitErr || !visitRow) throw new Error(visitErr?.message ?? "Visit not found");

        const { data: siteRow, error: siteErr } = await supabase
          .from("sites")
          .select("name, address, city, postcode, contact_name")
          .eq("id", visitRow.site_id)
          .maybeSingle();
        if (siteErr) throw siteErr;

        if (cancelled) return;
        setVisit(visitRow as WorkReportVisit);
        setSite(siteRow as SiteRow | null);
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
        <p className="text-sm font-medium">This work-report URL is malformed.</p>
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
          You must be signed in to capture a work report.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <WorkReportWizard
        visit={visit}
        userId={user.id}
        siteName={site?.name ?? ""}
        siteContactName={site?.contact_name ?? null}
        siteFullAddress={buildFullAddress(site)}
        onCompleted={() => {
          toast({ title: "Returning to reports" });
          navigate("/dashboard/reports");
        }}
      />
    </div>
  );
}
