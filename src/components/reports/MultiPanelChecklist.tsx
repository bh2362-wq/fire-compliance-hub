import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Server, Copy, MapPin, Star } from "lucide-react";
import { ServiceReportChecklist } from "./ServiceReportChecklist";
import { SecondaryPanelChecklist } from "./SecondaryPanelChecklist";
import { BS5839Checklist, getDefaultChecklist } from "@/services/serviceReportService";
import { useToast } from "@/hooks/use-toast";

export interface PanelChecklistData {
  assetId: string;
  assetName: string;
  manufacturer?: string;
  model?: string;
  location?: string;
  checklist: BS5839Checklist;
  defects?: string;
  recommendations?: string;
}

interface MultiPanelChecklistProps {
  panels: PanelChecklistData[];
  onChange: (panels: PanelChecklistData[]) => void;
  readonly?: boolean;
}

export function MultiPanelChecklist({
  panels,
  onChange,
  readonly = false,
}: MultiPanelChecklistProps) {
  const [activePanel, setActivePanel] = useState(panels[0]?.assetId || "");
  const { toast } = useToast();

  const updatePanelChecklist = (assetId: string, checklist: BS5839Checklist) => {
    const updatedPanels = panels.map((p) =>
      p.assetId === assetId ? { ...p, checklist } : p
    );
    onChange(updatedPanels);
  };

  const updatePanelDefects = (assetId: string, defects: string) => {
    const updatedPanels = panels.map((p) =>
      p.assetId === assetId ? { ...p, defects } : p
    );
    onChange(updatedPanels);
  };

  const updatePanelRecommendations = (assetId: string, recommendations: string) => {
    const updatedPanels = panels.map((p) =>
      p.assetId === assetId ? { ...p, recommendations } : p
    );
    onChange(updatedPanels);
  };

  const copyToAllPanels = (sourceAssetId: string) => {
    const sourcePanel = panels.find((p) => p.assetId === sourceAssetId);
    if (!sourcePanel) return;

    // Deep clone the source checklist to all other panels
    const updatedPanels = panels.map((p) => {
      if (p.assetId === sourceAssetId) return p;
      return {
        ...p,
        checklist: JSON.parse(JSON.stringify(sourcePanel.checklist)) as BS5839Checklist,
        defects: sourcePanel.defects || "",
        recommendations: sourcePanel.recommendations || "",
      };
    });

    onChange(updatedPanels);
    toast({
      title: "Checklist copied",
      description: `Copied ${sourcePanel.assetName} checklist to ${panels.length - 1} other panel${panels.length > 2 ? "s" : ""}. You can now edit each panel individually.`,
    });
  };

  const getPanelStats = (panel: PanelChecklistData, isMaster: boolean) => {
    const checklist = panel.checklist;
    let yes = 0;
    let no = 0;
    let total = 0;

    // For secondary panels, only count sections 8, 9, 10
    const sectionsToCount = isMaster
      ? Object.keys(checklist)
      : ["faultMonitoring", "standbyPowerSupplies", "controlEquipment"];

    sectionsToCount.forEach((sectionKey) => {
      const section = checklist[sectionKey as keyof BS5839Checklist];
      if (section && typeof section === "object") {
        Object.values(section).forEach((value) => {
          if (typeof value === "boolean" || value === null) {
            total++;
            if (value === true) yes++;
            if (value === false) no++;
          }
        });
      }
    });

    return { yes, no, na: total - yes - no };
  };

  const renderPanelDetails = (panel: PanelChecklistData, isMaster: boolean) => (
    <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-border mb-4">
      <div className="flex items-center gap-2">
        <Server className="w-5 h-5 text-primary" />
        <span className="font-semibold text-foreground">{panel.assetName}</span>
        {isMaster && (
          <Badge variant="default" className="text-xs bg-primary">
            <Star className="w-3 h-3 mr-1" />
            Master Panel
          </Badge>
        )}
      </div>
      
      {(panel.manufacturer || panel.model) && (
        <Badge variant="outline" className="text-xs">
          {panel.manufacturer}
          {panel.manufacturer && panel.model && " - "}
          {panel.model}
        </Badge>
      )}
      
      {panel.location && (
        <Badge variant="secondary" className="text-xs">
          <MapPin className="w-3 h-3 mr-1" />
          {panel.location}
        </Badge>
      )}
    </div>
  );

  if (panels.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Server className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No fire panels found in service contracts.</p>
        <p className="text-sm mt-1">Add panels to the site's service contract to begin.</p>
      </div>
    );
  }

  if (panels.length === 1) {
    const panel = panels[0];
    return (
      <div className="space-y-4">
        {renderPanelDetails(panel, true)}
        <ServiceReportChecklist
          checklist={panel.checklist}
          onChange={(c) => updatePanelChecklist(panel.assetId, c)}
          readonly={readonly}
        />
      </div>
    );
  }

  return (
    <Tabs value={activePanel} onValueChange={setActivePanel} className="w-full">
      <TabsList className="w-full flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
        {panels.map((panel, index) => {
          const isMaster = index === 0;
          const stats = getPanelStats(panel, isMaster);
          return (
            <TabsTrigger
              key={panel.assetId}
              value={panel.assetId}
              className="flex-1 min-w-[120px] flex flex-col items-center gap-0.5 py-2"
            >
              <div className="flex items-center gap-1">
                <Server className="w-4 h-4" />
                <span className="text-xs font-medium truncate max-w-[100px]">
                  {panel.assetName}
                </span>
                {isMaster && <Star className="w-3 h-3 text-primary" />}
              </div>
              <div className="flex items-center gap-1 text-[10px]">
                <span className="text-success">{stats.yes}</span>
                <span>/</span>
                <span className="text-destructive">{stats.no}</span>
                <span>/</span>
                <span className="text-muted-foreground">{stats.na}</span>
              </div>
            </TabsTrigger>
          );
        })}
      </TabsList>

      {panels.map((panel, index) => {
        const isMaster = index === 0;
        
        return (
          <TabsContent key={panel.assetId} value={panel.assetId} className="mt-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                {renderPanelDetails(panel, isMaster)}
                
                {/* Copy to All button - only show for multi-panel and not readonly */}
                {panels.length > 1 && !readonly && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => copyToAllPanels(panel.assetId)}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy to All Panels
                  </Button>
                )}
              </div>

              {isMaster ? (
                // Master panel gets full checklist
                <ServiceReportChecklist
                  checklist={panel.checklist}
                  onChange={(c) => updatePanelChecklist(panel.assetId, c)}
                  readonly={readonly}
                />
              ) : (
                // Secondary panels get sections 8, 9, 10 + defects/recommendations
                <SecondaryPanelChecklist
                  checklist={panel.checklist}
                  onChange={(c) => updatePanelChecklist(panel.assetId, c)}
                  defects={panel.defects || ""}
                  onDefectsChange={(d) => updatePanelDefects(panel.assetId, d)}
                  recommendations={panel.recommendations || ""}
                  onRecommendationsChange={(r) => updatePanelRecommendations(panel.assetId, r)}
                  readonly={readonly}
                />
              )}
            </div>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

export function initializePanelChecklists(
  assets: Array<{
    id: string;
    item_name: string;
    manufacturer?: string | null;
    model?: string | null;
    location?: string | null;
  }>
): PanelChecklistData[] {
  return assets.map((asset) => ({
    assetId: asset.id,
    assetName: asset.item_name,
    manufacturer: asset.manufacturer || undefined,
    model: asset.model || undefined,
    location: asset.location || undefined,
    checklist: getDefaultChecklist(),
    defects: "",
    recommendations: "",
  }));
}
