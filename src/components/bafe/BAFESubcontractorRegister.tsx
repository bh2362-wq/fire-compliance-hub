/**
 * BAFESubcontractorRegister
 *
 * Subcontractor register filtered to BAFE-relevant rows — those with
 * a registration number, an ISO 17065 equivalent fallback, or the
 * NICEIC/NAPIT electrical-only exception flag set. Lets you keep
 * Cl 15 verification current without leaving the BAFE dashboard.
 *
 * This view INTENTIONALLY does not handle the full sub-contractor
 * lifecycle (creating new subs, editing company info, etc.) — that
 * lives in the existing sub-contractor management UI. Here you only
 * see and edit the BAFE-specific fields: registration number,
 * modules held, verification dates, the two fallback flags, and
 * competency notes. Subs with no BAFE involvement aren't listed at
 * all to keep the register focused.
 *
 * Mark Verified action stamps bafe_verified_date with today's date
 * — the audit-trail evidence Cl 15.2 expects.
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  HardHat,
  Pencil,
  CheckCircle2,
  Loader2,
  AlertOctagon,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { BafeModule } from "@/types/bafe";
import { BAFE_MODULES, MODULE_LABELS, daysUntil } from "./utils";

interface SubRow {
  id: string;
  company_name: string;
  status: string;
  bafe_registration_number: string | null;
  bafe_modules_held: string[];
  bafe_verified_date: string | null;
  bafe_expiry_date: string | null;
  iso17065_equivalent: boolean;
  iso17065_cert_ref: string | null;
  electrical_only: boolean;
  electrical_cert_body: string | null;
  electrical_cert_ref: string | null;
  competency_notes: string | null;
}

interface FormState {
  bafe_registration_number: string;
  bafe_modules_held: BafeModule[];
  bafe_verified_date: string;
  bafe_expiry_date: string;
  iso17065_equivalent: boolean;
  iso17065_cert_ref: string;
  electrical_only: boolean;
  electrical_cert_body: string;
  electrical_cert_ref: string;
  competency_notes: string;
}

export function BAFESubcontractorRegister() {
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SubRow | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // BAFE-relevant filter — any of the three "uses BAFE / fallback"
      // flags. Subs that pre-date the BAFE columns (NULL on all the
      // new fields) are excluded so this register stays focused.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("subcontractors")
        .select(
          `id, company_name, status, bafe_registration_number,
           bafe_modules_held, bafe_verified_date, bafe_expiry_date,
           iso17065_equivalent, iso17065_cert_ref,
           electrical_only, electrical_cert_body, electrical_cert_ref,
           competency_notes`,
        )
        .or(
          "bafe_registration_number.not.is.null,iso17065_equivalent.eq.true,electrical_only.eq.true",
        )
        .order("company_name");
      if (error) throw error;
      setSubs((data ?? []) as SubRow[]);
    } catch (e) {
      toast.error("Couldn't load BAFE sub-contractor register", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleMarkVerified = async (sub: SubRow) => {
    setVerifying(sub.id);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("subcontractors")
        .update({
          bafe_verified_date: new Date().toISOString().slice(0, 10),
        })
        .eq("id", sub.id);
      if (error) throw error;
      toast.success(`Verification stamped for ${sub.company_name}`);
      await load();
    } catch (e) {
      toast.error("Couldn't mark as verified", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setVerifying(null);
    }
  };

  const counts = useMemo(() => {
    let expired = 0;
    let expiring = 0;
    let verifiedThisYear = 0;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + 60);
    const yearAgo = new Date();
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    for (const s of subs) {
      if (s.iso17065_equivalent) continue;
      if (s.bafe_expiry_date) {
        const exp = new Date(s.bafe_expiry_date);
        if (exp < new Date()) expired += 1;
        else if (exp < cutoff) expiring += 1;
      }
      if (s.bafe_verified_date && new Date(s.bafe_verified_date) > yearAgo) {
        verifiedThisYear += 1;
      }
    }
    return { expired, expiring, verifiedThisYear, total: subs.length };
  }, [subs]);

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
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <HardHat className="w-5 h-5 text-primary" />
          BAFE sub-contractor register
        </h2>
        <p className="text-sm text-muted-foreground">
          BAFE-registered subs plus Cl 15.3 ISO 17065 and Cl 15.4
          NICEIC/NAPIT electrical-only fallbacks. Other sub-contractors
          live in the main sub-contractor management UI.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <Tile label="Total" value={counts.total} />
        <Tile
          label="Expiring (60d)"
          value={counts.expiring}
          tint="bg-amber-500/10 text-amber-700"
        />
        <Tile
          label="Expired"
          value={counts.expired}
          tint="bg-destructive/10 text-destructive"
        />
        <Tile
          label="Verified this year"
          value={counts.verifiedThisYear}
          tint="bg-success/10 text-success"
        />
      </div>

      {subs.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          No BAFE-relevant sub-contractors yet. Edit a sub from the main
          register and set their BAFE registration number, ISO 17065
          flag, or NICEIC/NAPIT flag to surface them here.
        </div>
      ) : (
        <ul className="rounded-lg border bg-card divide-y">
          {subs.map((s) => (
            <SubRowItem
              key={s.id}
              sub={s}
              onEdit={() => setEditing(s)}
              onVerified={() => handleMarkVerified(s)}
              verifying={verifying === s.id}
            />
          ))}
        </ul>
      )}

      {editing && (
        <EditDialog
          sub={editing}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

function SubRowItem({
  sub,
  onEdit,
  onVerified,
  verifying,
}: {
  sub: SubRow;
  onEdit: () => void;
  onVerified: () => void;
  verifying: boolean;
}) {
  const expiryDays = daysUntil(sub.bafe_expiry_date);
  const expired = expiryDays != null && expiryDays < 0;
  const expiring = expiryDays != null && expiryDays >= 0 && expiryDays < 60;

  return (
    <li
      className={cn(
        "px-4 py-3",
        expired && !sub.iso17065_equivalent && "bg-destructive/5",
      )}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm">{sub.company_name}</p>
            {sub.bafe_registration_number && (
              <Badge variant="outline" className="text-[10px] font-mono">
                {sub.bafe_registration_number}
              </Badge>
            )}
            {sub.iso17065_equivalent && (
              <Badge variant="secondary" className="text-[10px]">
                ISO 17065
              </Badge>
            )}
            {sub.electrical_only && (
              <Badge variant="secondary" className="text-[10px]">
                Electrical only
              </Badge>
            )}
            {sub.status !== "active" && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                {sub.status}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap gap-1 mt-1">
            {sub.bafe_modules_held.map((m) => (
              <Badge key={m} variant="outline" className="text-[10px]">
                {MODULE_LABELS[m as BafeModule] ?? m}
              </Badge>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1.5">
            {sub.bafe_verified_date && (
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Verified {sub.bafe_verified_date}
              </span>
            )}
            {sub.bafe_expiry_date && (
              <span
                className={cn(
                  "inline-flex items-center gap-1",
                  expired && "text-destructive",
                  expiring && !expired && "text-amber-600",
                )}
              >
                {expired ? (
                  <AlertOctagon className="w-3 h-3" />
                ) : (
                  <Calendar className="w-3 h-3" />
                )}
                Expires {sub.bafe_expiry_date}{" "}
                {expiryDays != null && (
                  <>
                    (
                    {expired
                      ? `${Math.abs(expiryDays)}d ago`
                      : `${expiryDays}d`}
                    )
                  </>
                )}
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={onVerified}
            disabled={verifying}
          >
            {verifying && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
            Mark verified
          </Button>
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </li>
  );
}

function Tile({
  label,
  value,
  tint,
}: {
  label: string;
  value: number;
  tint?: string;
}) {
  return (
    <div className={cn("rounded-lg border p-3", tint ?? "bg-card")}>
      <p className="text-[10px] uppercase font-semibold tracking-wide opacity-80">
        {label}
      </p>
      <p className="text-2xl font-bold mt-0.5">{value}</p>
    </div>
  );
}

function EditDialog({
  sub,
  onClose,
  onSaved,
}: {
  sub: SubRow;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<FormState>({
    bafe_registration_number: sub.bafe_registration_number ?? "",
    bafe_modules_held: (sub.bafe_modules_held ?? []) as BafeModule[],
    bafe_verified_date: sub.bafe_verified_date ?? "",
    bafe_expiry_date: sub.bafe_expiry_date ?? "",
    iso17065_equivalent: sub.iso17065_equivalent,
    iso17065_cert_ref: sub.iso17065_cert_ref ?? "",
    electrical_only: sub.electrical_only,
    electrical_cert_body: sub.electrical_cert_body ?? "",
    electrical_cert_ref: sub.electrical_cert_ref ?? "",
    competency_notes: sub.competency_notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    // Cl 15.4 sanity check — electrical_only is Installation-only.
    // Warn if the modules don't reflect that, but don't block (UI
    // tells the user; the audit-side enforcement is in the sub-
    // contractor selection workflow, not here).
    if (form.electrical_only && form.bafe_modules_held.length > 1) {
      toast.warning(
        "Electrical-only sub-contractors are Installation-only per Cl 15.4",
      );
    }
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("subcontractors")
        .update({
          bafe_registration_number: form.bafe_registration_number.trim() || null,
          bafe_modules_held: form.bafe_modules_held,
          bafe_verified_date: form.bafe_verified_date || null,
          bafe_expiry_date: form.bafe_expiry_date || null,
          iso17065_equivalent: form.iso17065_equivalent,
          iso17065_cert_ref: form.iso17065_cert_ref.trim() || null,
          electrical_only: form.electrical_only,
          electrical_cert_body: form.electrical_cert_body.trim() || null,
          electrical_cert_ref: form.electrical_cert_ref.trim() || null,
          competency_notes: form.competency_notes.trim() || null,
        })
        .eq("id", sub.id);
      if (error) throw error;
      toast.success(`Updated ${sub.company_name}`);
      await onSaved();
      onClose();
    } catch (e) {
      toast.error("Couldn't save sub-contractor", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleModule = (m: BafeModule) =>
    setForm((s) =>
      s.bafe_modules_held.includes(m)
        ? { ...s, bafe_modules_held: s.bafe_modules_held.filter((x) => x !== m) }
        : { ...s, bafe_modules_held: [...s.bafe_modules_held, m] },
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit BAFE fields — {sub.company_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">BAFE registration number</Label>
            <Input
              value={form.bafe_registration_number}
              onChange={(e) =>
                setForm((s) => ({
                  ...s,
                  bafe_registration_number: e.target.value,
                }))
              }
              placeholder="e.g. BAFE/SP203-1/12345"
            />
          </div>

          <div>
            <Label className="text-xs">Modules held</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {BAFE_MODULES.map((m) => (
                <label
                  key={m}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <Checkbox
                    checked={form.bafe_modules_held.includes(m)}
                    onCheckedChange={() => toggleModule(m)}
                  />
                  {MODULE_LABELS[m]}
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Last verified</Label>
              <Input
                type="date"
                value={form.bafe_verified_date}
                onChange={(e) =>
                  setForm((s) => ({ ...s, bafe_verified_date: e.target.value }))
                }
              />
            </div>
            <div>
              <Label className="text-xs">BAFE expiry</Label>
              <Input
                type="date"
                value={form.bafe_expiry_date}
                onChange={(e) =>
                  setForm((s) => ({ ...s, bafe_expiry_date: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="rounded-md border p-3 bg-muted/20 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Cl 15.3 — ISO 17065 fallback
            </p>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={form.iso17065_equivalent}
                onCheckedChange={(v) =>
                  setForm((s) => ({ ...s, iso17065_equivalent: !!v }))
                }
              />
              ISO 17065-accredited equivalent
            </label>
            {form.iso17065_equivalent && (
              <div>
                <Label className="text-xs">Cert reference</Label>
                <Input
                  value={form.iso17065_cert_ref}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, iso17065_cert_ref: e.target.value }))
                  }
                />
              </div>
            )}
          </div>

          <div className="rounded-md border p-3 bg-muted/20 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Cl 15.4 — NICEIC / NAPIT electrical-only
            </p>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={form.electrical_only}
                onCheckedChange={(v) =>
                  setForm((s) => ({ ...s, electrical_only: !!v }))
                }
              />
              Electrical contractor for cabling element only
              (Installation module only)
            </label>
            {form.electrical_only && (
              <>
                <div>
                  <Label className="text-xs">Cert body</Label>
                  <Input
                    value={form.electrical_cert_body}
                    onChange={(e) =>
                      setForm((s) => ({
                        ...s,
                        electrical_cert_body: e.target.value,
                      }))
                    }
                    placeholder="NICEIC / NAPIT"
                  />
                </div>
                <div>
                  <Label className="text-xs">Cert reference</Label>
                  <Input
                    value={form.electrical_cert_ref}
                    onChange={(e) =>
                      setForm((s) => ({
                        ...s,
                        electrical_cert_ref: e.target.value,
                      }))
                    }
                  />
                </div>
              </>
            )}
          </div>

          <div>
            <Label className="text-xs">Competency notes</Label>
            <Textarea
              rows={3}
              value={form.competency_notes}
              onChange={(e) =>
                setForm((s) => ({ ...s, competency_notes: e.target.value }))
              }
              placeholder="Audit trail for Cl 15.2 verification"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
