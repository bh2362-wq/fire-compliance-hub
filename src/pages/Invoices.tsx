import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { OutstandingInvoices } from "@/components/xero/OutstandingInvoices";
import { ManualInvoiceDialog } from "@/components/xero/ManualInvoiceDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";

const Invoices = () => {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Invoices</h2>
            <p className="text-muted-foreground">Track and manage outstanding invoices</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search invoices..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-[250px]"
              />
            </div>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Invoice
            </Button>
          </div>
        </div>

        <OutstandingInvoices searchQuery={searchQuery} />
      </div>

      <ManualInvoiceDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={() => {
          window.location.reload();
        }}
      />
    </DashboardLayout>
  );
};

export default Invoices;
