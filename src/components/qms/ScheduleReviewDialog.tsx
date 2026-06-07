import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CalendarClock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createManagementReview } from "@/services/qmsService";

// Schedule a new ISO 9001 clause 9.3 management review. Captures the
// minimum needed to call the meeting:
//   - review_date           (when)
//   - attendees             (who; comma-separated, kept as plain text
//                            since the QMS module doesn't model org
//                            roles yet)
//   - next_review_date      (optional advance commitment; can be set
//                            on completion if not known yet)
//   - opening_agenda_notes  (kept on the agenda jsonb as a single
//                            "Notes" entry so the detail dialog can
//                            edit it later alongside per-input notes)
//
// On save the row lands in qms_management_reviews with status='scheduled'.
// review_number is generated server-side via get_next_qms_number('MR').

interface ScheduleReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScheduled?: (reviewId: string) => void;
}

export function ScheduleReviewDialog({ open, onOpenChange, onScheduled }: ScheduleReviewDialogProps) {
  const [reviewDate, setReviewDate] = useState(() => {
    // Default to two weeks out — enough lead time to circulate inputs.
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [attendeesText, setAttendeesText] = useState("");
  const [nextReviewDate, setNextReviewDate] = useState("");
  const [agendaNotes, setAgendaNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setAttendeesText("");
    setNextReviewDate("");
    setAgendaNotes("");
  };

  const handleSave = async () => {
    if (!reviewDate) {
      toast.error("Pick a review date");
      return;
    }
    const attendees = attendeesText
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    setSaving(true);
    try {
      const row = await createManagementReview({
        review_date: reviewDate,
        attendees,
        next_review_date: nextReviewDate || null,
        agenda: agendaNotes.trim() ? [{ kind: "notes", text: agendaNotes.trim() }] : [],
      });
      toast.success("Management review scheduled", {
        description: `${row.review_number} on ${reviewDate}.`,
      });
      reset();
      onOpenChange(false);
      onScheduled?.(row.id);
    } catch (e) {
      const obj = e as { message?: string; details?: string; code?: string };
      const detail = [obj.message, obj.details, obj.code ? `[${obj.code}]` : null]
        .filter(Boolean).join(" — ") || "Unknown error";
      toast.error("Couldn't schedule review", { description: detail });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5" /> Schedule management review
          </DialogTitle>
          <DialogDescription>
            ISO 9001 clause 9.3 review. Fill in the basics; agenda inputs and
            outputs are captured later in the review itself.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="mr-date" className="text-xs">Review date</Label>
            <Input
              id="mr-date"
              type="date"
              value={reviewDate}
              onChange={(e) => setReviewDate(e.target.value)}
              disabled={saving}
            />
          </div>

          <div>
            <Label htmlFor="mr-attendees" className="text-xs">
              Attendees <span className="text-muted-foreground">(comma-separated)</span>
            </Label>
            <Input
              id="mr-attendees"
              value={attendeesText}
              onChange={(e) => setAttendeesText(e.target.value)}
              placeholder="Ben Holden, Quality Manager, …"
              disabled={saving}
            />
          </div>

          <div>
            <Label htmlFor="mr-next-date" className="text-xs">
              Next review date <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="mr-next-date"
              type="date"
              value={nextReviewDate}
              onChange={(e) => setNextReviewDate(e.target.value)}
              disabled={saving}
            />
          </div>

          <div>
            <Label htmlFor="mr-agenda" className="text-xs">
              Opening agenda notes <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="mr-agenda"
              value={agendaNotes}
              onChange={(e) => setAgendaNotes(e.target.value)}
              placeholder="Standing items, additional topics for this review…"
              rows={3}
              disabled={saving}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CalendarClock className="w-4 h-4 mr-1.5" />}
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
