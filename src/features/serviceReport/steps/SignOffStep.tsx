import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ServiceReport } from "@/services/serviceReportService";

interface Props {
  report: ServiceReport;
  onPatch: (updates: Partial<ServiceReport>) => void;
  onComplete: () => Promise<void>;
  completing: boolean;
}

// Chunk 4 will replace the placeholder signature blocks with a touch-input
// signature canvas (and surface the engineer's stored signature from their
// profile). For Chunk 2, the client and engineer name fields persist; the
// signature fields stay untouched.
export function SignOffStep({ report, onPatch, onComplete, completing }: Props) {
  const canComplete =
    !!report.system_status && !!report.client_name && !!report.client_sign_name;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Sign-off</h3>
        <p className="text-xs text-muted-foreground">
          Capture the client's name and position. Digital signature capture is added
          in a later chunk.
        </p>
      </div>

      <div>
        <Label className="text-xs">Engineer name</Label>
        <Input
          value={report.engineer_name ?? ""}
          onChange={(e) => onPatch({ engineer_name: e.target.value || null })}
        />
      </div>

      <div>
        <Label className="text-xs">Client name</Label>
        <Input
          value={report.client_name ?? ""}
          onChange={(e) => onPatch({ client_name: e.target.value || null })}
        />
      </div>

      <div>
        <Label className="text-xs">Client signing name (as printed)</Label>
        <Input
          value={report.client_sign_name ?? ""}
          onChange={(e) => onPatch({ client_sign_name: e.target.value || null })}
        />
      </div>

      <div>
        <Label className="text-xs">Client position</Label>
        <Input
          value={report.client_sign_position ?? ""}
          onChange={(e) => onPatch({ client_sign_position: e.target.value || null })}
          placeholder="e.g. Site Manager"
        />
      </div>

      <div className="pt-2">
        <Button
          onClick={onComplete}
          disabled={!canComplete || completing}
          className="w-full"
          size="lg"
        >
          {completing ? "Completing…" : "Complete service report"}
        </Button>
        {!canComplete && (
          <p className="text-xs text-muted-foreground mt-2 text-center">
            System status, client name, and signing name are required before completion.
          </p>
        )}
      </div>
    </div>
  );
}
