import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Plus, Building2 } from "lucide-react";
import { CustomersTable } from "@/components/customers/CustomersTable";
import { CustomerFormDialog } from "@/components/customers/CustomerFormDialog";
import { CustomerWithSiteCount } from "@/services/customerService";

const Customers = () => {
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerWithSiteCount | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleEdit = (customer: CustomerWithSiteCount) => {
    setEditingCustomer(customer);
    setShowForm(true);
  };

  const handleSuccess = () => {
    setRefreshTrigger((prev) => prev + 1);
    setEditingCustomer(null);
  };

  const handleCloseForm = (open: boolean) => {
    setShowForm(open);
    if (!open) setEditingCustomer(null);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">Customers</h2>
              <p className="text-muted-foreground">Manage your customer accounts</p>
            </div>
          </div>
          <Button variant="hero" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Customer
          </Button>
        </div>

        <div className="bg-card rounded-xl border border-border p-6">
          <CustomersTable onEdit={handleEdit} refreshTrigger={refreshTrigger} />
        </div>
      </div>

      <CustomerFormDialog
        open={showForm}
        onOpenChange={handleCloseForm}
        customer={editingCustomer}
        onSuccess={handleSuccess}
      />
    </DashboardLayout>
  );
};

export default Customers;
