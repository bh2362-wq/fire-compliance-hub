import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DefectCategory, DefectStatus } from "@/services/defectService";

export function DefectCategoryBadge({ category, className }: { category: DefectCategory; className?: string }) {
  const styles: Record<DefectCategory, string> = {
    1: "bg-destructive/10 text-destructive border-destructive/30",
    2: "bg-warning/10 text-warning border-warning/30",
    3: "bg-muted text-muted-foreground border-border",
  };
  const labels: Record<DefectCategory, string> = { 1: "Cat 1", 2: "Cat 2", 3: "Cat 3" };
  return (
    <Badge variant="outline" className={cn(styles[category], "font-semibold", className)}>
      {labels[category]}
    </Badge>
  );
}

export function DefectStatusBadge({ status, className }: { status: DefectStatus; className?: string }) {
  const styles: Record<DefectStatus, string> = {
    open: "bg-destructive/10 text-destructive border-destructive/30",
    quoted: "bg-primary/10 text-primary border-primary/30",
    remediated: "bg-success/10 text-success border-success/30",
    accepted_risk: "bg-muted text-muted-foreground border-border",
  };
  const labels: Record<DefectStatus, string> = {
    open: "Open",
    quoted: "Quoted",
    remediated: "Remediated",
    accepted_risk: "Accepted Risk",
  };
  return (
    <Badge variant="outline" className={cn(styles[status], className)}>
      {labels[status]}
    </Badge>
  );
}
