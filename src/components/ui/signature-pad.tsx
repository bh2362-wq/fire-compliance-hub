import { useRef, useEffect, useState } from "react";
import SignaturePadLib from "signature_pad";
import { Button } from "@/components/ui/button";
import { Eraser, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";

interface SignaturePadProps {
  value?: string;
  onChange?: (dataUrl: string) => void;
  width?: number;
  height?: number;
  className?: string;
  disabled?: boolean;
  label?: string;
}

export function SignaturePad({
  value,
  onChange,
  width = 320,
  height = 120,
  className,
  disabled = false,
  label,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signaturePadRef = useRef<SignaturePadLib | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.getContext("2d")?.scale(ratio, ratio);

    signaturePadRef.current = new SignaturePadLib(canvas, {
      backgroundColor: "rgb(255, 255, 255)",
      penColor: "rgb(30, 41, 59)",
      minWidth: 0.5,
      maxWidth: 2,
    });

    if (disabled) {
      signaturePadRef.current.off();
    }

    // Load existing signature if provided
    if (value) {
      signaturePadRef.current.fromDataURL(value);
      setIsEmpty(false);
    }

    signaturePadRef.current.addEventListener("endStroke", () => {
      setIsEmpty(signaturePadRef.current?.isEmpty() ?? true);
      if (onChange && signaturePadRef.current) {
        onChange(signaturePadRef.current.toDataURL());
      }
    });

    return () => {
      signaturePadRef.current?.off();
    };
  }, [width, height, disabled]);

  // Update when value changes externally
  useEffect(() => {
    if (value && signaturePadRef.current) {
      signaturePadRef.current.fromDataURL(value);
      setIsEmpty(false);
    } else if (!value && signaturePadRef.current) {
      signaturePadRef.current.clear();
      setIsEmpty(true);
    }
  }, [value]);

  const handleClear = () => {
    if (signaturePadRef.current && !disabled) {
      signaturePadRef.current.clear();
      setIsEmpty(true);
      onChange?.("");
    }
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          <PenLine className="w-3 h-3" />
          {label}
        </div>
      )}
      <div className="relative">
        <div 
          className={cn(
            "relative rounded-md overflow-hidden bg-white",
            "border-2 border-dashed border-muted-foreground/20",
            "transition-colors duration-200",
            !disabled && "hover:border-muted-foreground/40 focus-within:border-primary/50",
            disabled && "opacity-60"
          )}
        >
          <canvas
            ref={canvasRef}
            // touchAction must be inline (not only Tailwind class) — iOS
            // Safari has been observed to ignore class-based touch-action in
            // some layouts, falling back to scroll gesture before pointer
            // events fire on the canvas. WebkitUserSelect + userSelect
            // suppress iOS text-callout that can swallow the first touch.
            style={{
              width,
              height,
              touchAction: "none",
              WebkitUserSelect: "none",
              userSelect: "none",
              WebkitTouchCallout: "none",
            }}
            className={cn(
              "touch-none block",
              disabled && "cursor-not-allowed"
            )}
          />
          {isEmpty && !disabled && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-1">
              <PenLine className="w-5 h-5 text-muted-foreground/30" />
              <span className="text-xs text-muted-foreground/40 font-medium">
                Sign above
              </span>
            </div>
          )}
        </div>
        
        {/* Signature line indicator */}
        <div className="absolute bottom-3 left-4 right-4 border-b border-muted-foreground/20" />
        
        {!disabled && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="absolute top-1 right-1 h-7 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          >
            <Eraser className="w-3.5 h-3.5 mr-1" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
