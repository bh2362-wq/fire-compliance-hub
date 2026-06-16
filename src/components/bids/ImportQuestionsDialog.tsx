import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { bulkCreateQuestions, parsePastedQuestions } from "@/services/bidService";

interface ImportQuestionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bidId: string;
  startOrder: number;
  onImported?: () => void;
}

export function ImportQuestionsDialog({ open, onOpenChange, bidId, startOrder, onImported }: ImportQuestionsDialogProps) {
  const [raw, setRaw] = useState("");
  const [section, setSection] = useState("");
  const [saving, setSaving] = useState(false);

  const parsed = parsePastedQuestions(raw);

  const handleImport = async () => {
    if (!parsed.length) { toast.error("Nothing to import"); return; }
    setSaving(true);
    try {
      await bulkCreateQuestions(
        bidId,
        parsed.map((q) => ({ ...q, section: section.trim() || null })),
        startOrder,
      );
      toast.success(`${parsed.length} question${parsed.length === 1 ? "" : "s"} added`);
      setRaw(""); setSection("");
      onOpenChange(false);
      onImported?.();
    } catch (e: any) {
      console.error("Import questions failed:", e);
      toast.error(e.message || "Failed to import questions");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Import questions</DialogTitle>
          <DialogDescription>
            Paste questions from the ITT, separated by a blank line. A leading "3.1" or "Q4:" becomes the
            reference, and a trailing "(500 words)" sets the word limit automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="import-section">Section (optional)</Label>
            <Input id="import-section" value={section} onChange={(e) => setSection(e.target.value)} placeholder="e.g. Quality / Method Statement" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="import-raw">Questions</Label>
            <Textarea
              id="import-raw"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={10}
              placeholder={`3.1 Describe your approach to mobilising this contract within 4 weeks. (500 words)\n\n3.2 How will you ensure compliance with BS 5839-1 across the estate? (750 words)`}
            />
          </div>
          {parsed.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Detected <span className="font-semibold text-foreground">{parsed.length}</span> question{parsed.length === 1 ? "" : "s"}.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleImport} disabled={saving || !parsed.length}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Import {parsed.length || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
