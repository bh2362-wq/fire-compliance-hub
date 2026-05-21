import { cn } from "@/lib/utils";

// Tap-friendly Yes/No/NA tile for the BS5839 checklist.
// Three buttons, each ~48px tall, no nested controls. Long-press is handled
// by the parent (it owns the note field) so this stays single-purpose.

export type TileValue = "yes" | "no" | "na";

interface Props {
  label: string;
  value: TileValue | null;
  onChange: (next: TileValue) => void;
  disabled?: boolean;
}

const OPTIONS: { key: TileValue; label: string; activeClass: string }[] = [
  { key: "yes", label: "Yes", activeClass: "bg-green-600 text-white border-green-700" },
  { key: "no", label: "No", activeClass: "bg-red-600 text-white border-red-700" },
  { key: "na", label: "N/A", activeClass: "bg-slate-500 text-white border-slate-600" },
];

export function ChecklistTile({ label, value, onChange, disabled }: Props) {
  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <p className="text-sm leading-snug">{label}</p>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((opt) => {
          const active = value === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.key)}
              className={cn(
                "h-12 rounded-md border text-sm font-medium transition-colors",
                "active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                active
                  ? opt.activeClass
                  : "bg-background text-foreground border-border hover:bg-accent",
                disabled && "opacity-50 cursor-not-allowed",
              )}
              aria-pressed={active}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
