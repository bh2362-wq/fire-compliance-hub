/**
 * BAFEComplianceDashboard
 *
 * Single-page summary of every outstanding BAFE SP203-1 compliance
 * item, backed by the `bafe_compliance_alerts` view (migration
 * 20260604200000). Alerts are grouped by severity (overdue → upcoming
 * → outstanding) with a summary tile row at the top.
 *
 * Mount this in a /dashboard/bafe route or compose it inside an
 * existing compliance landing page. No router dependency here — the
 * component is presentational and self-fetches.
 *
 * No mutations — this is read-only triage. Each alert kind maps to
 * the right CRUD surface in a sibling component (Leads, Cert
 * Register, Sub-contractors, Maintenance Contracts). The
 * "Jump to source" link is rendered when the alert carries a
 * subject_id; the parent page wires the actual navigation.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertOctagon,
  Clock,
  Info,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type {
  BafeAlertKind,
  BafeAlertSeverity,
  BafeComplianceAlert,
} from "@/types/bafe";
import { SEVERITY_STYLES, deadlineLabel } from "./utils";

// Display labels per alert kind. Centralised so a tweaked label
// only edits this map.
const KIND_LABELS: Record<BafeAlertKind, string> = {
  lead_departed_30d: "Lead — CB notification",
  lead_gap_90d: "Lead — replacement gap",
  no_lead_for_certified: "Lead — module uncovered",
  cert_overdue: "Certificate — overdue",
  bs5839_cert_missing: "Certificate — BS 5839-1 missing",
  ms_review_due: "MS review — due",
  subcontractor_expired: "Sub-contractor — expired",
  subcontractor_expiring: "Sub-contractor — expiring",
  backup_cover_expiring: "Backup cover — expiring",
  backup_cover_missing: "Backup cover — missing",
  clause_1412_outstanding: "Cl. 14.12 — inspection outstanding",
  surveillance_remedial: "Surveillance — remedial overdue",
  surveillance_overdue: "Surveillance audit — overdue",
};

interface Props {
  /** Optional click-through handler — parent decides where each
   *  alert kind navigates to. Called with the alert; the parent
   *  reads .alert_kind + .subject_id to route. */
  onAlertClick?: (alert: BafeComplianceAlert) => void;
}

export function BAFEComplianceDashboard({ onAlertClick }: Props) {
  const [alerts, setAlerts] = useState<BafeComplianceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      // bafe_compliance_alerts is a view — the autogen types haven't
      // picked it up yet, so we cast through `any` at the boundary.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("bafe_compliance_alerts")
        .select("*");
      if (error) throw error;
      setAlerts((data ?? []) as BafeComplianceAlert[]);
    } catch (e) {
      toast.error("Couldn't load BAFE compliance alerts", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  // Bucket by severity. Order overdue → upcoming → outstanding.
  const grouped = useMemo(() => {
    const out: Record<BafeAlertSeverity, BafeComplianceAlert[]> = {
      overdue: [],
      upcoming: [],
      outstanding: [],
    };
    for (const a of alerts) out[a.severity]?.push(a);
    // Within each severity, sort by deadline (earliest first so the
    // most urgent items rise to the top).
    (Object.keys(out) as BafeAlertSeverity[]).forEach((k) => {
      out[k].sort((x, y) => (x.deadline ?? "").localeCompare(y.deadline ?? ""));
    });
    return out;
  }, [alerts]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            BAFE SP203-1 compliance
          </h2>
          <p className="text-sm text-muted-foreground">
            Live triage from the compliance alerts view. Items group by
            severity; click any row to jump to its source.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load(true)}
          disabled={refreshing}
        >
          <RefreshCw
            className={cn("w-4 h-4 mr-1", refreshing && "animate-spin")}
          />
          Refresh
        </Button>
      </div>

      {/* Summary tiles — quick triage view */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryTile severity="overdue" count={grouped.overdue.length} />
        <SummaryTile severity="upcoming" count={grouped.upcoming.length} />
        <SummaryTile severity="outstanding" count={grouped.outstanding.length} />
      </div>

      {alerts.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-4">
          {(["overdue", "upcoming", "outstanding"] as BafeAlertSeverity[]).map(
            (sev) =>
              grouped[sev].length > 0 ? (
                <AlertGroup
                  key={sev}
                  severity={sev}
                  alerts={grouped[sev]}
                  onAlertClick={onAlertClick}
                />
              ) : null,
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function SummaryTile({
  severity,
  count,
}: {
  severity: BafeAlertSeverity;
  count: number;
}) {
  const s = SEVERITY_STYLES[severity];
  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        s.tint,
        s.border,
      )}
    >
      <p className={cn("text-xs uppercase font-semibold tracking-wide", s.ink)}>
        {s.label}
      </p>
      <p className={cn("text-3xl font-bold mt-1", s.ink)}>{count}</p>
    </div>
  );
}

function SeverityIcon({ severity }: { severity: BafeAlertSeverity }) {
  const cls = SEVERITY_STYLES[severity].ink;
  if (severity === "overdue") return <AlertOctagon className={cn("w-4 h-4", cls)} />;
  if (severity === "upcoming") return <Clock className={cn("w-4 h-4", cls)} />;
  return <Info className={cn("w-4 h-4", cls)} />;
}

function AlertGroup({
  severity,
  alerts,
  onAlertClick,
}: {
  severity: BafeAlertSeverity;
  alerts: BafeComplianceAlert[];
  onAlertClick?: (a: BafeComplianceAlert) => void;
}) {
  const s = SEVERITY_STYLES[severity];
  return (
    <section className="rounded-lg border bg-card">
      <header
        className={cn("px-4 py-2 border-b flex items-center gap-2", s.tint)}
      >
        <SeverityIcon severity={severity} />
        <h3 className={cn("text-sm font-semibold", s.ink)}>
          {s.label} · {alerts.length}
        </h3>
      </header>
      <ul className="divide-y">
        {alerts.map((alert, i) => (
          <AlertRow
            key={`${alert.alert_kind}-${alert.subject_id ?? i}`}
            alert={alert}
            onClick={onAlertClick}
          />
        ))}
      </ul>
    </section>
  );
}

function AlertRow({
  alert,
  onClick,
}: {
  alert: BafeComplianceAlert;
  onClick?: (a: BafeComplianceAlert) => void;
}) {
  const clickable = !!onClick;
  return (
    <li
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onClick(alert) : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick(alert);
              }
            }
          : undefined
      }
      className={cn(
        "px-4 py-3 flex items-start gap-3",
        clickable &&
          "cursor-pointer hover:bg-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {KIND_LABELS[alert.alert_kind] ?? alert.alert_kind}
        </p>
        <p className="text-sm mt-0.5 break-words">{alert.message}</p>
        <p className="text-xs text-muted-foreground mt-1">
          Deadline {deadlineLabel(alert.deadline)}
        </p>
      </div>
      {clickable && (
        <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
      )}
    </li>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border bg-card p-10 text-center">
      <ShieldCheck className="w-10 h-10 mx-auto text-success/70" />
      <p className="text-sm font-medium mt-3">All clear</p>
      <p className="text-xs text-muted-foreground mt-1">
        No active BAFE compliance items. Run a fresh load if you've
        just made changes upstream.
      </p>
    </div>
  );
}
