/**
 * QuotePipeline.tsx
 *
 * Quote pipeline — all quotes grouped by status with value summary.
 * Statuses: draft → sent → accepted | declined | recalled
 *
 * Features:
 * - Tab filter: All / Open / Won / Lost
 * - Value totals per tab
 * - Days-since-sent, expiry warning
 * - One-click open QuotationDetailDialog
 * - Follow-up flag when quote is stale (sent >14 days, no response)
 */

import { useEffect, useState, useMemo } from "react";
import { differenceInDays, format, parseISO, isAfter } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Search, Loader2, TrendingUp, Clock, CheckCircle2,
  XCircle, FileText, AlertTriangle, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { QuotationDetailDialog } from "@/components/quotations/QuotationDetailDialog";

// ── Types ─────────────────────────────────────────────────────────────────────
interface QuoteRow {
  id:               string;
  quotation_number: string;
  status:           string;
  title:            string | null;
  total_amount:     number;
  valid_until:      string | null;
  created_at:       string;
  locked_at:        string | null;
  site_name:        string;
  customer_name:    string | null;
  customer_email:   string | null;
  site_id:          string;
  customer_id:      string | null;
}

type FilterTab = "all" | "open" | "won" | "lost";

const STATUS_CONFIG: Record<string, { label: string; color: string; tab: FilterTab }> = {
  draft:    { label: "Draft",    color: "bg-gray-100 text-gray-700 border-gray-200",   tab: "open" },
  sent:     { label: "Sent",     color: "bg-blue-50 text-blue-700 border-blue-200",    tab: "open" },
  recalled: { label: "Recalled", color: "bg-amber-50 text-amber-700 border-amber-200", tab: "lost" },
  accepted: { label: "Accepted", color: "bg-green-50 text-green-700 border-green-200", tab: "won"  },
  declined: { label: "Declined", color: "bg-red-50 text-red-700 border-red-200",       tab: "lost" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: "bg-gray-100 text-gray-700 border-gray-200", tab: "all" };
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border capitalize ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function gbp(n: number) { return `£${n.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`; }

// ── Component ─────────────────────────────────────────────────────────────────
export default function QuotePipeline() {
  const [quotes,   setQuotes]   = useState<QuoteRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [tab,      setTab]      = useState<FilterTab>("open");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => { loadQuotes(); }, []);

  async function loadQuotes() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("quotations")
        .select(`
          id, quotation_number, status, title, total_amount,
          valid_until, created_at, locked_at,
          sites:site_id(id, name, customer_id, customer:customers(id, name, contact_email))
        `)
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;

      const rows: QuoteRow[] = (data || []).map((q: any) => ({
        id:               q.id,
        quotation_number: q.quotation_number,
        status:           q.status || "draft",
        title:            q.title,
        total_amount:     q.total_amount || 0,
        valid_until:      q.valid_until,
        created_at:       q.created_at,
        locked_at:        q.locked_at,
        site_name:        q.sites?.name || "Unknown Site",
        customer_name:    q.sites?.customer?.name || null,
        customer_email:   q.sites?.customer?.contact_email || null,
        site_id:          q.sites?.id || "",
        customer_id:      q.sites?.customer?.id || q.sites?.customer_id || null,
      }));

      setQuotes(rows);
    } catch (e: any) {
      toast.error("Failed to load quotes");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const today = new Date();

  const filtered = useMemo(() => {
    let r = quotes;

    // Tab filter
    if (tab !== "all") {
      r = r.filter((q) => (STATUS_CONFIG[q.status]?.tab || "all") === tab);
    }

    // Search
    if (search.trim()) {
      const s = search.toLowerCase();
      r = r.filter(
        (q) =>
          q.quotation_number.toLowerCase().includes(s) ||
          q.site_name.toLowerCase().includes(s) ||
          (q.customer_name || "").toLowerCase().includes(s) ||
          (q.title || "").toLowerCase().includes(s)
      );
    }
    return r;
  }, [quotes, tab, search]);

  const totals = useMemo(() => {
    const sum = (filter: (q: QuoteRow) => boolean) =>
      quotes.filter(filter).reduce((acc, q) => acc + q.total_amount, 0);
    return {
      all:  sum(() => true),
      open: sum((q) => STATUS_CONFIG[q.status]?.tab === "open"),
      won:  sum((q) => q.status === "accepted"),
      lost: sum((q) => STATUS_CONFIG[q.status]?.tab === "lost"),
    };
  }, [quotes]);

  const counts = useMemo(() => ({
    all:  quotes.length,
    open: quotes.filter((q) => STATUS_CONFIG[q.status]?.tab === "open").length,
    won:  quotes.filter((q) => q.status === "accepted").length,
    lost: quotes.filter((q) => STATUS_CONFIG[q.status]?.tab === "lost").length,
  }), [quotes]);

  const isExpired  = (q: QuoteRow) => q.valid_until && isAfter(today, parseISO(q.valid_until));
  const isStale    = (q: QuoteRow) => q.status === "sent" &&
    differenceInDays(today, parseISO(q.created_at)) > 14;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#1a1a1a]">Quote Pipeline</h2>
            <p className="text-[12px] text-[#5f6368]">{quotes.length} total quotations</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadQuotes} className="h-8 text-xs">
            Refresh
          </Button>
        </div>

        {/* Tab filter with value summary */}
        <div className="grid grid-cols-4 gap-3">
          {([
            { key: "all",  label: "All",      icon: FileText,       value: totals.all,  count: counts.all,  cls: "border-[#dadce0]" },
            { key: "open", label: "Open",      icon: Clock,          value: totals.open, count: counts.open, cls: "border-blue-200 bg-blue-50" },
            { key: "won",  label: "Won",       icon: CheckCircle2,   value: totals.won,  count: counts.won,  cls: "border-green-200 bg-green-50" },
            { key: "lost", label: "Lost",      icon: XCircle,        value: totals.lost, count: counts.lost, cls: "border-red-200 bg-red-50" },
          ] as const).map((f) => {
            const Icon = f.icon;
            return (
              <button
                key={f.key}
                onClick={() => setTab(f.key as FilterTab)}
                className={`text-left p-3 rounded-sm border transition-all ${f.cls} ${
                  tab === f.key ? "ring-2 ring-offset-1 ring-[#e85c2c] opacity-100" : "opacity-60 hover:opacity-90"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className="w-3.5 h-3.5 text-[#5f6368]" />
                  <span className="text-[11px] font-semibold text-[#5f6368] uppercase tracking-wide">{f.label}</span>
                </div>
                <p className="text-[15px] font-bold text-[#1a1a1a]">{gbp(f.value)}</p>
                <p className="text-[11px] text-[#9aa0a6]">{f.count} quote{f.count !== 1 ? "s" : ""}</p>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9aa0a6]" />
          <Input
            className="pl-8 h-8 text-sm border-[#dadce0]"
            placeholder="Search quotes, sites, customers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-[#e85c2c]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-[#9aa0a6] text-sm">
            {quotes.length === 0 ? "No quotations found." : "No quotes match this filter."}
          </div>
        ) : (
          <div className="border border-[#e0e0e0] rounded-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-[#3c3c3c] text-white text-[11px] font-semibold">
                  <th className="text-left px-4 py-2.5">Quote</th>
                  <th className="text-left px-3 py-2.5">Site / Customer</th>
                  <th className="text-left px-3 py-2.5 max-w-[160px]">Scope</th>
                  <th className="text-center px-3 py-2.5">Status</th>
                  <th className="text-right px-3 py-2.5">Value</th>
                  <th className="text-center px-3 py-2.5">Age</th>
                  <th className="text-center px-3 py-2.5">Valid Until</th>
                  <th className="text-center px-3 py-2.5 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((q, i) => {
                  const ageD   = differenceInDays(today, parseISO(q.created_at));
                  const stale  = isStale(q);
                  const expd   = isExpired(q);

                  return (
                    <tr
                      key={q.id}
                      onClick={() => setSelected(q.id)}
                      className={`border-b border-[#f0f0f0] text-[12px] cursor-pointer
                        ${i % 2 === 0 ? "bg-white" : "bg-[#fafafa]"}
                        hover:bg-[#f9fbe7] transition-colors`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-mono font-semibold text-[#1a1a1a] text-[11px]">
                          {q.quotation_number}
                        </p>
                        <p className="text-[10px] text-[#9aa0a6]">
                          {format(parseISO(q.created_at), "dd MMM yyyy")}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-medium text-[#1a1a1a]">{q.site_name}</p>
                        {q.customer_name && (
                          <p className="text-[11px] text-[#5f6368]">{q.customer_name}</p>
                        )}
                      </td>
                      <td className="px-3 py-3 max-w-[160px]">
                        <p className="text-[11px] text-[#5f6368] truncate">
                          {q.title || "—"}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <StatusBadge status={q.status} />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <p className="font-bold text-[#1a1a1a]">{gbp(q.total_amount)}</p>
                        <p className="text-[10px] text-[#9aa0a6]">+VAT</p>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`text-[11px] ${stale ? "text-amber-600 font-semibold" : "text-[#5f6368]"}`}>
                          {stale && <AlertTriangle className="w-3 h-3 inline mr-0.5" />}
                          {ageD}d
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {q.valid_until ? (
                          <span className={`text-[11px] ${expd ? "text-red-600 font-semibold" : "text-[#5f6368]"}`}>
                            {expd ? "EXPIRED" : format(parseISO(q.valid_until), "dd MMM")}
                          </span>
                        ) : (
                          <span className="text-[11px] text-[#9aa0a6]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <ChevronRight className="w-4 h-4 text-[#9aa0a6]" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Total row */}
              <tfoot>
                <tr className="bg-[#f8f9fa] border-t border-[#e0e0e0]">
                  <td colSpan={4} className="px-4 py-2.5 text-[11px] font-semibold text-[#5f6368] uppercase">
                    {filtered.length} quote{filtered.length !== 1 ? "s" : ""}
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-[#1a1a1a] text-[13px]">
                    {gbp(filtered.reduce((s, q) => s + q.total_amount, 0))}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Quote detail dialog */}
      {selected && (
        <QuotationDetailDialog
          open={!!selected}
          onOpenChange={(o) => { if (!o) setSelected(null); }}
          quotationId={selected}
          onUpdate={loadQuotes}
        />
      )}
    </>
  );
}
