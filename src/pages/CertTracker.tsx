import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import {
  Award, CheckCircle2, Search, RefreshCw, ArrowRight,
  FileSignature, Lock, AlertTriangle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, parseISO, isValid } from "date-fns";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

// ── Cert types displayed as columns ──────────────────────────────────────────
const CERT_COLS = [
  { key: "bs5839_inspection_servicing", label: "IS Cert",       code: "IS" },
  { key: "bs5839_installation",         label: "Installation",  code: "FD/02" },
  { key: "bs5839_commissioning",        label: "Commissioning", code: "FD/03" },
  { key: "bs5839_modification",         label: "Modification",  code: "FD/05" },
] as const;

type CertColKey = typeof CERT_COLS[number]["key"];

interface CertEntry {
  id: string;
  certificate_reference: string;
  completed_at: string | null;
  job_number: string | null;
}

interface SiteRow {
  site_id: string;
  site_name: string;
  site_address: string | null;
  certs: Partial<Record<CertColKey, CertEntry>>;
  certCount: number;
}

// ── Data fetcher ──────────────────────────────────────────────────────────────
async function fetchCertTrackerData(): Promise<SiteRow[]> {
  const { data, error } = await supabase
    .from("smart_form_submissions")
    .select(`
      id,
      form_type,
      certificate_reference,
      completed_at,
      job_number,
      site_id,
      sites:site_id ( id, name, address )
    `)
    .eq("status", "completed")
    .not("site_id", "is", null)
    .order("completed_at", { ascending: false });

  if (error) throw error;
  const rows = (data ?? []) as unknown as {
    id: string;
    form_type: string;
    certificate_reference: string;
    completed_at: string | null;
    job_number: string | null;
    site_id: string;
    sites: { id: string; name: string; address: string | null } | null;
  }[];

  // Group by site_id — only keep latest per form_type per site
  const siteMap = new Map<string, SiteRow>();

  for (const row of rows) {
    if (!row.site_id || !row.sites) continue;
    const colKey = row.form_type as CertColKey;
    const isKnownType = CERT_COLS.some((c) => c.key === colKey);
    if (!isKnownType) continue;

    if (!siteMap.has(row.site_id)) {
      siteMap.set(row.site_id, {
        site_id: row.site_id,
        site_name: row.sites.name,
        site_address: row.sites.address,
        certs: {},
        certCount: 0,
      });
    }

    const sr = siteMap.get(row.site_id)!;
    // Only store the first (most recent) of each type per site
    if (!sr.certs[colKey]) {
      sr.certs[colKey] = {
        id: row.id,
        certificate_reference: row.certificate_reference,
        completed_at: row.completed_at,
        job_number: row.job_number,
      };
    }
  }

  // Set cert count and return only sites with ≥1 cert
  return Array.from(siteMap.values()).map((s) => ({
    ...s,
    certCount: Object.keys(s.certs).length,
  }));
}

// ── Cert cell ─────────────────────────────────────────────────────────────────
function CertCell({ entry }: { entry?: CertEntry }) {
  if (!entry) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
        N/A
      </span>
    );
  }

  const dateStr = entry.completed_at && isValid(parseISO(entry.completed_at))
    ? format(parseISO(entry.completed_at), "dd MMM yyyy")
    : "—";

  return (
    <div className="space-y-0.5">
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
        <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
        {dateStr}
      </span>
      <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[130px]">
        {entry.certificate_reference}
      </p>
    </div>
  );
}

// ── Summary stat ──────────────────────────────────────────────────────────────
function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CertTracker() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<CertColKey | "all">("all");

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ["cert-tracker-v2"],
    queryFn: fetchCertTrackerData,
  });

  // Summary counts per cert type
  const counts = useMemo(() => {
    const result: Record<CertColKey | "sites", number> = {
      sites: rows.length,
      bs5839_inspection_servicing: 0,
      bs5839_installation: 0,
      bs5839_commissioning: 0,
      bs5839_modification: 0,
    };
    rows.forEach((r) => {
      CERT_COLS.forEach((c) => { if (r.certs[c.key]) result[c.key]++; });
    });
    return result;
  }, [rows]);

  // Filter + search
  const filtered = useMemo(() =>
    rows
      .filter((r) => {
        if (filterType !== "all" && !r.certs[filterType]) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          r.site_name.toLowerCase().includes(q) ||
          r.site_address?.toLowerCase().includes(q) ||
          Object.values(r.certs).some((c) =>
            c?.certificate_reference.toLowerCase().includes(q)
          )
        );
      })
      .sort((a, b) => b.certCount - a.certCount), // sites with most certs first
    [rows, filterType, search]
  );

  return (
    <DashboardLayout>
      <div className="space-y-5 p-4 md:p-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Award className="w-6 h-6 text-primary" />
              Certificate Tracker
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              BS 5839-1:2025 issued certificates — only sites with at least one completed cert are shown
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Sites with Certs" value={counts.sites} />
          {CERT_COLS.map((c) => (
            <StatCard key={c.key} label={c.label} value={counts[c.key]} sub={c.code} />
          ))}
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground mr-1">Filter by cert type:</span>
          <button
            onClick={() => setFilterType("all")}
            className={cn("px-3 py-1 rounded-full border text-xs font-medium transition-colors", filterType === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent/30")}
          >
            All sites
          </button>
          {CERT_COLS.map((c) => (
            <button
              key={c.key}
              onClick={() => setFilterType(filterType === c.key ? "all" : c.key)}
              className={cn("px-3 py-1 rounded-full border text-xs font-medium transition-colors", filterType === c.key ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent/30")}
            >
              {c.label} <span className="opacity-60">({counts[c.key]})</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search site name, address or cert reference..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card"
          />
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 bg-card rounded-xl border animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-card rounded-xl border p-12 text-center">
            <FileSignature className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="font-semibold text-muted-foreground">
              {rows.length === 0
                ? "No completed certificates yet — complete a smart form cert to see it here"
                : "No sites match your search"}
            </p>
          </div>
        ) : (
          <div className="bg-card rounded-xl border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                    Site
                  </th>
                  {CERT_COLS.map((c) => (
                    <th key={c.key} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                      <div>{c.label}</div>
                      <div className="text-[9px] font-normal opacity-60">{c.code}</div>
                    </th>
                  ))}
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Certs
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const allFour = row.certCount === CERT_COLS.length;
                  return (
                    <tr
                      key={row.site_id}
                      className="border-b border-border/60 hover:bg-muted/30 transition-colors cursor-pointer last:border-0"
                      onClick={() => navigate(`/sites/${row.site_id}`)}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          {allFour && <Lock className="w-3 h-3 text-green-600 flex-shrink-0" />}
                          <div>
                            <p className="font-semibold text-sm">{row.site_name}</p>
                            {row.site_address && (
                              <p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[200px]">
                                {row.site_address}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {CERT_COLS.map((c) => (
                        <td key={c.key} className="px-4 py-4">
                          <CertCell entry={row.certs[c.key]} />
                        </td>
                      ))}

                      <td className="px-4 py-4">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            allFour
                              ? "border-green-500/40 text-green-700 bg-green-50 dark:bg-green-950/20"
                              : "border-border text-muted-foreground"
                          )}
                        >
                          {row.certCount} / {CERT_COLS.length}
                        </Badge>
                      </td>

                      <td className="px-4 py-4">
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/sites/${row.site_id}`); }}
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="px-5 py-3 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Showing {filtered.length} of {rows.length} certified sites</span>
              <span className="flex items-center gap-1">
                <Lock className="w-3 h-3 text-green-600" /> = All 4 cert types issued
              </span>
            </div>
          </div>
        )}

        {/* Info panel */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-card rounded-xl border p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Certificate Types</p>
            <div className="space-y-1.5 text-xs">
              {CERT_COLS.map((c) => (
                <div key={c.key} className="flex items-start gap-2">
                  <Badge variant="outline" className="text-[9px] w-12 justify-center flex-shrink-0">{c.code}</Badge>
                  <span className="text-muted-foreground"><span className="text-foreground font-medium">{c.label}</span> — {
                    c.key === "bs5839_inspection_servicing" ? "Routine inspection and servicing per BS 5839-1 Annex G.6" :
                    c.key === "bs5839_installation" ? "New system / extension installed per BS 5839-1 Annex E" :
                    c.key === "bs5839_commissioning" ? "System fully tested and commissioned per BS 5839-1 Annex C" :
                    "Alterations to existing certified system per BS 5839-1 Annex F"
                  }</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-200/60 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
              One cert per job rule
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Each job number can only carry one completed certificate of each type per site. 
              If you need to re-issue, create a new job reference. The system will warn you 
              if a duplicate is detected before completion.
            </p>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
