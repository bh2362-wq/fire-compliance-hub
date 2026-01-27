import { useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import ReconciliationPanel from "@/components/reconciliation/ReconciliationPanel";

const Reconciliation = () => {
  const [searchParams] = useSearchParams();
  const initialSiteId = searchParams.get("siteId") || undefined;
  const initialUploadId = searchParams.get("uploadId") || undefined;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Reconciliation</h2>
          <p className="text-muted-foreground">
            Compare uploaded test results against site device inventory to calculate coverage
          </p>
        </div>

        <ReconciliationPanel 
          initialSiteId={initialSiteId} 
          initialUploadId={initialUploadId} 
        />
      </div>
    </DashboardLayout>
  );
};

export default Reconciliation;
