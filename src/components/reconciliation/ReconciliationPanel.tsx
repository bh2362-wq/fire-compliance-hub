import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, GitCompare, AlertCircle } from "lucide-react";
import { getSites, getSiteUploads, reconcileDevices, ReconciliationResult } from "@/services/reconciliationService";
import ReconciliationResults from "./ReconciliationResults";
import ReconciliationSkeleton from "./ReconciliationSkeleton";
import { useToast } from "@/hooks/use-toast";

interface ReconciliationPanelProps {
  initialSiteId?: string;
  initialUploadId?: string;
}

interface Upload {
  id: string;
  file_name: string;
  created_at: string;
  devices_found: number | null;
  site_id: string | null;
  site_name?: string;
}

const ReconciliationPanel = ({ initialSiteId, initialUploadId }: ReconciliationPanelProps) => {
  const [sites, setSites] = useState<{ id: string; name: string; total_devices: number | null }[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [selectedSite, setSelectedSite] = useState<string>(initialSiteId || "");
  const [selectedUpload, setSelectedUpload] = useState<string>(initialUploadId || "");
  const [loading, setLoading] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const { toast } = useToast();

  // Load sites and uploads on mount
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      
      const [sitesResult, uploadsResult] = await Promise.all([
        getSites(),
        getSiteUploads(initialSiteId), // Load uploads for initial site or all uploads
      ]);

      if (sitesResult.error) {
        toast({
          title: "Error loading sites",
          description: sitesResult.error.message,
          variant: "destructive",
        });
      } else {
        setSites(sitesResult.sites);
      }

      if (uploadsResult.error) {
        toast({
          title: "Error loading uploads",
          description: uploadsResult.error.message,
          variant: "destructive",
        });
      } else {
        setUploads(uploadsResult.uploads);
        if (initialUploadId && uploadsResult.uploads.some(u => u.id === initialUploadId)) {
          setSelectedUpload(initialUploadId);
        }
      }

      setLoading(false);
    };
    loadData();
  }, [initialSiteId, initialUploadId, toast]);

  // Load uploads when site filter changes (after initial load)
  useEffect(() => {
    // Skip if this is initial load (handled above)
    if (loading) return;

    const loadUploads = async () => {
      const siteToFilter = selectedSite === "all" ? undefined : selectedSite || undefined;
      const { uploads: uploadData, error } = await getSiteUploads(siteToFilter);
      
      if (error) {
        toast({
          title: "Error loading uploads",
          description: error.message,
          variant: "destructive",
        });
      } else {
        setUploads(uploadData);
        // Reset upload selection if it's no longer in the list
        if (selectedUpload && !uploadData.some(u => u.id === selectedUpload)) {
          setSelectedUpload("");
        }
      }
    };
    loadUploads();
  }, [selectedSite, loading, toast]);

  // Auto-run reconciliation when both initial parameters are provided
  useEffect(() => {
    if (initialSiteId && initialUploadId && selectedUpload === initialUploadId && !result && !reconciling && !loading) {
      handleReconcile();
    }
  }, [selectedUpload, initialSiteId, initialUploadId, result, reconciling, loading]);

  const handleReconcile = async () => {
    if (!selectedUpload) return;

    // Get site_id from the selected upload if not explicitly selected
    const upload = uploads.find(u => u.id === selectedUpload);
    const siteId = selectedSite && selectedSite !== "all" ? selectedSite : upload?.site_id;

    if (!siteId) {
      toast({
        title: "Site required",
        description: "The selected upload must be associated with a site for reconciliation.",
        variant: "destructive",
      });
      return;
    }

    setReconciling(true);
    setResult(null);

    const { result: reconciliationResult, error } = await reconcileDevices(siteId, selectedUpload);

    if (error) {
      toast({
        title: "Reconciliation failed",
        description: error.message,
        variant: "destructive",
      });
    } else if (reconciliationResult) {
      setResult(reconciliationResult);
      toast({
        title: "Reconciliation complete",
        description: `Matched ${reconciliationResult.summary.matched} devices with ${reconciliationResult.coverage}% coverage`,
      });
    }

    setReconciling(false);
  };

  // Filter uploads based on selected site
  const filteredUploads = selectedSite && selectedSite !== "all" 
    ? uploads.filter(u => u.site_id === selectedSite)
    : uploads;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Selection Panel */}
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <GitCompare className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Device Reconciliation</h3>
            <p className="text-sm text-muted-foreground">
              Compare parsed test results against site inventory
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Site <span className="text-muted-foreground font-normal">(optional filter)</span>
            </label>
            <Select value={selectedSite} onValueChange={setSelectedSite}>
              <SelectTrigger>
                <SelectValue placeholder="All sites" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sites</SelectItem>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.name} ({site.total_devices || 0} devices)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Upload to Compare</label>
            <Select
              value={selectedUpload}
              onValueChange={setSelectedUpload}
              disabled={filteredUploads.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an upload" />
              </SelectTrigger>
              <SelectContent>
                {filteredUploads.length === 0 ? (
                  <SelectItem value="none" disabled>No uploads available</SelectItem>
                ) : (
                  filteredUploads.map((upload) => (
                    <SelectItem key={upload.id} value={upload.id}>
                      {upload.file_name} ({upload.devices_found || 0} devices)
                      {!selectedSite || selectedSite === "all" ? ` - ${upload.site_name}` : ""}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <Button
              variant="hero"
              onClick={handleReconcile}
              disabled={!selectedUpload || reconciling}
              className="w-full"
            >
              {reconciling ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Reconciling...
                </>
              ) : (
                <>
                  <GitCompare className="w-4 h-4 mr-2" />
                  Reconcile
                </>
              )}
            </Button>
          </div>
        </div>

        {uploads.length === 0 && !loading && (
          <div className="mt-4 p-4 bg-warning/10 border border-warning/20 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-warning">No uploads found</p>
              <p className="text-sm text-muted-foreground">
                Upload test results to a site before reconciling.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Loading Skeleton */}
      {reconciling && <ReconciliationSkeleton />}

      {/* Results */}
      {result && !reconciling && <ReconciliationResults result={result} />}
    </div>
  );
};

export default ReconciliationPanel;
