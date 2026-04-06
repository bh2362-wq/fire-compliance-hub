import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ReassignVisitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visitId: string;
  currentSiteId: string;
  currentSiteName: string;
  onSuccess?: () => void;
}

interface SiteOption {
  id: string;
  name: string;
  customer_name: string | null;
  address: string | null;
}

export const ReassignVisitDialog = ({ open, onOpenChange, visitId, currentSiteId, currentSiteName, onSuccess }: ReassignVisitDialogProps) => {
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState(currentSiteId);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setSelectedSiteId(currentSiteId);
    const fetchSites = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("sites")
        .select("id, name, address, customer:customers(name)")
        .eq("status", "active")
        .order("name");
      
      setSites((data || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        customer_name: s.customer?.name || null,
        address: s.address,
      })));
      setLoading(false);
    };
    fetchSites();
  }, [open, currentSiteId]);

  const handleSave = async () => {
    if (selectedSiteId === currentSiteId) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("visits")
      .update({ site_id: selectedSiteId })
      .eq("id", visitId);

    setSaving(false);
    if (error) {
      toast({ title: "Error", description: "Failed to reassign visit", variant: "destructive" });
    } else {
      const newSite = sites.find(s => s.id === selectedSiteId);
      toast({ title: "Visit reassigned", description: `Moved to ${newSite?.name || "new site"}` });
      onSuccess?.();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>Reassign Visit</DialogTitle>
          <DialogDescription>
            Move this visit from <strong>{currentSiteName}</strong> to a different site.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>New Site</Label>
            <Select value={selectedSiteId} onValueChange={setSelectedSiteId} disabled={loading}>
              <SelectTrigger>
                <SelectValue placeholder="Select a site..." />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    <span className="flex flex-col">
                      <span>{site.name}</span>
                      {site.customer_name && (
                        <span className="text-xs text-muted-foreground">{site.customer_name}</span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || selectedSiteId === currentSiteId}>
            {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</> : "Reassign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
