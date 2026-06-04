/**
 * BAFECertificateRegister
 *
 * Lists every BAFE SP203-1 certificate (Compliance / Modular /
 * Maintenance / Modification) issued or pending, with filters by
 * type and status. Drives off site_bafe_certificates WHERE
 * bafe_cert_type IS NOT NULL — non-BAFE entries in the same table
 * are excluded.
 *
 * Actions:
 *   - Issue new cert (calls getNextBafeCertNumber, opens a dialog
 *     to capture completion date / modules covered / variations,
 *     inserts a draft row)
 *   - Mark as issued (stamps issued_date, signed_by, optionally
 *     flips bs5839_cert_issued)
 *
 * Overdue rows are highlighted red — completion_date + 30d in the
 * past with no issued_date.
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  FileCheck,
  Plus,
  Loader2,
  CheckCircle2,
  AlertOctagon,
  CalendarClock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getNextBafeCertNumber } from "@/utils/bafe/generateCertNumber";
import type { BafeCertType, BafeModule } from "@/types/bafe";
import { BAFE_MODULES, MODULE_LABELS } from "./utils";

// Cert row shape — projects the columns we actually display. The
// schema has more fields (signed_by, voided_reason, etc.); we add
// them as needed.
interface CertRow {
  id: string;
  certificate_number: string;
  bafe_cert_type: BafeCertType;
  bafe_modules_covered: string[];
  completion_date: string | null;
  issued_date: string | null;
  site_id: string;
  site_name: string | null;
  customer_id: string | null;
  customer_name: string | null;
  variations_list: string | null;
  bs5839_cert_issued: boolean;
  voided: boolean;
}

interface NewCertForm {
  bafe_cert_type: BafeCertType;
  site_id: string;
  bafe_modules_covered: BafeModule[];
  completion_date: string;
  variations_list: string;
}

const TYPE_LABELS: Record<BafeCertType, string> = {
  compliance: "Compliance (D+I+C+H)",
  modular: "Modular",
  maintenance: "Maintenance",
  modification: "Modification",
};

const TYPE_PREFIX: Record<BafeCertType, string> = {
  compliance: "COC",
  modular: "MOD",
  maintenance: "MNT",
  modification: "MOF",
};

type StatusFilter = "all" | "outstanding" | "issued" | "overdue" | "voided";

export function BAFECertificateRegister() {
  const [rows, setRows] = useState<CertRow[]>([]);
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<BafeCertType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [newDialog, setNewDialog] = useState(false);
  const [issuing, setIssuing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("site_bafe_certificates")
        .select(
          `id, certificate_number, bafe_cert_type, bafe_modules_covered,
           completion_date, issued_date, site_id, customer_id,
           variations_list, bs5839_cert_issued, voided,
           sites!inner(name),
           customers(name)`,
        )
        .not("bafe_cert_type", "is", null)
        .order("completion_date", { ascending: false, nullsFirst: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const projected: CertRow[] = (data ?? []).map((r: any) => ({
        id: r.id,
        certificate_number: r.certificate_number,
        bafe_cert_type: r.bafe_cert_type,
        bafe_modules_covered: r.bafe_modules_covered ?? [],
        completion_date: r.completion_date,
        issued_date: r.issued_date,
        site_id: r.site_id,
        site_name: r.sites?.name ?? null,
        customer_id: r.customer_id,
        customer_name: r.customers?.name ?? null,
        variations_list: r.variations_list,
        bs5839_cert_issued: r.bs5839_cert_issued ?? false,
        voided: r.voided ?? false,
      }));
      setRows(projected);

      // Pre-fetch sites for the "Issue new cert" dropdown — small
      // enough table that one upfront query saves a per-dialog spin.
      const { data: siteData } = await supabase
        .from("sites")
        .select("id, name")
        .order("name");
      setSites(siteData ?? []);
    } catch (e) {
      toast.error("Couldn't load BAFE certificate register", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (typeFilter !== "all" && r.bafe_cert_type !== typeFilter) return false;
      const status = certStatus(r);
      if (statusFilter !== "all" && status !== statusFilter) return false;
      return true;
    });
  }, [rows, typeFilter, statusFilter]);

  const counts = useMemo(() => {
    const out = { outstanding: 0, issued: 0, overdue: 0, voided: 0 };
    for (const r of rows) {
      const s = certStatus(r);
      if (s in out) out[s as keyof typeof out] += 1;
    }
    return out;
  }, [rows]);

  const handleMarkIssued = async (cert: CertRow) => {
    if (!confirm(`Mark certificate ${cert.certificate_number} as issued today?`)) return;
    setIssuing(cert.id);
    try {
      const { data: userData } = await supabase.auth.getUser();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("site_bafe_certificates")
        .update({
          issued_date: new Date().toISOString().slice(0, 10),
          signed_by: userData.user?.id ?? null,
        })
        .eq("id", cert.id);
      if (error) throw error;
      toast.success(`Certificate ${cert.certificate_number} marked as issued`);
      await load();
    } catch (e) {
      toast.error("Couldn't mark certificate as issued", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setIssuing(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-primary" />
            BAFE certificate register
          </h2>
          <p className="text-sm text-muted-foreground">
            Compliance / Modular / Maintenance / Modification certs.
            30 days from completion to issuance.
          </p>
        </div>
        <Button size="sm" onClick={() => setNewDialog(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Issue new cert
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <FilterTile
          label="Outstanding"
          count={counts.outstanding}
          active={statusFilter === "outstanding"}
          onClick={() =>
            setStatusFilter(statusFilter === "outstanding" ? "all" : "outstanding")
          }
        />
        <FilterTile
          label="Overdue"
          count={counts.overdue}
          tint="bg-destructive/10 text-destructive border-destructive/30"
          active={statusFilter === "overdue"}
          onClick={() =>
            setStatusFilter(statusFilter === "overdue" ? "all" : "overdue")
          }
        />
        <FilterTile
          label="Issued"
          count={counts.issued}
          tint="bg-success/10 text-success border-success/30"
          active={statusFilter === "issued"}
          onClick={() =>
            setStatusFilter(statusFilter === "issued" ? "all" : "issued")
          }
        />
        <FilterTile
          label="Voided"
          count={counts.voided}
          tint="bg-muted text-muted-foreground"
          active={statusFilter === "voided"}
          onClick={() =>
            setStatusFilter(statusFilter === "voided" ? "all" : "voided")
          }
        />
      </div>

      <div className="flex items-center gap-2">
        <Label className="text-xs">Type</Label>
        <Select
          value={typeFilter}
          onValueChange={(v) => setTypeFilter(v as BafeCertType | "all")}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {(Object.keys(TYPE_LABELS) as BafeCertType[]).map((t) => (
              <SelectItem key={t} value={t}>
                {TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          No certificates match the current filters.
        </div>
      ) : (
        <ul className="rounded-lg border bg-card divide-y">
          {filtered.map((cert) => (
            <CertRowItem
              key={cert.id}
              cert={cert}
              onMarkIssued={() => handleMarkIssued(cert)}
              issuingNow={issuing === cert.id}
            />
          ))}
        </ul>
      )}

      <NewCertDialog
        open={newDialog}
        onClose={() => setNewDialog(false)}
        sites={sites}
        onCreated={load}
      />
    </div>
  );
}

// ── Row ────────────────────────────────────────────────────────────

function CertRowItem({
  cert,
  onMarkIssued,
  issuingNow,
}: {
  cert: CertRow;
  onMarkIssued: () => void;
  issuingNow: boolean;
}) {
  const status = certStatus(cert);
  const isOverdue = status === "overdue";
  const isIssued = status === "issued";

  return (
    <li className={cn("px-4 py-3", isOverdue && "bg-destructive/5")}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-semibold text-sm">
              {cert.certificate_number}
            </span>
            <Badge variant="outline" className="text-[10px]">
              {TYPE_PREFIX[cert.bafe_cert_type]}
            </Badge>
            {cert.bafe_modules_covered.map((m) => (
              <Badge key={m} variant="secondary" className="text-[10px]">
                {MODULE_LABELS[m as BafeModule] ?? m}
              </Badge>
            ))}
            <StatusBadge status={status} />
          </div>
          <p className="text-sm mt-1">
            {cert.site_name ?? "Unknown site"}
            {cert.customer_name && (
              <span className="text-muted-foreground"> · {cert.customer_name}</span>
            )}
          </p>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="w-3 h-3" />
              Completed {cert.completion_date ?? "—"}
            </span>
            {isIssued ? (
              <span className="inline-flex items-center gap-1 text-success">
                <CheckCircle2 className="w-3 h-3" />
                Issued {cert.issued_date}
              </span>
            ) : (
              <DueWindow completionDate={cert.completion_date} />
            )}
            {!cert.bs5839_cert_issued && isIssued && (
              <span className="text-amber-600">
                BS 5839-1 cert not recorded (Cl 16.4)
              </span>
            )}
          </div>
        </div>
        {!isIssued && !cert.voided && (
          <Button
            size="sm"
            variant="outline"
            onClick={onMarkIssued}
            disabled={issuingNow}
          >
            {issuingNow && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
            Mark issued
          </Button>
        )}
      </div>
    </li>
  );
}

function DueWindow({ completionDate }: { completionDate: string | null }) {
  if (!completionDate) return null;
  const due = new Date(completionDate);
  due.setDate(due.getDate() + 30);
  const days = Math.ceil((due.getTime() - Date.now()) / 86400000);
  if (days >= 0) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1",
          days <= 7 ? "text-amber-600" : "text-muted-foreground",
        )}
      >
        Issuance deadline in {days}d
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-destructive">
      <AlertOctagon className="w-3 h-3" />
      {Math.abs(days)}d past 30-day issuance window
    </span>
  );
}

function StatusBadge({
  status,
}: {
  status: ReturnType<typeof certStatus>;
}) {
  if (status === "issued")
    return (
      <Badge className="text-[10px] bg-success/10 text-success border-success/30">
        Issued
      </Badge>
    );
  if (status === "overdue")
    return <Badge className="text-[10px]" variant="destructive">Overdue</Badge>;
  if (status === "voided")
    return (
      <Badge variant="outline" className="text-[10px]">
        Voided
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-[10px]">
      Outstanding
    </Badge>
  );
}

function FilterTile({
  label,
  count,
  tint,
  active,
  onClick,
}: {
  label: string;
  count: number;
  tint?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border p-3 text-left transition-colors",
        tint ?? "bg-card",
        active && "ring-2 ring-ring",
      )}
    >
      <p className="text-[10px] uppercase font-semibold tracking-wide opacity-80">
        {label}
      </p>
      <p className="text-2xl font-bold mt-0.5">{count}</p>
    </button>
  );
}

// ── New-cert dialog ────────────────────────────────────────────────

function NewCertDialog({
  open,
  onClose,
  sites,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  sites: { id: string; name: string }[];
  onCreated: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<NewCertForm>({
    bafe_cert_type: "modular",
    site_id: "",
    bafe_modules_covered: [],
    completion_date: new Date().toISOString().slice(0, 10),
    variations_list: "",
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm({
        bafe_cert_type: "modular",
        site_id: "",
        bafe_modules_covered: [],
        completion_date: new Date().toISOString().slice(0, 10),
        variations_list: "",
      });
    }
  }, [open]);

  const handleCreate = async () => {
    if (!form.site_id) {
      toast.error("Pick a site");
      return;
    }
    if (form.bafe_modules_covered.length === 0) {
      toast.error("Tick at least one module");
      return;
    }
    setCreating(true);
    try {
      const certNumber = await getNextBafeCertNumber(form.bafe_cert_type);
      const { data: userData } = await supabase.auth.getUser();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: siteData } = await (supabase as any)
        .from("sites")
        .select("name, customer_id, address, city, postcode")
        .eq("id", form.site_id)
        .maybeSingle();
      const addressSnapshot = siteData
        ? [siteData.address, siteData.city, siteData.postcode]
            .filter(Boolean)
            .join(", ")
        : null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("site_bafe_certificates")
        .insert({
          site_id: form.site_id,
          customer_id: siteData?.customer_id ?? null,
          // certificate_type is the legacy text discriminator that
          // existed before the BAFE columns landed — set it to the
          // BAFE type for consistency so existing consumers of the
          // table that filter on certificate_type still see this row.
          certificate_type: form.bafe_cert_type,
          certificate_number: certNumber,
          bafe_cert_type: form.bafe_cert_type,
          bafe_modules_covered: form.bafe_modules_covered,
          completion_date: form.completion_date,
          // issued_date is intentionally NULL — the row is a
          // pending/outstanding cert until the user clicks Mark issued.
          issued_date: null,
          issued_by: userData.user?.id, // required NOT NULL on legacy col
          site_address_snapshot: addressSnapshot,
          variations_list: form.variations_list.trim() || null,
        });
      if (error) throw error;
      toast.success(`Certificate ${certNumber} created`, {
        description: "Outstanding until you click Mark issued.",
      });
      await onCreated();
      onClose();
    } catch (e) {
      toast.error("Couldn't create certificate", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setCreating(false);
    }
  };

  const toggleModule = (m: BafeModule) => {
    setForm((s) =>
      s.bafe_modules_covered.includes(m)
        ? { ...s, bafe_modules_covered: s.bafe_modules_covered.filter((x) => x !== m) }
        : { ...s, bafe_modules_covered: [...s.bafe_modules_covered, m] },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Issue new BAFE certificate</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Cert type</Label>
            <Select
              value={form.bafe_cert_type}
              onValueChange={(v) =>
                setForm((s) => ({ ...s, bafe_cert_type: v as BafeCertType }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_LABELS) as BafeCertType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-1">
              Number prefix will be BHO-{TYPE_PREFIX[form.bafe_cert_type]}-…
            </p>
          </div>

          <div>
            <Label className="text-xs">Site</Label>
            <Select
              value={form.site_id}
              onValueChange={(v) => setForm((s) => ({ ...s, site_id: v }))}
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

          <div>
            <Label className="text-xs">Modules covered</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {BAFE_MODULES.map((m) => (
                <label
                  key={m}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <Checkbox
                    checked={form.bafe_modules_covered.includes(m)}
                    onCheckedChange={() => toggleModule(m)}
                  />
                  {MODULE_LABELS[m]}
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">Completion date</Label>
            <Input
              type="date"
              value={form.completion_date}
              onChange={(e) =>
                setForm((s) => ({ ...s, completion_date: e.target.value }))
              }
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              30-day issuance clock starts here.
            </p>
          </div>

          <div>
            <Label className="text-xs">Variations (Cl 7)</Label>
            <Textarea
              rows={3}
              value={form.variations_list}
              onChange={(e) =>
                setForm((s) => ({ ...s, variations_list: e.target.value }))
              }
              placeholder="None — or list agreed variations from the spec / Section 4 of BS 5839-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Status helper ──────────────────────────────────────────────────

function certStatus(cert: CertRow): "outstanding" | "overdue" | "issued" | "voided" {
  if (cert.voided) return "voided";
  if (cert.issued_date) return "issued";
  if (cert.completion_date) {
    const due = new Date(cert.completion_date);
    due.setDate(due.getDate() + 30);
    if (due.getTime() < Date.now()) return "overdue";
  }
  return "outstanding";
}
