import { useRef, useState, TouchEvent } from "react";
import { Check, X, ArrowLeftRight } from "lucide-react";

interface SwipeRowProps {
  primary: string;
  secondary: string;
  hasHistory?: boolean;
  lastResult?: "pass" | "fail" | null;
  onPass: () => void;
  onFail: () => void;
}

const SWIPE_THRESHOLD = 80;

export function SwipeRow({ primary, secondary, hasHistory, lastResult, onPass, onFail }: SwipeRowProps) {
  const [dx, setDx] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [done, setDone] = useState<"pass" | "fail" | null>(null);
  const startX = useRef(0);

  const handleTouchStart = (e: TouchEvent) => {
    if (done) return;
    startX.current = e.touches[0].clientX;
    setAnimating(false);
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (done) return;
    const x = e.touches[0].clientX - startX.current;
    setDx(Math.max(-180, Math.min(180, x)));
  };

  const handleTouchEnd = () => {
    if (done) return;
    setAnimating(true);
    if (dx > SWIPE_THRESHOLD) {
      setDone("pass");
      setDx(window.innerWidth);
      setTimeout(onPass, 200);
    } else if (dx < -SWIPE_THRESHOLD) {
      setDone("fail");
      setDx(-window.innerWidth);
      setTimeout(onFail, 200);
    } else {
      setDx(0);
    }
  };

  const opacity = Math.min(Math.abs(dx) / SWIPE_THRESHOLD, 1);

  return (
    <div className="relative h-14 mb-2 overflow-hidden rounded-xl">
      <div className="absolute inset-y-0 left-0 right-0 bg-[#137334] flex items-center justify-start pl-5 gap-2 text-white text-sm font-medium" style={{ opacity: dx > 0 ? opacity : 0 }}>
        <Check className="w-4 h-4" /> PASS
      </div>
      <div className="absolute inset-y-0 left-0 right-0 bg-[#A32D2D] flex items-center justify-end pr-5 gap-2 text-white text-sm font-medium" style={{ opacity: dx < 0 ? opacity : 0 }}>
        FAIL <X className="w-4 h-4" />
      </div>
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="absolute inset-0 bg-white flex items-center justify-between px-3 select-none"
        style={{
          transform: `translateX(${dx}px)`,
          transition: animating ? "transform 0.2s ease-out" : "none",
          touchAction: "pan-y",
        }}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-900 truncate">{primary}</p>
          <p className="text-[10px] text-zinc-500 truncate">{secondary}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {hasHistory && (
            <span className={`w-1.5 h-1.5 rounded-full ${lastResult === "fail" ? "bg-[#C22126]" : "bg-[#137334]"}`} />
          )}
          <ArrowLeftRight className="w-3.5 h-3.5 text-zinc-300" />
        </div>
      </div>
    </div>
  );
}
