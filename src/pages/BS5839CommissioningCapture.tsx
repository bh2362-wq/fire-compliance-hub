import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { CommissioningWizard } from "@/features/bs5839Commissioning/CommissioningWizard";
import { writeRecentContext } from "@/services/recentContextService";

// Route handler for /dashboard/visits/:visitId/bs5839-commissioning/capture
// Thin wrapper — the wizard owns all loading + error UI via its own
// state hook, so this page just validates the URL param and hands
// off.

export default function BS5839CommissioningCapture() {
  const { visitId } = useParams<{ visitId: string }>();

  const visitIdValid =
    !!visitId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(visitId);

  useEffect(() => {
    if (!visitIdValid || !visitId) return;
    writeRecentContext("job", {
      id: visitId,
      label: "Commissioning",
      subtitle: "BS 5839",
      href: `/dashboard/visits/${visitId}/bs5839-commissioning/capture`,
    });
  }, [visitId, visitIdValid]);

  if (!visitIdValid) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <p className="text-sm font-medium">Invalid visit URL</p>
        <p className="text-xs text-muted-foreground mt-1">
          Open this wizard from a visit page rather than direct-typing the URL.
        </p>
      </div>
    );
  }

  return <CommissioningWizard visitId={visitId!} />;
}
