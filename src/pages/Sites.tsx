import DashboardLayout from "@/components/dashboard/DashboardLayout";
import SitesList from "@/components/dashboard/SitesList";

const Sites = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div>
          <h2 className="text-2xl font-bold text-foreground">Sites</h2>
          <p className="text-muted-foreground">Manage fire alarm installations and device inventories</p>
        </div>

        <SitesList />
      </div>
    </DashboardLayout>
  );
};

export default Sites;
