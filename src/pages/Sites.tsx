import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import SiteFormDialog from "@/components/sites/SiteFormDialog";
import DeviceImportDialog from "@/components/sites/DeviceImportDialog";
import DeleteSiteDialog from "@/components/sites/DeleteSiteDialog";
import { Site, getSites } from "@/services/siteService";
import { getAllBafeCertificates, BafeCertificate } from "@/services/bafeCertificateService";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, MapPin, Cpu, Plus, Search, MoreHorizontal,
  Pencil, Trash2, Upload, Eye, Award, AlertTriangle, CheckCircle2,
  Clock, Filter
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { differenceInDays, parseISO } from "date-fns";

/* ── Types ──────────────────────────────────────────────────────────── */
type StatusFilter = "all" | "active" | "cert_alert" | "needs_visit";

interface SiteWithCompliance extends Site {
  certStatus: "compliant" | "expiring" | "expired" | "missing";
  daysUntilExpiry?: number;
}

/* ── Cert status helpers ─────────────────────────────────────────────── */
const BAFE_TYPES = ["design", "installation", "commissioning", "maintenance"];

function getSiteCertStatus(
  siteId: string,
  certs: BafeCertificate[]
): { status: SiteWithCompliance["certStatus"]; daysUntilExpiry?: number } {
  const siteCerts = certs.filter((c) => c.site_id === siteId);
  const hasAllTypes = BAFE_TYPES.every((t) => siteCerts.some((c) => c.certificate_type === t));

  if (!hasAllTypes) return { status: "missing" };

  const soonest = siteCerts
    .filter((c) => c.expiry_date)
    .map((c) => differenceInDays(parseISO(c.expiry_date!), new Date()))
    .sort((a, b) => a - b)[0];

  if (soonest === undefined) return { status: "compliant" };
  if (soonest < 0)  return { status: "expired",  daysUntilExpiry: soonest };
  if (soonest <= 30) return { status: "expiring", daysUntilExpiry: soonest };
  return { status: "compliant", daysUntilExpiry: soonest };
}

/* ── Status badge ────────────────────────────────────────────────────── */
const CertBadge = ({ status, days }: { status: SiteWithCompliance["certStatus"]; days?: number }) => {
  if (status === "compliant") {
    return (
      <span className="badge-ok flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3" />
        Valid
      </span>
    );
  }
  if (status === "expiring") {
    return (
      <span className="badge-warn flex items-center gap-1">
        <Clock className="w-3 h-3" />
        {days !== undefined ? `${days}d` : "Expiring"}
      </span>
    );
  }
  if (status === "expired") {
    return (
      <span className="badge-danger flex items-center gap-1">
        <AlertTriangle className="w-3 h-3" />
        Expired
      </span>
    );
  }
  return (
    <span className="badge-muted flex items-center gap-1">
      <Award className="w-3 h-3" />
      Missing
    </span>
  );
};

/* ── Site card ───────────────────────────────────────────────────────── */
const SiteCard = ({
  site,
  onEdit,
  onDelete,
  onImport,
}: {
  site: SiteWithCompliance;
  onEdit: (s: Site) => void;
  onDelete: (s: Site) => void;
  onImport: (s: Site) => void;
}) => {
  const navigate = useNavigate();

  return (
    <div
      className={cn(
        "bg-card rounded-xl border border-border p-5 flex flex-col gap-4",
        "hover:border-primary/25 transition-all duration-200 cursor-pointer",
        site.certStatus === "expired"  && "border-destructive/20 hover:border-destructive/40",
        site.certStatus === "expiring" && "border-warning/20 hover:border-warning/40"
      )}
      onClick={() => navigate(`/sites/${site.id}`)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground text-sm leading-snug truncate">
            {site.name}
          </h3>
          {site.address && (
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              {site.address}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <CertBadge status={site.certStatus} days={site.daysUntilExpiry} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/sites/${site.id}`); }}>
                <Eye className="w-4 h-4 mr-2" />View Site
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(site); }}>
                <Pencil className="w-4 h-4 mr-2" />Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onImport(site); }}>
                <Upload className="w-4 h-4 mr-2" />Import Devices
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); onDelete(site); }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Cpu className="w-3.5 h-3.5" />
          {site.total_devices ?? "—"} devices
        </span>
        {site.status && site.status !== "active" && (
          <span className="badge-muted capitalize">{site.status}</span>
        )}
      </div>
    </div>
  );
};

/* ── Main Sites page ─────────────────────────────────────────────────── */
const Sites = () => {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<StatusFilter>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [siteToDelete, setSiteToDelete] = useState<Site | null>(null);
  const { toast } = useToast();

  const { data: bafeCerts = [] } = useQuery({
    queryKey: ["all-bafe-certs"],
    queryFn: getAllBafeCertificates,
  });

  const loadSites = async () => {
    setLoading(true);
    const { sites: data, error } = await getSites();
    if (error) {
      toast({ title: "Error loading sites", description: error.message, variant: "destructive" });
    } else {
      setSites(data);
    }
    setLoading(false);
  };

  useEffect(() => { loadSites(); }, []);

  /* Enrich sites with cert status */
  const enriched: SiteWithCompliance[] = sites.map((s) => {
    const { status, daysUntilExpiry } = getSiteCertStatus(s.id, bafeCerts);
    return { ...s, certStatus: status, daysUntilExpiry };
  });

  /* Filter counts */
  const counts = {
    all:        enriched.length,
    active:     enriched.filter((s) => s.status === "active").length,
    cert_alert: enriched.filter((s) => s.certStatus === "expired" || s.certStatus === "expiring").length,
    needs_visit: enriched.filter((s) => s.certStatus === "missing").length,
  };

  /* Apply filters */
  const filtered = enriched
    .filter((s) => {
      if (activeFilter === "active")     return s.status === "active";
      if (activeFilter === "cert_alert") return s.certStatus === "expired" || s.certStatus === "expiring";
      if (activeFilter === "needs_visit") return s.certStatus === "missing";
      return true;
    })
    .filter((s) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        s.address?.toLowerCase().includes(q) ||
        s.postcode?.toLowerCase().includes(q)
      );
    });

  const filterTabs: { key: StatusFilter; label: string; count: number }[] = [
    { key: "all",         label: "All Sites",    count: counts.all },
    { key: "active",      label: "Active",       count: counts.active },
    { key: "cert_alert",  label: "Cert Alert",   count: counts.cert_alert },
    { key: "needs_visit", label: "Needs Visit",  count: counts.needs_visit },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="page-title">Sites</h2>
            <p className="page-subtitle">
              {enriched.length} fire alarm installation{enriched.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Button
            onClick={() => { setSelectedSite(null); setFormOpen(true); }}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-md"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Site
          </Button>
        </div>

        {/* Search + filter bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, address, postcode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-card border-border"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                  activeFilter === tab.key
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "bg-card text-muted-foreground border-border hover:border-primary/20 hover:text-foreground"
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    "ml-1.5 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                    activeFilter === tab.key
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Site grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-card rounded-xl border border-border p-5 h-32 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">
              {searchQuery ? "No sites match your search" : "No sites found"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((site) => (
              <SiteCard
                key={site.id}
                site={site}
                onEdit={(s) => { setSelectedSite(s); setFormOpen(true); }}
                onDelete={(s) => { setSiteToDelete(s); setDeleteDialogOpen(true); }}
                onImport={(s) => { setSelectedSite(s); setImportOpen(true); }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <SiteFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        site={selectedSite}
        onSuccess={() => { loadSites(); setFormOpen(false); }}
      />
      {selectedSite && (
        <DeviceImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          site={selectedSite}
          onSuccess={() => { loadSites(); setImportOpen(false); }}
        />
      )}
      {siteToDelete && (
        <DeleteSiteDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          siteName={siteToDelete.name}
          siteId={siteToDelete.id}
          onSuccess={() => { loadSites(); setDeleteDialogOpen(false); setSiteToDelete(null); }}
        />
      )}
    </DashboardLayout>
  );
};

export default Sites;
