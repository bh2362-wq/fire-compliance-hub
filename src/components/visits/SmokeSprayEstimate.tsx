import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Flame } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SmokeSprayEstimateProps {
  siteId: string;
  visitType: string;
}

// Device types that are smoke detectors
const SMOKE_DETECTOR_TYPES = [
  "smoke",
  "optical",
  "ionisation",
  "ionization",
  "photo",
  "photoelectric",
  "qoh", // Gent optical heat
  "opt", // Optical
  "ion", // Ionisation
  "smoke detector",
  "optical smoke",
  "multi-sensor",
  "multisensor",
];

// A can of smoke test spray tests approximately 170 smoke detectors
const DETECTORS_PER_CAN = 170;

// Service type multipliers (percentage of devices tested)
const SERVICE_MULTIPLIERS: Record<string, number> = {
  quarterly_service: 0.25, // 25% tested
  biannual_service: 0.5,   // 50% tested
  annual_inspection: 1.0,  // 100% tested
  emergency: 0,            // No smoke testing
  remedial: 0,             // No smoke testing
};

export function SmokeSprayEstimate({ siteId, visitType }: SmokeSprayEstimateProps) {
  const [smokeCount, setSmokeCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSmokeDetectorCount = async () => {
      setLoading(true);
      try {
        const { data: devices, error } = await supabase
          .from("devices")
          .select("device_type")
          .eq("site_id", siteId);

        if (error) throw error;

        // Count smoke detectors
        const count = (devices || []).filter((d) => {
          const type = d.device_type?.toLowerCase() || "";
          return SMOKE_DETECTOR_TYPES.some(
            (smokeType) =>
              type.includes(smokeType) || smokeType.includes(type)
          );
        }).length;

        setSmokeCount(count);
      } catch (err) {
        console.error("Error fetching smoke detectors:", err);
        setSmokeCount(0);
      } finally {
        setLoading(false);
      }
    };

    fetchSmokeDetectorCount();
  }, [siteId]);

  if (loading || smokeCount === null) {
    return null;
  }

  const multiplier = SERVICE_MULTIPLIERS[visitType] ?? 0;
  
  // Don't show for visit types that don't require smoke testing
  if (multiplier === 0) {
    return null;
  }

  const detectorsToTest = Math.ceil(smokeCount * multiplier);
  const cansNeeded = detectorsToTest / DETECTORS_PER_CAN;
  const cansPercentage = Math.min(cansNeeded * 100, 100); // Cap at 100% for display

  // Determine color based on usage
  const getBarColor = () => {
    if (cansNeeded >= 1) return "bg-warning";
    if (cansNeeded >= 0.5) return "bg-accent";
    return "bg-success";
  };

  const getLabel = () => {
    if (cansNeeded >= 1) {
      return `${cansNeeded.toFixed(1)} cans`;
    }
    return `${Math.round(cansNeeded * 100)}%`;
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 min-w-[100px]">
            <Flame className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <div className="flex-1">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${getBarColor()}`}
                  style={{ width: `${Math.max(cansPercentage, 5)}%` }}
                />
              </div>
            </div>
            <span className="text-xs font-medium text-muted-foreground w-12 text-right">
              {getLabel()}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1 text-sm">
            <p className="font-medium">Smoke Spray Estimate</p>
            <p className="text-muted-foreground">
              {smokeCount} smoke detectors on site
            </p>
            <p className="text-muted-foreground">
              {Math.round(multiplier * 100)}% tested ({detectorsToTest} detectors)
            </p>
            <p className="text-muted-foreground">
              ≈ {cansNeeded.toFixed(2)} cans needed (170/can)
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
