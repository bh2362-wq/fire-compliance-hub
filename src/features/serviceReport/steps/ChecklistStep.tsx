import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  BS5839Checklist,
  CHECKLIST_LABELS,
  SECTION_LABELS,
} from "@/services/serviceReportService";
import { ChecklistTile, TileValue } from "../ChecklistTile";

// Section keys appear in BS 5839-1:2025 Cl.45 / BAFE SP203-1 Cl.9.8 order;
// each item under CHECKLIST_LABELS is a Yes/No/NA question unless listed
// in NON_BOOLEAN_ITEMS below.
const SECTION_ORDER: (keyof BS5839Checklist)[] = [
  "visualInspection",
  "manualCallPoints",
  "automaticDetection",
  "audibleAlarms",
  "visualAlarms",
  "ancillaryEquipment",
  "radioLinkedEquipment",
  "faultMonitoring",
  "standbyPowerSupplies",
  "controlEquipment",
  "causeEffect",
  "remoteTransmission",
  "detectionZones",
  "falseAlarms",
  "logbook",
  "certification",
  "postInspection",
];

// Items that take a free value rather than a Y/N/NA selection.
const NON_BOOLEAN_ITEMS: Record<string, "text" | "number"> = {
  "standbyPowerSupplies.chargeVoltage": "text",
  "falseAlarms.detectorCount": "number",
  "falseAlarms.falseAlarmCount": "number",
};

function tileValueFromBool(b: boolean | null): TileValue | null {
  if (b === true) return "yes";
  if (b === false) return "no";
  return null;
}

function boolFromTile(t: TileValue): boolean | null {
  if (t === "yes") return true;
  if (t === "no") return false;
  return null; // NA — distinguished separately below
}

interface Props {
  checklist: BS5839Checklist;
  onChange: (next: BS5839Checklist) => void;
  disabled?: boolean;
}

export function ChecklistStep({ checklist, onChange, disabled }: Props) {
  // All 17 sections are rendered in one scrollable list now — the
  // previous in-step Previous/Next navigator meant engineers reached
  // section 14, hit the wizard's main Next, and never saw sections
  // 15 (Logbook), 16 (Certification) or 17 (Post inspection).
  // Section-by-section nav was hiding work that needs doing.

  // Overall completion: how many of the boolean items have a recorded value.
  const { completed, total } = useMemo(() => {
    let done = 0;
    let count = 0;
    for (const sk of SECTION_ORDER) {
      const items = CHECKLIST_LABELS[sk] ?? {};
      for (const itemKey of Object.keys(items)) {
        const path = `${sk}.${itemKey}`;
        if (NON_BOOLEAN_ITEMS[path]) continue;
        count += 1;
        const sec = checklist[sk] as Record<string, unknown> | undefined;
        const v = sec?.[itemKey];
        if (v === true || v === false) done += 1;
      }
    }
    return { completed: done, total: count };
  }, [checklist]);

  const setBool = (sectionKey: keyof BS5839Checklist, itemKey: string, value: boolean | "na") => {
    const section = (checklist[sectionKey] ?? {}) as Record<string, unknown>;
    const next: BS5839Checklist = {
      ...checklist,
      [sectionKey]: { ...section, [itemKey]: value === "na" ? null : value },
    };
    onChange(next);
  };

  const setSpecial = (sectionKey: keyof BS5839Checklist, itemKey: string, value: string | number | null) => {
    const section = (checklist[sectionKey] ?? {}) as Record<string, unknown>;
    const next: BS5839Checklist = {
      ...checklist,
      [sectionKey]: { ...section, [itemKey]: value },
    };
    onChange(next);
  };

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 bg-background pb-3 pt-1 -mx-4 px-4 border-b">
        <p className="text-xs text-muted-foreground">
          {completed}/{total} items recorded across all {SECTION_ORDER.length} sections
        </p>
        <Progress value={(completed / Math.max(1, total)) * 100} className="mt-2 h-1.5" />
      </div>

      {SECTION_ORDER.map((sectionKey) => {
        const sectionItems = Object.entries(CHECKLIST_LABELS[sectionKey] ?? {});
        const section = (checklist[sectionKey] ?? {}) as Record<string, unknown>;
        return (
          <section key={sectionKey} className="space-y-3">
            <h3 className="text-base font-semibold sticky top-[68px] bg-background py-1 -mx-4 px-4 z-[5] border-b">
              {SECTION_LABELS[sectionKey]}
            </h3>
            {sectionItems.map(([itemKey, label]) => {
              const path = `${sectionKey}.${itemKey}`;
              const special = NON_BOOLEAN_ITEMS[path];
              const rawValue = section[itemKey];

              if (special === "text") {
                return (
                  <div key={itemKey} className="rounded-lg border bg-card p-3 space-y-2">
                    <Label className="text-sm leading-snug">{label}</Label>
                    <Input
                      inputMode="decimal"
                      value={(rawValue as string | null) ?? ""}
                      onChange={(e) => setSpecial(sectionKey, itemKey, e.target.value || null)}
                      placeholder="e.g. 27.4V"
                      disabled={disabled}
                    />
                  </div>
                );
              }
              if (special === "number") {
                return (
                  <div key={itemKey} className="rounded-lg border bg-card p-3 space-y-2">
                    <Label className="text-sm leading-snug">{label}</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={rawValue == null ? "" : String(rawValue)}
                      onChange={(e) =>
                        setSpecial(sectionKey, itemKey, e.target.value === "" ? null : Number(e.target.value))
                      }
                      disabled={disabled}
                    />
                  </div>
                );
              }

              // Default: Yes/No/NA tile.
              const boolValue = rawValue as boolean | null | undefined;
              // Distinguish recorded N/A (null) from "not yet touched" (undefined).
              const isRecordedNa = boolValue === null && Object.prototype.hasOwnProperty.call(section, itemKey);

              return (
                <ChecklistTile
                  key={itemKey}
                  label={label}
                  value={isRecordedNa ? "na" : tileValueFromBool(boolValue ?? null)}
                  onChange={(t) =>
                    setBool(sectionKey, itemKey, boolFromTile(t) === null ? "na" : (boolFromTile(t) as boolean))
                  }
                  disabled={disabled}
                />
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
