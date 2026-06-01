import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  // Will be wired up in PR 5b. Props kept compatible with the future
  // implementation so the wizard orchestrator doesn't churn.
  onOpenLegacyDialog?: () => void;
}

export function MaterialsStep({ onOpenLegacyDialog }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Materials used</h3>
        <p className="text-xs text-muted-foreground">
          Track parts + materials consumed during the visit.
        </p>
      </div>

      <div className="rounded-lg border border-dashed bg-muted/40 p-6 text-sm space-y-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">Materials tracking ships in PR 5b.</p>
            <p className="text-xs text-muted-foreground">
              For now, use the legacy Work Report dialog if you need to record materials. Other
              tabs (Job, Works, Sign-off) are fully captured here and persist to the same row.
            </p>
          </div>
        </div>
        {onOpenLegacyDialog && (
          <Button variant="outline" size="sm" onClick={onOpenLegacyDialog}>
            Open legacy dialog for materials
          </Button>
        )}
      </div>
    </div>
  );
}
