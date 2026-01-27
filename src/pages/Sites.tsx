import DashboardLayout from "@/components/dashboard/DashboardLayout";
import SitesTable from "@/components/sites/SitesTable";

const Sites = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div>
          <h2 className="text-2xl font-bold text-foreground">Sites</h2>
          <p className="text-muted-foreground">Manage fire alarm installations and device inventories</p>
        </div>

        <SitesTable />
      </div>
    </DashboardLayout>
  );
};

export default Sites;
