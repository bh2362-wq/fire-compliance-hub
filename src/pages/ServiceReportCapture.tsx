import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Visit } from "@/hooks/useVisits";
import { CaptureWizard } from "@/features/serviceReport/CaptureWizard";
import { writeRecentContext } from "@/services/recentContextService";

export default function ServiceReportCapture() {
  const { visitId } = useParams<{ visitId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reject obviously-malformed visit ids before sending them to the DB.
  // Without this guard, hitting the page with the literal route param
  // (e.g. opening the URL pattern from preview tooling) surfaces the
  // Postgres uuid syntax error, which is confusing.
  const visitIdValid =
    !!visitId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(visitId);

  useEffect(() => {
    if (!visitIdValid) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error: err } = await supabase
        .from("service_visits")
        .select("*, site:sites(id, name)")
        .eq("id", visitId!)
        .maybeSingle();
      if (cancelled) return;
      if (err || !data) {
        setError(err?.message ?? "Visit not found");
        setLoading(false);
        return;
      }
      const loadedVisit = data as unknown as Visit;
      setVisit(loadedVisit);
      writeRecentContext("job", {
        id: loadedVisit.id,
        label: loadedVisit.job_number || loadedVisit.site?.name || "Service report",
        subtitle: loadedVisit.site?.name || loadedVisit.visit_type,
        href: `/dashboard/visits/${loadedVisit.id}/service-report/capture`,
      });
      if (loadedVisit.site_id && loadedVisit.site?.name) {
        writeRecentContext("site", {
          id: loadedVisit.site_id,
          label: loadedVisit.site.name,
          subtitle: "From service report",
          href: `/dashboard/sites/${loadedVisit.site_id}`,
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [visitId, visitIdValid]);

  if (!visitIdValid) {
    return (
      <div className="max-w-md mx-auto p-6 text-center space-y-4">
        <p className="text-sm font-medium">This service report URL is malformed.</p>
        <p className="text-xs text-muted-foreground">
          Open a service report from the Visits page (clipboard icon on a row) or the
          site's Service Reports list — don't navigate to the route pattern directly.
        </p>
        <Button onClick={() => navigate("/dashboard/visits")} variant="outline">
          Go to Visits
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
        <p className="text-sm text-muted-foreground">
          {error ?? "Could not load this visit."}
        </p>
        <Button onClick={() => navigate(-1)} variant="outline">
          Go back
        </Button>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <p className="text-sm text-muted-foreground">
          You must be signed in to capture a service report.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <CaptureWizard
        visit={visit}
        userId={user.id}
        onCompleted={() => {
          toast({ title: "Returning to visits" });
          navigate(`/dashboard/visits`);
        }}
      />
    </div>
  );
}
