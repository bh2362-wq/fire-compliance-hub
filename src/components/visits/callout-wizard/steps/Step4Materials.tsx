import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "../sharedFields";
import type { CalloutWizardState } from "../useCalloutWizard";

// Step 4 — Materials & time. Parts list + labour + mileage. All on
// service_reports — no fault_details involvement.

export function Step4Materials({ state }: { state: CalloutWizardState }) {
  const { report, patchReport } = state;
  return (
    <div className="space-y-4">
      <Field
        label="Parts used"
        hint="One per line: qty × description, or free text."
      >
        <Textarea
          rows={5}
          value={report.parts_used ?? ""}
          onChange={(e) => patchReport({ parts_used: e.target.value })}
          placeholder="2 × Apollo XP95 optical heads&#10;1 × MCP replacement plate"
        />
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Labour (hours)">
          <Input
            type="number"
            inputMode="decimal"
            step="0.25"
            min="0"
            value={report.labour_hours ?? ""}
            onChange={(e) =>
              patchReport({
                labour_hours:
                  e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </Field>
        <Field label="Mileage (miles)">
          <Input
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            value={report.mileage_miles ?? ""}
            onChange={(e) =>
              patchReport({
                mileage_miles:
                  e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </Field>
      </div>
    </div>
  );
}
