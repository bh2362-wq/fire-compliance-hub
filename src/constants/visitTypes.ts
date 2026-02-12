export const VISIT_TYPES = [
  { value: "quarterly_service", label: "Quarterly Fire Alarm Service" },
  { value: "biannual_service", label: "Bi-Annual Fire Alarm Service" },
  { value: "annual_inspection", label: "Annual Fire Alarm Inspection" },
  { value: "emergency", label: "Emergency Callout" },
  { value: "remedial", label: "Remedial Works" },
  { value: "supply_only", label: "Supply Only" },
];

export const SERVICE_FREQUENCY_TYPES = VISIT_TYPES.filter((t) =>
  ["quarterly_service", "biannual_service", "annual_inspection"].includes(t.value)
);

export const GENERAL_TYPES = VISIT_TYPES.filter((t) =>
  ["emergency", "remedial", "supply_only"].includes(t.value)
);

/** Look up a human-readable label for a visit_type value */
export function getVisitTypeLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const found = VISIT_TYPES.find((t) => t.value === value);
  return found ? found.label : value.replace(/_/g, " ");
}
