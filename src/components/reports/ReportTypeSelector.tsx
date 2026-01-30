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
import { Loader2, FileText, ClipboardCheck, Wind, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ASDAsset {
  id: string;
  item_name: string;
  manufacturer: string | null;
  model: string | null;
  location: string | null;
}

interface ReportTypeSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (type: "bs5839" | "work" | "asd", asdAsset?: ASDAsset) => void;
  siteId?: string;
}

export function ReportTypeSelector({
  open,
  onOpenChange,
  onSelect,
  siteId,
}: ReportTypeSelectorProps) {
  const [loading, setLoading] = useState(false);
  const [asdAssets, setAsdAssets] = useState<ASDAsset[]>([]);

  useEffect(() => {
    if (open && siteId) {
      loadAsdAssets();
    }
  }, [open, siteId]);

  const loadAsdAssets = async () => {
    if (!siteId) return;
    setLoading(true);

    try {
      // Get ASD assets directly from site_assets table
      const { data: assets } = await supabase
        .from("site_assets")
        .select("id, item_name, manufacturer, model, location")
        .eq("site_id", siteId)
        .eq("asset_type", "asd");

      setAsdAssets(assets || []);
    } catch (error) {
      console.error("Failed to load ASD assets:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Select Report Type</DialogTitle>
          <DialogDescription>
            Choose the type of service report to create for this visit.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-4">
          <Button
            variant="outline"
            className="h-auto p-4 flex flex-col items-start gap-2 hover:border-primary"
            onClick={() => {
              onSelect("work");
              onOpenChange(false);
            }}
          >
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <span className="font-semibold">Work Report</span>
            </div>
            <p className="text-sm text-muted-foreground text-left">
              General job sheet for all service types. Includes job details, works carried out, materials used, and sign-off.
            </p>
          </Button>

          <Button
            variant="outline"
            className="h-auto p-4 flex flex-col items-start gap-2 hover:border-primary"
            onClick={() => {
              onSelect("bs5839");
              onOpenChange(false);
            }}
          >
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              <span className="font-semibold">BS5839 Fire Alarm Report</span>
            </div>
            <p className="text-sm text-muted-foreground text-left">
              Comprehensive fire alarm service report with BS5839:2025 compliance checklist, system details, and condition assessment.
            </p>
          </Button>

          {/* ASD Reports Section */}
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : asdAssets.length > 0 ? (
            <div className="space-y-2 border-t pt-3 mt-1">
              <h4 className="text-sm font-medium text-muted-foreground px-1 flex items-center gap-2">
                <Wind className="w-4 h-4" />
                ASD Service Reports
              </h4>
              {asdAssets.map((asset) => (
                <Button
                  key={asset.id}
                  variant="outline"
                  className="w-full h-auto p-3 flex items-center justify-between hover:border-primary"
                  onClick={() => {
                    onSelect("asd", asset);
                    onOpenChange(false);
                  }}
                >
                  <div className="flex items-center gap-3">
                    <Wind className="w-5 h-5 text-primary" />
                    <div className="text-left">
                      <span className="font-medium">{asset.item_name}</span>
                      <div className="text-xs text-muted-foreground">
                        {asset.manufacturer && `${asset.manufacturer} `}
                        {asset.model && `${asset.model}`}
                        {asset.location && ` • ${asset.location}`}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </Button>
              ))}
            </div>
          ) : siteId ? (
            <div className="text-center py-4 text-sm text-muted-foreground border-t mt-1">
              <Wind className="w-6 h-6 mx-auto mb-2 opacity-40" />
              No ASD units on this site's contract.
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
