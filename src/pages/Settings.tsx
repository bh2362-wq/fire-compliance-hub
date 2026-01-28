import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { XeroConnectionCard } from "@/components/xero/XeroConnectionCard";
import { OutstandingInvoices } from "@/components/xero/OutstandingInvoices";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { getXeroConnection, XeroConnection } from "@/services/xeroService";

const Settings = () => {
  const { user } = useAuth();
  const [xeroConnection, setXeroConnection] = useState<XeroConnection | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkConnection = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      
      try {
        const connection = await getXeroConnection(user.id);
        setXeroConnection(connection);
      } catch (err) {
        console.error("Failed to check Xero connection:", err);
      } finally {
        setLoading(false);
      }
    };
    
    checkConnection();
  }, [user]);

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

        {/* Show Outstanding Invoices if connected to Xero */}
        {!loading && xeroConnection && <OutstandingInvoices />}
      </div>
    </DashboardLayout>
  );
};

export default Settings;
