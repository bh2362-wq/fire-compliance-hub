/**
 * ComplianceCalendar
 *
 * Dashboard widget showing which sites are due for service.
 * Data sources (merged, latest wins):
 *   1. service_reports.next_service_due — set by legacy form on completion
 *   2. smart_form_submissions payload.next_service_date — set in IS cert
 *   3. site_service_contracts — calculate next due from frequency if no cert yet
 *
 * Urgency bands:
 *   Overdue      — next_service_due < today           (red)
 *   Due ≤ 30 days — today to today+30                 (amber)
 *   Due 31-60 days                                    (yellow)
 *   Due 61-90 days                                    (muted/green)
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  addDays, differenceInDays, format, parseISO, isValid,
  addMonths, addQuarters,
} from "date-fns";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CalendarDays, AlertTriangle, Clock, CheckCircle2,
  ArrowRight, RefreshCw, CalendarPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
interface DueSite {
  site_id: string;
  site_name: string;
  next_due: Date;
  last_service: Date | null;
  source: "cert" | "report" | "contract" | "calculated";
  service_type: string;
}

type Band = "overdue" | "within30" | "within60" | "within90";

function getBand(daysUntil: number): Band {
  if (daysUntil < 0)   return "overdue";
  if (daysUntil <= 30) return "within30";
  if (daysUntil <= 60) return "within60";
  return "within90";
}

// RAG tone via theme tokens. The 60-day band uses the warning token
// at attenuated strength so it reads as a step softer than the 30-day
// band but still in the warning family (vs the neutral 90-day band).
const BAND_CONFIG: Record<Band, { label: string; color: string; bg: string; icon: typeof AlertTriangle }> = {
  overdue:  { label: "Overdue",       color: "text-destructive", bg: "bg-destructive/10 border-destructive/20",    icon: AlertTriangle },
  within30: { label: "Due ≤ 30 days", color: "text-warning",     bg: "bg-warning/10 border-warning/20",            icon: Clock },
  within60: { label: "Due 31–60 days",color: "text-warning/80",  bg: "bg-warning/5 border-warning/15",             icon: CalendarDays },
  within90: { label: "Due 61–90 days",color: "text-muted-foreground", bg: "bg-muted/30 border-border/60", icon: CalendarDays },
};

// ── Data fetcher ───────────────────────────────────────────────────────────────
async function fetchDueSites(): Promise<DueSite[]> {
  const today = new Date();
  const horizon = addDays(today, 90);
  const horizonStr = format(horizon, "yyyy-MM-dd");

  // 1. Service reports — latest next_service_due per site
  const { data: reports } = await supabase
    .from("service_reports")
    .select("site_id, report_date, next_service_due")
    .not("next_service_due", "is", null)
    .lte("next_service_due", horizonStr)
    .order("report_date", { ascending: false });

  // 2. Smart form IS cert submissions — payload.next_service_date
  const { data: smartCerts } = await supabase
    .from("smart_form_submissions")
    .select("site_id, completed_at, payload")
    .eq("form_type", "bs5839_inspection_servicing")
    .eq("status", "completed")
    .order("completed_at", { ascending: false });

  // 3. Site service contracts for sites with no recent cert
  const { data: contracts } = await supabase
    .from("site_service_contracts")
    .select("site_id, service_type, frequency, contract_start, contract_end");

  // 4. Site names
  const allSiteIds = Array.from(new Set([
    ...(reports || []).map(r => r.site_id),
    ...(smartCerts || []).map(s => s.site_id),
    ...(contracts || []).map(c => c.site_id),
  ].filter(Boolean)));

  if (allSiteIds.length === 0) return [];

  const { data: sites } = await supabase
    .from("sites")
    .select("id, name")
    .in("id", allSiteIds);

  const siteNames = new Map((sites || []).map(s => [s.id, s.name]));

  // ── Build best next_due per site ───────────────────────────────────────────
  // Map: site_id → { next_due, last_service, source, service_type }
  const best = new Map<string, Omit<DueSite, "site_name">>();

  function update(
    site_id: string,
    next_due: Date,
    last_service: Date | null,
    source: DueSite["source"],
    service_type: string
  ) {
    const existing = best.get(site_id);
    // Only update if this is a better (more recent cert = more accurate) source,
    // or if we don't have one yet. Priority: cert > report > contract
    const sourcePriority: Record<DueSite["source"], number> = { cert: 3, report: 2, contract: 1, calculated: 0 };
    if (!existing || sourcePriority[source] > sourcePriority[existing.source]) {
      best.set(site_id, { site_id, next_due, last_service, source, service_type });
    }
  }

  // From service reports (legacy)
  const seenReportSites = new Set<string>();
  for (const r of reports || []) {
    if (!r.site_id || !r.next_service_due || seenReportSites.has(r.site_id)) continue;
    seenReportSites.add(r.site_id);
    const next = parseISO(r.next_service_due);
    const last = r.report_date ? parseISO(r.report_date) : null;
    if (isValid(next)) update(r.site_id, next, last, "report", "Fire Alarm Service");
  }

  // From smart form IS certs
  const seenCertSites = new Set<string>();
  for (const c of smartCerts || []) {
    if (!c.site_id || seenCertSites.has(c.site_id)) continue;
    seenCertSites.add(c.site_id);
    const p = c.payload as Record<string, unknown>;
    const nextStr = (p?.next_service_date as string) || (p?.next_service_due as string);
    if (nextStr) {
      const next = parseISO(nextStr);
      const last = c.completed_at ? parseISO(c.completed_at) : null;
      if (isValid(next)) update(c.site_id, next, last, "cert", "BS5839 IS Cert");
    }
  }

  // From service contracts (fallback — calculate from last cert + frequency)
  for (const contract of contracts || []) {
    if (!contract.site_id) continue;

    // Skip if we already have a cert/report for this site
    if (seenCertSites.has(contract.site_id) || seenReportSites.has(contract.site_id)) continue;

    if (!contract.contract_start) continue;

    // Calculate next due from contract_start + frequency
    const start = parseISO(contract.contract_start);
    if (!isValid(start)) continue;

    const freq = contract.frequency?.toLowerCase() || "annual";
    let next: Date;

    if (freq.includes("quarter") || freq.includes("3")) {
      // Quarterly — find next occurrence after today
      next = addQuarters(start, 1);
      while (next < today) next = addQuarters(next, 1);
    } else if (freq.includes("6") || freq.includes("bi") || freq.includes("half")) {
      // 6-monthly
      next = addMonths(start, 6);
      while (next < today) next = addMonths(next, 6);
    } else {
      // Annual
      next = addMonths(start, 12);
      while (next < today) next = addMonths(next, 12);
    }

    if (next <= horizon) {
      update(contract.site_id, next, null, "contract", contract.service_type || "Service");
    }
  }

  // Filter to 90-day horizon and build final list
  const results: DueSite[] = [];
  for (const [site_id, data] of best.entries()) {
    const daysUntil = differenceInDays(data.next_due, today);
    if (daysUntil > 90) continue; // outside horizon
    const site_name = siteNames.get(site_id) || "Unknown Site";
    results.push({ ...data, site_name });
  }

  // Sort: overdue first, then soonest
  results.sort((a, b) => a.next_due.getTime() - b.next_due.getTime());
  return results;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SiteRow({ site, onClick }: { site: DueSite; onClick: () => void }) {
  const today = new Date();
  const daysUntil = differenceInDays(site.next_due, today);
  const band = getBand(daysUntil);
  const cfg = BAND_CONFIG[band];

  const urgencyLabel = daysUntil < 0
    ? `${Math.abs(daysUntil)}d overdue`
    : daysUntil === 0
      ? "Due today"
      : `${daysUntil}d to go`;

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer border-b last:border-0 border-border/40"
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold truncate">{site.site_name}</span>
          <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">
            {site.service_type}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
          <span>Due {format(site.next_due, "dd MMM yyyy")}</span>
          {site.last_service && (
            <span>Last: {format(site.last_service, "dd MMM yyyy")}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] font-bold px-2 py-0.5 whitespace-nowrap",
            band === "overdue"  && "border-destructive/25 bg-destructive/10 text-destructive",
            band === "within30" && "border-warning/25 bg-warning/10 text-warning",
            band === "within60" && "border-warning/20 bg-warning/5 text-warning/85",
            band === "within90" && "border-border text-muted-foreground",
          )}
        >
          {urgencyLabel}
        </Badge>
        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function ComplianceCalendar() {
  const navigate = useNavigate();

  const { data: sites = [], isLoading, refetch } = useQuery({
    queryKey: ["compliance-calendar"],
    queryFn: fetchDueSites,
    staleTime: 5 * 60_000, // 5 minutes
  });

  const today = new Date();
  const overdue   = sites.filter(s => differenceInDays(s.next_due, today) < 0);
  const within30  = sites.filter(s => { const d = differenceInDays(s.next_due, today); return d >= 0 && d <= 30; });
  const within60  = sites.filter(s => { const d = differenceInDays(s.next_due, today); return d > 30 && d <= 60; });
  const within90  = sites.filter(s => { const d = differenceInDays(s.next_due, today); return d > 60 && d <= 90; });

  const totalUrgent = overdue.length + within30.length;

  function goToSite(siteId: string) {
    navigate(`/sites/${siteId}`);
  }

  function goToVisits() {
    navigate("/dashboard/visits");
  }

  if (isLoading) {
    return (
      <div className="section-card space-y-3 animate-pulse">
        <div className="h-5 w-40 bg-muted rounded" />
        {[1,2,3].map(i => <div key={i} className="h-14 bg-muted rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="section-card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center",
            totalUrgent > 0 ? "bg-warning/15" : "bg-success/15"
          )}>
            <CalendarDays className={cn(
              "w-4 h-4",
              totalUrgent > 0 ? "text-warning" : "text-success"
            )} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Compliance Calendar</h3>
            <p className="text-xs text-muted-foreground">Sites due for service — next 90 days</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Summary pills */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          { count: overdue.length,  label: "Overdue",   color: "border-destructive/25 bg-destructive/10 text-destructive" },
          { count: within30.length, label: "≤ 30 days", color: "border-warning/25 bg-warning/10 text-warning" },
          { count: within60.length, label: "31–60 days", color: "border-warning/20 bg-warning/5 text-warning/85" },
          { count: within90.length, label: "61–90 days", color: "border-border text-muted-foreground" },
        ].map(({ count, label, color }) => (
          <div key={label} className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium", color)}>
            <span className="font-bold">{count}</span>
            <span className="opacity-80">{label}</span>
          </div>
        ))}
      </div>

      {/* Site list */}
      {sites.length === 0 ? (
        <div className="py-8 text-center">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-success/60" />
          <p className="text-sm font-medium text-muted-foreground">All sites are up to date</p>
          <p className="text-xs text-muted-foreground mt-0.5">No services due within 90 days</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          {/* Overdue */}
          {overdue.length > 0 && (
            <>
              <div className="px-4 py-1.5 bg-destructive/10 border-b border-destructive/20">
                <p className="text-[10px] font-bold uppercase tracking-wide text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3" /> Overdue ({overdue.length})
                </p>
              </div>
              {overdue.map(s => <SiteRow key={s.site_id} site={s} onClick={() => goToSite(s.site_id)} />)}
            </>
          )}

          {/* Due within 30 days */}
          {within30.length > 0 && (
            <>
              <div className="px-4 py-1.5 bg-warning/10 border-b border-warning/20">
                <p className="text-[10px] font-bold uppercase tracking-wide text-warning flex items-center gap-1.5">
                  <Clock className="w-3 h-3" /> Due within 30 days ({within30.length})
                </p>
              </div>
              {within30.map(s => <SiteRow key={s.site_id} site={s} onClick={() => goToSite(s.site_id)} />)}
            </>
          )}

          {/* Due 31-60 days */}
          {within60.length > 0 && (
            <>
              <div className="px-4 py-1.5 bg-muted/30 border-b border-border/60">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <CalendarDays className="w-3 h-3" /> Due in 31–60 days ({within60.length})
                </p>
              </div>
              {within60.map(s => <SiteRow key={s.site_id} site={s} onClick={() => goToSite(s.site_id)} />)}
            </>
          )}

          {/* Due 61-90 days */}
          {within90.length > 0 && (
            <>
              <div className="px-4 py-1.5 bg-muted/20 border-b border-border/40">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <CalendarDays className="w-3 h-3" /> Due in 61–90 days ({within90.length})
                </p>
              </div>
              {within90.map(s => <SiteRow key={s.site_id} site={s} onClick={() => goToSite(s.site_id)} />)}
            </>
          )}
        </div>
      )}

      {/* Footer */}
      {sites.length > 0 && (
        <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[11px] text-muted-foreground">
            {sites.length} site{sites.length !== 1 ? "s" : ""} due within 90 days
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={goToVisits}
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            Schedule Visits
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Export a compact version of the urgent count for the alert strip ──────────
export async function getComplianceAlertCount(): Promise<number> {
  const today = format(new Date(), "yyyy-MM-dd");
  const in30   = format(addDays(new Date(), 30), "yyyy-MM-dd");

  const { count } = await supabase
    .from("service_reports")
    .select("id", { count: "exact", head: true })
    .not("next_service_due", "is", null)
    .lte("next_service_due", in30);

  return count || 0;
}
