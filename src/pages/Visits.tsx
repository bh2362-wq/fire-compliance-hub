import DashboardLayout from "@/components/dashboard/DashboardLayout";
import VisitsTable from "@/components/visits/VisitsTable";
import VisitFormDialog from "@/components/visits/VisitFormDialog";
import { AISweepDialog } from "@/components/visits/AISweepDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Sparkles, Search, Filter, AlertTriangle, Calendar } from "lucide-react";
import { Link } from "react-router-dom";
import { useVisits } from "@/hooks/useVisits";
import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Site { id: string; name: string; }
type StatusFilter = "all" | "scheduled" | "in_progress" | "completed" | "open";

const Visits = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [sites, setSites] = useState<Site[]>([]);
  const [showAISweep, setShowAISweep] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const initialVisitId = searchParams.get("visitId");

  const { visits, loading, refetch } = useVisits({
    siteId: selectedSiteId && selectedSiteId !== "all" ? selectedSiteId : undefined,
  });

  const handleVisitOpened = () => {
    if (initialVisitId) {
      searchParams.delete("visitId");
      setSearchParams(searchParams, { replace: true });
    }
  };

  useEffect(() => {
    const fetchSites = async () => {
      const { data } = await supabase
        .from("sites").select("id, name").eq("status", "active").order("name");
      if (data) setSites(data);
    };
    fetchSites();
  }, []);

  /* Status counts for filter tabs */
  const counts = useMemo(() => ({
    all:         visits.length,
    scheduled:   visits.filter((v) => v.status === "scheduled").length,
    in_progress: visits.filter((v) => v.status === "in_progress").length,
    completed:   visits.filter((v) => v.status === "completed").length,
    open:        visits.filter((v) => ["scheduled","in_progress","pending_review"].includes(v.status)).length,
  }), [visits]);

  const statusTabs: { key: StatusFilter; label: string }[] = [
    { key: "all",         label: "All" },
    { key: "scheduled",   label: "Scheduled" },
    { key: "in_progress", label: "In Progress" },
    { key: "open",        label: "Open" },
    { key: "completed",   label: "Completed" },
  ];

  const openCount = counts.open;

  const filteredVisits = useMemo(() => {
    if (statusFilter === "all") return visits;
    if (statusFilter === "open") {
      return visits.filter((v) => ["scheduled", "in_progress", "pending_review"].includes(v.status));
    }
    return visits.filter((v) => v.status === statusFilter);
  }, [visits, statusFilter]);

  return (
    <DashboardLayout>
      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="page-title">Visits</h2>
            <p className="page-subtitle">Service visits and job management</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAISweep(true)}
              className="hidden sm:flex items-center gap-1.5 text-xs"
            >
              <Sparkles className="w-3.5 h-3.5" />
              AI Sweep
            </Button>
            <VisitFormDialog
              siteId={selectedSiteId && selectedSiteId !== "all" ? selectedSiteId : undefined}
              siteName={sites.find((s) => s.id === selectedSiteId)?.name}
              sites={sites}
              onVisitCreated={refetch}
              trigger={
                <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-md text-sm h-9">
                  <Plus className="w-4 h-4 mr-1.5" />
                  New Visit
                </Button>
              }
            />
          </div>
        </div>

        {/* Open visits alert */}
        {openCount > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-destructive/8 border-destructive/20 text-destructive text-sm font-medium">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>
              {openCount} open visit{openCount !== 1 ? "s" : ""} awaiting completion
            </span>
          </div>
        )}

        {/* Filter row */}
        <div className="flex items-center gap-0 border-b border-border -mb-px">
          {/* Status filter tabs — underline style */}
          <div className="flex items-center">
            {statusTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap",
                  statusFilter === tab.key
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                  tab.key === "open" && statusFilter !== "open" && counts.open > 0
                    && "text-destructive"
                )}
              >
                {tab.label}
                <span className={cn(
                  "ml-1.5 text-[11px]",
                  statusFilter === tab.key ? "text-muted-foreground" : "text-muted-foreground/60"
                )}>
                  {counts[tab.key]}
                </span>
              </button>
            ))}
          </div>

          {/* Site filter */}
          <div className="ml-auto pb-1">
            <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
              <SelectTrigger className="w-[180px] bg-card border-border text-sm h-8">
                <Filter className="w-3 h-3 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Filter by site" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sites</SelectItem>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Visits table */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <VisitsTable
            visits={filteredVisits}
            loading={loading}
            onRefresh={refetch}
            initialEditVisitId={initialVisitId || undefined}
            onInitialVisitOpened={handleVisitOpened}
          />
        </div>
      </div>

      <AISweepDialog open={showAISweep} onOpenChange={setShowAISweep} />
    </DashboardLayout>
  );
};

export default Visits;
