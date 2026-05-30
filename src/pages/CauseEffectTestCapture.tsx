import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Visit } from "@/hooks/useVisits";
import { CauseEffectTestWizard } from "@/features/causeEffectTest/CauseEffectTestWizard";

export default function CauseEffectTestCapture() {
  const { visitId } = useParams<{ visitId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UUID guard — same defensive check the BS 5839 wizard does so a bad
  // URL surfaces a friendly message instead of a Postgres error.
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
      setVisit(data as unknown as Visit);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [visitId, visitIdValid]);

  if (!visitIdValid) {
    return (
      <div className="max-w-md mx-auto p-6 text-center space-y-4">
        <p className="text-sm font-medium">This C&amp;E test URL is malformed.</p>
        <p className="text-xs text-muted-foreground">
          Open a cause &amp; effect test from a Visits row — don't navigate to the
          route pattern directly.
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
          You must be signed in to capture a C&amp;E test report.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <CauseEffectTestWizard
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
