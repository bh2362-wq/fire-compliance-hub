import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { OutstandingInvoices } from "@/components/xero/OutstandingInvoices";
import { ManualInvoiceDialog } from "@/components/xero/ManualInvoiceDialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

const Invoices = () => {
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Invoices</h2>
            <p className="text-muted-foreground">Track and manage outstanding invoices</p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Invoice
          </Button>
        </div>

        <OutstandingInvoices />
      </div>

      <ManualInvoiceDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={() => {
          // Trigger a refresh of the invoices list
          window.location.reload();
        }}
      />
    </DashboardLayout>
  );
};

export default Invoices;
