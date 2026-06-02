import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { createTender } from "@/services/tenderService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdded?: () => void;
}

export function AddTenderDialog({ open, onOpenChange, onAdded }: Props) {
  const [title, setTitle] = useState("");
  const [buyer, setBuyer] = useState("");
  const [url, setUrl] = useState("");
  const [deadline, setDeadline] = useState("");
  const [value, setValue] = useState("");
  const [region, setRegion] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setTitle(""); setBuyer(""); setUrl(""); setDeadline(""); setValue(""); setRegion(""); setDescription("");
  };

  const save = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    try {
      await createTender({
        title: title.trim(),
        buyer_org: buyer.trim() || null,
        url: url.trim() || null,
        deadline_at: deadline ? new Date(deadline).toISOString() : null,
        value_max: value ? Number(value) : null,
        region: region.trim() || null,
        description: description.trim() || null,
        status: "watching",
      });
      toast.success("Tender added");
      reset();
      onOpenChange(false);
      onAdded?.();
    } catch (e) {
      toast.error("Couldn't add tender", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add tender</DialogTitle>
          <DialogDescription>
            Manually log a tender opportunity. Use the Contracts Finder sync to pull these in automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="t-title">Title *</Label>
            <Input id="t-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fire alarm system maintenance — Greenwich Council" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="t-buyer">Buyer / organisation</Label>
              <Input id="t-buyer" value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder="Greenwich Council" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-region">Region</Label>
              <Input id="t-region" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Greater London" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="t-deadline">Deadline</Label>
              <Input id="t-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-value">Estimated value (£)</Label>
              <Input id="t-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="50000" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-url">Source URL</Label>
            <Input id="t-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-desc">Description / notes</Label>
            <Textarea id="t-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
            Add tender
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
