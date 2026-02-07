import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, FileText, Flame, Wind, Phone, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ASDAsset {
  id: string;
  item_name: string;
  manufacturer: string | null;
  model: string | null;
  location: string | null;
}

interface DisabledRefugeAsset {
  id: string;
  item_name: string;
  manufacturer?: string | null;
  model?: string | null;
  location?: string | null;
}

interface ReportTypeSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (type: "bs5839" | "work" | "asd" | "disabled_refuge", asdAssets?: ASDAsset[], disabledRefugeAssets?: DisabledRefugeAsset[]) => void;
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
  const [disabledRefugeAssets, setDisabledRefugeAssets] = useState<DisabledRefugeAsset[]>([]);

  useEffect(() => {
    if (open && siteId) {
      loadAssets();
    }
  }, [open, siteId]);

  const loadAssets = async () => {
    if (!siteId) return;
    setLoading(true);

    try {
      const [asdResult, refugeResult] = await Promise.all([
        supabase
          .from("site_assets")
          .select("id, item_name, manufacturer, model, location")
          .eq("site_id", siteId)
          .eq("asset_type", "aspirator"),
        supabase
          .from("site_assets")
          .select("id, item_name, manufacturer, model, location")
          .eq("site_id", siteId)
          .eq("asset_type", "disabled_refuge"),
      ]);

      setAsdAssets(asdResult.data || []);
      setDisabledRefugeAssets((refugeResult.data || []).map(a => ({ 
        id: a.id,
        item_name: a.item_name,
        manufacturer: a.manufacturer,
        model: a.model,
        location: a.location
      })));
    } catch (error) {
      console.error("Failed to load assets:", error);
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
            Choose the type of service report to create.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3 pt-2">
            {/* Job Sheet */}
            <button
              type="button"
              className="w-full group flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent hover:border-accent transition-all text-left"
              onClick={() => {
                onSelect("work");
                onOpenChange(false);
              }}
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

            {/* Inspection Service Sheet */}
            <button
              type="button"
              className="w-full group flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent hover:border-accent transition-all text-left"
              onClick={() => {
                onSelect("bs5839");
                onOpenChange(false);
              }}
            >
              <div className="w-12 h-12 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0 group-hover:bg-destructive/20 transition-colors">
                <Flame className="w-6 h-6 text-destructive" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-foreground">Inspection Service Sheet</div>
                <div className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  BS5839:2025 compliance checklist.
                  <br />
                  System details and condition assessment.
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
            </button>

            {/* ASD Report - Single button for all units */}
            {asdAssets.length > 0 && (
              <button
                type="button"
                className="w-full group flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent hover:border-accent transition-all text-left"
                onClick={() => {
                  onSelect("asd", asdAssets);
                  onOpenChange(false);
                }}
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

            {/* No ASD message */}
            {asdAssets.length === 0 && disabledRefugeAssets.length === 0 && siteId && (
              <p className="text-xs text-muted-foreground text-center pt-2">
                No ASD or Disabled Refuge units on this site.
              </p>
            )}

            {/* Disabled Refuge Report */}
            {disabledRefugeAssets.length > 0 && (
              <button
                type="button"
                className="w-full group flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent hover:border-accent transition-all text-left"
                onClick={() => {
                  onSelect("disabled_refuge", undefined, disabledRefugeAssets);
                  onOpenChange(false);
                }}
              >
                <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 group-hover:bg-secondary/80 transition-colors">
                  <Phone className="w-6 h-6 text-secondary-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-foreground flex items-center gap-2 flex-wrap">
                    Disabled Refuge / EVC Report
                    {disabledRefugeAssets.length > 1 && (
                      <Badge variant="secondary" className="text-xs">
                        {disabledRefugeAssets.length} units
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    BS 5839-9 compliance checklist.
                    <br />
                    {disabledRefugeAssets.length === 1 
                      ? disabledRefugeAssets[0].item_name
                      : `Covers all ${disabledRefugeAssets.length} EVC units on site.`}
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
              </button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
