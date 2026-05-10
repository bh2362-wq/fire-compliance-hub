import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  createDefect,
  DEFECT_CATEGORY_DESCRIPTIONS,
  DEFECT_CATEGORY_LABELS,
  type DefectCategory,
} from "@/services/defectService";

interface SiteOption {
  id: string;
  name: string;
  customer_name?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSiteId?: string;
  defaultVisitId?: string;
  defaultDescription?: string;
  onCreated?: () => void;
}

export function DefectFormDialog({
  open,
  onOpenChange,
  defaultSiteId,
  defaultVisitId,
  defaultDescription,
  onCreated,
}: Props) {
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [siteId, setSiteId] = useState<string>(defaultSiteId || "");
  const [category, setCategory] = useState<DefectCategory>(2);
  const [description, setDescription] = useState(defaultDescription || "");
  const [location, setLocation] = useState("");
  const [raisedBy, setRaisedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSiteId(defaultSiteId || "");
    setDescription(defaultDescription || "");
    setLocation("");
    setRaisedBy("");
    setNotes("");
    setCategory(2);

    if (!defaultSiteId) {
      supabase
        .from("sites")
        .select("id, name, customers(name)")
        .order("name")
        .then(({ data }) => {
          setSites(
            (data || []).map((s: any) => ({
              id: s.id,
              name: s.name,
              customer_name: s.customers?.name,
            })),
          );
        });
    }
  }, [open, defaultSiteId]);

  const handleSubmit = async () => {
    if (!siteId) {
      toast.error("Please select a site");
      return;
    }
    if (!description.trim()) {
      toast.error("Please enter a description");
      return;
    }
    setSaving(true);
    try {
      await createDefect({
        site_id: siteId,
        visit_id: defaultVisitId || null,
        description: description.trim(),
        location: location.trim() || null,
        raised_by: raisedBy.trim() || null,
        notes: notes.trim() || null,
        category,
        status: "open",
      });
      toast.success("Defect raised");
      onCreated?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to raise defect");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Raise Defect</DialogTitle>
          <DialogDescription>
            Categorise per BS 5839-1 / industry severity (Cat 1 critical → Cat 3 minor).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!defaultSiteId && (
            <div className="space-y-1.5">
              <Label>Site</Label>
              <Select value={siteId} onValueChange={setSiteId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select site" />
                </SelectTrigger>
                <SelectContent className="pointer-events-auto">
                  {sites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {s.customer_name ? ` — ${s.customer_name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={String(category)} onValueChange={(v) => setCategory(Number(v) as DefectCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="pointer-events-auto">
                {([1, 2, 3] as DefectCategory[]).map((c) => (
                  <SelectItem key={c} value={String(c)}>
                    {DEFECT_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{DEFECT_CATEGORY_DESCRIPTIONS[category]}</p>
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="What is the defect? Include device IDs, loop/address if relevant."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Floor 2 corridor"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Raised By</Label>
              <Input
                value={raisedBy}
                onChange={(e) => setRaisedBy(e.target.value)}
                placeholder="Engineer / inspector name"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any additional context"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving..." : "Raise Defect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
