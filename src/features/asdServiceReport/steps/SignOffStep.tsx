import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SignaturePad } from "@/components/ui/signature-pad";
import { Loader2 } from "lucide-react";
import type { ASDDraft } from "../useASDDraft";

interface Props {
  draft: ASDDraft;
  onPatch: (updates: Partial<ASDDraft>) => void;
  onComplete: () => void;
  completing: boolean;
}

function isDataUrlSig(v: string | null | undefined): boolean {
  return typeof v === "string" && v.startsWith("data:image");
}

export function SignOffStep({ draft, onPatch, onComplete, completing }: Props) {
  const disabled = draft.is_locked;
  const engineerSigOk = isDataUrlSig(draft.engineer_signature);
  const clientSigOk = draft.customer_not_present || isDataUrlSig(draft.customer_signature);
  const canComplete = engineerSigOk && clientSigOk && !!draft.engineer_name;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold">Sign-off</h3>
        <p className="text-xs text-muted-foreground">
          Capture engineer + client signatures, then complete the report.
        </p>
      </div>

      <section className="rounded-lg border bg-card p-3 space-y-2">
        <Label className="text-sm font-medium">Engineer signature</Label>
        <Input
          value={draft.engineer_name}
          onChange={(e) => onPatch({ engineer_name: e.target.value })}
          placeholder="Engineer name"
          disabled={disabled}
        />
        <SignaturePad
          label="Engineer signature"
          value={draft.engineer_signature}
          onChange={(v) => onPatch({ engineer_signature: v || "" })}
          disabled={disabled}
        />
      </section>

      <section className="rounded-lg border bg-card p-3 space-y-2">
        <Label className="text-sm font-medium">Client / Responsible Person</Label>
        <Input
          value={draft.client_name}
          onChange={(e) => onPatch({ client_name: e.target.value })}
          placeholder="Client name"
          disabled={disabled}
        />
        <div className="flex items-center gap-2">
          <Checkbox
            id="customer-absent-asd"
            checked={draft.customer_not_present}
            onCheckedChange={(v) => onPatch({ customer_not_present: v === true })}
            disabled={disabled}
          />
          <Label htmlFor="customer-absent-asd" className="text-xs">
            Customer not present on site
          </Label>
        </div>
        {!draft.customer_not_present && (
          <SignaturePad
            label="Client signature"
            value={isDataUrlSig(draft.customer_signature) ? draft.customer_signature : ""}
            onChange={(v) => onPatch({ customer_signature: v || "" })}
            disabled={disabled}
          />
        )}
      </section>

      <div className="pt-2">
        <Button
          onClick={onComplete}
          disabled={!canComplete || completing || disabled}
          className="w-full"
          size="lg"
        >
          {completing ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Completing…</>
          ) : (
            "Complete ASD service report"
          )}
        </Button>
        {!canComplete && !disabled && (
          <ul className="text-xs text-muted-foreground mt-2 space-y-0.5">
            {!draft.engineer_name && <li>• Engineer name required</li>}
            {!engineerSigOk && <li>• Engineer signature required</li>}
            {!clientSigOk && <li>• Client signature (or "not present" tick) required</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
