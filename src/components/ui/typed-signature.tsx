import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface TypedSignatureProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function TypedSignature({
  value,
  onChange,
  placeholder = "Type your name",
  className,
  disabled = false,
}: TypedSignatureProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div
        className={cn(
          "relative rounded-md overflow-hidden bg-white",
          "border-2 border-dashed border-muted-foreground/20",
          "transition-colors duration-200 min-h-[120px] flex items-center justify-center px-6",
          !disabled && "hover:border-muted-foreground/40",
          disabled && "opacity-60"
        )}
      >
        {value ? (
          <span
            className="text-3xl text-slate-800 select-none"
            style={{ fontFamily: "'Dancing Script', cursive" }}
          >
            {value}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground/40">
            Your signature will appear here
          </span>
        )}
        {/* Signature line */}
        <div className="absolute bottom-3 left-4 right-4 border-b border-muted-foreground/20" />
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="text-sm"
      />
    </div>
  );
}
