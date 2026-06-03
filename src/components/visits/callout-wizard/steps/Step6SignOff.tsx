import { Input } from "@/components/ui/input";
import { SmartSignature } from "@/components/ui/smart-signature";
import { Field } from "../sharedFields";
import type { CalloutWizardState } from "../useCalloutWizard";

// Step 6 — Sign-off. Engineer signs, then the client. Customer-record
// fallback at render time, same as PR #128 fixed for C&E §9: whatever
// the engineer types wins, but if a field is blank the PDF/DOCX
// renderer falls through to the customer record so the report doesn't
// print "—". We surface the customer values as PLACEHOLDERS so the
// form stays an accurate record of what the engineer typed.
//
// Storage:
//   client_sign_name      → reportData?.client_sign_name
//                         → reportData?.client_name (legacy)
//                         → customer.contact_name (render-time fallback)

export function Step6SignOff({ state }: { state: CalloutWizardState }) {
  const { report, patchReport, customer } = state;

  const namePlaceholder = customer.contact_name ?? "Client name";

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-muted-foreground">
          Engineer
        </h4>
        <Field label="Engineer name">
          <Input
            value={report.engineer_name ?? ""}
            onChange={(e) => patchReport({ engineer_name: e.target.value })}
            placeholder="Your name as it should appear on the report"
          />
        </Field>
        <SmartSignature
          label="Engineer signature"
          value={report.engineer_signature ?? ""}
          onChange={(v) => patchReport({ engineer_signature: v })}
        />
      </section>

      <section className="space-y-3 border-t pt-4">
        <h4 className="text-sm font-semibold text-muted-foreground">
          Client / Responsible Person
        </h4>
        <Field
          label="Client name"
          hint={
            customer.contact_name
              ? `Leave blank to use customer record (${customer.contact_name}).`
              : undefined
          }
        >
          <Input
            value={report.client_sign_name ?? ""}
            onChange={(e) => patchReport({ client_sign_name: e.target.value })}
            placeholder={namePlaceholder}
          />
        </Field>
        <Field label="Client position / role">
          <Input
            value={report.client_sign_position ?? ""}
            onChange={(e) =>
              patchReport({ client_sign_position: e.target.value })
            }
            placeholder="e.g. Facilities Manager"
          />
        </Field>
        <SmartSignature
          label="Client signature"
          value={report.client_signature ?? ""}
          onChange={(v) => patchReport({ client_signature: v })}
          showAbsent
        />
      </section>
    </div>
  );
}
