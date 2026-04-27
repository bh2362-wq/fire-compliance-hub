import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { getAllBafeCertificates, BafeCertificate } from "@/services/bafeCertificateService";
import { getSites, Site } from "@/services/siteService";
import { supabase } from "@/integrations/supabase/client";
import {
  Award, AlertTriangle, CheckCircle2, Clock, Search, Filter,
  ShieldCheck, ShieldAlert, Shield, ArrowRight, RefreshCw, Download
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { differenceInDays, parseISO, format, isValid } from "date-fns";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

/* ── Types ──────────────────────────────────────────────────────────── */
type CertStatus = "compliant" | "expiring_soon" | "expiring_30" | "expired" | "missing";
type FilterType = "all" | "danger" | "warning" | "ok";

const BAFE_TYPES = ["design", "installation", "commissioning", "maintenance"] as const;
type BafeType = typeof BAFE_TYPES[number];

const TYPE_LABELS: Record<BafeType, string> = {
  design:        "Design",
  installation:  "Installation",
  commissioning: "Commissioning",
  maintenance:   "Maintenance",
};

interface SiteCertRow {
  site: Site;
  certs: Partial<Record<BafeType, BafeCertificate>>;
  overallStatus: CertStatus;
  soonestExpiry?: number; // days
}

/* ── Helpers ─────────────────────────────────────────────────────────── */
function certDays(cert?: BafeCertificate): number | null {
  if (!cert?.expiry_date) return null;
  const d = parseISO(cert.expiry_date);
  if (!isValid(d)) return null;
  return differenceInDays(d, new Date());
}

function siteStatus(row: SiteCertRow): CertStatus {
  const hasMissing = BAFE_TYPES.some((t) => !row.certs[t]);
  if (hasMissing) return "missing";

  const days = BAFE_TYPES.map((t) => certDays(row.certs[t])).filter((d): d is number => d !== null);
  const min  = Math.min(...days);

  if (min < 0)   return "expired";
  if (min <= 14) return "expiring_soon";
  if (min <= 30) return "expiring_30";
  return "compliant";
}

function getOverallStatus(row: SiteCertRow): CertStatus {
  return siteStatus(row);
}

/* ── Cert cell ───────────────────────────────────────────────────────── */
const CertCell = ({ cert, type }: { cert?: BafeCertificate; type: BafeType }) => {
  if (!cert) {
    return (
      <div className="flex flex-col items-start gap-0.5">
        <span className="cert-pill-missing">Missing</span>
      </div>
    );
  }

  const days = certDays(cert);
  const expiryStr = cert.expiry_date ? format(parseISO(cert.expiry_date), "dd MMM yyyy") : "No expiry";

  let pill = "cert-pill-ok";
  let label = expiryStr;

  if (days !== null) {
    if (days < 0)   { pill = "cert-pill-danger"; label = `Expired ${Math.abs(days)}d ago`; }
    else if (days <= 14) { pill = "cert-pill-danger"; label = `${days}d left`; }
    else if (days <= 30) { pill = "cert-pill-warn";   label = `${days}d left`; }
    else                 { pill = "cert-pill-ok";     label = expiryStr; }
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className={pill}>{label}</span>
      {cert.certificate_number && (
        <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
          {cert.certificate_number}
        </span>
      )}
    </div>
  );
};

/* ── Row status badge ────────────────────────────────────────────────── */
const StatusBadge = ({ status }: { status: CertStatus }) => {
  switch (status) {
    case "compliant":
      return <span className="badge-ok flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Compliant</span>;
    case "expiring_soon":
      return <span className="badge-danger flex items-center gap-1"><AlertTriangle className="w-3 h-3" />≤14 days</span>;
    case "expiring_30":
      return <span className="badge-warn flex items-center gap-1"><Clock className="w-3 h-3" />≤30 days</span>;
    case "expired":
      return <span className="badge-danger flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Expired</span>;
    case "missing":
      return <span className="badge-muted flex items-center gap-1"><Shield className="w-3 h-3" />Missing certs</span>;
  }
};

/* ── Summary stat card ───────────────────────────────────────────────── */
const SummaryCard = ({
  icon: Icon,
  label,
  value,
  color,
  active,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: "ok" | "warn" | "danger" | "muted";
  active?: boolean;
  onClick?: () => void;
}) => {
  const colorMap = {
    ok:     "bg-success/10 text-success",
    warn:   "bg-warning/10 text-warning",
    danger: "bg-destructive/10 text-destructive",
    muted:  "bg-muted text-muted-foreground",
  };
  const borderMap = {
    ok:     "border-success/20 hover:border-success/40",
    warn:   "border-warning/20 hover:border-warning/40",
    danger: "border-destructive/20 hover:border-destructive/40",
    muted:  "border-border hover:border-primary/20",
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-card rounded-xl border p-5 cursor-pointer transition-all",
        borderMap[color],
        active && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
    >
      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center mb-3", colorMap[color])}>
        <Icon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-1">{label}</p>
    </div>
  );
};

/* ── Main Page ───────────────────────────────────────────────────────── */
const CertTracker = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("all");

  const { data: certs = [], isLoading: certsLoading, refetch } = useQuery({
    queryKey: ["all-bafe-certs"],
    queryFn: getAllBafeCertificates,
  });

  const { data: sitesResult, isLoading: sitesLoading } = useQuery({
    queryKey: ["all-sites"],
    queryFn: async () => {
      const { data } = await supabase.from("sites").select("*").eq("status", "active").order("name");
      return (data || []) as Site[];
    },
  });

  const sites = sitesResult || [];
  const isLoading = certsLoading || sitesLoading;

  /* Build site→cert map */
  const rows: SiteCertRow[] = useMemo(() => {
    return sites.map((site) => {
      const siteCerts = certs.filter((c) => c.site_id === site.id);
      const certMap: Partial<Record<BafeType, BafeCertificate>> = {};
      BAFE_TYPES.forEach((t) => {
        const found = siteCerts
          .filter((c) => c.certificate_type === t)
          .sort((a, b) => new Date(b.issued_date).getTime() - new Date(a.issued_date).getTime())[0];
        if (found) certMap[t] = found;
      });
      const row: SiteCertRow = { site, certs: certMap, overallStatus: "compliant" };
      row.overallStatus = getOverallStatus(row);
      const days = BAFE_TYPES.map((t) => certDays(certMap[t])).filter((d): d is number => d !== null);
      row.soonestExpiry = days.length > 0 ? Math.min(...days) : undefined;
      return row;
    });
  }, [sites, certs]);

  /* Summary counts */
  const counts = {
    compliant:    rows.filter((r) => r.overallStatus === "compliant").length,
    expiring:     rows.filter((r) => r.overallStatus === "expiring_30" || r.overallStatus === "expiring_soon").length,
    expired:      rows.filter((r) => r.overallStatus === "expired").length,
    missing:      rows.filter((r) => r.overallStatus === "missing").length,
  };

  /* Filter + search */
  const filtered = rows
    .filter((r) => {
      if (filterType === "danger")  return r.overallStatus === "expired" || r.overallStatus === "expiring_soon";
      if (filterType === "warning") return r.overallStatus === "expiring_30";
      if (filterType === "ok")      return r.overallStatus === "compliant";
      return true;
    })
    .filter((r) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return r.site.name.toLowerCase().includes(q) || r.site.address?.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      // Sort: expired first, then expiring, then missing, then compliant
      const order: Record<CertStatus, number> = {
        expired: 0, expiring_soon: 1, expiring_30: 2, missing: 3, compliant: 4,
      };
      return order[a.overallStatus] - order[b.overallStatus];
    });

  return (
    <DashboardLayout>
      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="page-title flex items-center gap-2">
              <Award className="w-6 h-6 text-primary" />
              Certificate Tracker
            </h2>
            <p className="page-subtitle">BAFE SP203-1 compliance across all sites</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} className="text-xs">
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard
            icon={CheckCircle2}
            label="Fully Compliant"
            value={counts.compliant}
            color="ok"
            active={filterType === "ok"}
            onClick={() => setFilterType(filterType === "ok" ? "all" : "ok")}
          />
          <SummaryCard
            icon={Clock}
            label="Expiring ≤30 days"
            value={counts.expiring}
            color="warn"
            active={filterType === "warning"}
            onClick={() => setFilterType(filterType === "warning" ? "all" : "warning")}
          />
          <SummaryCard
            icon={AlertTriangle}
            label="Expired / ≤14d"
            value={counts.expired}
            color="danger"
            active={filterType === "danger"}
            onClick={() => setFilterType(filterType === "danger" ? "all" : "danger")}
          />
          <SummaryCard
            icon={Shield}
            label="Missing Certs"
            value={counts.missing}
            color="muted"
            onClick={() => setFilterType("all")}
          />
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by site name or address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-card border-border"
          />
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 bg-card rounded-xl border border-border animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                    Site
                  </th>
                  {BAFE_TYPES.map((t) => (
                    <th
                      key={t}
                      className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap"
                    >
                      {TYPE_LABELS[t]}
                    </th>
                  ))}
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                      No sites found
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => (
                    <tr
                      key={row.site.id}
                      className={cn(
                        "border-b border-border/60 hover:bg-muted/30 transition-colors cursor-pointer last:border-0",
                        (row.overallStatus === "expired" || row.overallStatus === "expiring_soon") &&
                          "bg-destructive/4 hover:bg-destructive/8"
                      )}
                      onClick={() => navigate(`/sites/${row.site.id}`)}
                    >
                      <td className="px-5 py-4">
                        <p className="font-semibold text-foreground text-sm">{row.site.name}</p>
                        {row.site.address && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[200px]">
                            {row.site.address}
                          </p>
                        )}
                      </td>

                      {BAFE_TYPES.map((t) => (
                        <td key={t} className="px-4 py-4">
                          <CertCell cert={row.certs[t]} type={t} />
                        </td>
                      ))}

                      <td className="px-4 py-4">
                        <StatusBadge status={row.overallStatus} />
                      </td>

                      <td className="px-4 py-4">
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/sites/${row.site.id}`); }}
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Context / guidance */}
        <div className="grid md:grid-cols-2 gap-4 pt-2">
          <div className="section-card">
            <p className="section-card-title">BAFE SP203-1 Certificate Types</p>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex items-start gap-2">
                <Award className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                <div><span className="text-foreground font-medium">Design</span> — System design approved by BAFE-registered designer</div>
              </div>
              <div className="flex items-start gap-2">
                <Award className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                <div><span className="text-foreground font-medium">Installation</span> — Physical installation certified to BS 5839-1</div>
              </div>
              <div className="flex items-start gap-2">
                <Award className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                <div><span className="text-foreground font-medium">Commissioning</span> — System fully tested and operational</div>
              </div>
              <div className="flex items-start gap-2">
                <Award className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                <div><span className="text-foreground font-medium">Maintenance</span> — Annual maintenance carried out by BAFE-registered company</div>
              </div>
            </div>
          </div>

          <div className="new-feature-callout">
            <p className="new-feature-label">✦ Suggested next step</p>
            <p className="text-sm font-semibold text-foreground mb-1">Automated Cert Renewal Reminders</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              When a BAFE certificate is 60 days from expiry, automatically email the client and create a draft visit in the schedule. No manual tracking needed — the system chases renewals for you.
            </p>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
};

export default CertTracker;
