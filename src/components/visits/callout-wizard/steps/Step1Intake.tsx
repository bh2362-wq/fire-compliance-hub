import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PRIORITIES,
  COMMERCIAL_CLASSIFICATIONS,
  REPORT_METHODS,
  type Priority,
  type CommercialClassification,
  type ReportMethod,
} from "@/services/visitCalloutService";
import { Field, DateTimeField } from "../sharedFields";
import type { CalloutWizardState } from "../useCalloutWizard";

// Step 1 — Callout intake. Who called, when, how, what they reported.
// Maps to the service_visits intake columns + fault_details.reported.

export function Step1Intake({ state }: { state: CalloutWizardState }) {
  const { visit, patchVisit, fault, patchFault } = state;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Priority">
          <Select
            value={visit.priority ?? "__none"}
            onValueChange={(v) =>
              patchVisit({
                priority: v === "__none" ? null : (v as Priority),
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">—</SelectItem>
              {PRIORITIES.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Commercial classification">
          <Select
            value={visit.commercial_classification ?? "__none"}
            onValueChange={(v) =>
              patchVisit({
                commercial_classification:
                  v === "__none" ? null : (v as CommercialClassification),
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">—</SelectItem>
              {COMMERCIAL_CLASSIFICATIONS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <DateTimeField
          label="Call received at"
          value={visit.call_received_at}
          onChange={(v) => patchVisit({ call_received_at: v })}
        />

        <Field label="Reported by">
          <Input
            value={visit.reported_by ?? ""}
            onChange={(e) => patchVisit({ reported_by: e.target.value })}
            placeholder="Name + role / site contact"
          />
        </Field>

        <Field label="Report method">
          <Select
            value={visit.report_method ?? "__none"}
            onValueChange={(v) =>
              patchVisit({
                report_method: v === "__none" ? null : (v as ReportMethod),
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">—</SelectItem>
              {REPORT_METHODS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <DateTimeField
          label="Engineer assigned at"
          value={visit.engineer_assigned_at}
          onChange={(v) => patchVisit({ engineer_assigned_at: v })}
        />

        <DateTimeField
          label="ARC notified at"
          value={visit.arc_notified_at}
          onChange={(v) => patchVisit({ arc_notified_at: v })}
          hint="Leave blank if the system isn't ARC-connected."
        />
      </div>

      <Field label="Fault as reported">
        <Textarea
          rows={3}
          value={fault.reported ?? ""}
          onChange={(e) => patchFault({ reported: e.target.value })}
          placeholder="What the caller described — verbatim is best."
        />
      </Field>
    </div>
  );
}
