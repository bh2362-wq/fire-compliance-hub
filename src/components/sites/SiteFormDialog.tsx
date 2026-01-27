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
import { Loader2 } from "lucide-react";
import { Site, SiteFormData, createSite, updateSite } from "@/services/siteService";
import { useToast } from "@/hooks/use-toast";

interface SiteFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  site?: Site | null;
  onSuccess: () => void;
}

const SiteFormDialog = ({ open, onOpenChange, site, onSuccess }: SiteFormDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<SiteFormData>({
    name: "",
    address: "",
    city: "",
    postcode: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
  });
  const { toast } = useToast();

  useEffect(() => {
    if (site) {
      setFormData({
        name: site.name,
        address: site.address || "",
        city: site.city || "",
        postcode: site.postcode || "",
        contact_name: site.contact_name || "",
        contact_email: site.contact_email || "",
        contact_phone: site.contact_phone || "",
      });
    } else {
      setFormData({
        name: "",
        address: "",
        city: "",
        postcode: "",
        contact_name: "",
        contact_email: "",
        contact_phone: "",
      });
    }
  }, [site, open]);

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

    const { error } = site
      ? await updateSite(site.id, formData)
      : await createSite(formData);

    setLoading(false);

    if (error) {
      toast({
        title: site ? "Update failed" : "Creation failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: site ? "Site updated" : "Site created",
        description: `${formData.name} has been ${site ? "updated" : "added"} successfully.`,
      });
      onSuccess();
      onOpenChange(false);
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
            <Label htmlFor="name">Site Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={handleChange("name")}
              placeholder="e.g., Manchester Royal Infirmary"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={handleChange("address")}
                placeholder="Street address"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={handleChange("city")}
                placeholder="City"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="postcode">Postcode</Label>
            <Input
              id="postcode"
              value={formData.postcode}
              onChange={handleChange("postcode")}
              placeholder="e.g., M13 9WL"
              className="w-32"
            />
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-sm font-medium text-foreground mb-3">Contact Details</p>
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
