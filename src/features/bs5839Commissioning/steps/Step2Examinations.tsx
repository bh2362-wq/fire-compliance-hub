import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CommissioningDraft, CommissioningHeader } from "../useCommissioningDraft";

// Step 2 — System Examinations + Soak Test + Outstanding work + risks.
// Six A051 checkbox items + the supporting fields beneath them. Each
// checkbox maps to a boolean column on the header (null = engineer
// hasn't ticked it yet).

const EXAM_ITEMS: { key: keyof CommissioningHeader; label: string }[] = [
  { key: "exam_all_equipment_operates",     label: "All equipment operates correctly" },
  { key: "exam_install_acceptable",         label: "Installation work is, as far as can reasonably be ascertained, of an acceptable standard" },
  { key: "exam_inspected_per_39_2c",        label: "The entire system has been inspected and tested in accordance with the recommendations of clause 39.2c of the current BS 5839-1" },
  { key: "exam_performs_to_spec",           label: "The system performs as required by the specification prepared by (named below)" },
  { key: "exam_no_false_alarm_potential",   label: "Taking into account guidance in §3 of BS 5839-1, no obvious potential for unacceptable false alarms" },
  { key: "exam_documentation_provided",     label: "The documentation described in clause 40 of the standard has been provided to the user" },
];

export function Step2Examinations({ draft }: { draft: CommissioningDraft }) {
  const { header, patchHeader } = draft;

  const setExamFlag = (key: keyof CommissioningHeader, ticked: boolean) =>
    patchHeader({ [key]: ticked } as Partial<CommissioningHeader>);

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h4 className="text-sm font-semibold text-muted-foreground">System Examinations</h4>
        <p className="text-xs text-muted-foreground">
          Tick items confirmed during commissioning. Unticked items are
          treated as outstanding for the report.
        </p>
        <ul className="space-y-2">
          {EXAM_ITEMS.map((item) => {
            const value = header[item.key] as boolean | null;
            return (
              <li key={item.key} className="flex items-start gap-2">
                <Checkbox
                  checked={!!value}
                  onCheckedChange={(c) => setExamFlag(item.key, !!c)}
                  className="mt-0.5"
                />
                <span className="text-sm leading-snug">{item.label}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3 pt-3 border-t">
        <Field label="Specification prepared by">
          <Input
            value={header.specifier ?? ""}
            onChange={(e) => patchHeader({ specifier: e.target.value })}
            placeholder="Name of designer / specifier"
          />
        </Field>
        <Field label="Soak test period (weeks) — leave blank for N/A">
          <Input
            type="number"
            min="0"
            value={header.soak_test_weeks ?? ""}
            onChange={(e) =>
              patchHeader({
                soak_test_weeks:
                  e.target.value === "" ? null : parseInt(e.target.value, 10),
              })
            }
          />
        </Field>
        <Field label="Outstanding work — before/after the system becomes operational">
          <Textarea
            rows={2}
            value={header.outstanding_work ?? ""}
            onChange={(e) => patchHeader({ outstanding_work: e.target.value })}
          />
        </Field>
        <Field label="Potential causes of false alarm at next service">
          <Textarea
            rows={2}
            value={header.false_alarm_risks ?? ""}
            onChange={(e) => patchHeader({ false_alarm_risks: e.target.value })}
          />
        </Field>
      </section>
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
