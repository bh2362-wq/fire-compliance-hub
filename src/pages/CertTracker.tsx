import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import {
  Award, CheckCircle2, Search, RefreshCw, ArrowRight,
  FileSignature, Lock, AlertTriangle, FileDown, Mail, Zap, Wind, Droplets,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, parseISO, isValid } from "date-fns";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { generateServiceReport as generateBS5839CertificatePDF } from "@/lib/serviceReportGenerator";
import { generateInstallationCertificatePDF } from "@/lib/installationCertificatePdfGenerator";
import { generateCommissioningCertificatePDF } from "@/lib/commissioningCertificatePdfGenerator";
import { generateModificationCertificatePDF } from "@/lib/modificationCertificatePdfGenerator";

// ── Fire Alarm cert columns (BS 5839-1) ────────────────────────────────────────
const FA_COLS = [
  { key: "bs5839_inspection_servicing", label: "IS Cert",       code: "IS"    },
  { key: "bs5839_installation",         label: "Installation",  code: "FD/02" },
  { key: "bs5839_commissioning",        label: "Commissioning", code: "FD/03" },
  { key: "bs5839_modification",         label: "Modification",  code: "FD/05" },
] as const;
type FACertKey = typeof FA_COLS[number]["key"];

// ── Discipline cert columns — grouped by prefix ────────────────────────────────
// One column per discipline shows the most recent cert of any sub-type
const DISC_COLS = [
  { key: "el",  label: "Emerg. Lighting", code: "BS 5266",   prefix: "el_",  icon: Zap,      iconColor: "text-yellow-600" },
  { key: "asd", label: "ASD",             code: "EN 54-20",  prefix: "asd_", icon: Wind,     iconColor: "text-sky-600"    },
  { key: "dr",  label: "Dry Riser",       code: "BS 9990",   prefix: "dr_",  icon: Droplets, iconColor: "text-blue-600"   },
] as const;
type DiscCertKey = typeof DISC_COLS[number]["key"];

interface CertEntry {
  id: string;
  certificate_reference: string;
  completed_at: string | null;
  job_number: string | null;
  form_type: string;
  payload: any;
}

interface SiteRow {
  site_id: string;
  site_name: string;
  site_address: string | null;
  fa: Partial<Record<FACertKey, CertEntry>>;
  disc: Partial<Record<DiscCertKey, CertEntry>>;
  faCertCount: number;
  discCertCount: number;
}

// ── Data fetcher ───────────────────────────────────────────────────────────────
async function fetchCertTrackerData(): Promise<SiteRow[]> {
  const { data, error } = await supabase
    .from("smart_form_submissions")
    .select("id, form_type, certificate_reference, completed_at, job_number, site_id, payload")
    .eq("status", "completed")
    .not("site_id", "is", null)
    .order("completed_at", { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as unknown as {
    id: string; form_type: string; certificate_reference: string;
    completed_at: string | null; job_number: string | null; site_id: string; payload: any;
  }[];

  const siteIds = Array.from(new Set(rows.map((r) => r.site_id).filter(Boolean)));
  const sitesById = new Map<string, { id: string; name: string; address: string | null }>();
  if (siteIds.length > 0) {
    const { data: sitesData } = await supabase.from("sites").select("id, name, address").in("id", siteIds);
    (sitesData ?? []).forEach((s: any) => sitesById.set(s.id, s));
  }

  const siteMap = new Map<string, SiteRow>();

  for (const row of rows) {
    const site = sitesById.get(row.site_id);
    if (!site) continue;

    if (!siteMap.has(row.site_id)) {
      siteMap.set(row.site_id, {
        site_id: row.site_id, site_name: site.name, site_address: site.address,
        fa: {}, disc: {}, faCertCount: 0, discCertCount: 0,
      });
    }

    const sr = siteMap.get(row.site_id)!;
    const entry: CertEntry = {
      id: row.id, certificate_reference: row.certificate_reference,
      completed_at: row.completed_at, job_number: row.job_number,
      form_type: row.form_type, payload: row.payload,
    };

    // BS5839 direct match
    const faCol = FA_COLS.find(c => c.key === row.form_type);
    if (faCol && !sr.fa[faCol.key]) {
      sr.fa[faCol.key] = entry;
      continue; // handled
    }

    // Discipline — match by prefix, store latest (first seen = most recent due to ORDER BY)
    const discCol = DISC_COLS.find(c => row.form_type.startsWith(c.prefix));
    if (discCol && !sr.disc[discCol.key]) {
      sr.disc[discCol.key] = entry;
    }
  }

  return Array.from(siteMap.values()).map((s) => ({
    ...s,
    faCertCount:   Object.keys(s.fa).length,
    discCertCount: Object.keys(s.disc).length,
  }));
}

// ── PDF download ───────────────────────────────────────────────────────────────
async function downloadCertPdf(entry: CertEntry) {
  try {
    const p = entry.payload || {};
    const ft = entry.form_type;
    if (ft === "bs5839_installation") {
      await generateInstallationCertificatePDF(p, { autoSign: true });
    } else if (ft === "bs5839_commissioning") {
      await generateCommissioningCertificatePDF(p, { autoSign: true });
    } else if (ft === "bs5839_modification") {
      await generateModificationCertificatePDF(p, { autoSign: true });
    } else if (ft.startsWith("el_")) {
      const { generateELCertificatePDF } = await import("@/lib/emergencyLightingPdfGenerator");
      await generateELCertificatePDF(p);
    } else if (ft.startsWith("asd_")) {
      const { generateASDCommissioningPDF } = await import("@/lib/asdCommissioningPdfGenerator");
      await generateASDCommissioningPDF(p);
    } else if (ft.startsWith("dr_")) {
      const { generateDryRiserPDF } = await import("@/lib/dryRiserPdfGenerator");
      await generateDryRiserPDF(p);
    } else {
      await generateBS5839CertificatePDF(p, { autoSign: true });
    }
  } catch (err) {
    console.error(err);
    toast.error("Failed to generate PDF");
  }
}

function buildMailto(entry: CertEntry) {
  const p = entry.payload || {};
  const to = p.responsible_person_email || p.responsible_email || "";
  const premises = p.premises_name || "";
  const ref = entry.certificate_reference || "";
  const dateStr = entry.completed_at && isValid(parseISO(entry.completed_at))
    ? format(parseISO(entry.completed_at), "dd MMMM yyyy") : "";
  const subject = `Fire Safety Certificate – ${premises} – ${ref}`;
  const body = `Please find attached your certificate for ${premises}, reference ${ref}, dated ${dateStr}. Please retain this document for your records.`;
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ── Cert cell ──────────────────────────────────────────────────────────────────
function CertCell({ entry }: { entry?: CertEntry }) {
  if (!entry) return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
      N/A
    </span>
  );

  const dateStr = entry.completed_at && isValid(parseISO(entry.completed_at))
    ? format(parseISO(entry.completed_at), "dd MMM yyyy") : "—";

  // Show sub-type for discipline certs
  const subLabel = !entry.form_type.startsWith("bs5839") ? (
    <span className="text-[9px] text-muted-foreground block">{entry.form_type.replace(/_/g, " ")}</span>
  ) : null;

  return (
    <div className="space-y-0.5">
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
        <CheckCircle2 className="w-2.5 h-2.5 mr-1" />{dateStr}
      </span>
      {subLabel}
      <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[130px]">
        {entry.certificate_reference}
      </p>
      <div className="flex items-center gap-1 pt-0.5">
        <button onClick={(e) => { e.stopPropagation(); downloadCertPdf(entry); }} title="Download PDF"
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
          <FileDown className="w-3 h-3" />
        </button>
        <a href={buildMailto(entry)} onClick={(e) => e.stopPropagation()} title="Email"
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
          <Mail className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function CertTracker() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filterDiscipline, setFilterDiscipline] = useState<"all" | "fa" | "el" | "asd" | "dr">("all");

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ["cert-tracker-v3"],
    queryFn: fetchCertTrackerData,
  });

  const counts = useMemo(() => {
    const r = { sites: rows.length, fa: 0, el: 0, asd: 0, dr: 0 } as Record<string, number>;
    rows.forEach((s) => {
      if (s.faCertCount > 0) r.fa++;
      if (s.disc.el)  r.el++;
      if (s.disc.asd) r.asd++;
      if (s.disc.dr)  r.dr++;
    });
    return r;
  }, [rows]);

  const filtered = useMemo(() =>
    rows.filter((r) => {
      if (filterDiscipline === "fa"  && r.faCertCount === 0)   return false;
      if (filterDiscipline === "el"  && !r.disc.el)            return false;
      if (filterDiscipline === "asd" && !r.disc.asd)           return false;
      if (filterDiscipline === "dr"  && !r.disc.dr)            return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        r.site_name.toLowerCase().includes(q) ||
        r.site_address?.toLowerCase().includes(q) ||
        Object.values(r.fa).some(c => c?.certificate_reference.toLowerCase().includes(q)) ||
        Object.values(r.disc).some(c => c?.certificate_reference.toLowerCase().includes(q))
      );
    }).sort((a, b) => (b.faCertCount + b.discCertCount) - (a.faCertCount + a.discCertCount)),
    [rows, filterDiscipline, search]
  );

  const chipClass = (active: boolean) => cn(
    "px-3 py-1 rounded-full border text-xs font-medium transition-colors",
    active ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent/30"
  );

  return (
    <DashboardLayout>
      <div className="space-y-5 p-4 md:p-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Award className="w-6 h-6 text-primary" /> Certificate Tracker
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              All disciplines — sites with at least one completed certificate
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          <StatCard label="Sites with Certs" value={counts.sites} />
          <StatCard label="Fire Alarm"        value={counts.fa}    sub="BS 5839-1" />
          <StatCard label="Emerg. Lighting"   value={counts.el}    sub="BS 5266-1" />
          <StatCard label="ASD"               value={counts.asd}   sub="EN 54-20" />
          <StatCard label="Dry Riser"         value={counts.dr}    sub="BS 9990" />
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground mr-1">Filter:</span>
          {(["all", "fa", "el", "asd", "dr"] as const).map(f => (
            <button key={f} onClick={() => setFilterDiscipline(f)} className={chipClass(filterDiscipline === f)}>
              {f === "all" ? `All sites` :
               f === "fa"  ? `Fire Alarm (${counts.fa})` :
               f === "el"  ? `EL (${counts.el})` :
               f === "asd" ? `ASD (${counts.asd})` :
                             `Dry Riser (${counts.dr})`}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search site name, address or cert reference..."
            value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-card" />
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-card rounded-xl border animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-card rounded-xl border p-12 text-center">
            <FileSignature className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="font-semibold text-muted-foreground">
              {rows.length === 0
                ? "No completed certificates yet — complete a smart form to see it here"
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

                  {/* Fire Alarm group header */}
                  <th colSpan={4} className="text-center px-2 py-2 text-[9px] font-bold uppercase tracking-widest text-blue-600 border-l border-border bg-blue-50/40 dark:bg-blue-950/10">
                    Fire Alarm — BS 5839-1:2025
                  </th>

                  {/* Discipline group header */}
                  <th colSpan={3} className="text-center px-2 py-2 text-[9px] font-bold uppercase tracking-widest text-purple-600 border-l border-border bg-purple-50/40 dark:bg-purple-950/10">
                    Other Disciplines
                  </th>

                  <th className="px-4 py-3" />
                </tr>
                <tr className="border-b border-border">
                  <th className="px-5 py-2" />
                  {FA_COLS.map((c) => (
                    <th key={c.key} className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap border-l border-border/40 first:border-l">
                      <div>{c.label}</div>
                      <div className="text-[9px] font-normal opacity-60">{c.code}</div>
                    </th>
                  ))}
                  {DISC_COLS.map((c) => (
                    <th key={c.key} className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap border-l border-border/40">
                      <div className="flex items-center gap-1">
                        <c.icon className={cn("w-3 h-3", c.iconColor)} />
                        {c.label}
                      </div>
                      <div className="text-[9px] font-normal opacity-60">{c.code}</div>
                    </th>
                  ))}
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const allFa   = row.faCertCount === FA_COLS.length;
                  const anyDisc = row.discCertCount > 0;
                  return (
                    <tr key={row.site_id}
                      className="border-b border-border/60 hover:bg-muted/30 transition-colors cursor-pointer last:border-0"
                      onClick={() => navigate(`/sites/${row.site_id}`)}>

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          {allFa && <Lock className="w-3 h-3 text-green-600 flex-shrink-0" />}
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

                      {FA_COLS.map((c) => (
                        <td key={c.key} className="px-4 py-4 border-l border-border/30">
                          <CertCell entry={row.fa[c.key]} />
                        </td>
                      ))}

                      {DISC_COLS.map((c) => (
                        <td key={c.key} className="px-4 py-4 border-l border-border/30">
                          <CertCell entry={row.disc[c.key]} />
                        </td>
                      ))}

                      <td className="px-4 py-4">
                        <button onClick={(e) => { e.stopPropagation(); navigate(`/sites/${row.site_id}`); }}
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
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
                <Lock className="w-3 h-3 text-green-600" /> = All 4 fire alarm cert types issued
              </span>
            </div>
          </div>
        )}

        {/* Info panel */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-card rounded-xl border p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Certificate Types</p>
            <div className="space-y-1.5 text-xs">
              {[
                { code: "IS",       label: "Inspection & Servicing", desc: "Routine periodic maintenance per BS 5839-1 Annex G.6" },
                { code: "FD/02",    label: "Installation",           desc: "New system / extension per BS 5839-1 Annex E" },
                { code: "FD/03",    label: "Commissioning",          desc: "System fully commissioned per BS 5839-1 Annex C" },
                { code: "FD/05",    label: "Modification",           desc: "Alterations to certified system per BS 5839-1 Annex F" },
                { code: "EPM6C",    label: "Emergency Lighting",     desc: "BS 5266-1:2016 — periodic, commissioning, discharge" },
                { code: "EN 54-20", label: "ASD",                    desc: "Aspirating smoke detection — annual service / commissioning" },
                { code: "BS 9990",  label: "Dry Riser",              desc: "6-monthly visual inspection and annual pressure test" },
              ].map(({ code, label, desc }) => (
                <div key={code} className="flex items-start gap-2">
                  <Badge variant="outline" className="text-[9px] w-16 justify-center flex-shrink-0">{code}</Badge>
                  <span className="text-muted-foreground">
                    <span className="text-foreground font-medium">{label}</span> — {desc}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-200/60 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
              Discipline columns
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Emergency Lighting, ASD and Dry Riser columns show the most recent certificate
              of any sub-type for that discipline. Hover over a date badge to see the full
              certificate reference and download the PDF. All certs are recorded against the site
              and appear in full on the Site Detail page.
            </p>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
