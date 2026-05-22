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
    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
      <AlertTriangle className="w-3 h-3" />
      {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
    </span>
  );
  if (r === "amber") return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
      <Clock className="w-3 h-3" />
      {days}d
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[#1a1a1a]">Service Due</h2>
          <p className="text-[12px] text-[#5f6368]">
            {rows.length} site{rows.length !== 1 ? "s" : ""} with upcoming service dates
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} className="h-8 text-xs">
          Refresh
        </Button>
      </div>

      {/* RAG summary pills */}
      <div className="flex gap-3">
        {[
          { key: "all",   label: `All (${rows.length})`,       cls: "bg-white border-[#dadce0] text-[#1a1a1a]" },
          { key: "red",   label: `Overdue / urgent (${counts.red})`,   cls: "bg-red-50 border-red-200 text-red-700" },
          { key: "amber", label: `Due soon (${counts.amber})`,  cls: "bg-amber-50 border-amber-200 text-amber-700" },
          { key: "green", label: `On track (${counts.green})`,  cls: "bg-green-50 border-green-200 text-green-700" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key as any)}
            className={`text-[11px] font-semibold px-3 py-1 rounded-full border transition-all ${f.cls} ${filter === f.key ? "ring-2 ring-offset-1 ring-[#e85c2c]" : "opacity-70 hover:opacity-100"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9aa0a6]" />
        <Input
          className="pl-8 h-8 text-sm border-[#dadce0]"
          placeholder="Search sites or customers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-[#e85c2c]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-[#9aa0a6] text-sm">
          {rows.length === 0 ? "No completed certificates with next service dates found." : "No results match your filter."}
        </div>
      ) : (
        <div className="border border-[#e0e0e0] rounded-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-[#3c3c3c] text-white text-[11px] font-semibold">
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
              {filtered.map((row, i) => (
                <tr
                  key={row.siteId}
                  className={`border-b border-[#f0f0f0] text-[12px] ${i % 2 === 0 ? "bg-white" : "bg-[#fafafa]"} hover:bg-[#f9fbe7] transition-colors`}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-[#1a1a1a]">{row.siteName}</p>
                    {row.siteAddress && (
                      <p className="text-[11px] text-[#9aa0a6] truncate max-w-[200px]">{row.siteAddress}</p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[#5f6368]">
                    {row.customerName || "—"}
                  </td>
                  <td className="px-3 py-3 text-center text-[#5f6368]">
                    {row.lastServiceDate
                      ? format(parseISO(row.lastServiceDate), "dd MMM yyyy")
                      : "—"}
                  </td>
                  <td className="px-3 py-3 text-center font-medium text-[#1a1a1a]">
                    {format(parseISO(row.nextServiceDate), "dd MMM yyyy")}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <RAGBadge days={row.daysUntil} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    {row.openDefects > 0 ? (
                      <span className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                        {row.openDefects}
                      </span>
                    ) : (
                      <span className="text-[11px] text-[#9aa0a6]">0</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <Button
                      size="sm"
                      className="h-7 text-[11px] gap-1.5 bg-[#e85c2c] hover:bg-[#d24e1f] text-white font-semibold px-3 shadow-sm"
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
      )}
    </div>
  );
}
