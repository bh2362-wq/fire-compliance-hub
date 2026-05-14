/**
 * AssetHistoryPanel
 * Slide-in panel showing full service history for a single site asset.
 * Queries smart_form_submissions and visits filtered to site + form type.
 */

import { useState, useEffect } from "react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2, AlertTriangle, Clock, Calendar, Wrench,
  FileText, Package, ChevronRight, Server, Wind,
  Lightbulb, Flame, Droplets, ShieldAlert,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
interface SiteAsset {
  id: string;
  site_id: string;
  asset_type: string;
  item_name: string;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  location: string | null;
}

interface ServiceRecord {
  id: string;
  type: "cert" | "visit";
  date: string;
  form_type?: string;
  certificate_reference?: string;
  status: string;
  engineer?: string;
  overall_status?: string;
  work_carried_out?: string;
  defect_count?: number;
  next_service_date?: string;
}

interface Props {
  asset: SiteAsset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ── Form type → asset type mapping ───────────────────────────────────────────
const ASSET_FORM_TYPES: Record<string, string[]> = {
  fire:               ["bs5839_inspection_servicing", "bs5839_installation", "bs5839_commissioning", "bs5839_modification", "bs5839_declination"],
  fire_panel:         ["bs5839_inspection_servicing", "bs5839_installation", "bs5839_commissioning", "bs5839_modification"],
  aspirator:          ["asd_service", "asd_commissioning"],
  asd:                ["asd_service", "asd_commissioning"],
  emergency_lighting: ["el_inspection_commissioning"],
  dry_riser:          ["dry_riser"],
  gas_suppression:    [],
  intruder_alarm:     [],
  nurse_call:         [],
  room_integrity:     [],
};

const ASSET_ICONS: Record<string, React.FC<any>> = {
  fire:               Server,
  fire_panel:         Server,
  aspirator:          Wind,
  asd:                Wind,
  emergency_lighting: Lightbulb,
  dry_riser:          Droplets,
  gas_suppression:    Flame,
  intruder_alarm:     ShieldAlert,
  default:            Server,
};

const FORM_TYPE_LABELS: Record<string, string> = {
  bs5839_inspection_servicing: "IS Certificate",
  bs5839_installation:         "Installation Cert",
  bs5839_commissioning:        "Commissioning Cert",
  bs5839_modification:         "Modification Cert",
  bs5839_declination:          "Declination Cert",
  asd_service:                 "ASD Service Cert",
  asd_commissioning:           "ASD Commissioning",
  el_inspection_commissioning: "EL Certificate",
  dry_riser:                   "Dry Riser Cert",
};

// ── Status helpers ─────────────────────────────────────────────────────────────
function statusBadge(s: string | undefined) {
  if (!s) return null;
  if (s === "Satisfactory")
    return <span className="vstatus vstatus-completed">Satisfactory</span>;
  if (s === "Unsatisfactory")
    return <span className="vstatus vstatus-overdue">Unsatisfactory</span>;
  if (s.includes("Observation"))
    return <span className="vstatus vstatus-inprogress">Obs.</span>;
  return <span className="vstatus vstatus-scheduled">{s}</span>;
}

function overallStatus(records: ServiceRecord[]): { label: string; color: string } {
  if (!records.length)
    return { label: "No records", color: "text-muted-foreground" };
  const last = records[0];
  if (!last.next_service_date)
    return { label: "Up to date", color: "text-success" };
  const due = parseISO(last.next_service_date);
  const now = new Date();
  if (due < now) return { label: "Overdue", color: "text-destructive" };
  const diff = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 30) return { label: "Due soon", color: "text-warning" };
  return { label: "Up to date", color: "text-success" };
}

// ── Main component ─────────────────────────────────────────────────────────────
export function AssetHistoryPanel({ asset, open, onOpenChange }: Props) {
  const [records, setRecords]   = useState<ServiceRecord[]>([]);
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    if (open && asset) load();
  }, [open, asset?.id]);

  async function load() {
    if (!asset) return;
    setLoading(true);

    try {
      const formTypes = ASSET_FORM_TYPES[asset.asset_type] ?? [];

      // Fetch certs for this site (filtered to relevant form types if known)
      let certQuery = supabase
        .from("smart_form_submissions")
        .select("id, form_type, certificate_reference, status, completed_at, payload, created_at")
        .eq("site_id", asset.site_id)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(20);

      if (formTypes.length) certQuery = certQuery.in("form_type", formTypes);

      const { data: certs } = await certQuery;

      const certRecords: ServiceRecord[] = (certs ?? []).map((c: any) => {
        const p = c.payload ?? {};
        return {
          id:                  c.id,
          type:                "cert",
          date:                c.completed_at ?? c.created_at,
          form_type:           c.form_type,
          certificate_reference: c.certificate_reference,
          status:              c.status,
          engineer:            p.engineer_name || p.engineer_declaration_name,
          overall_status:      p.overall_status,
          work_carried_out:    p.work_carried_out,
          defect_count:        (p.defects ?? []).length,
          next_service_date:   p.next_service_date,
        };
      });

      setRecords(certRecords);
    } finally {
      setLoading(false);
    }
  }

  const Icon = ASSET_ICONS[asset?.asset_type ?? "default"] ?? Server;
  const status = overallStatus(records);
  const lastRecord = records[0];
  const nextDue = lastRecord?.next_service_date;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[540px] overflow-y-auto p-0">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b border-border px-6 py-4">
          <SheetHeader>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon className="w-4.5 h-4.5 text-muted-foreground" style={{ width: 18, height: 18 }} />
              </div>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-base font-semibold leading-tight">
                  {asset?.item_name ?? "Asset"}
                </SheetTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {[asset?.manufacturer, asset?.model].filter(Boolean).join(" · ")}
                  {asset?.location ? ` · ${asset.location}` : ""}
                </p>
                {asset?.serial_number && (
                  <p className="text-[11px] text-muted-foreground/70 font-mono mt-0.5">
                    S/N {asset.serial_number}
                  </p>
                )}
              </div>
            </div>
          </SheetHeader>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* Status strip */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-muted/40 rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Status</p>
              <p className={cn("text-sm font-semibold", status.color)}>{status.label}</p>
            </div>
            <div className="bg-muted/40 rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Last service</p>
              <p className="text-sm font-medium">
                {lastRecord
                  ? formatDistanceToNow(parseISO(lastRecord.date), { addSuffix: true })
                  : "—"}
              </p>
            </div>
            <div className="bg-muted/40 rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Next due</p>
              <p className="text-sm font-medium">
                {nextDue ? format(parseISO(nextDue), "dd MMM yyyy") : "—"}
              </p>
            </div>
          </div>

          {/* Service history timeline */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Service history
            </p>

            {loading && (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
              </div>
            )}

            {!loading && records.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Wrench className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No service records found for this asset.</p>
                <p className="text-xs mt-1">Complete a smart form cert to start tracking history.</p>
              </div>
            )}

            {!loading && records.length > 0 && (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[15px] top-4 bottom-4 w-[1px] bg-border" />

                <div className="space-y-3">
                  {records.map((rec, i) => (
                    <div key={rec.id} className="flex gap-3">
                      {/* Timeline dot */}
                      <div className={cn(
                        "w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 bg-background z-10",
                        i === 0 ? "border-primary" : "border-border"
                      )}>
                        <FileText className={cn("w-3.5 h-3.5", i === 0 ? "text-primary" : "text-muted-foreground")} />
                      </div>

                      {/* Card */}
                      <div className={cn(
                        "flex-1 rounded-lg border p-3 min-w-0",
                        i === 0 ? "border-primary/20 bg-primary/3" : "border-border bg-card"
                      )}>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {FORM_TYPE_LABELS[rec.form_type ?? ""] ?? rec.form_type ?? "Service visit"}
                            </p>
                            {rec.certificate_reference && (
                              <p className="text-[11px] font-mono text-muted-foreground">
                                {rec.certificate_reference}
                              </p>
                            )}
                          </div>
                          {statusBadge(rec.overall_status)}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {format(parseISO(rec.date), "dd MMM yyyy")}
                          </span>
                          {rec.engineer && (
                            <span>{rec.engineer}</span>
                          )}
                          {rec.defect_count !== undefined && rec.defect_count > 0 && (
                            <span className="flex items-center gap-1 text-warning">
                              <AlertTriangle className="w-3 h-3" />
                              {rec.defect_count} defect{rec.defect_count !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>

                        {rec.work_carried_out && (
                          <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                            {rec.work_carried_out}
                          </p>
                        )}

                        {rec.next_service_date && i === 0 && (
                          <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
                            <Clock className="w-3 h-3 flex-shrink-0" />
                            Next service: <span className="font-medium text-foreground">
                              {format(parseISO(rec.next_service_date), "dd MMM yyyy")}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
