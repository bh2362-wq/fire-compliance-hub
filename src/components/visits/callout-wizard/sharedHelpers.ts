// <input type="datetime-local"> wants 'YYYY-MM-DDTHH:mm' (no zone, no
// seconds). Round-trip through Date so stored UTC strings render as
// the engineer's local time.

export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// text[] columns are easiest to edit as comma-separated strings —
// matches the editor pattern from the panel this wizard replaces.

export function arrayToInput(arr: string[] | null | undefined): string {
  return Array.isArray(arr) ? arr.join(", ") : "";
}

export function inputToArray(s: string): string[] | null {
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length === 0 ? null : parts;
}
