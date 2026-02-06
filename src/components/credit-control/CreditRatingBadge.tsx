import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Shield } from "lucide-react";
import { RISK_LEVEL_CONFIG } from "@/services/creditCheckService";

interface CreditRatingBadgeProps {
  riskLevel: string | null | undefined;
  companyName?: string | null;
  compact?: boolean;
}

export function CreditRatingBadge({ riskLevel, companyName, compact = false }: CreditRatingBadgeProps) {
  if (!riskLevel || riskLevel === "unknown") return null;

  const config = RISK_LEVEL_CONFIG[riskLevel] || RISK_LEVEL_CONFIG.unknown;

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant={config.variant} className="text-xs gap-1">
              <Shield className="h-3 w-3" />
              {config.label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>Companies House credit rating{companyName ? ` for ${companyName}` : ""}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Badge variant={config.variant} className="gap-1">
      <Shield className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}
