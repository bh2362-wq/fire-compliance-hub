import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

interface StatsCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  iconColor?: string;        // Tailwind bg class for icon wrapper
  iconStroke?: string;       // Tailwind text class for icon colour
  href?: string;
  accent?: boolean;          // Highlight with orange border
}

const StatsCard = ({
  title,
  value,
  change,
  changeType = "neutral",
  icon: Icon,
  iconColor = "bg-primary/10",
  iconStroke = "text-primary",
  href,
  accent = false,
}: StatsCardProps) => {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => href && navigate(href)}
      className={cn(
        "bg-card rounded-xl border border-border p-5 transition-all duration-200",
        href && "cursor-pointer hover:border-primary/30 hover:bg-card/80",
        accent && "border-primary/25 bg-primary/5"
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {title}
        </p>
        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", iconColor)}>
          <Icon className={cn("w-4.5 h-4.5", iconStroke)} style={{ width: 18, height: 18 }} />
        </div>
      </div>

      <p className="text-3xl font-bold text-foreground tracking-tight" style={{ letterSpacing: "-0.025em" }}>
        {value}
      </p>

      {change && (
        <p
          className={cn(
            "text-xs font-medium mt-2",
            changeType === "positive" && "text-success",
            changeType === "negative" && "text-destructive",
            changeType === "neutral"  && "text-muted-foreground"
          )}
        >
          {change}
        </p>
      )}
    </div>
  );
};

export default StatsCard;
