import { Textarea } from "@/components/ui/textarea";
import { Field, DateTimeField } from "../sharedFields";
import type { CalloutWizardState } from "../useCalloutWizard";

// Step 5 — Departure & follow-up. Departed timestamp + the state the
// engineer left the system in + recommendations + a free-form notes
// field for anything else (responsible person briefed, quote needed,
// remedial visit booked, etc.).

export function Step5Departure({ state }: { state: CalloutWizardState }) {
  const { report, patchReport } = state;
  return (
    <div className="space-y-4">
      <DateTimeField
        label="Departed site at"
        value={report.departure_time ?? null}
        onChange={(v) => patchReport({ departure_time: v })}
      />

      <Field
        label="Isolation details (on departure)"
        hint="Anything still isolated when you left — overrides Step 2 if updated."
      >
        <Textarea
          rows={2}
          value={report.isolation_details ?? ""}
          onChange={(e) => patchReport({ isolation_details: e.target.value })}
        />
      </Field>

      <Field
        label="Recommendations"
        hint="What needs to happen next — appears in the report's actions section."
      >
        <Textarea
          rows={3}
          value={report.recommendations ?? ""}
          onChange={(e) => patchReport({ recommendations: e.target.value })}
          placeholder="Quote for cable replacement; remedial visit within 7 days; etc."
        />
      </Field>

      <Field
        label="Follow-up notes"
        hint="Responsible person briefed, quote ID, remedial visit booked, ARC updated."
      >
        <Textarea
          rows={4}
          value={report.notes ?? ""}
          onChange={(e) => patchReport({ notes: e.target.value })}
        />
      </Field>
    </div>
  );
}
