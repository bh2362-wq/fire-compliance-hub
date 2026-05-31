// Helpers for decoding the "absent" marker stored in
// service_reports.client_signature when the customer didn't physically
// sign. Format:
//   "absent"                              — legacy, no reason
//   "absent:verbally_briefed"             — engineer briefed verbally
//   "absent:not_on_site"                  — customer not on site
//   "absent:other:Some free-text note"    — engineer-supplied reason
//
// Kept as a tiny pure module so the wizard's SignOffStep and the PDF
// caller layers (SiteServiceReports, PdfPreviewDialog) can both decode
// without depending on React.

export const ABSENT_MARKER = "absent";
export const ABSENT_REASONS = ["verbally_briefed", "not_on_site", "other"] as const;
export type AbsentReason = (typeof ABSENT_REASONS)[number];

export function isAbsentMarker(value: string | null | undefined): boolean {
  return typeof value === "string" && (value === ABSENT_MARKER || value.startsWith(`${ABSENT_MARKER}:`));
}

export function parseAbsentMarker(
  value: string | null | undefined,
): { absent: boolean; reason: AbsentReason | null; note: string | null } {
  if (!isAbsentMarker(value)) return { absent: false, reason: null, note: null };
  if (value === ABSENT_MARKER) return { absent: true, reason: null, note: null };
  const parts = (value as string).split(":");
  const reason = parts[1] as AbsentReason | undefined;
  const note = parts.length > 2 ? parts.slice(2).join(":") : null;
  return {
    absent: true,
    reason: reason && (ABSENT_REASONS as readonly string[]).includes(reason) ? reason : null,
    note,
  };
}

export function buildAbsentMarker(reason: AbsentReason, note?: string | null): string {
  if (reason === "other" && note?.trim()) return `${ABSENT_MARKER}:other:${note.trim()}`;
  return `${ABSENT_MARKER}:${reason}`;
}
