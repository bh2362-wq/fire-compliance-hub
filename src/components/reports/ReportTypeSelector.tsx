import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, FileText, Flame, Wind, ChevronRight } from "lucide-react";
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

            {/* ASD Reports */}
            {asdAssets.length > 0 && (
              <>
                <div className="pt-2 pb-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Aspirating Smoke Detection
                  </span>
                </div>
                {asdAssets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    className="w-full group flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent hover:border-accent transition-all text-left"
                    onClick={() => {
                      onSelect("asd", asset);
                      onOpenChange(false);
                    }}
                  >
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                      <Wind className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-foreground">{asset.item_name}</div>
                      <div className="text-sm text-muted-foreground mt-1 truncate">
                        {[asset.manufacturer, asset.model, asset.location].filter(Boolean).join(" • ") || "ASD Unit"}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
                  </button>
                ))}
              </>
            )}

            {/* No ASD message */}
            {asdAssets.length === 0 && siteId && (
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
