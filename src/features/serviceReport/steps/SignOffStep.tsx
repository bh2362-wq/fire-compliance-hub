import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { SignaturePad } from "@/components/ui/signature-pad";
import { ServiceReport } from "@/services/serviceReportService";
import {
  getEngineerSignature,
  setEngineerSignature,
} from "@/services/profileSignatureService";

interface Props {
  report: ServiceReport;
  onPatch: (updates: Partial<ServiceReport>) => void;
  onComplete: () => Promise<void>;
  completing: boolean;
}

import {
  ABSENT_REASONS,
  buildAbsentMarker,
  isAbsentMarker,
  parseAbsentMarker,
  type AbsentReason,
} from "@/lib/clientSignatureMarker";

function isDataUrlSig(value: string | null): boolean {
  return typeof value === "string" && value.startsWith("data:image");
}

const REASON_LABELS: Record<AbsentReason, string> = {
  verbally_briefed: "Verbally briefed",
  not_on_site: "Not on site",
  other: "Other",
};

export function SignOffStep({ report, onPatch, onComplete, completing }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [savedDefault, setSavedDefault] = useState<string | null>(null);
  const [savingDefault, setSavingDefault] = useState(false);
  const [defaultLoaded, setDefaultLoaded] = useState(false);

  // Load the engineer's stored default signature once.
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const stored = await getEngineerSignature(user.id);
        setSavedDefault(stored);
        // If no engineer sig yet on this report but a default exists, preload it.
        if (stored && !report.engineer_signature) {
          onPatch({ engineer_signature: stored });
        }
      } catch {
        // Ignore — column may not be present yet (migration not applied).
      } finally {
        setDefaultLoaded(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const clientAbsent = isAbsentMarker(report.client_signature);
  const { reason: absentReason, note: absentNote } = parseAbsentMarker(report.client_signature);

  const handleUseDefault = () => {
    if (savedDefault) onPatch({ engineer_signature: savedDefault });
  };

  const handleSaveAsDefault = async () => {
    if (!user || !report.engineer_signature) return;
    setSavingDefault(true);
    try {
      await setEngineerSignature(user.id, report.engineer_signature);
      setSavedDefault(report.engineer_signature);
      toast({ title: "Saved as your default signature" });
    } catch (e) {
      toast({
        title: "Could not save default",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setSavingDefault(false);
    }
  };

  const toggleClientAbsent = (absent: boolean) => {
    if (absent) {
      // Default to "verbally_briefed" when first ticked — engineer can
      // change to another reason or add an "Other" note. Persisting a
      // reason from the start keeps the printed report meaningful even
      // if the engineer ticks and completes without revisiting.
      onPatch({ client_signature: buildAbsentMarker("verbally_briefed") });
    } else {
      onPatch({ client_signature: null });
    }
  };

  const setAbsentReason = (reason: AbsentReason) => {
    if (reason === "other") {
      onPatch({ client_signature: buildAbsentMarker("other", absentNote) });
    } else {
      onPatch({ client_signature: buildAbsentMarker(reason) });
    }
  };

  const setAbsentNote = (note: string) => {
    onPatch({ client_signature: buildAbsentMarker("other", note) });
  };

  const engineerSigOk = isDataUrlSig(report.engineer_signature);
  const clientSigOk = clientAbsent || isDataUrlSig(report.client_signature);
  const clientDetailsOk = clientAbsent || !!report.client_sign_name;
  const canComplete =
    !!report.system_status && engineerSigOk && clientSigOk && clientDetailsOk;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold">Recommendations &amp; sign-off</h3>
        <p className="text-xs text-muted-foreground">
          Summarise findings, set the next service date, then capture both signatures.
        </p>
      </div>

      {/* ── Recommendations & next service ──────────────────────────── */}
      <section className="space-y-3 rounded-lg border bg-card p-3">
        <h4 className="text-sm font-medium">Recommendations</h4>
        <div>
          <Label className="text-xs">Summary for the client</Label>
          <Textarea
            value={report.recommendations ?? ""}
            onChange={(e) => onPatch({ recommendations: e.target.value || null })}
            rows={4}
            placeholder="2–4 sentences summarising findings, referencing BS 5839-1:2025 clauses where relevant."
          />
        </div>
        <div>
          <Label className="text-xs">Next service due</Label>
          <Input
            type="date"
            value={report.next_service_due ?? ""}
            onChange={(e) => onPatch({ next_service_due: e.target.value || null })}
          />
        </div>
      </section>

      {/* ── Engineer block ──────────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border bg-card p-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">Engineer</h4>
          {defaultLoaded && savedDefault && (
            <Badge
              variant="outline"
              className="bg-emerald-50 text-emerald-800 border-emerald-200"
            >
              Default on file
            </Badge>
          )}
        </div>

        <div>
          <Label className="text-xs">Engineer name</Label>
          <Input
            value={report.engineer_name ?? ""}
            onChange={(e) => onPatch({ engineer_name: e.target.value || null })}
          />
        </div>

        <SignaturePad
          label="Engineer signature"
          value={report.engineer_signature ?? ""}
          onChange={(v) => onPatch({ engineer_signature: v || null })}
        />

        <div className="flex flex-wrap gap-2">
          {savedDefault && report.engineer_signature !== savedDefault && (
            <Button variant="outline" size="sm" onClick={handleUseDefault}>
              Use saved signature
            </Button>
          )}
          {engineerSigOk && report.engineer_signature !== savedDefault && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveAsDefault}
              disabled={savingDefault}
            >
              {savingDefault ? "Saving…" : "Save as my default"}
            </Button>
          )}
        </div>
      </section>

      {/* ── Client block ────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border bg-card p-3">
        <h4 className="text-sm font-medium">Client</h4>

        <div className="flex items-center gap-2">
          <Checkbox
            id="client-absent"
            checked={clientAbsent}
            onCheckedChange={(checked) => toggleClientAbsent(checked === true)}
          />
          <Label htmlFor="client-absent" className="text-sm">
            Client not present / not signing
          </Label>
        </div>

        {clientAbsent && (
          <div className="space-y-2 rounded-md border bg-muted/40 p-2.5">
            <Label className="text-xs">Reason</Label>
            <div className="grid grid-cols-1 gap-1.5">
              {ABSENT_REASONS.map((r) => {
                const active = absentReason === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setAbsentReason(r)}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background hover:bg-accent"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded-sm border ${
                        active ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                      }`}
                    >
                      {active && <span className="text-[10px] leading-none">✓</span>}
                    </span>
                    {REASON_LABELS[r]}
                  </button>
                );
              })}
            </div>
            {absentReason === "other" && (
              <Input
                value={absentNote ?? ""}
                onChange={(e) => setAbsentNote(e.target.value)}
                placeholder="Describe the reason (printed on the report)"
                className="text-sm"
              />
            )}
          </div>
        )}

        {!clientAbsent && (
          <>
            <div>
              <Label className="text-xs">Client name</Label>
              <Input
                value={report.client_name ?? ""}
                onChange={(e) => onPatch({ client_name: e.target.value || null })}
              />
            </div>

            <div>
              <Label className="text-xs">Signing name (as printed)</Label>
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

            <SignaturePad
              label="Client signature"
              value={isDataUrlSig(report.client_signature) ? (report.client_signature as string) : ""}
              onChange={(v) => onPatch({ client_signature: v || null })}
            />
          </>
        )}
      </section>

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
          <ul className="text-xs text-muted-foreground mt-2 space-y-0.5">
            {!report.system_status && <li>• Departure status missing (Step 5)</li>}
            {!engineerSigOk && <li>• Engineer signature required</li>}
            {!clientSigOk && <li>• Client signature required (or mark client absent)</li>}
            {!clientDetailsOk && <li>• Client signing name required</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
