import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SiteRow {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  customers: { name: string } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Discriminator so we update the right table — service_reports vs.
  // ce_audibility_reports — without dragging the full row types in.
  reportKind: "service" | "ce";
  reportId: string | null;
  currentSiteId: string | null;
  currentSiteName: string | null;
  onSuccess: () => void;
}

/**
 * Reassign an existing report to a different site. Customer follows
 * automatically via the new site's customer_id (joined when the report
 * row is next read). Only changes report.site_id — the visit's site_id
 * is left untouched so any captured devices / defects keep their
 * original visit binding.
 */
export function ChangeReportSiteDialog({
  open, onOpenChange, reportKind, reportId, currentSiteId, currentSiteName, onSuccess,
}: Props) {
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedId(currentSiteId);
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("sites")
        .select("id, name, address, city, customers:customer_id(name)")
        .eq("status", "active")
        .order("name");
      if (cancelled) return;
      if (error) {
        toast.error(`Couldn't load sites: ${error.message}`);
        setSites([]);
      } else {
        setSites((data ?? []) as unknown as SiteRow[]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, currentSiteId]);

  const handleSave = async () => {
    if (!reportId || !selectedId || selectedId === currentSiteId) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    try {
      const table = reportKind === "ce" ? "ce_audibility_reports" : "service_reports";
      const { error } = await (supabase as any)
        .from(table)
        .update({ site_id: selectedId })
        .eq("id", reportId);
      if (error) throw error;
      toast.success("Report moved to the selected site.");
      onSuccess();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Couldn't move report: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Move report to a different site</DialogTitle>
          <DialogDescription>
            {currentSiteName
              ? <>Currently linked to <span className="font-medium">{currentSiteName}</span>. Customer follows the new site automatically.</>
              : "Pick the site this report should belong to. Customer follows automatically."}
          </DialogDescription>
        </DialogHeader>

        <Command className="rounded-lg border">
          <CommandInput placeholder="Search by site or customer name..." />
          <CommandList className="max-h-[320px]">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            ) : (
              <>
                <CommandEmpty>No sites match.</CommandEmpty>
                <CommandGroup>
                  {sites.map((s) => {
                    const value = `${s.name} ${s.customers?.name ?? ""} ${s.city ?? ""}`.toLowerCase();
                    const isSelected = selectedId === s.id;
                    return (
                      <CommandItem
                        key={s.id}
                        value={value}
                        onSelect={() => setSelectedId(s.id)}
                        className="cursor-pointer"
                      >
                        <Check className={cn("w-4 h-4 mr-2", isSelected ? "opacity-100" : "opacity-0")} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{s.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {s.customers?.name ?? "No customer linked"}
                            {s.city ? ` · ${s.city}` : ""}
                          </p>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !selectedId || selectedId === currentSiteId}
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Move report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
