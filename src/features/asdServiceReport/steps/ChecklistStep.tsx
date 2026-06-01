import { MultiASDChecklist } from "@/components/reports/MultiASDChecklist";
import type { ASDDraft } from "../useASDDraft";

interface Props {
  draft: ASDDraft;
  onPatch: (updates: Partial<ASDDraft>) => void;
}

export function ChecklistStep({ draft, onPatch }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Per-unit ASD checklist</h3>
        <p className="text-xs text-muted-foreground">
          Tick each item per ASD unit, including airflow readings. Skip items that don't apply by marking N/A.
        </p>
      </div>

      <MultiASDChecklist
        units={draft.units}
        onChange={(next) => onPatch({ units: next })}
        readonly={draft.is_locked}
      />
    </div>
  );
}
