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

const ReconciliationPanel = ({ initialSiteId, initialUploadId }: ReconciliationPanelProps) => {
  const [sites, setSites] = useState<{ id: string; name: string; total_devices: number | null }[]>([]);
  const [uploads, setUploads] = useState<{ id: string; file_name: string; created_at: string; devices_found: number | null }[]>([]);
  const [selectedSite, setSelectedSite] = useState<string>(initialSiteId || "");
  const [selectedUpload, setSelectedUpload] = useState<string>(initialUploadId || "");
  const [loading, setLoading] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const { toast } = useToast();

  // Load sites on mount
  useEffect(() => {
    const loadSites = async () => {
      setLoading(true);
      const { sites: siteData, error } = await getSites();
      if (error) {
        toast({
          title: "Error loading sites",
          description: error.message,
          variant: "destructive",
        });
      } else {
        setSites(siteData);
      }
      setLoading(false);
    };
    loadSites();
  }, [toast]);

  // Load uploads when site changes
  useEffect(() => {
    if (!selectedSite) {
      setUploads([]);
      setSelectedUpload("");
      return;
    }

    const loadUploads = async () => {
      const { uploads: uploadData, error } = await getSiteUploads(selectedSite);
      if (error) {
        toast({
          title: "Error loading uploads",
          description: error.message,
          variant: "destructive",
        });
      } else {
        setUploads(uploadData);
        if (initialUploadId && uploadData.some(u => u.id === initialUploadId)) {
          setSelectedUpload(initialUploadId);
        } else {
          setSelectedUpload("");
        }
      }
    };
    loadUploads();
  }, [selectedSite, initialUploadId, toast]);

  // Auto-run reconciliation when both initial parameters are provided
  useEffect(() => {
    if (initialSiteId && initialUploadId && selectedSite === initialSiteId && selectedUpload === initialUploadId && !result && !reconciling) {
      handleReconcile();
    }
  }, [selectedSite, selectedUpload, initialSiteId, initialUploadId, result, reconciling]);

  const handleReconcile = async () => {
    if (!selectedSite || !selectedUpload) return;

    setReconciling(true);
    setResult(null);

    const { result: reconciliationResult, error } = await reconcileDevices(selectedSite, selectedUpload);

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
            <label className="text-sm font-medium text-foreground">Site</label>
            <Select value={selectedSite} onValueChange={setSelectedSite}>
              <SelectTrigger>
                <SelectValue placeholder="Select a site" />
              </SelectTrigger>
              <SelectContent>
                {sites.length === 0 ? (
                  <SelectItem value="none" disabled>No sites available</SelectItem>
                ) : (
                  sites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name} ({site.total_devices || 0} devices)
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Upload to Compare</label>
            <Select
              value={selectedUpload}
              onValueChange={setSelectedUpload}
              disabled={!selectedSite || uploads.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={selectedSite ? "Select an upload" : "Select a site first"} />
              </SelectTrigger>
              <SelectContent>
                {uploads.length === 0 ? (
                  <SelectItem value="none" disabled>No uploads for this site</SelectItem>
                ) : (
                  uploads.map((upload) => (
                    <SelectItem key={upload.id} value={upload.id}>
                      {upload.file_name} ({upload.devices_found || 0} devices)
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
              disabled={!selectedSite || !selectedUpload || reconciling}
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

        {sites.length === 0 && !loading && (
          <div className="mt-4 p-4 bg-warning/10 border border-warning/20 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-warning">No sites found</p>
              <p className="text-sm text-muted-foreground">
                Add sites and their device inventory before reconciling uploads.
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
