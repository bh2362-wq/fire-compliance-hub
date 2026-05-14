/**
 * SmartSignature
 *
 * Replaces TypedSignature across all smart form certs.
 * Defaults to the real SignaturePad (draw with finger/stylus on tablet/phone).
 * Engineers can switch to "type instead" for desktop use.
 * Existing typed: values are detected and displayed correctly.
 *
 * Storage format (unchanged — PDF generator handles both):
 *   Drawn  → PNG dataURL  (data:image/png;base64,...)
 *   Typed  → typed:Name   (existing format, fully backwards compat)
 *   Absent → "absent"     (client not present — rendered as "Not present" on PDF)
 *
 * Props:
 *   value          current stored value
 *   onChange       called with new stored value
 *   label          shown above the pad (optional)
 *   showAbsent     show "Client not present" option (client sig only)
 *   disabled       read-only display mode
 */

import { useState, useEffect } from "react";
import { SignaturePad } from "@/components/ui/signature-pad";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PenLine, Keyboard, UserX } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value?: string;
  onChange: (value: string) => void;
  label?: string;
  showAbsent?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

type Mode = "draw" | "type" | "absent";

function detectMode(value?: string): Mode {
  if (!value) return "draw";
  if (value === "absent") return "absent";
  if (value.startsWith("typed:")) return "type";
  if (value.startsWith("data:")) return "draw";
  return "type"; // fallback for legacy plain text
}

export function SmartSignature({
  value,
  onChange,
  label,
  showAbsent = false,
  disabled = false,
  placeholder = "Type name to sign",
}: Props) {
  const [mode, setMode] = useState<Mode>(() => detectMode(value));
  const [typedName, setTypedName] = useState(() =>
    value?.startsWith("typed:") ? value.replace("typed:", "") : ""
  );

  // Sync mode if value changes externally (e.g. prefill)
  useEffect(() => {
    const m = detectMode(value);
    setMode(m);
    if (m === "type") setTypedName(value?.replace("typed:", "") ?? "");
  }, [value]);

  function switchMode(next: Mode) {
    setMode(next);
    if (next === "absent") {
      onChange("absent");
    } else if (next === "type") {
      onChange(typedName ? `typed:${typedName}` : "");
    } else {
      // Switching back to draw — clear if current is typed
      if (value?.startsWith("typed:") || value === "absent") onChange("");
    }
  }

  function handleTyped(name: string) {
    setTypedName(name);
    onChange(name ? `typed:${name}` : "");
  }

  const isAbsent = mode === "absent";
  const isType   = mode === "type";
  const isDraw   = mode === "draw";

  return (
    <div className="space-y-2">
      {label && (
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <PenLine className="w-3 h-3" />{label}
        </p>
      )}

      {/* Draw mode */}
      {isDraw && !disabled && (
        <SignaturePad
          value={value?.startsWith("data:") ? value : ""}
          onChange={onChange}
          width={340}
          height={110}
          disabled={disabled}
        />
      )}

      {/* Draw mode — disabled / preview */}
      {isDraw && disabled && value?.startsWith("data:") && (
        <div className="rounded-md border overflow-hidden bg-white">
          <img src={value} alt="Signature" className="max-h-[110px] w-full object-contain p-2" />
        </div>
      )}

      {/* Type mode */}
      {isType && (
        <div className={cn(
          "rounded-md border-2 border-dashed border-muted-foreground/20 bg-white",
          "min-h-[110px] flex flex-col items-center justify-center px-4 py-3 gap-2",
          disabled && "opacity-60"
        )}>
          {disabled ? (
            <span
              className="text-3xl text-slate-800 select-none"
              style={{ fontFamily: "'Dancing Script', cursive, serif" }}
            >
              {typedName || "—"}
            </span>
          ) : (
            <>
              {typedName && (
                <span
                  className="text-3xl text-slate-800 select-none pointer-events-none"
                  style={{ fontFamily: "'Dancing Script', cursive, serif" }}
                >
                  {typedName}
                </span>
              )}
              <Input
                value={typedName}
                onChange={e => handleTyped(e.target.value)}
                placeholder={placeholder}
                className="max-w-xs text-center text-sm border-muted-foreground/30"
              />
            </>
          )}
        </div>
      )}

      {/* Absent mode */}
      {isAbsent && (
        <div className="rounded-md border-2 border-dashed border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/10 min-h-[110px] flex flex-col items-center justify-center gap-1.5">
          <UserX className="w-5 h-5 text-amber-500" />
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Client not present on site</p>
          <p className="text-xs text-muted-foreground">This will be noted on the certificate</p>
        </div>
      )}

      {/* Mode switcher — not shown when disabled */}
      {!disabled && (
        <div className="flex items-center gap-2 flex-wrap">
          {isDraw && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground px-2"
              onClick={() => switchMode("type")}
            >
              <Keyboard className="w-3 h-3 mr-1" />
              Type instead
            </Button>
          )}
          {isType && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground px-2"
              onClick={() => switchMode("draw")}
            >
              <PenLine className="w-3 h-3 mr-1" />
              Draw instead
            </Button>
          )}
          {showAbsent && !isAbsent && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-amber-600 px-2 ml-auto"
              onClick={() => switchMode("absent")}
            >
              <UserX className="w-3 h-3 mr-1" />
              Client not present
            </Button>
          )}
          {isAbsent && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground px-2"
              onClick={() => switchMode("draw")}
            >
              <PenLine className="w-3 h-3 mr-1" />
              Client is present — add signature
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
