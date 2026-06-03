import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { ReactNode } from "react";
import { toLocalInput, fromLocalInput } from "./sharedHelpers";

// Small label-wrapper used by every step. Centralised so a label
// rename or class tweak only needs editing here.

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && (
        <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>
      )}
    </div>
  );
}

// Reused widget for a labelled <input type="datetime-local"> so steps
// that capture timestamps stay terse.
export function DateTimeField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (next: string | null) => void;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <Input
        type="datetime-local"
        value={toLocalInput(value)}
        onChange={(e) => onChange(fromLocalInput(e.target.value))}
      />
    </Field>
  );
}
