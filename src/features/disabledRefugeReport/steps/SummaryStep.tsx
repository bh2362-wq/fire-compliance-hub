import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AIRewriteButton } from "@/components/reports/AIRewriteButton";
import type { DisabledRefugeDraft } from "../useDisabledRefugeDraft";

interface Props {
  draft: DisabledRefugeDraft;
  onPatch: (updates: Partial<DisabledRefugeDraft>) => void;
}

export function SummaryStep({ draft, onPatch }: Props) {
  const disabled = draft.is_locked;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold">System condition &amp; findings</h3>
        <p className="text-xs text-muted-foreground">
          Overall condition, defects observed during the inspection, and recommended actions.
        </p>
      </div>

      <div className="space-y-2">
        <Label>System condition</Label>
        <Select
          value={draft.system_condition}
          onValueChange={(v) => onPatch({ system_condition: v })}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select overall condition" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="satisfactory">Satisfactory</SelectItem>
            <SelectItem value="requires_attention">Requires Attention</SelectItem>
            <SelectItem value="unsatisfactory">Unsatisfactory</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>Defects found</Label>
          {!disabled && (
            <AIRewriteButton
              text={draft.defects_found}
              type="defects"
              onRewrite={(v) => onPatch({ defects_found: v })}
            />
          )}
        </div>
        <Textarea
          rows={4}
          value={draft.defects_found}
          onChange={(e) => onPatch({ defects_found: e.target.value })}
          placeholder="List any defects or faults identified..."
          disabled={disabled}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>Recommendations</Label>
          {!disabled && (
            <AIRewriteButton
              text={draft.recommendations}
              type="recommendations"
              onRewrite={(v) => onPatch({ recommendations: v })}
            />
          )}
        </div>
        <Textarea
          rows={4}
          value={draft.recommendations}
          onChange={(e) => onPatch({ recommendations: e.target.value })}
          placeholder="Recommended actions or improvements..."
          disabled={disabled}
        />
      </div>
    </div>
  );
}
