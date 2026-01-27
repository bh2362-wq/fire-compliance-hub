import DashboardLayout from "@/components/dashboard/DashboardLayout";
import ReconciliationPanel from "@/components/reconciliation/ReconciliationPanel";

const Reconciliation = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Reconciliation</h2>
          <p className="text-muted-foreground">
            Compare uploaded test results against site device inventory to calculate coverage
          </p>
        </div>

        <ReconciliationPanel />
      </div>
    </DashboardLayout>
  );
};

export default Reconciliation;
