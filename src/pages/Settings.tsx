import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { XeroConnectionCard } from "@/components/xero/XeroConnectionCard";

const Settings = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Settings</h2>
          <p className="text-muted-foreground">Manage integrations and preferences</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <XeroConnectionCard />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
