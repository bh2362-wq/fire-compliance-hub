import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createSupplier, Supplier } from "@/services/purchaseOrderService";
import { useAuth } from "@/contexts/AuthContext";

interface SupplierFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (supplier: Supplier) => void;
  supplier?: Supplier | null;
}

const SupplierFormDialog = ({
  open,
  onOpenChange,
  onSuccess,
  supplier,
}: SupplierFormDialogProps) => {
  const { user } = useAuth();
  const isEditing = !!supplier;
  const [loading, setLoading] = useState(false);
  const [syncToXero, setSyncToXero] = useState(true);
  
  // Form state
  const [formData, setFormData] = useState({
    name: "",
    contact_name: "",
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    mobile: "",
    address: "",
    address_line_2: "",
    city: "",
    region: "",
    postcode: "",
    country: "United Kingdom",
    tax_number: "",
    bank_account_name: "",
    bank_account_number: "",
    bank_sort_code: "",
    default_currency: "GBP",
    notes: "",
  });

  const resetForm = () => {
    setFormData({
      name: "",
      contact_name: "",
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      mobile: "",
      address: "",
      address_line_2: "",
      city: "",
      region: "",
      postcode: "",
      country: "United Kingdom",
      tax_number: "",
      bank_account_name: "",
      bank_account_number: "",
      bank_sort_code: "",
      default_currency: "GBP",
      notes: "",
    });
    setSyncToXero(true);
  };

  // Populate form when editing
  useEffect(() => {
    if (supplier && open) {
      setFormData({
        name: supplier.name || "",
        contact_name: supplier.contact_name || "",
        first_name: "",
        last_name: "",
        email: supplier.email || "",
        phone: supplier.phone || "",
        mobile: "",
        address: supplier.address || "",
        address_line_2: "",
        city: supplier.city || "",
        region: "",
        postcode: supplier.postcode || "",
        country: "United Kingdom",
        tax_number: "",
        bank_account_name: "",
        bank_account_number: "",
        bank_sort_code: "",
        default_currency: "GBP",
        notes: supplier.notes || "",
      });
      setSyncToXero(false);
    } else if (!open) {
      resetForm();
    }
  }, [supplier, open]);

  const handleAddressSelect = (details: {
    address: string;
    city: string;
    postcode: string;
    businessName?: string;
  }) => {
    setFormData((prev) => ({
      ...prev,
      address: details.address,
      city: details.city,
      postcode: details.postcode,
      name: prev.name || details.businessName || "",
    }));
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error("Supplier name is required");
      return;
    }

    if (!user?.id) {
      toast.error("You must be logged in");
      return;
    }

    try {
      setLoading(true);

      if (isEditing && supplier) {
        // Update existing supplier
        const { data: updated, error } = await supabase
          .from("suppliers")
          .update({
            name: formData.name,
            contact_name: formData.contact_name || `${formData.first_name} ${formData.last_name}`.trim() || null,
            email: formData.email || null,
            phone: formData.phone || null,
            address: formData.address || null,
            city: formData.city || null,
            postcode: formData.postcode || null,
            notes: formData.notes || null,
          })
          .eq("id", supplier.id)
          .select()
          .single();

        if (error) throw error;
        toast.success("Supplier updated");
        onOpenChange(false);
        onSuccess(updated as Supplier);
        return;
      }

      let xeroContactId: string | null = null;
      let xeroSyncFailed = false;

      // Sync to Xero first if enabled
      if (syncToXero) {
        try {
          const { data: xeroResult, error: xeroError } = await supabase.functions.invoke(
            "xero-create-supplier",
            {
              body: formData,
            }
          );

          if (xeroError) {
            console.error("Xero sync error:", xeroError);
            xeroSyncFailed = true;
            const errorMessage = xeroError.message || "";
            if (errorMessage.includes("Load failed") || errorMessage.includes("timeout") || errorMessage.includes("Failed to fetch")) {
              toast.warning("Xero sync unavailable. Creating supplier locally only.");
            } else {
              toast.warning("Failed to sync to Xero. Creating locally only.");
            }
          } else if (xeroResult?.error) {
            console.error("Xero API error:", xeroResult.error);
            xeroSyncFailed = true;
            toast.warning(`Xero: ${xeroResult.error}. Creating locally only.`);
          } else if (xeroResult?.xero_contact_id) {
            xeroContactId = xeroResult.xero_contact_id;
          }
        } catch (xeroErr: any) {
          console.error("Xero sync exception:", xeroErr);
          xeroSyncFailed = true;
          toast.warning("Xero sync failed. Creating supplier locally only.");
        }
      }

      // Create in local database
      const newSupplier = await createSupplier(
        {
          name: formData.name,
          contact_name: formData.contact_name || `${formData.first_name} ${formData.last_name}`.trim() || null,
          email: formData.email || null,
          phone: formData.phone || null,
          address: formData.address || null,
          city: formData.city || null,
          postcode: formData.postcode || null,
          xero_contact_id: xeroContactId,
          notes: formData.notes || null,
        },
        user.id
      );

      if (xeroContactId) {
        toast.success("Supplier created and synced to Xero");
      } else if (syncToXero && xeroSyncFailed) {
        toast.success("Supplier created locally (Xero sync can be retried later)");
      } else {
        toast.success("Supplier added successfully");
      }
      
      resetForm();
      onOpenChange(false);
      onSuccess(newSupplier);
    } catch (error: any) {
      console.error("Error adding supplier:", error);
      toast.error(error.message || "Failed to add supplier");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) resetForm();
      onOpenChange(open);
    }}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Supplier" : "Add New Supplier"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Xero Sync Toggle - only show for new suppliers */}
          {!isEditing && (
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div>
              <p className="font-medium">Sync to Xero</p>
              <p className="text-sm text-muted-foreground">
                Create this supplier as a contact in your Xero account
              </p>
            </div>
            <Switch checked={syncToXero} onCheckedChange={setSyncToXero} />
          </div>
          )}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground">Company Details</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Company Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter company name"
                />
              </div>
              
              <div className="space-y-2">
                <Label>VAT Number</Label>
                <Input
                  value={formData.tax_number}
                  onChange={(e) => setFormData({ ...formData, tax_number: e.target.value })}
                  placeholder="e.g. GB123456789"
                />
              </div>

              <div className="space-y-2">
                <Label>Default Currency</Label>
                <Input
                  value={formData.default_currency}
                  onChange={(e) => setFormData({ ...formData, default_currency: e.target.value })}
                  placeholder="GBP"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Contact Person */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground">Contact Person</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  placeholder="First name"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  placeholder="Last name"
                />
              </div>

              <div className="space-y-2">
                <Label>Email Address</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@company.com"
                />
              </div>

              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Phone number"
                />
              </div>

              <div className="space-y-2">
                <Label>Mobile</Label>
                <Input
                  value={formData.mobile}
                  onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                  placeholder="Mobile number"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Address */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground">Address</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Address Line 1</Label>
                <AddressAutocomplete
                  value={formData.address}
                  onChange={(value) => setFormData({ ...formData, address: value })}
                  onAddressSelect={handleAddressSelect}
                  placeholder="Start typing address..."
                />
              </div>

              <div className="col-span-2 space-y-2">
                <Label>Address Line 2</Label>
                <Input
                  value={formData.address_line_2}
                  onChange={(e) => setFormData({ ...formData, address_line_2: e.target.value })}
                  placeholder="Suite, floor, etc."
                />
              </div>

              <div className="space-y-2">
                <Label>City</Label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="City"
                />
              </div>

              <div className="space-y-2">
                <Label>Region / County</Label>
                <Input
                  value={formData.region}
                  onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                  placeholder="County"
                />
              </div>

              <div className="space-y-2">
                <Label>Postcode</Label>
                <Input
                  value={formData.postcode}
                  onChange={(e) => setFormData({ ...formData, postcode: e.target.value })}
                  placeholder="Postcode"
                />
              </div>

              <div className="space-y-2">
                <Label>Country</Label>
                <Input
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  placeholder="Country"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Bank Details */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground">Bank Details (Optional)</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Account Name</Label>
                <Input
                  value={formData.bank_account_name}
                  onChange={(e) => setFormData({ ...formData, bank_account_name: e.target.value })}
                  placeholder="Account holder name"
                />
              </div>

              <div className="space-y-2">
                <Label>Sort Code</Label>
                <Input
                  value={formData.bank_sort_code}
                  onChange={(e) => setFormData({ ...formData, bank_sort_code: e.target.value })}
                  placeholder="00-00-00"
                />
              </div>

              <div className="space-y-2">
                <Label>Account Number</Label>
                <Input
                  value={formData.bank_account_number}
                  onChange={(e) => setFormData({ ...formData, bank_account_number: e.target.value })}
                  placeholder="12345678"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes about this supplier"
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {isEditing ? "Saving..." : syncToXero ? "Creating in Xero..." : "Creating..."}
                </>
              ) : (
                isEditing ? "Save Changes" : "Add Supplier"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SupplierFormDialog;