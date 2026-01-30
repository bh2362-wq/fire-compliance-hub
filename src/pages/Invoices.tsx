import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { OutstandingInvoices } from "@/components/xero/OutstandingInvoices";

const Invoices = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div>
          <h2 className="text-2xl font-bold text-foreground">Invoices</h2>
          <p className="text-muted-foreground">Track and manage outstanding invoices</p>
        </div>

        <OutstandingInvoices />
      </div>
    </DashboardLayout>
  );
};

export default Invoices;
