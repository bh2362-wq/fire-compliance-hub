import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CommissioningDraft } from "../useCommissioningDraft";

// Step 4 — Variations from Cl 39 + cross-cert references
// (design / installation cert numbers + drawing references).

export function Step4Variations({ draft }: { draft: CommissioningDraft }) {
  const { header, cert, patchHeader, patchVariations } = draft;
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-muted-foreground">
          Variations from clause 39 of BS 5839-1:2025
        </h4>
        <Textarea
          rows={4}
          value={cert?.variations_list ?? ""}
          onChange={(e) => patchVariations(e.target.value)}
          placeholder="Leave blank if commissioning complies in full."
        />
      </section>

      <section className="space-y-3 pt-3 border-t">
        <h4 className="text-sm font-semibold text-muted-foreground">
          Cross-references — other certs &amp; drawings
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Design certificate no.">
            <Input
              value={header.design_cert_number ?? ""}
              onChange={(e) => patchHeader({ design_cert_number: e.target.value })}
            />
          </Field>
          <Field label="Installation certificate no.">
            <Input
              value={header.installation_cert_number ?? ""}
              onChange={(e) => patchHeader({ installation_cert_number: e.target.value })}
            />
          </Field>
          <Field label="Design drawings ref.">
            <Input
              value={header.design_drawings_ref ?? ""}
              onChange={(e) => patchHeader({ design_drawings_ref: e.target.value })}
            />
          </Field>
          <Field label="As-fitted drawings ref.">
            <Input
              value={header.as_fitted_drawings_ref ?? ""}
              onChange={(e) => patchHeader({ as_fitted_drawings_ref: e.target.value })}
            />
          </Field>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
