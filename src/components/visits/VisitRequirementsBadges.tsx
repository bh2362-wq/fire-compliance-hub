import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Package, Wrench, Cpu, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface VisitRequirementsBadgesProps {
  visitId: string;
  compact?: boolean;
  inline?: boolean;
}

interface RequirementSummary {
  category: string;
  count: number;
  items: string[];
}

const CATEGORY_CONFIG: Record<string, { icon: typeof Package; color: string; label: string }> = {
  materials: { icon: Package, color: "bg-primary/10 text-primary border-primary/20", label: "Materials" },
  tools: { icon: Wrench, color: "bg-warning/10 text-warning border-warning/20", label: "Tools" },
  equipment: { icon: Cpu, color: "bg-accent/10 text-accent border-accent/20", label: "Equipment" },
  other: { icon: HelpCircle, color: "bg-muted text-muted-foreground border-border", label: "Other" },
};

export function VisitRequirementsBadges({ visitId, compact }: VisitRequirementsBadgesProps) {
  const [summary, setSummary] = useState<RequirementSummary[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("visit_requirements")
        .select("category, item_name, quantity")
        .eq("visit_id", visitId);

      if (!data || data.length === 0) {
        setSummary([]);
        return;
      }

      const grouped: Record<string, { count: number; items: string[] }> = {};
      data.forEach((r: any) => {
        if (!grouped[r.category]) grouped[r.category] = { count: 0, items: [] };
        grouped[r.category].count++;
        grouped[r.category].items.push(
          r.quantity > 1 ? `${r.quantity}x ${r.item_name}` : r.item_name
        );
      });

      setSummary(
        Object.entries(grouped).map(([category, { count, items }]) => ({
          category,
          count,
          items,
        }))
      );
    };
    fetch();
  }, [visitId]);

  if (summary.length === 0) return null;

  if (compact) {
    const total = summary.reduce((s, g) => s + g.count, 0);
    return (
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-primary/5 text-primary border-primary/20">
        <Package className="w-2.5 h-2.5 mr-0.5" />
        {total} items
      </Badge>
    );
  }

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {summary.map((g) => {
        const cfg = CATEGORY_CONFIG[g.category] || CATEGORY_CONFIG.other;
        const Icon = cfg.icon;
        return (
          <Badge
            key={g.category}
            variant="outline"
            className={`text-[10px] px-1.5 py-0 h-4 ${cfg.color}`}
            title={g.items.join(", ")}
          >
            <Icon className="w-2.5 h-2.5 mr-0.5" />
            {g.count} {cfg.label.toLowerCase()}
          </Badge>
        );
      })}
    </div>
  );
}
