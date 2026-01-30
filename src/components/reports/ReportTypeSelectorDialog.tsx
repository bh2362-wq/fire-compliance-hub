import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, Wind, Server, Flame, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ServiceReportDialog } from "./ServiceReportDialog";
import { ASDReportDialog } from "./ASDReportDialog";

interface VisitForReport {
  id: string;
  visit_type: string;
  visit_date: string;
  site_id: string;
  sites?: { name: string } | null;
}

interface ContractAsset {
  id: string;
  item_name: string;
  item_type: string | null;
  manufacturer: string | null;
  model: string | null;
  location: string | null;
  service_type: string;
}

interface ReportTypeSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visit: VisitForReport;
  onSuccess?: () => void;
}

export function ReportTypeSelectorDialog({
  open,
  onOpenChange,
  visit,
  onSuccess,
}: ReportTypeSelectorDialogProps) {
  const [loading, setLoading] = useState(true);
  const [fireAssets, setFireAssets] = useState<ContractAsset[]>([]);
  const [asdAssets, setAsdAssets] = useState<ContractAsset[]>([]);

  // Sub-dialog states
  const [showFireReport, setShowFireReport] = useState(false);
  const [showAsdReport, setShowAsdReport] = useState(false);
  const [selectedAsdAsset, setSelectedAsdAsset] = useState<ContractAsset | null>(null);

  useEffect(() => {
    if (open) {
      loadAssets();
    }
  }, [open, visit.site_id]);

  const loadAssets = async () => {
    setLoading(true);
    try {
      // Get all contracts for this site
      const { data: contracts } = await supabase
        .from("site_service_contracts")
        .select("id, service_type")
        .eq("site_id", visit.site_id);

      if (!contracts || contracts.length === 0) {
        setLoading(false);
        return;
      }

      const contractIds = contracts.map((c) => c.id);
      const contractTypeMap = new Map(contracts.map((c) => [c.id, c.service_type]));

      // Get all assets for these contracts
      const { data: assets } = await supabase
        .from("contract_assets")
        .select("id, item_name, item_type, manufacturer, model, location, contract_id")
        .in("contract_id", contractIds);

      if (assets) {
        const enrichedAssets = assets.map((a) => ({
          ...a,
          service_type: contractTypeMap.get(a.contract_id) || "Unknown",
        }));

        // Separate fire panels and ASD units
        const fire = enrichedAssets.filter(
          (a) => a.service_type === "Fire" && 
                 (a.item_type?.toLowerCase().includes("panel") || 
                  a.item_type?.toLowerCase().includes("control"))
        );
        const asd = enrichedAssets.filter(
          (a) => a.service_type === "Aspirator" ||
                 a.item_type?.toLowerCase().includes("asd") ||
                 a.item_type?.toLowerCase().includes("aspirat")
        );

        setFireAssets(fire);
        setAsdAssets(asd);
      }
    } catch (error) {
      console.error("Failed to load assets:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFireReportClick = () => {
    setShowFireReport(true);
    onOpenChange(false);
  };

  const handleAsdClick = (asset: ContractAsset) => {
    setSelectedAsdAsset(asset);
    setShowAsdReport(true);
    onOpenChange(false);
  };

  const handleSubDialogClose = () => {
    setShowFireReport(false);
    setShowAsdReport(false);
    setSelectedAsdAsset(null);
  };

  const handleSubDialogSuccess = () => {
    handleSubDialogClose();
    onSuccess?.();
  };

  // If no assets, go straight to fire report
  useEffect(() => {
    if (!loading && fireAssets.length === 0 && asdAssets.length === 0) {
      handleFireReportClick();
    }
  }, [loading, fireAssets, asdAssets]);

  // Render sub-dialogs
  if (showFireReport) {
    return (
      <ServiceReportDialog
        open={true}
        onOpenChange={(open) => {
          if (!open) handleSubDialogClose();
        }}
        visit={visit}
        onSuccess={handleSubDialogSuccess}
      />
    );
  }

  if (showAsdReport && selectedAsdAsset) {
    return (
      <ASDReportDialog
        open={true}
        onOpenChange={(open) => {
          if (!open) handleSubDialogClose();
        }}
        visit={visit}
        asset={selectedAsdAsset}
        onSuccess={handleSubDialogSuccess}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Select Report Type
          </DialogTitle>
          <DialogDescription>
            Choose which service report to create for this visit
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Fire Alarm Report */}
            <Button
              variant="outline"
              className="w-full h-auto p-4 flex items-start justify-between"
              onClick={handleFireReportClick}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
                  <Flame className="w-5 h-5 text-destructive" />
                </div>
                <div className="text-left">
                  <div className="font-medium">Fire Alarm Report</div>
                  <div className="text-sm text-muted-foreground">
                    BS5839:2025 compliant service report
                  </div>
                  {fireAssets.length > 1 && (
                    <Badge variant="secondary" className="mt-1">
                      <Server className="w-3 h-3 mr-1" />
                      {fireAssets.length} panels
                    </Badge>
                  )}
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </Button>

            {/* ASD Reports */}
            {asdAssets.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground px-1">
                  Aspirating Smoke Detection (ASD)
                </h4>
                {asdAssets.map((asset) => (
                  <Button
                    key={asset.id}
                    variant="outline"
                    className="w-full h-auto p-4 flex items-start justify-between"
                    onClick={() => handleAsdClick(asset)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Wind className="w-5 h-5 text-primary" />
                      </div>
                      <div className="text-left">
                        <div className="font-medium">{asset.item_name}</div>
                        <div className="text-sm text-muted-foreground">
                          {asset.manufacturer && `${asset.manufacturer} `}
                          {asset.model && `${asset.model}`}
                          {asset.location && ` • ${asset.location}`}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </Button>
                ))}
              </div>
            )}

            {/* No ASD assets message */}
            {asdAssets.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-4 border-t">
                <Wind className="w-8 h-8 mx-auto mb-2 opacity-40" />
                No ASD units found in service contracts.
                <br />
                Add Aspirator contracts with assets to enable ASD reports.
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
