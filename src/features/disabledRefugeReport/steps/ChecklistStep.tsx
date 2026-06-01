import { MultiDisabledRefugeChecklist } from "@/components/reports/MultiDisabledRefugeChecklist";
import type { DisabledRefugeDraft } from "../useDisabledRefugeDraft";

interface Props {
  draft: DisabledRefugeDraft;
  onPatch: (updates: Partial<DisabledRefugeDraft>) => void;
}

export function ChecklistStep({ draft, onPatch }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Per-unit checklist</h3>
        <p className="text-xs text-muted-foreground">
          Tick each item per disabled-refuge unit. Engineers can skip items that don't apply by marking N/A.
        </p>
      </div>

      <MultiDisabledRefugeChecklist
        units={draft.units}
        onChange={(next) => onPatch({ units: next })}
        readonly={draft.is_locked}
      />
    </div>
  );
}
