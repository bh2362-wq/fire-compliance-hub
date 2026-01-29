import { useRef, useEffect, useState } from "react";
import SignaturePadLib from "signature_pad";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";
import { cn } from "@/lib/utils";

interface SignaturePadProps {
  value?: string;
  onChange?: (dataUrl: string) => void;
  width?: number;
  height?: number;
  className?: string;
  disabled?: boolean;
}

export function SignaturePad({
  value,
  onChange,
  width = 300,
  height = 150,
  className,
  disabled = false,
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
      penColor: "rgb(0, 0, 0)",
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
    <div className={cn("space-y-2", className)}>
      <div className="relative border rounded-lg overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          style={{ width, height }}
          className={cn(
            "touch-none",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        />
        {isEmpty && !disabled && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-sm text-muted-foreground/50">
              Sign here
            </span>
          </div>
        )}
      </div>
      {!disabled && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClear}
          className="text-muted-foreground"
        >
          <Eraser className="w-4 h-4 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}
