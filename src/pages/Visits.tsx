import DashboardLayout from "@/components/dashboard/DashboardLayout";
import VisitsTable from "@/components/visits/VisitsTable";
import VisitFormDialog from "@/components/visits/VisitFormDialog";
import { OutstandingInvoices } from "@/components/xero/OutstandingInvoices";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Filter, Plus, ClipboardList, Receipt } from "lucide-react";
import { useVisits } from "@/hooks/useVisits";
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
  const [activeTab, setActiveTab] = useState("visits");
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
            <h2 className="text-2xl font-bold text-foreground">Visits & Invoices</h2>
            <p className="text-muted-foreground">Manage service visits and track invoices</p>
          </div>
          {activeTab === "visits" && (
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
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="visits" className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4" />
              Visits
            </TabsTrigger>
            <TabsTrigger value="invoices" className="flex items-center gap-2">
              <Receipt className="w-4 h-4" />
              Outstanding Invoices
            </TabsTrigger>
          </TabsList>

          <TabsContent value="visits" className="mt-6">
            <VisitsTable 
              visits={visits} 
              loading={loading} 
              onRefresh={refetch} 
              initialEditVisitId={initialVisitId || undefined}
              onInitialVisitOpened={handleVisitOpened}
            />
          </TabsContent>

          <TabsContent value="invoices" className="mt-6">
            <OutstandingInvoices />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Visits;
