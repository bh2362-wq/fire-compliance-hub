import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { Site, createSite, updateSite } from "@/services/siteService";
import { getCustomers, CustomerWithSiteCount } from "@/services/customerService";
import { useToast } from "@/hooks/use-toast";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { supabase } from "@/integrations/supabase/client";

interface SiteFormData {
  name: string;
  address: string;
  city: string;
  postcode: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  customer_id: string | null;
}

interface SiteFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  site?: Site | null;
  onSuccess?: () => void;
  onSiteCreated?: () => void;
  defaultCustomerId?: string;
}

const SiteFormDialog = ({ 
  open, 
  onOpenChange, 
  site, 
  onSuccess,
  onSiteCreated,
  defaultCustomerId,
}: SiteFormDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<CustomerWithSiteCount[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [formData, setFormData] = useState<SiteFormData>({
    name: "",
    address: "",
    city: "",
    postcode: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    customer_id: defaultCustomerId || null,
  });
  const { toast } = useToast();

  // Load customers for the dropdown
  useEffect(() => {
    const loadCustomers = async () => {
      setLoadingCustomers(true);
      const { customers: data } = await getCustomers();
      setCustomers(data);
      setLoadingCustomers(false);
    };
    if (open) {
      loadCustomers();
    }
  }, [open]);

  useEffect(() => {
    if (site) {
      // We need to fetch customer_id for existing site
      const fetchSiteWithCustomer = async () => {
        const { data } = await supabase
          .from("sites")
          .select("customer_id")
          .eq("id", site.id)
          .maybeSingle();
        
        setFormData({
          name: site.name,
          address: site.address || "",
          city: site.city || "",
          postcode: site.postcode || "",
          contact_name: site.contact_name || "",
          contact_email: site.contact_email || "",
          contact_phone: site.contact_phone || "",
          customer_id: data?.customer_id || null,
        });
      };
      fetchSiteWithCustomer();
    } else {
      setFormData({
        name: "",
        address: "",
        city: "",
        postcode: "",
        contact_name: "",
        contact_email: "",
        contact_phone: "",
        customer_id: defaultCustomerId || null,
      });
    }
  }, [site, open, defaultCustomerId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: "Validation error",
        description: "Site name is required",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    if (site) {
      // Update existing site
      const { error } = await updateSite(site.id, {
        name: formData.name,
        address: formData.address || undefined,
        city: formData.city || undefined,
        postcode: formData.postcode || undefined,
        contact_name: formData.contact_name || undefined,
        contact_email: formData.contact_email || undefined,
        contact_phone: formData.contact_phone || undefined,
      });

      // Update customer_id separately
      if (!error) {
        await supabase
          .from("sites")
          .update({ customer_id: formData.customer_id })
          .eq("id", site.id);
      }

      setLoading(false);

      if (error) {
        toast({
          title: "Update failed",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Site updated",
          description: `${formData.name} has been updated successfully.`,
        });
        onSuccess?.();
        onSiteCreated?.();
        onOpenChange(false);
      }
    } else {
      // Create new site with customer_id
      const { data: newSite, error } = await supabase
        .from("sites")
        .insert({
          name: formData.name,
          address: formData.address || null,
          city: formData.city || null,
          postcode: formData.postcode || null,
          contact_name: formData.contact_name || null,
          contact_email: formData.contact_email || null,
          contact_phone: formData.contact_phone || null,
          customer_id: formData.customer_id,
          status: "active",
        })
        .select()
        .single();

      setLoading(false);

      if (error) {
        toast({
          title: "Creation failed",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Site created",
          description: `${formData.name} has been added successfully.`,
        });
        onSuccess?.();
        onSiteCreated?.();
        onOpenChange(false);
      }
    }
  };

  const handleChange = (field: keyof SiteFormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{site ? "Edit Site" : "Add New Site"}</DialogTitle>
          <DialogDescription>
            {site ? "Update the site details below." : "Enter the details for the new site."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="customer">Customer</Label>
            <Select
              value={formData.customer_id || "none"}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, customer_id: value === "none" ? null : value }))
              }
              disabled={loadingCustomers}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a customer (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No customer</SelectItem>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Site Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={handleChange("name")}
              placeholder="e.g., Manchester Royal Infirmary"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <AddressAutocomplete
              value={formData.address}
              onChange={(value) => setFormData((prev) => ({ ...prev, address: value }))}
              onAddressSelect={(details) => {
                setFormData((prev) => ({
                  ...prev,
                  address: details.address,
                  city: details.city,
                  postcode: details.postcode,
                }));
              }}
              placeholder="Start typing to search UK addresses..."
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={handleChange("city")}
                placeholder="City"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postcode">Postcode</Label>
              <Input
                id="postcode"
                value={formData.postcode}
                onChange={handleChange("postcode")}
                placeholder="e.g., M13 9WL"
              />
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-sm font-medium text-foreground mb-3">Site Contact Details</p>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="contact_name">Contact Name</Label>
                <Input
                  id="contact_name"
                  value={formData.contact_name}
                  onChange={handleChange("contact_name")}
                  placeholder="Primary contact"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contact_email">Email</Label>
                  <Input
                    id="contact_email"
                    type="email"
                    value={formData.contact_email}
                    onChange={handleChange("contact_email")}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact_phone">Phone</Label>
                  <Input
                    id="contact_phone"
                    value={formData.contact_phone}
                    onChange={handleChange("contact_phone")}
                    placeholder="Phone number"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="hero" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  {site ? "Updating..." : "Creating..."}
                </>
              ) : (
                site ? "Update Site" : "Create Site"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SiteFormDialog;
