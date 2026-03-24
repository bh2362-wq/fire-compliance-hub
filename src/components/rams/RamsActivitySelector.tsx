import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getRamsActivities, RamsActivity } from "@/services/ramsActivityService";
import { Shield, Flame, Lightbulb, Camera, AlertTriangle, Check } from "lucide-react";

interface RamsActivitySelectorProps {
  selectedKey: string | null;
  onSelect: (activity: RamsActivity) => void;
}

const categoryIcons: Record<string, React.ReactNode> = {
  "Fire Detection": <Flame className="w-5 h-5 text-destructive" />,
  "Emergency Lighting": <Lightbulb className="w-5 h-5 text-warning" />,
  "Fire Suppression": <AlertTriangle className="w-5 h-5 text-orange-500" />,
  "Security Systems": <Camera className="w-5 h-5 text-primary" />,
};

const categoryColors: Record<string, string> = {
  "Fire Detection": "border-destructive/30 bg-destructive/5",
  "Emergency Lighting": "border-warning/30 bg-warning/5",
  "Fire Suppression": "border-orange-500/30 bg-orange-50",
  "Security Systems": "border-primary/30 bg-primary/5",
};

export function RamsActivitySelector({ selectedKey, onSelect }: RamsActivitySelectorProps) {
  const { data: activities = [], isLoading } = useQuery({
    queryKey: ["rams-activities"],
    queryFn: getRamsActivities,
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground p-4">Loading activities...</p>;
  }

  const grouped = activities.reduce<Record<string, RamsActivity[]>>((acc, a) => {
    (acc[a.category] = acc[a.category] || []).push(a);
    return acc;
  }, {});

  return (
    <ScrollArea className="h-[350px]">
      <div className="space-y-4 pr-4">
        {Object.entries(grouped).map(([category, items]) => (
          <div key={category}>
            <div className="flex items-center gap-2 mb-2">
              {categoryIcons[category] || <Shield className="w-4 h-4" />}
              <h4 className="text-sm font-semibold text-foreground">{category}</h4>
            </div>
            <div className="grid gap-2">
              {items.map((activity) => {
                const isSelected = selectedKey === activity.activity_key;
                return (
                  <Card
                    key={activity.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      isSelected
                        ? "ring-2 ring-primary border-primary"
                        : categoryColors[category] || "border-border"
                    }`}
                    onClick={() => onSelect(activity)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {activity.activity_name}
                            </span>
                            {isSelected && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
                          </div>
                          {activity.british_standard && (
                            <Badge variant="outline" className="mt-1 text-xs">
                              {activity.british_standard}
                            </Badge>
                          )}
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {activity.description}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs text-muted-foreground">
                            {activity.hazards.length} hazards
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {activity.method_statements.length} steps
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
