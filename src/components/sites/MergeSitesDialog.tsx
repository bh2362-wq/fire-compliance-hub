import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertTriangle, GitMerge } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface MergeSitesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceSiteId?: string;
  sourceSiteName?: string;
  onSuccess?: () => void;
}

interface SiteOption {
  id: string;
  name: string;
  customer_name: string | null;
  address: string | null;
}

export const MergeSitesDialog = ({ open, onOpenChange, sourceSiteId, sourceSiteName, onSuccess }: MergeSitesDialogProps) => {
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [sourceId, setSourceId] = useState(sourceSiteId || "");
  const [targetId, setTargetId] = useState("");
  const [counts, setCounts] = useState<{ visits: number; devices: number; reports: number } | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setSourceId(sourceSiteId || "");
    setTargetId("");
    setCounts(null);
    const fetchSites = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("sites")
        .select("id, name, address, customer:customers(name)")
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
  }, [open, sourceSiteId]);

  // Fetch counts when source is selected
  useEffect(() => {
    if (!sourceId) { setCounts(null); return; }
    const fetchCounts = async () => {
      const [v, d, r] = await Promise.all([
        supabase.from("visits").select("id", { count: "exact", head: true }).eq("site_id", sourceId),
        supabase.from("devices").select("id", { count: "exact", head: true }).eq("site_id", sourceId),
        supabase.from("service_reports").select("id", { count: "exact", head: true }).eq("site_id", sourceId),
      ]);
      setCounts({ visits: v.count || 0, devices: d.count || 0, reports: r.count || 0 });
    };
    fetchCounts();
  }, [sourceId]);

  const handleMerge = async () => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setMerging(true);

    try {
      // Reassign all related records from source to target
      // Reassign records from known tables
      const migrateFn = async (table: string) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const client = supabase as any;
        const { error } = await client
          .from(table)
          .update({ site_id: targetId })
          .eq("site_id", sourceId);
        if (error) console.warn(`Failed to migrate ${table}:`, error.message);
      };

      const tables = [
        "visits", "devices", "service_reports", "appointments",
        "file_uploads", "issues", "email_logs", "customer_form_submissions",
        "customer_rams_requirements", "site_service_contracts", "site_assets", "rams_documents",
      ];

      for (const table of tables) {
        await migrateFn(table);
      }

      // Mark source site as inactive
      await supabase
        .from("sites")
        .update({ status: "inactive" })
        .eq("id", sourceId);

      const sourceSite = sites.find(s => s.id === sourceId);
      const targetSite = sites.find(s => s.id === targetId);
      toast({
        title: "Sites merged",
        description: `All records from "${sourceSite?.name}" moved to "${targetSite?.name}". Source site marked inactive.`,
      });
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      console.error("Merge error:", err);
      toast({ title: "Error", description: "Failed to merge sites", variant: "destructive" });
    } finally {
      setMerging(false);
    }
  };

  const sourceSite = sites.find(s => s.id === sourceId);
  const targetSite = sites.find(s => s.id === targetId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="w-5 h-5" />
            Merge Duplicate Sites
          </DialogTitle>
          <DialogDescription>
            Move all records from one site into another. The source site will be marked inactive.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Source Site (will be merged away)</Label>
            <Select value={sourceId} onValueChange={setSourceId} disabled={loading || !!sourceSiteId}>
              <SelectTrigger>
                <SelectValue placeholder="Select source site..." />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.name} {site.customer_name ? `(${site.customer_name})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {counts && (
            <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
              This site has <strong>{counts.visits}</strong> visits, <strong>{counts.devices}</strong> devices, and <strong>{counts.reports}</strong> reports that will be moved.
            </div>
          )}

          <div className="space-y-2">
            <Label>Target Site (keep this one)</Label>
            <Select value={targetId} onValueChange={setTargetId} disabled={loading}>
              <SelectTrigger>
                <SelectValue placeholder="Select target site..." />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {sites.filter(s => s.id !== sourceId).map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.name} {site.customer_name ? `(${site.customer_name})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {sourceId && targetId && sourceId !== targetId && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                All records from <strong>{sourceSite?.name}</strong> will be permanently moved to <strong>{targetSite?.name}</strong>. This cannot be easily undone.
              </AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={handleMerge}
            disabled={merging || !sourceId || !targetId || sourceId === targetId}
          >
            {merging ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Merging...</> : "Merge Sites"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
