import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { WorkReportWizard } from "@/features/workReport/WorkReportWizard";
import type { WorkReportVisit } from "@/features/workReport/useWorkReportDraft";
import type {
  CompleteSiteInfo,
  CompleteCustomerInfo,
} from "@/features/workReport/completeWorkReport";
import { writeRecentContext } from "@/services/recentContextService";

export default function WorkReportCapture() {
  const { visitId } = useParams<{ visitId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [visit, setVisit] = useState<WorkReportVisit | null>(null);
  const [site, setSite] = useState<CompleteSiteInfo | null>(null);
  const [customer, setCustomer] = useState<CompleteCustomerInfo | null>(null);
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
          .select(
            "id, name, address, city, postcode, contact_name, contact_phone, customer_id, customers(id, name, xero_contact_id)",
          )
          .eq("id", visitRow.site_id)
          .maybeSingle();
        if (siteErr || !siteRow) throw new Error(siteErr?.message ?? "Site not found");

        if (cancelled) return;
        setVisit(visitRow as WorkReportVisit);
        setSite({
          id: siteRow.id,
          name: siteRow.name,
          address: siteRow.address,
          city: siteRow.city,
          postcode: siteRow.postcode,
          contact_name: siteRow.contact_name,
          contact_phone: siteRow.contact_phone,
        });
        writeRecentContext("job", {
          id: visitRow.id,
          label: visitRow.job_number || siteRow.name || "Work report",
          subtitle: siteRow.name,
          href: `/dashboard/visits/${visitRow.id}/work-report/capture`,
        });
        writeRecentContext("site", {
          id: siteRow.id,
          label: siteRow.name,
          subtitle: [siteRow.address, siteRow.city, siteRow.postcode].filter(Boolean).join(", "),
          href: `/dashboard/sites/${siteRow.id}`,
        });

        const cust = siteRow.customers as
          | { id: string; name: string; xero_contact_id: string | null }
          | null;
        if (cust) {
          setCustomer({
            id: cust.id,
            name: cust.name,
            xero_contact_id: cust.xero_contact_id,
          });
        }
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

  if (error || !visit || !site) {
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
        site={site}
        customer={customer}
        onCompleted={() => {
          toast({ title: "Returning to reports" });
          navigate("/dashboard/reports");
        }}
      />
    </div>
  );
}
