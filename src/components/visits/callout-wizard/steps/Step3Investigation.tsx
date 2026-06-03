import { Textarea } from "@/components/ui/textarea";
import { Field } from "../sharedFields";
import type { CalloutWizardState } from "../useCalloutWizard";

// Step 3 — Investigation & actions. Diagnosis + what was done.
// Splits across two stores:
//   fault_details.found / .action_taken — short PDF/DOCX-facing summary
//   service_reports.work_carried_out / .defects_found — long narrative

export function Step3Investigation({ state }: { state: CalloutWizardState }) {
  const { fault, patchFault, report, patchReport } = state;
  return (
    <div className="space-y-4">
      <Field
        label="Fault found / diagnosis"
        hint="Short summary for §3 of the report."
      >
        <Textarea
          rows={3}
          value={fault.found ?? ""}
          onChange={(e) => patchFault({ found: e.target.value })}
          placeholder="Root cause as confirmed on site."
        />
      </Field>

      <Field label="Action taken" hint="Short summary for §3.">
        <Textarea
          rows={3}
          value={fault.action_taken ?? ""}
          onChange={(e) => patchFault({ action_taken: e.target.value })}
          placeholder="Reset, replaced device, isolated zone, etc."
        />
      </Field>

      <Field
        label="Work carried out (full narrative)"
        hint="Longer detail — appears in the service report appendix."
      >
        <Textarea
          rows={4}
          value={report.work_carried_out ?? ""}
          onChange={(e) => patchReport({ work_carried_out: e.target.value })}
        />
      </Field>

      <Field label="Defects found">
        <Textarea
          rows={3}
          value={report.defects_found ?? ""}
          onChange={(e) => patchReport({ defects_found: e.target.value })}
          placeholder="Anything else flagged during the visit."
        />
      </Field>
    </div>
  );
}
