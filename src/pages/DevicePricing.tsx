import { useState, useEffect } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Upload, Trash2, ArrowRight, Package } from "lucide-react";
import { getPriceLists, deletePriceList, DevicePriceList } from "@/services/devicePricingService";
import { toast } from "sonner";
import { format } from "date-fns";
import { DevicePricingWorkbench } from "@/components/device-pricing/DevicePricingWorkbench";
import { ImportDeviceReportDialog } from "@/components/device-pricing/ImportDeviceReportDialog";

export default function DevicePricing() {
  const [priceLists, setPriceLists] = useState<DevicePriceList[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const fetchLists = async () => {
    setLoading(true);
    const { data, error } = await getPriceLists();
    if (error) toast.error("Failed to load price lists");
    setPriceLists(data);
    setLoading(false);
  };

  useEffect(() => { fetchLists(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this price list and all its items?")) return;
    const { error } = await deletePriceList(id);
    if (error) toast.error("Failed to delete");
    else { toast.success("Deleted"); fetchLists(); if (selectedListId === id) setSelectedListId(null); }
  };

  if (selectedListId) {
    return (
      <DashboardLayout>
        <DevicePricingWorkbench
          priceListId={selectedListId}
          onBack={() => { setSelectedListId(null); fetchLists(); }}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Device Pricing</h1>
            <p className="text-muted-foreground">Upload device health reports, get AI-powered pricing, and generate quotations</p>
          </div>
          <Button onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" /> Import Device Report
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3].map(i => <Card key={i} className="animate-pulse h-40" />)}
          </div>
        ) : priceLists.length === 0 ? (
          <Card className="p-12 text-center">
            <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Price Lists Yet</h3>
            <p className="text-muted-foreground mb-4">Import a Gent device health report to get started with AI-powered pricing.</p>
            <Button onClick={() => setImportOpen(true)}>
              <Upload className="mr-2 h-4 w-4" /> Import Report
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {priceLists.map(list => (
              <Card key={list.id} className="hover:border-primary/50 transition-colors cursor-pointer" onClick={() => setSelectedListId(list.id)}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{list.name}</CardTitle>
                    <Badge variant={list.status === 'priced' ? 'default' : 'secondary'}>
                      {list.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {list.source_file_name && (
                    <p className="text-xs text-muted-foreground truncate">{list.source_file_name}</p>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{list.total_items} devices</span>
                    {list.total_sell > 0 && (
                      <span className="font-medium">£{Number(list.total_sell).toFixed(2)}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(list.created_at), "dd MMM yyyy")}
                    </span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleDelete(list.id); }}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <ImportDeviceReportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={(id) => { setImportOpen(false); setSelectedListId(id); fetchLists(); }}
      />
    </DashboardLayout>
  );
}
