/**
 * BAFELeadIndividualsPanel
 *
 * Manage BAFE SP203-1 Lead Individuals (Clauses 11.4-14.5). Lists
 * active + interim leads grouped by module, plus a separate
 * Departed section showing the 30/90-day deadline countdown so
 * suspension risk is visible at a glance.
 *
 * Actions: Add lead, Edit lead, Mark departed (which sets the
 * departed_date and computes the 90-day replacement_deadline).
 * CPD records are shown as a count for now — full CPD CRUD lives
 * in a follow-up PR.
 *
 * No org_id involvement (single-tenant); RLS gates access via
 * has_elevated_role.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  UserCog,
  UserPlus,
  Loader2,
  Pencil,
  UserX,
  GraduationCap,
  AlertOctagon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type {
  BafeLeadIndividual,
  BafeLeadStatus,
  BafeModule,
} from "@/types/bafe";
import { BAFE_MODULES, MODULE_LABELS, daysUntil } from "./utils";

interface FormState {
  name: string;
  module: BafeModule;
  qualification_name: string;
  qualification_level: string;
  qualification_body: string;
  qualification_date: string;
  status: BafeLeadStatus;
  notes: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  module: "maintenance",
  qualification_name: "",
  qualification_level: "",
  qualification_body: "",
  qualification_date: "",
  status: "active",
  notes: "",
};

type DialogState =
  | { mode: "add" }
  | { mode: "edit"; lead: BafeLeadIndividual }
  | { mode: "depart"; lead: BafeLeadIndividual }
  | null;

export function BAFELeadIndividualsPanel() {
  const [leads, setLeads] = useState<BafeLeadIndividual[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<DialogState>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("bafe_lead_individuals")
        .select("*")
        .order("status")
        .order("module")
        .order("name");
      if (error) throw error;
      setLeads((data ?? []) as BafeLeadIndividual[]);
    } catch (e) {
      toast.error("Couldn't load Lead Individuals", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const { byModule, departed } = useMemo(() => {
    const active: Partial<Record<BafeModule, BafeLeadIndividual[]>> = {};
    const dep: BafeLeadIndividual[] = [];
    for (const l of leads) {
      if (l.status === "departed") dep.push(l);
      else {
        if (!active[l.module]) active[l.module] = [];
        active[l.module]!.push(l);
      }
    }
    return { byModule: active, departed: dep };
  }, [leads]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <UserCog className="w-5 h-5 text-primary" />
            BAFE Lead Individuals
          </h2>
          <p className="text-sm text-muted-foreground">
            One per certified module (Clauses 11.4–14.5). Marking a
            Lead as departed triggers the 30-day CB notification clock
            and the 90-day replacement deadline.
          </p>
        </div>
        <Button size="sm" onClick={() => setDialog({ mode: "add" })}>
          <UserPlus className="w-4 h-4 mr-1" />
          Add Lead
        </Button>
      </div>

      {BAFE_MODULES.map((module) => (
        <ModuleSection
          key={module}
          module={module}
          leads={byModule[module] ?? []}
          onEdit={(lead) => setDialog({ mode: "edit", lead })}
          onDepart={(lead) => setDialog({ mode: "depart", lead })}
        />
      ))}

      {departed.length > 0 && (
        <DepartedSection
          leads={departed}
          onEdit={(lead) => setDialog({ mode: "edit", lead })}
        />
      )}

      <LeadDialog state={dialog} onClose={() => setDialog(null)} onSaved={load} />
    </div>
  );
}

// ── Module section ─────────────────────────────────────────────────

function ModuleSection({
  module,
  leads,
  onEdit,
  onDepart,
}: {
  module: BafeModule;
  leads: BafeLeadIndividual[];
  onEdit: (l: BafeLeadIndividual) => void;
  onDepart: (l: BafeLeadIndividual) => void;
}) {
  const noLead = leads.length === 0;
  return (
    <section className="rounded-lg border bg-card overflow-hidden">
      <header
        className={cn(
          "px-4 py-2 border-b flex items-center justify-between gap-2",
          noLead ? "bg-destructive/5" : "bg-muted/30",
        )}
      >
        <h3 className="text-sm font-semibold">{MODULE_LABELS[module]}</h3>
        {noLead && (
          <span className="text-xs text-destructive flex items-center gap-1">
            <AlertOctagon className="w-3.5 h-3.5" />
            No active Lead
          </span>
        )}
      </header>
      {noLead ? (
        <p className="px-4 py-3 text-xs text-muted-foreground">
          No active Lead Individual recorded. If this module is in
          <code className="ml-1 px-1 bg-muted rounded text-[10px]">
            company_settings.bafe_modules_certified
          </code>
          , the compliance dashboard will flag a
          <code className="ml-1 px-1 bg-muted rounded text-[10px]">
            no_lead_for_certified
          </code>
          alert.
        </p>
      ) : (
        <ul className="divide-y">
          {leads.map((l) => (
            <LeadRow key={l.id} lead={l} onEdit={onEdit} onDepart={onDepart} />
          ))}
        </ul>
      )}
    </section>
  );
}

function LeadRow({
  lead,
  onEdit,
  onDepart,
}: {
  lead: BafeLeadIndividual;
  onEdit: (l: BafeLeadIndividual) => void;
  onDepart: (l: BafeLeadIndividual) => void;
}) {
  const cpdCount = Array.isArray(lead.cpd_records) ? lead.cpd_records.length : 0;
  return (
    <li className="px-4 py-3 flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-sm">{lead.name}</p>
          {lead.status === "interim" && (
            <Badge variant="outline" className="text-[10px]">
              Interim
            </Badge>
          )}
        </div>
        {lead.qualification_name && (
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <GraduationCap className="w-3 h-3" />
            {lead.qualification_name}
            {lead.qualification_level && ` · ${lead.qualification_level}`}
            {lead.qualification_body && ` · ${lead.qualification_body}`}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground mt-1">
          {cpdCount} CPD record{cpdCount === 1 ? "" : "s"} logged
        </p>
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={() => onEdit(lead)}
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-destructive hover:text-destructive"
          onClick={() => onDepart(lead)}
          title="Mark this Lead as departed"
        >
          <UserX className="w-3.5 h-3.5" />
        </Button>
      </div>
    </li>
  );
}

// ── Departed section — countdown UI ───────────────────────────────

function DepartedSection({
  leads,
  onEdit,
}: {
  leads: BafeLeadIndividual[];
  onEdit: (l: BafeLeadIndividual) => void;
}) {
  return (
    <section className="rounded-lg border bg-card overflow-hidden">
      <header className="px-4 py-2 border-b bg-amber-500/5 flex items-center gap-2">
        <UserX className="w-4 h-4 text-amber-600" />
        <h3 className="text-sm font-semibold">Departed Leads</h3>
        <span className="text-xs text-muted-foreground">
          · 30-day CB notification + 90-day replacement clocks
        </span>
      </header>
      <ul className="divide-y">
        {leads.map((l) => (
          <DepartedRow key={l.id} lead={l} onEdit={onEdit} />
        ))}
      </ul>
    </section>
  );
}

function DepartedRow({
  lead,
  onEdit,
}: {
  lead: BafeLeadIndividual;
  onEdit: (l: BafeLeadIndividual) => void;
}) {
  const cbDeadline = lead.departed_date
    ? addDays(lead.departed_date, 30)
    : null;
  const replaceDeadline =
    lead.replacement_deadline ??
    (lead.departed_date ? addDays(lead.departed_date, 90) : null);

  const cbDays = daysUntil(cbDeadline);
  const replaceDays = daysUntil(replaceDeadline);

  return (
    <li className="px-4 py-3 flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{lead.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {MODULE_LABELS[lead.module]} · departed {lead.departed_date ?? "?"}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-3 text-[11px]">
          <DeadlineChip
            label="CB notification"
            days={cbDays}
            satisfied={!!lead.cb_notified_date}
            satisfiedLabel="CB notified"
          />
          <DeadlineChip
            label="Replacement"
            days={replaceDays}
            satisfied={false}
            satisfiedLabel=""
          />
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2"
        onClick={() => onEdit(lead)}
      >
        <Pencil className="w-3.5 h-3.5" />
      </Button>
    </li>
  );
}

function DeadlineChip({
  label,
  days,
  satisfied,
  satisfiedLabel,
}: {
  label: string;
  days: number | null;
  satisfied: boolean;
  satisfiedLabel: string;
}) {
  if (satisfied) {
    return (
      <span className="px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20">
        {label}: {satisfiedLabel}
      </span>
    );
  }
  if (days == null) {
    return (
      <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground border">
        {label}: —
      </span>
    );
  }
  const overdue = days < 0;
  return (
    <span
      className={cn(
        "px-2 py-0.5 rounded-full border",
        overdue
          ? "bg-destructive/10 text-destructive border-destructive/30"
          : days <= 7
            ? "bg-amber-500/10 text-amber-700 border-amber-500/30"
            : "bg-muted text-muted-foreground border",
      )}
    >
      {label}:{" "}
      {overdue
        ? `${Math.abs(days)}d overdue`
        : days === 0
          ? "today"
          : `${days}d left`}
    </span>
  );
}

// ── Lead dialog (add / edit / depart) ─────────────────────────────

function LeadDialog({
  state,
  onClose,
  onSaved,
}: {
  state: DialogState;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const isAdd = state?.mode === "add";
  const isEdit = state?.mode === "edit";
  const isDepart = state?.mode === "depart";

  const initialEditForm = (lead: BafeLeadIndividual): FormState => ({
    name: lead.name,
    module: lead.module,
    qualification_name: lead.qualification_name ?? "",
    qualification_level: lead.qualification_level ?? "",
    qualification_body: lead.qualification_body ?? "",
    qualification_date: lead.qualification_date ?? "",
    status: lead.status,
    notes: lead.notes ?? "",
  });

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [departedDate, setDepartedDate] = useState("");
  const [cbNotifiedDate, setCbNotifiedDate] = useState("");
  const [saving, setSaving] = useState(false);

  // Hydrate the form when the dialog opens for edit / depart.
  useEffect(() => {
    if (isEdit) setForm(initialEditForm(state!.lead as BafeLeadIndividual));
    else if (isDepart) {
      setDepartedDate(new Date().toISOString().slice(0, 10));
      setCbNotifiedDate("");
    } else setForm(EMPTY_FORM);
  }, [isEdit, isDepart, state]);

  if (!state) return null;

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = {
        name: form.name.trim(),
        module: form.module,
        status: form.status,
        qualification_name: form.qualification_name.trim() || null,
        qualification_level: form.qualification_level.trim() || null,
        qualification_body: form.qualification_body.trim() || null,
        qualification_date: form.qualification_date || null,
        notes: form.notes.trim() || null,
      };

      if (isAdd) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("bafe_lead_individuals")
          .insert(payload);
        if (error) throw error;
        toast.success("Lead Individual added");
      } else if (isEdit) {
        const lead = (state as { lead: BafeLeadIndividual }).lead;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("bafe_lead_individuals")
          .update(payload)
          .eq("id", lead.id);
        if (error) throw error;
        toast.success("Lead Individual updated");
      }
      await onSaved();
      onClose();
    } catch (e) {
      toast.error("Couldn't save Lead Individual", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDepart = async () => {
    if (!departedDate) {
      toast.error("Departed date is required");
      return;
    }
    setSaving(true);
    try {
      const lead = (state as { lead: BafeLeadIndividual }).lead;
      const replacementDeadline = addDays(departedDate, 90);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("bafe_lead_individuals")
        .update({
          status: "departed",
          departed_date: departedDate,
          cb_notified_date: cbNotifiedDate || null,
          replacement_deadline: replacementDeadline,
        })
        .eq("id", lead.id);
      if (error) throw error;
      toast.success("Lead marked as departed", {
        description: `Replacement deadline: ${replacementDeadline}`,
      });
      await onSaved();
      onClose();
    } catch (e) {
      toast.error("Couldn't mark Lead as departed", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isAdd && "Add Lead Individual"}
            {isEdit && "Edit Lead Individual"}
            {isDepart && "Mark Lead as departed"}
          </DialogTitle>
        </DialogHeader>

        {isDepart ? (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Departed date</Label>
              <Input
                type="date"
                value={departedDate}
                onChange={(e) => setDepartedDate(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">
                CB notified date{" "}
                <span className="text-muted-foreground">(optional now — fill when you do)</span>
              </Label>
              <Input
                type="date"
                value={cbNotifiedDate}
                onChange={(e) => setCbNotifiedDate(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Replacement deadline will be set to{" "}
              {departedDate ? addDays(departedDate, 90) : "—"}.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <Field label="Name">
              <Input
                value={form.name}
                onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                placeholder="J. Smith"
              />
            </Field>
            <Field label="Module">
              <Select
                value={form.module}
                onValueChange={(v) =>
                  setForm((s) => ({ ...s, module: v as BafeModule }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BAFE_MODULES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {MODULE_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select
                value={form.status}
                onValueChange={(v) =>
                  setForm((s) => ({ ...s, status: v as BafeLeadStatus }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="interim">Interim</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Qualification name">
                <Input
                  value={form.qualification_name}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, qualification_name: e.target.value }))
                  }
                  placeholder="BS 5839-1 Maintainer"
                />
              </Field>
              <Field label="Level">
                <Input
                  value={form.qualification_level}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, qualification_level: e.target.value }))
                  }
                  placeholder="Level 3"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Awarding body">
                <Input
                  value={form.qualification_body}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, qualification_body: e.target.value }))
                  }
                  placeholder="FIA"
                />
              </Field>
              <Field label="Date">
                <Input
                  type="date"
                  value={form.qualification_date}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, qualification_date: e.target.value }))
                  }
                />
              </Field>
            </div>
            <Field label="Notes">
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
              />
            </Field>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={isDepart ? handleDepart : handleSave}
            disabled={saving}
          >
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {isDepart ? "Mark departed" : isAdd ? "Add" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
