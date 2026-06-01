import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AIRewriteButton } from "@/components/reports/AIRewriteButton";
import type { DisabledRefugeDraft } from "../useDisabledRefugeDraft";

interface Props {
  draft: DisabledRefugeDraft;
  onPatch: (updates: Partial<DisabledRefugeDraft>) => void;
}

export function NotesStep({ draft, onPatch }: Props) {
  const disabled = draft.is_locked;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold">Work notes</h3>
        <p className="text-xs text-muted-foreground">
          What was carried out during the visit, parts used, and anything else worth noting.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>Work carried out</Label>
          {!disabled && (
            <AIRewriteButton
              text={draft.work_carried_out}
              type="works"
              onRewrite={(v) => onPatch({ work_carried_out: v })}
            />
          )}
        </div>
        <Textarea
          rows={4}
          value={draft.work_carried_out}
          onChange={(e) => onPatch({ work_carried_out: e.target.value })}
          placeholder="Describe work performed during this visit..."
          disabled={disabled}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>Parts used</Label>
          {!disabled && (
            <AIRewriteButton
              text={draft.parts_used}
              type="parts"
              onRewrite={(v) => onPatch({ parts_used: v })}
            />
          )}
        </div>
        <Textarea
          rows={3}
          value={draft.parts_used}
          onChange={(e) => onPatch({ parts_used: e.target.value })}
          placeholder="List any parts or materials used..."
          disabled={disabled}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>Additional notes</Label>
          {!disabled && (
            <AIRewriteButton
              text={draft.additional_notes}
              type="notes"
              onRewrite={(v) => onPatch({ additional_notes: v })}
            />
          )}
        </div>
        <Textarea
          rows={4}
          value={draft.additional_notes}
          onChange={(e) => onPatch({ additional_notes: e.target.value })}
          placeholder="Any other observations or comments..."
          disabled={disabled}
        />
      </div>
    </div>
  );
}
