/**
 * ServiceDueDashboard.tsx
 *
 * RAG dashboard — all sites with next service due date from completed BS5839 certs.
 * Red = overdue / <14 days, Amber = 14–30 days, Green = >30 days.
 * Sortable by due date, filterable by customer/site name.
 */

import { useEffect, useState, useMemo } from "react";
import { differenceInDays, format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Search, AlertTriangle, Clock, CheckCircle2, CalendarPlus, ExternalLink } from "lucide-react";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ServiceRow {
  siteId:           string;
  siteName:         string;
  siteAddress:      string | null;
  customerName:     string | null;
  certRef:          string;
  lastServiceDate:  string;   // ISO
  nextServiceDate:  string;   // ISO
  daysUntil:        number;   // negative = overdue
  visitType:        string;
  engineer:         string | null;
  openDefects:      number;
}

type RAG = "red" | "amber" | "green";

function rag(days: number): RAG {
  if (days < 14) return "red";
  if (days < 30) return "amber";
  return "green";
}

function RAGBadge({ days }: { days: number }) {
  const r = rag(days);
  if (r === "red") return (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-destructive bg-destructive/10 border border-destructive/25 px-2 py-0.5 rounded-full whitespace-nowrap">
      <AlertTriangle className="w-3 h-3" />
      {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
    </span>
  );
  if (r === "amber") return (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-warning bg-warning/10 border border-warning/25 px-2 py-0.5 rounded-full whitespace-nowrap">
      <Clock className="w-3 h-3" />
      {days}d
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-success bg-success/10 border border-success/25 px-2 py-0.5 rounded-full whitespace-nowrap">
      <CheckCircle2 className="w-3 h-3" />
      {days}d
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ServiceDueDashboard() {
  const [rows,     setRows]     = useState<ServiceRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [filter,   setFilter]   = useState<"all" | "red" | "amber" | "green">("all");
  const [scheduling, setScheduling] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      // Fetch most recent completed BS5839 cert per site
      const { data, error } = await supabase
        .from("smart_form_submissions")
        .select(`
          id, certificate_reference, completed_at, payload,
          site:sites(id, name, address, city, customer:customers(name)),
          engineer:profiles(full_name)
        `)
        .eq("form_type", "bs5839_inspection_servicing")
        .eq("status",    "completed")
        .not("payload->next_service_date", "is", null)
        .order("completed_at", { ascending: false });

      if (error) throw error;

      // De-duplicate — keep only most recent per site
      const seen = new Set<string>();
      const unique = (data || []).filter((r: any) => {
        const sid = r.site?.id;
        if (!sid || seen.has(sid)) return false;
        seen.add(sid);
        return true;
      });

      // Count open defects per site in parallel
      const siteIds = unique.map((r: any) => r.site?.id).filter(Boolean);
      const { data: defectCounts } = await supabase
        .from("site_defects")
        .select("site_id")
        .in("site_id", siteIds)
        .in("status",  ["open", "quoted", "pending"]);

      const defectMap: Record<string, number> = {};
      (defectCounts || []).forEach((d: any) => {
        defectMap[d.site_id] = (defectMap[d.site_id] || 0) + 1;
      });

      const today = new Date();
      const rows: ServiceRow[] = unique
        .map((r: any) => {
          const payload        = r.payload || {};
          const nextDate       = payload.next_service_date as string | undefined;
          const lastDate       = payload.date_of_service   as string | undefined;
          if (!nextDate) return null;

          const daysUntil = differenceInDays(parseISO(nextDate), today);

          return {
            siteId:          r.site?.id,
            siteName:        r.site?.name || "Unknown Site",
            siteAddress:     [r.site?.address, r.site?.city].filter(Boolean).join(", ") || null,
            customerName:    r.site?.customer?.name || null,
            certRef:         r.certificate_reference || "",
            lastServiceDate: lastDate || r.completed_at?.slice(0, 10) || "",
            nextServiceDate: nextDate,
            daysUntil,
            visitType:       "fire",
            engineer:        r.engineer?.full_name || null,
            openDefects:     defectMap[r.site?.id] || 0,
          } as ServiceRow;
        })
        .filter(Boolean) as ServiceRow[];

      // Sort: overdue first, then soonest
      rows.sort((a, b) => a.daysUntil - b.daysUntil);
      setRows(rows);
    } catch (e: any) {
      console.error("ServiceDueDashboard load error:", e);
      toast.error("Failed to load service due data");
    } finally {
      setLoading(false);
    }
  }

  async function createVisit(row: ServiceRow) {
    setScheduling(row.siteId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      // Check if visit already exists
      const { data: existing } = await supabase
        .from("service_visits")
        .select("id")
        .eq("site_id",    row.siteId)
        .eq("visit_date", row.nextServiceDate)
        .eq("visit_type", "fire")
        .neq("status",    "cancelled")
        .maybeSingle();

      if (existing) {
        toast.info("A visit for this date already exists");
        return;
      }

      const { error } = await supabase.from("service_visits").insert({
        site_id:    row.siteId,
        visit_date: row.nextServiceDate,
        visit_type: "fire",
        status:     "scheduled",
        notes:      `Auto-scheduled from cert ${row.certRef}`,
      });

      if (error) throw error;

      const label = format(parseISO(row.nextServiceDate), "dd MMM yyyy");
      toast.success(`Visit scheduled for ${row.siteName} on ${label}`);
    } catch (e: any) {
      toast.error(`Failed to schedule visit: ${e.message}`);
    } finally {
      setScheduling(null);
    }
  }

  const filtered = useMemo(() => {
    let r = rows;
    if (filter !== "all") r = r.filter((row) => rag(row.daysUntil) === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(
        (row) =>
          row.siteName.toLowerCase().includes(q) ||
          (row.customerName || "").toLowerCase().includes(q) ||
          (row.siteAddress || "").toLowerCase().includes(q)
      );
    }
    return r;
  }, [rows, filter, search]);

  const counts = useMemo(() => ({
    red:   rows.filter((r) => rag(r.daysUntil) === "red").length,
    amber: rows.filter((r) => rag(r.daysUntil) === "amber").length,
    green: rows.filter((r) => rag(r.daysUntil) === "green").length,
  }), [rows]);

  // RAG filter pills — semantic colour per tone, theme-token-based so
  // the previous hard-coded slate/google-mail palette is gone.
  const pills = [
    { key: "all",   label: `All (${rows.length})`,       cls: "bg-card border-border text-foreground" },
    { key: "red",   label: `Overdue (${counts.red})`,    cls: "bg-destructive/10 border-destructive/25 text-destructive" },
    { key: "amber", label: `Due soon (${counts.amber})`, cls: "bg-warning/10 border-warning/25 text-warning" },
    { key: "green", label: `On track (${counts.green})`, cls: "bg-success/10 border-success/25 text-success" },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-foreground">Service Due</h2>
          <p className="text-sm text-muted-foreground">
            {rows.length} site{rows.length !== 1 ? "s" : ""} with upcoming service dates
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData}>
          Refresh
        </Button>
      </div>

      {/* RAG summary pills — wrap on mobile rather than horizontal-scroll
          so all four tones are visible without swiping. */}
      <div className="flex flex-wrap gap-2">
        {pills.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key as any)}
            className={`text-[13px] sm:text-xs font-semibold px-3 py-1.5 sm:py-1 rounded-full border transition-all ${f.cls} ${filter === f.key ? "ring-2 ring-offset-1 ring-primary" : "opacity-75 hover:opacity-100"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9 h-11 sm:h-9 text-base sm:text-sm"
          placeholder="Search sites or customers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Loading / empty */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          {rows.length === 0 ? "No completed certificates with next service dates found." : "No results match your filter."}
        </div>
      ) : (
        <>
          {/* Mobile: card list. The desktop table is too dense for a
              phone and the hardcoded-hex palette didn't respect the
              theme — this layout shows the same data row-by-row with
              proper tap targets. */}
          <div className="md:hidden space-y-2.5">
            {filtered.map((row) => (
              <div
                key={row.siteId}
                className="rounded-md border border-border bg-card p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-[15px] truncate">{row.siteName}</p>
                    {row.customerName && (
                      <p className="text-sm text-muted-foreground truncate">{row.customerName}</p>
                    )}
                    {row.siteAddress && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{row.siteAddress}</p>
                    )}
                  </div>
                  <RAGBadge days={row.daysUntil} />
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Last</p>
                    <p className="text-foreground mt-0.5">
                      {row.lastServiceDate
                        ? format(parseISO(row.lastServiceDate), "dd MMM yyyy")
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Next due</p>
                    <p className="text-foreground font-semibold mt-0.5">
                      {format(parseISO(row.nextServiceDate), "dd MMM yyyy")}
                    </p>
                  </div>
                </div>

                {row.openDefects > 0 && (
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-destructive bg-destructive/10 border border-destructive/25 px-2 py-1 rounded-full">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {row.openDefects} open defect{row.openDefects !== 1 ? "s" : ""}
                  </div>
                )}

                <Button
                  className="w-full h-11 gap-2"
                  disabled={scheduling === row.siteId}
                  onClick={() => createVisit(row)}
                >
                  {scheduling === row.siteId
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <CalendarPlus className="w-4 h-4" />}
                  Schedule visit
                </Button>
              </div>
            ))}
          </div>

          {/* Desktop: table — same data, now driven by theme tokens
              (was a fixed slate / google-mail palette). */}
          <div className="hidden md:block border border-border rounded-md overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-muted text-foreground text-xs font-semibold uppercase tracking-wider">
                  <th className="text-left px-4 py-2.5">Site</th>
                  <th className="text-left px-3 py-2.5">Customer</th>
                  <th className="text-center px-3 py-2.5">Last Service</th>
                  <th className="text-center px-3 py-2.5">Next Due</th>
                  <th className="text-center px-3 py-2.5">Status</th>
                  <th className="text-center px-3 py-2.5">Open Defects</th>
                  <th className="text-center px-3 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.siteId}
                    className="border-t border-border text-sm bg-card hover:bg-muted/40 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{row.siteName}</p>
                      {row.siteAddress && (
                        <p className="text-xs text-muted-foreground truncate max-w-[260px]">{row.siteAddress}</p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {row.customerName || "—"}
                    </td>
                    <td className="px-3 py-3 text-center text-muted-foreground">
                      {row.lastServiceDate
                        ? format(parseISO(row.lastServiceDate), "dd MMM yyyy")
                        : "—"}
                    </td>
                    <td className="px-3 py-3 text-center font-medium text-foreground">
                      {format(parseISO(row.nextServiceDate), "dd MMM yyyy")}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <RAGBadge days={row.daysUntil} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      {row.openDefects > 0 ? (
                        <span className="text-xs font-bold text-destructive bg-destructive/10 border border-destructive/25 px-2 py-0.5 rounded-full">
                          {row.openDefects}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Button
                        size="sm"
                        className="gap-1.5 font-semibold"
                        disabled={scheduling === row.siteId}
                        onClick={() => createVisit(row)}
                        title={`Schedule fire alarm visit for ${row.siteName} on ${format(parseISO(row.nextServiceDate), "dd MMM yyyy")}`}
                      >
                        {scheduling === row.siteId
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <CalendarPlus className="w-3.5 h-3.5" />}
                        Schedule visit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
