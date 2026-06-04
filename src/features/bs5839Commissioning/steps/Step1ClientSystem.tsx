import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CommissioningDraft } from "../useCommissioningDraft";
import type { Bs5839SystemState } from "@/types/bs5839";

// Step 1 — Client + System details (page 1 top half of A051).
// Customer block, system address/extent, new vs modification, category.

export function Step1ClientSystem({ draft }: { draft: CommissioningDraft }) {
  const { header, patchHeader, patchCategory, cert } = draft;
  const category = cert?.bs5839_install_category ?? null;

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-muted-foreground">Details of Client</h4>
        <Field label="Name">
          <Input
            value={header.customer_name ?? ""}
            onChange={(e) => patchHeader({ customer_name: e.target.value })}
          />
        </Field>
        <Field label="Address">
          <Input
            value={header.customer_address ?? ""}
            onChange={(e) => patchHeader({ customer_address: e.target.value })}
          />
        </Field>
        <Field label="Postcode">
          <Input
            value={header.customer_postcode ?? ""}
            onChange={(e) => patchHeader({ customer_postcode: e.target.value })}
          />
        </Field>
      </section>

      <section className="space-y-3 pt-3 border-t">
        <h4 className="text-sm font-semibold text-muted-foreground">
          Details of the Fire Alarm and Detection System
        </h4>
        <Field label="Extent of system covered by this certificate">
          <Textarea
            rows={2}
            value={header.extent_of_system ?? ""}
            onChange={(e) => patchHeader({ extent_of_system: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="The system is">
            <Select
              value={header.system_state ?? "__none"}
              onValueChange={(v) =>
                patchHeader({
                  system_state: v === "__none" ? null : (v as Bs5839SystemState),
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">—</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="modification">Modification</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Category (L1 / L2 / L3 / L4 / L5 / P1 / P2 / M)">
            <Input
              value={category ?? ""}
              onChange={(e) => patchCategory(e.target.value)}
              placeholder="e.g. L2"
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
