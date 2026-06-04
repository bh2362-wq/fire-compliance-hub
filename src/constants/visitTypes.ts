export const VISIT_TYPES = [
  { value: "quarterly_service", label: "Quarterly Fire Alarm Service" },
  { value: "biannual_service", label: "Bi-Annual Fire Alarm Service" },
  { value: "annual_inspection", label: "Annual Fire Alarm Inspection" },
  { value: "callout", label: "Callout" },
  { value: "remedial", label: "Remedial Works" },
  { value: "supply_only", label: "Supply Only" },
  { value: "subcontract", label: "Subcontract Works" },
  { value: "room_integrity", label: "Room Integrity Test" },
  { value: "gas_suppression", label: "Gas Suppression Service" },
];

export const SERVICE_FREQUENCY_TYPES = VISIT_TYPES.filter((t) =>
  ["quarterly_service", "biannual_service", "annual_inspection"].includes(t.value)
);

export const GENERAL_TYPES = VISIT_TYPES.filter((t) =>
  ["callout", "remedial", "supply_only"].includes(t.value)
);

/** Look up a human-readable label for a visit_type value. Falls
 *  through to the legacy 'emergency' value as Callout for any
 *  pre-rename rows that didn't get migrated (migration 20260605200000
 *  handles the main case; this is belt + braces). */
export function getVisitTypeLabel(value: string | null | undefined): string {
  if (!value) return "—";
  if (value === "emergency") return "Callout";
  const found = VISIT_TYPES.find((t) => t.value === value);
  return found ? found.label : value.replace(/_/g, " ");
}
