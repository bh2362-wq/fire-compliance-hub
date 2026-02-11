import DashboardLayout from "@/components/dashboard/DashboardLayout";
import VisitsTable from "@/components/visits/VisitsTable";
import VisitFormDialog from "@/components/visits/VisitFormDialog";
import { Button } from "@/components/ui/button";
import { Filter, Plus, Sparkles } from "lucide-react";
import { useVisits } from "@/hooks/useVisits";
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AISweepDialog } from "@/components/visits/AISweepDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Site {
  id: string;
  name: string;
}

const Visits = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [sites, setSites] = useState<Site[]>([]);
  const [showAISweep, setShowAISweep] = useState(false);
  const initialVisitId = searchParams.get("visitId");
  const { visits, loading, refetch } = useVisits({
    siteId: selectedSiteId && selectedSiteId !== "all" ? selectedSiteId : undefined,
  });

  // Clear the visitId from URL after it's been used
  const handleVisitOpened = () => {
    if (initialVisitId) {
      searchParams.delete("visitId");
      setSearchParams(searchParams, { replace: true });
    }
  };

  useEffect(() => {
    const fetchSites = async () => {
      const { data } = await supabase
        .from("sites")
        .select("id, name")
        .eq("status", "active")
        .order("name");
      if (data) setSites(data);
    };
    fetchSites();
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Visits</h2>
            <p className="text-muted-foreground">Manage service visits</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
              <SelectTrigger className="w-[200px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filter by site" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sites</SelectItem>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => setShowAISweep(true)}>
              <Sparkles className="w-4 h-4 mr-2" />
              AI Sweep
            </Button>
            <VisitFormDialog
              siteId={selectedSiteId && selectedSiteId !== "all" ? selectedSiteId : undefined}
              siteName={sites.find((s) => s.id === selectedSiteId)?.name}
              sites={sites}
              onVisitCreated={refetch}
              trigger={
                <Button variant="hero" size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  New Visit
                </Button>
              }
            />
          </div>
        </div>

        {/* Visits Table */}
        <VisitsTable 
          visits={visits} 
          loading={loading} 
          onRefresh={refetch} 
          initialEditVisitId={initialVisitId || undefined}
          onInitialVisitOpened={handleVisitOpened}
        />

        <AISweepDialog open={showAISweep} onOpenChange={setShowAISweep} />
      </div>
    </DashboardLayout>
  );
};

export default Visits;
