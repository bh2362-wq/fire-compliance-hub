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
  /** Pre-selects the SOURCE (loser) site — the one that gets archived
      after its records and non-null fields are folded into the target. */
  sourceSiteId?: string;
  sourceSiteName?: string;
  /** Pre-selects the TARGET (winner) site — the one that survives and
      receives every child row plus any non-null fields the source had
      filled but the target didn't. Set this when launching from the
      surviving site's detail page so the engineer doesn't have to
      re-pick it. */
  targetSiteId?: string;
  onSuccess?: () => void;
}

interface SiteOption {
  id: string;
  name: string;
  customer_name: string | null;
  address: string | null;
}

// Every table with a site_id FK to sites.id, as of the FK constraints
// in the generated supabase types. Keep in sync with the schema — a
// missing entry here means rows on the source site silently stay
// pointed at the soon-to-be-inactive loser, breaking workflows that
// hop through it (the QUO-00500 → empty SITE DETAILS bug was caused
// by exactly this — `quotations` was missing from the prior list).
//
// `service_visits` is the table name even though its FK constraint
// is historically named `visits_site_id_fkey`.
const TABLES_WITH_SITE_FK = [
  "appointments",
  "bafe_defect_complaints",
  "bafe_false_alarms",
  "bafe_maintenance_contracts",
  "cause_effect_matrices",
  "ce_audibility_reports",
  "customer_email_drafts",
  "customer_form_submissions",
  "customer_rams_requirements",
  "device_price_lists",
  "devices",
  "email_logs",
  "file_uploads",
  "issues",
  "qms_feedback",
  "qms_ncrs",
  "quotations",
  "rams_documents",
  "service_reports",
  "service_visits",
  "site_assets",
  "site_bafe_certificates",
  "site_defects",
  "site_service_contracts",
  "smart_form_submissions",
  "visit_documents",
] as const;

// Fields we'll fill on the target from the source when the target's
// value is null/empty. Anything not listed here stays untouched on
// both sides — keeps the merge predictable. Identifier columns
// (id, created_at, updated_at, customer_id, name, status) are
// deliberately excluded.
const MERGEABLE_SITE_FIELDS = [
  "address", "city", "postcode",
  "contact_name", "contact_email", "contact_phone",
  "duty_holder_name", "duty_holder_email", "duty_holder_phone", "duty_holder_role",
  "access_hours", "access_notes", "gate_code", "parking_notes",
  "areas_covered", "areas_not_covered",
  "building_type", "occupancy_type",
  "panel_make_model", "panel_software_version",
  "bs5839_category", "cable_type",
  "num_zones", "num_loops", "num_devices", "num_detectors",
  "num_manual_call_points", "num_sounders", "total_devices",
  "psu_capacity_ah", "year_installed",
  "has_pava",
  "pava_make", "pava_model", "pava_software_version",
  "pava_network_topology", "pava_fa_interface_method",
  "pava_num_zones", "pava_num_circuits", "pava_num_loudspeakers",
  "pava_bs_en_54_16_compliant", "pava_bs_en_54_24_compliant", "pava_has_backup_amplifier",
  "arc_connected", "arc_provider", "arc_account_ref",
  "sharepoint_url", "sharepoint_folder",
] as const;

function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string" && v.trim() === "") return true;
  return false;
}

export const MergeSitesDialog = ({
  open, onOpenChange, sourceSiteId, sourceSiteName, targetSiteId, onSuccess,
}: MergeSitesDialogProps) => {
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [sourceId, setSourceId] = useState(sourceSiteId || "");
  const [targetId, setTargetId] = useState(targetSiteId || "");
  const [counts, setCounts] = useState<{ visits: number; devices: number; reports: number; quotations: number; defects: number } | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setSourceId(sourceSiteId || "");
    setTargetId(targetSiteId || "");
    setCounts(null);
    const fetchSites = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("sites")
        .select("id, name, address, customer:customers(name)")
        .order("name");
      setSites((data || []).map((s: { id: string; name: string; address: string | null; customer: { name: string } | null }) => ({
        id: s.id,
        name: s.name,
        customer_name: s.customer?.name || null,
        address: s.address,
      })));
      setLoading(false);
    };
    fetchSites();
  }, [open, sourceSiteId, targetSiteId]);

  // Count what'll move so the engineer sees the blast-radius before
  // confirming. Quotations and defects matter most for fire-compliance
  // workflows — surface them alongside the legacy three counts.
  useEffect(() => {
    if (!sourceId) { setCounts(null); return; }
    const fetchCounts = async () => {
      const [v, d, r, q, df] = await Promise.all([
        supabase.from("service_visits").select("id", { count: "exact", head: true }).eq("site_id", sourceId),
        supabase.from("devices").select("id", { count: "exact", head: true }).eq("site_id", sourceId),
        supabase.from("service_reports").select("id", { count: "exact", head: true }).eq("site_id", sourceId),
        supabase.from("quotations").select("id", { count: "exact", head: true }).eq("site_id", sourceId),
        supabase.from("site_defects").select("id", { count: "exact", head: true }).eq("site_id", sourceId),
      ]);
      setCounts({
        visits: v.count || 0,
        devices: d.count || 0,
        reports: r.count || 0,
        quotations: q.count || 0,
        defects: df.count || 0,
      });
    };
    fetchCounts();
  }, [sourceId]);

  const handleMerge = async () => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setMerging(true);

    try {
      // 1. Load both site rows so we can fill the target's blanks with
      //    the source's values. Without this step, the source's
      //    panel_make_model / bs5839_category / address etc. are
      //    permanently lost when it's archived.
      const [{ data: source }, { data: target }] = await Promise.all([
        supabase.from("sites").select("*").eq("id", sourceId).single(),
        supabase.from("sites").select("*").eq("id", targetId).single(),
      ]);
      if (!source || !target) throw new Error("Failed to load one or both site rows");

      const targetUpdates: Record<string, unknown> = {};
      const src = source as Record<string, unknown>;
      const tgt = target as Record<string, unknown>;
      for (const field of MERGEABLE_SITE_FIELDS) {
        if (isEmpty(tgt[field]) && !isEmpty(src[field])) {
          targetUpdates[field] = src[field];
        }
      }
      const mergedFieldCount = Object.keys(targetUpdates).length;
      if (mergedFieldCount > 0) {
        const { error: updErr } = await supabase
          .from("sites")
          .update(targetUpdates)
          .eq("id", targetId);
        if (updErr) throw new Error(`Failed to update target site fields: ${updErr.message}`);
      }

      // 2. Re-point every FK table from source → target. Fail fast on
      //    the first error rather than continuing silently — a partial
      //    migration that then archives the source would orphan rows.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabase as any;
      let movedRowCount = 0;
      for (const table of TABLES_WITH_SITE_FK) {
        const { error, count } = await client
          .from(table)
          .update({ site_id: targetId }, { count: "exact" })
          .eq("site_id", sourceId);
        if (error) {
          throw new Error(`Failed to migrate ${table}: ${error.message}`);
        }
        movedRowCount += count ?? 0;
      }

      // 3. Mark the source as inactive. We don't DELETE because the
      //    archived row is the historical audit trail of "site X was
      //    merged into site Y on date D" — useful when an engineer
      //    later asks "what happened to that other Downe Manor row?".
      const { error: arcErr } = await supabase
        .from("sites")
        .update({ status: "inactive" })
        .eq("id", sourceId);
      if (arcErr) throw new Error(`Failed to archive source site: ${arcErr.message}`);

      const sourceSite = sites.find(s => s.id === sourceId);
      const targetSite = sites.find(s => s.id === targetId);
      toast({
        title: "Sites merged",
        description: `"${sourceSite?.name}" → "${targetSite?.name}" · ${movedRowCount} record${movedRowCount === 1 ? "" : "s"} moved · ${mergedFieldCount} field${mergedFieldCount === 1 ? "" : "s"} filled · source archived.`,
      });
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      console.error("Merge error:", err);
      const message = err instanceof Error ? err.message : "Failed to merge sites";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setMerging(false);
    }
  };

  const sourceSite = sites.find(s => s.id === sourceId);
  const targetSite = sites.find(s => s.id === targetId);
  // Lock whichever end the caller pinned. Both can be pinned (rare —
  // e.g. you opened from one site detail page already knowing the
  // duplicate ID), in which case the engineer just confirms.
  const sourceLocked = !!sourceSiteId;
  const targetLocked = !!targetSiteId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="w-5 h-5" />
            Merge Duplicate Sites
          </DialogTitle>
          <DialogDescription>
            Move every record from one site into another and fold non-empty fields
            into the target. The source site is then archived (status: inactive).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Source Site (will be archived)</Label>
            <Select value={sourceId} onValueChange={setSourceId} disabled={loading || sourceLocked}>
              <SelectTrigger>
                <SelectValue placeholder={sourceSiteName || "Select source site..."} />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {sites.filter(s => s.id !== targetId).map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.name} {site.customer_name ? `(${site.customer_name})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {counts && (
            <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3 space-y-0.5">
              <div>Records on this site that will be moved:</div>
              <div>
                <strong>{counts.quotations}</strong> quotation{counts.quotations === 1 ? "" : "s"} ·{" "}
                <strong>{counts.defects}</strong> defect{counts.defects === 1 ? "" : "s"} ·{" "}
                <strong>{counts.visits}</strong> visit{counts.visits === 1 ? "" : "s"} ·{" "}
                <strong>{counts.devices}</strong> device{counts.devices === 1 ? "" : "s"} ·{" "}
                <strong>{counts.reports}</strong> report{counts.reports === 1 ? "" : "s"}
              </div>
              <div className="text-xs">Plus any records in the other 21 site-linked tables.</div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Target Site (keep this one)</Label>
            <Select value={targetId} onValueChange={setTargetId} disabled={loading || targetLocked}>
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
                All records from <strong>{sourceSite?.name}</strong> will move to{" "}
                <strong>{targetSite?.name}</strong>. Any field <strong>{targetSite?.name}</strong>{" "}
                doesn't have set (address, panel make, BS5839 category, etc.) will be filled
                from <strong>{sourceSite?.name}</strong>'s value. The source site stays in the
                database as an inactive audit record.
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
