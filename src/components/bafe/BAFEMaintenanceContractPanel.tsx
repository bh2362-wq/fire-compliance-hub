/**
 * BAFEMaintenanceContractPanel
 *
 * Per-site BAFE maintenance contracts (Clauses 14.1-14.13). Lists
 * existing contracts with their SLA, ARC config, and inherited-system
 * status; inherited contracts that haven't had the Cl 14.12
 * inspection completed get an action button to log it.
 *
 * Add / Edit dialog covers the fields the audit checks for:
 *   - fault_attendance_sla_hours (default 8)
 *   - ARC agreement + provider + cert body + 24h notification flag
 *   - spare parts access + customer-notified flag
 *   - inherited_system + Cl 14.12 inspection completion tracking
 *
 * Single-tenant so no organisation_id filtering — RLS gates by
 * has_elevated_role.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Wrench,
  Plus,
  Pencil,
  Loader2,
  Radio,
  AlertOctagon,
  CheckCircle2,
  PackageOpen,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { BafeMaintenanceContract } from "@/types/bafe";

interface ContractRow extends BafeMaintenanceContract {
  site_name: string | null;
}

interface FormState {
  site_id: string;
  contract_start: string;
  contract_review: string;
  fault_attendance_sla_hours: string;
  arc_agreement: boolean;
  arc_provider: string;
  arc_cert_body: string;
  arc_notification_within_24h: boolean;
  spare_parts_access: boolean;
  spare_parts_unavailable_notified: boolean;
  spare_parts_notification_date: string;
  inherited_system: boolean;
  clause_1412_inspection_complete: boolean;
  clause_1412_inspection_date: string;
  clause_1412_variations_documented: boolean;
}

const EMPTY_FORM: FormState = {
  site_id: "",
  contract_start: new Date().toISOString().slice(0, 10),
  contract_review: "",
  fault_attendance_sla_hours: "8",
  arc_agreement: false,
  arc_provider: "",
  arc_cert_body: "",
  arc_notification_within_24h: false,
  spare_parts_access: true,
  spare_parts_unavailable_notified: false,
  spare_parts_notification_date: "",
  inherited_system: false,
  clause_1412_inspection_complete: false,
  clause_1412_inspection_date: "",
  clause_1412_variations_documented: false,
};

export function BAFEMaintenanceContractPanel() {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<
    { mode: "add" } | { mode: "edit"; contract: ContractRow } | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("bafe_maintenance_contracts")
        .select(`*, sites!inner(name)`)
        .order("contract_start", { ascending: false, nullsFirst: false });
      if (error) throw error;
      setContracts(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (data ?? []).map((r: any) => ({
          ...r,
          site_name: r.sites?.name ?? null,
        })),
      );

      const { data: siteData } = await supabase
        .from("sites")
        .select("id, name")
        .order("name");
      setSites(siteData ?? []);
    } catch (e) {
      toast.error("Couldn't load maintenance contracts", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleQuickComplete1412 = async (contract: ContractRow) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("bafe_maintenance_contracts")
        .update({
          clause_1412_inspection_complete: true,
          clause_1412_inspection_date: new Date().toISOString().slice(0, 10),
          // The flag for documented variations stays as the user set
          // it via the dialog; this is just the "ran the inspection"
          // tick.
        })
        .eq("id", contract.id);
      if (error) throw error;
      toast.success("Cl 14.12 inspection marked complete");
      await load();
    } catch (e) {
      toast.error("Couldn't mark inspection complete", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Wrench className="w-5 h-5 text-primary" />
            BAFE maintenance contracts
          </h2>
          <p className="text-sm text-muted-foreground">
            Per-site SLA, ARC config, inherited-system tracking
            (Clauses 14.1–14.13).
          </p>
        </div>
        <Button size="sm" onClick={() => setDialog({ mode: "add" })}>
          <Plus className="w-4 h-4 mr-1" />
          Add contract
        </Button>
      </div>

      {contracts.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          No maintenance contracts recorded yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {contracts.map((c) => (
            <ContractCard
              key={c.id}
              contract={c}
              onEdit={() => setDialog({ mode: "edit", contract: c })}
              onComplete1412={() => handleQuickComplete1412(c)}
            />
          ))}
        </ul>
      )}

      <ContractDialog
        state={dialog}
        sites={sites}
        onClose={() => setDialog(null)}
        onSaved={load}
      />
    </div>
  );
}

// ── Card ───────────────────────────────────────────────────────────

function ContractCard({
  contract,
  onEdit,
  onComplete1412,
}: {
  contract: ContractRow;
  onEdit: () => void;
  onComplete1412: () => void;
}) {
  const inherited1412Outstanding =
    contract.inherited_system && !contract.clause_1412_inspection_complete;
  return (
    <li
      className={cn(
        "rounded-lg border bg-card p-4",
        inherited1412Outstanding && "border-amber-500/50 bg-amber-500/5",
      )}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="font-semibold">{contract.site_name ?? "Unknown site"}</p>
          <div className="flex flex-wrap gap-2 mt-1.5 text-xs">
            <Chip
              icon={<Wrench className="w-3 h-3" />}
              label={`${contract.fault_attendance_sla_hours}h SLA`}
            />
            {contract.arc_agreement ? (
              <Chip
                icon={<Radio className="w-3 h-3" />}
                label={
                  contract.arc_provider
                    ? `ARC: ${contract.arc_provider}`
                    : "ARC linked"
                }
                tone={
                  contract.arc_notification_within_24h
                    ? "success"
                    : "warning"
                }
              />
            ) : null}
            <Chip
              icon={<PackageOpen className="w-3 h-3" />}
              label={
                contract.spare_parts_access
                  ? "Spares OK"
                  : "Spares unavailable"
              }
              tone={contract.spare_parts_access ? "default" : "warning"}
            />
            {contract.inherited_system && (
              <Badge variant="outline" className="text-[10px]">
                Inherited
              </Badge>
            )}
            {contract.inherited_system &&
              contract.clause_1412_inspection_complete && (
                <Chip
                  icon={<CheckCircle2 className="w-3 h-3" />}
                  label={`Cl 14.12 ${contract.clause_1412_inspection_date}`}
                  tone="success"
                />
              )}
          </div>
        </div>
        <div className="flex gap-2">
          {inherited1412Outstanding && (
            <Button
              size="sm"
              variant="outline"
              className="border-amber-500/50 text-amber-700 hover:text-amber-800"
              onClick={onComplete1412}
            >
              Complete Cl 14.12
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      {inherited1412Outstanding && (
        <p className="text-xs text-amber-700 mt-3 flex items-center gap-1">
          <AlertOctagon className="w-3 h-3" />
          Inherited system — Cl 14.12 inspection against BS 5839-1
          required before maintenance starts.
        </p>
      )}
    </li>
  );
}

function Chip({
  icon,
  label,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  tone?: "default" | "success" | "warning";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px]",
        tone === "success" &&
          "bg-success/10 text-success border-success/30",
        tone === "warning" &&
          "bg-amber-500/10 text-amber-700 border-amber-500/30",
        tone === "default" && "bg-muted text-muted-foreground",
      )}
    >
      {icon}
      {label}
    </span>
  );
}

// ── Dialog ─────────────────────────────────────────────────────────

function ContractDialog({
  state,
  sites,
  onClose,
  onSaved,
}: {
  state: { mode: "add" } | { mode: "edit"; contract: ContractRow } | null;
  sites: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (state?.mode === "edit") {
      const c = state.contract;
      setForm({
        site_id: c.site_id,
        contract_start: c.contract_start ?? "",
        contract_review: c.contract_review ?? "",
        fault_attendance_sla_hours: String(c.fault_attendance_sla_hours ?? 8),
        arc_agreement: c.arc_agreement,
        arc_provider: c.arc_provider ?? "",
        arc_cert_body: c.arc_cert_body ?? "",
        arc_notification_within_24h: c.arc_notification_within_24h,
        spare_parts_access: c.spare_parts_access,
        spare_parts_unavailable_notified: c.spare_parts_unavailable_notified,
        spare_parts_notification_date: c.spare_parts_notification_date ?? "",
        inherited_system: c.inherited_system,
        clause_1412_inspection_complete: c.clause_1412_inspection_complete,
        clause_1412_inspection_date: c.clause_1412_inspection_date ?? "",
        clause_1412_variations_documented: c.clause_1412_variations_documented,
      });
    } else if (state?.mode === "add") {
      setForm(EMPTY_FORM);
    }
  }, [state]);

  if (!state) return null;
  const isEdit = state.mode === "edit";

  const handleSave = async () => {
    if (!form.site_id) {
      toast.error("Pick a site");
      return;
    }
    const sla = parseInt(form.fault_attendance_sla_hours, 10);
    if (!Number.isFinite(sla) || sla <= 0) {
      toast.error("SLA hours must be a positive number");
      return;
    }
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = {
        site_id: form.site_id,
        contract_start: form.contract_start || null,
        contract_review: form.contract_review || null,
        fault_attendance_sla_hours: sla,
        arc_agreement: form.arc_agreement,
        arc_provider: form.arc_provider.trim() || null,
        arc_cert_body: form.arc_cert_body.trim() || null,
        arc_notification_within_24h: form.arc_notification_within_24h,
        spare_parts_access: form.spare_parts_access,
        spare_parts_unavailable_notified: form.spare_parts_unavailable_notified,
        spare_parts_notification_date: form.spare_parts_notification_date || null,
        inherited_system: form.inherited_system,
        clause_1412_inspection_complete: form.clause_1412_inspection_complete,
        clause_1412_inspection_date: form.clause_1412_inspection_date || null,
        clause_1412_variations_documented: form.clause_1412_variations_documented,
      };
      if (isEdit) {
        const id = (state as { contract: ContractRow }).contract.id;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("bafe_maintenance_contracts")
          .update(payload)
          .eq("id", id);
        if (error) throw error;
        toast.success("Maintenance contract updated");
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("bafe_maintenance_contracts")
          .insert(payload);
        if (error) throw error;
        toast.success("Maintenance contract added");
      }
      await onSaved();
      onClose();
    } catch (e) {
      toast.error("Couldn't save maintenance contract", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit maintenance contract" : "Add maintenance contract"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Site</Label>
            <Select
              value={form.site_id}
              onValueChange={(v) => setForm((s) => ({ ...s, site_id: v }))}
              disabled={isEdit}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick a site" />
              </SelectTrigger>
              <SelectContent>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Contract start</Label>
              <Input
                type="date"
                value={form.contract_start}
                onChange={(e) =>
                  setForm((s) => ({ ...s, contract_start: e.target.value }))
                }
              />
            </div>
            <div>
              <Label className="text-xs">Next review</Label>
              <Input
                type="date"
                value={form.contract_review}
                onChange={(e) =>
                  setForm((s) => ({ ...s, contract_review: e.target.value }))
                }
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">
              Fault attendance SLA (hours) · default 8
            </Label>
            <Input
              type="number"
              min="1"
              value={form.fault_attendance_sla_hours}
              onChange={(e) =>
                setForm((s) => ({
                  ...s,
                  fault_attendance_sla_hours: e.target.value,
                }))
              }
            />
          </div>

          <div className="space-y-2 rounded-md border p-3 bg-muted/20">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              ARC (Cl 14.10)
            </p>
            <CheckboxRow
              label="ARC agreement in place"
              checked={form.arc_agreement}
              onChange={(v) => setForm((s) => ({ ...s, arc_agreement: v }))}
            />
            {form.arc_agreement && (
              <>
                <div>
                  <Label className="text-xs">ARC provider</Label>
                  <Input
                    value={form.arc_provider}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, arc_provider: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">ARC cert body</Label>
                  <Input
                    value={form.arc_cert_body}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, arc_cert_body: e.target.value }))
                    }
                    placeholder="e.g. UKAS-accredited"
                  />
                </div>
                <CheckboxRow
                  label="ARC notifies activations within 24h / NWD"
                  checked={form.arc_notification_within_24h}
                  onChange={(v) =>
                    setForm((s) => ({ ...s, arc_notification_within_24h: v }))
                  }
                />
              </>
            )}
          </div>

          <div className="space-y-2 rounded-md border p-3 bg-muted/20">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Spare parts (Cl 14.13)
            </p>
            <CheckboxRow
              label="Spare parts access available"
              checked={form.spare_parts_access}
              onChange={(v) => setForm((s) => ({ ...s, spare_parts_access: v }))}
            />
            {!form.spare_parts_access && (
              <>
                <CheckboxRow
                  label="Customer notified in writing"
                  checked={form.spare_parts_unavailable_notified}
                  onChange={(v) =>
                    setForm((s) => ({ ...s, spare_parts_unavailable_notified: v }))
                  }
                />
                <div>
                  <Label className="text-xs">Notification date</Label>
                  <Input
                    type="date"
                    value={form.spare_parts_notification_date}
                    onChange={(e) =>
                      setForm((s) => ({
                        ...s,
                        spare_parts_notification_date: e.target.value,
                      }))
                    }
                  />
                </div>
              </>
            )}
          </div>

          <div className="space-y-2 rounded-md border p-3 bg-muted/20">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Inherited system (Cl 14.12)
            </p>
            <CheckboxRow
              label="System inherited from prior maintainer"
              checked={form.inherited_system}
              onChange={(v) => setForm((s) => ({ ...s, inherited_system: v }))}
            />
            {form.inherited_system && (
              <>
                <CheckboxRow
                  label="Cl 14.12 inspection complete"
                  checked={form.clause_1412_inspection_complete}
                  onChange={(v) =>
                    setForm((s) => ({ ...s, clause_1412_inspection_complete: v }))
                  }
                />
                {form.clause_1412_inspection_complete && (
                  <>
                    <div>
                      <Label className="text-xs">Inspection date</Label>
                      <Input
                        type="date"
                        value={form.clause_1412_inspection_date}
                        onChange={(e) =>
                          setForm((s) => ({
                            ...s,
                            clause_1412_inspection_date: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <CheckboxRow
                      label="Variations documented to customer"
                      checked={form.clause_1412_variations_documented}
                      onChange={(v) =>
                        setForm((s) => ({
                          ...s,
                          clause_1412_variations_documented: v,
                        }))
                      }
                    />
                  </>
                )}
              </>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {isEdit ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} />
      {label}
    </label>
  );
}
