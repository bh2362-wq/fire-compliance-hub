import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalloutPhotoUploader } from "../PhotoUploader";
import { Field, DateTimeField } from "../sharedFields";
import { arrayToInput, inputToArray } from "../sharedHelpers";
import type { CalloutWizardState } from "../useCalloutWizard";
import type { ServiceReportFields } from "../useCalloutWizard";

// Step 2 — System on arrival. Captures what the engineer found when
// they got there: timestamp, panel state, zones/loops, isolation
// notes, and §2 evidence photos.

const SYSTEM_STATUS: {
  value: NonNullable<ServiceReportFields["system_status"]>;
  label: string;
}[] = [
  { value: "fully_operational", label: "Fully operational" },
  { value: "partial_operation", label: "Partial operation" },
  { value: "advisory_only", label: "Advisory only" },
  { value: "not_operational", label: "Not operational" },
];

interface Props {
  visitId: string;
  state: CalloutWizardState;
}

export function Step2OnArrival({ visitId, state }: Props) {
  const { visit, patchVisit, fault, patchFault, report, patchReport } = state;

  // text[] inputs are kept as raw strings while the user types so the
  // field doesn't reformat mid-edit. Initial mount syncs from the
  // hook's current value.
  const [zonesText, setZonesText] = useState(arrayToInput(visit.affected_zones));
  const [loopsText, setLoopsText] = useState(arrayToInput(visit.affected_loops));
  useEffect(() => {
    setZonesText(arrayToInput(visit.affected_zones));
  }, [visit.affected_zones]);
  useEffect(() => {
    setLoopsText(arrayToInput(visit.affected_loops));
  }, [visit.affected_loops]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <DateTimeField
          label="Arrived on site at"
          value={report.arrival_time ?? null}
          onChange={(v) => patchReport({ arrival_time: v })}
        />

        <Field label="System status on arrival">
          <Select
            value={report.system_status ?? "__none"}
            onValueChange={(v) =>
              patchReport({
                system_status: v === "__none" ? null : (v as ServiceReportFields["system_status"]),
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">—</SelectItem>
              {SYSTEM_STATUS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Affected zones">
          <Input
            value={zonesText}
            onChange={(e) => {
              setZonesText(e.target.value);
              patchVisit({ affected_zones: inputToArray(e.target.value) });
            }}
            placeholder="e.g. 3, 7, 12"
          />
        </Field>

        <Field label="Affected loops">
          <Input
            value={loopsText}
            onChange={(e) => {
              setLoopsText(e.target.value);
              patchVisit({ affected_loops: inputToArray(e.target.value) });
            }}
            placeholder="e.g. 1, 2"
          />
        </Field>
      </div>

      <Field label="Panel state on arrival">
        <Textarea
          rows={3}
          value={fault.on_arrival ?? ""}
          onChange={(e) => patchFault({ on_arrival: e.target.value })}
          placeholder="What was the panel showing? Faults, alarms, isolations."
        />
      </Field>

      <Field
        label="Isolation details"
        hint="Items already isolated when you arrived (zone, device, loop)."
      >
        <Textarea
          rows={2}
          value={report.isolation_details ?? ""}
          onChange={(e) => patchReport({ isolation_details: e.target.value })}
        />
      </Field>

      <div className="border-t pt-4">
        <CalloutPhotoUploader visitId={visitId} />
      </div>
    </div>
  );
}
