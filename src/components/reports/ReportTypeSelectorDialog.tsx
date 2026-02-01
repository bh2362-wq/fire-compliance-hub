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

  const handleAsdClick = () => {
    setShowAsdReport(true);
    onOpenChange(false);
  };

  const handleSubDialogClose = () => {
    setShowFireReport(false);
    setShowAsdReport(false);
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

  if (showAsdReport && asdAssets.length > 0) {
    return (
      <ASDReportDialog
        open={true}
        onOpenChange={(open) => {
          if (!open) handleSubDialogClose();
        }}
        visit={visit}
        assets={asdAssets}
        onSuccess={handleSubDialogSuccess}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Select Report Type</DialogTitle>
          <DialogDescription>
            Choose the type of service report to create for this visit.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3 pt-2">
            {/* Job Sheet Option */}
            <button
              type="button"
              className="w-full group flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent hover:border-accent transition-all text-left"
              onClick={handleFireReportClick}
            >
              <div className="w-12 h-12 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-orange-500/20 transition-colors">
                <FileText className="w-6 h-6 text-orange-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-foreground">Job Sheet</div>
                <div className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  General job sheet for all service types.
                  <br />
                  Includes works carried out and sign-off.
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
            </button>

            {/* Inspection Service Sheet Option */}
            <button
              type="button"
              className="w-full group flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent hover:border-accent transition-all text-left"
              onClick={handleFireReportClick}
            >
              <div className="w-12 h-12 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0 group-hover:bg-destructive/20 transition-colors">
                <Flame className="w-6 h-6 text-destructive" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-foreground flex items-center gap-2 flex-wrap">
                  Inspection Service Sheet
                  {fireAssets.length > 1 && (
                    <Badge variant="secondary" className="text-xs">
                      {fireAssets.length} panels
                    </Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  BS5839:2025 compliance checklist.
                  <br />
                  System details and condition assessment.
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
            </button>

            {/* ASD Report - Single button for all ASD units */}
            {asdAssets.length > 0 && (
              <button
                type="button"
                className="w-full group flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent hover:border-accent transition-all text-left"
                onClick={handleAsdClick}
              >
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                  <Wind className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-foreground flex items-center gap-2 flex-wrap">
                    ASD Service Report
                    {asdAssets.length > 1 && (
                      <Badge variant="secondary" className="text-xs">
                        {asdAssets.length} units
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    Aspirating smoke detection service.
                    <br />
                    {asdAssets.length === 1 
                      ? asdAssets[0].item_name
                      : `Covers all ${asdAssets.length} ASD units on site.`}
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
              </button>
            )}

            {/* No ASD message - subtle */}
            {asdAssets.length === 0 && (
              <p className="text-xs text-muted-foreground text-center pt-2">
                No ASD units on this site's contract.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
