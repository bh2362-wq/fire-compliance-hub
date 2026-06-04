import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CommissioningDraft } from "../useCommissioningDraft";

// Step 5 — Page 3 of A051. Incomplete work (details + reasons) +
// further visit requirement. Optional — clean commissioning leaves
// all three blank.

export function Step5IncompleteWork({ draft }: { draft: CommissioningDraft }) {
  const { header, patchHeader } = draft;
  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        Fields here populate page 3 of the printed cert. Leave blank if
        commissioning is complete with no outstanding work.
      </p>
      <Field label="Incomplete work — details">
        <Textarea
          rows={3}
          value={header.incomplete_work_details ?? ""}
          onChange={(e) => patchHeader({ incomplete_work_details: e.target.value })}
          placeholder="What couldn't be completed?"
        />
      </Field>
      <Field label="Incomplete work — reasons">
        <Textarea
          rows={3}
          value={header.incomplete_work_reasons ?? ""}
          onChange={(e) => patchHeader({ incomplete_work_reasons: e.target.value })}
          placeholder="Reasons beyond the company's control"
        />
      </Field>
      <Field label="Further visit required (type N/A if not needed)">
        <Textarea
          rows={3}
          value={header.further_visit_required ?? ""}
          onChange={(e) => patchHeader({ further_visit_required: e.target.value })}
          placeholder="Specifics of what the next visit must address"
        />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
