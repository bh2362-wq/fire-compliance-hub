// Shared helpers for the BAFE SP203-1 components.
//
// Pulled out of individual components so the severity → colour
// mapping and deadline-formatting logic stay consistent across the
// Compliance Dashboard, the Lead Individuals panel, and the cert
// register (PR #5).

import type { BafeAlertSeverity, BafeModule } from "@/types/bafe";

// Tailwind class triples per severity. Centralised so a colour
// change only edits this one map.
export const SEVERITY_STYLES: Record<
  BafeAlertSeverity,
  { tint: string; ink: string; border: string; label: string }
> = {
  overdue: {
    tint: "bg-destructive/10",
    ink: "text-destructive",
    border: "border-destructive/30",
    label: "Overdue",
  },
  upcoming: {
    tint: "bg-amber-500/10",
    ink: "text-amber-700 dark:text-amber-400",
    border: "border-amber-500/30",
    label: "Upcoming",
  },
  outstanding: {
    tint: "bg-blue-500/10",
    ink: "text-blue-700 dark:text-blue-400",
    border: "border-blue-500/30",
    label: "Outstanding",
  },
};

// Module display labels — matches BAFE SP203-1 module naming
// conventions. Components use this for headings + chips.
export const MODULE_LABELS: Record<BafeModule, string> = {
  design: "Design",
  installation: "Installation",
  commissioning: "Commissioning",
  maintenance: "Maintenance",
};

export const BAFE_MODULES: BafeModule[] = [
  "design",
  "installation",
  "commissioning",
  "maintenance",
];

// Whole-days between a date and now. Negative when the date is in
// the past. Returns null for null inputs so callers can render "—"
// without a separate null check.
export function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const target = new Date(date);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const ms = target.getTime() - now.getTime();
  return Math.ceil(ms / 86400000);
}

// "5 days ago" / "in 12 days" / "today" — keeps the visual short
// without losing the sense of direction.
export function deadlineLabel(date: string | null): string {
  const d = daysUntil(date);
  if (d == null) return "—";
  if (d === 0) return "today";
  if (d < 0) return `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} overdue`;
  return `in ${d} day${d === 1 ? "" : "s"}`;
}
