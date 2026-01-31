import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Server, Copy } from "lucide-react";
import { ServiceReportChecklist } from "./ServiceReportChecklist";
import { BS5839Checklist, getDefaultChecklist } from "@/services/serviceReportService";
import { useToast } from "@/hooks/use-toast";

export interface PanelChecklistData {
  assetId: string;
  assetName: string;
  manufacturer?: string;
  model?: string;
  location?: string;
  checklist: BS5839Checklist;
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

  const copyToAllPanels = (sourceAssetId: string) => {
    const sourcePanel = panels.find((p) => p.assetId === sourceAssetId);
    if (!sourcePanel) return;

    // Deep clone the source checklist to all other panels
    const updatedPanels = panels.map((p) => {
      if (p.assetId === sourceAssetId) return p;
      return {
        ...p,
        checklist: JSON.parse(JSON.stringify(sourcePanel.checklist)) as BS5839Checklist,
      };
    });

    onChange(updatedPanels);
    toast({
      title: "Checklist copied",
      description: `Copied ${sourcePanel.assetName} checklist to ${panels.length - 1} other panel${panels.length > 2 ? "s" : ""}. You can now edit each panel individually.`,
    });
  };

  const getPanelStats = (panel: PanelChecklistData) => {
    const checklist = panel.checklist;
    let yes = 0;
    let no = 0;
    let total = 0;

    Object.values(checklist).forEach((section) => {
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
        <div className="flex items-center gap-2 pb-2 border-b">
          <Server className="w-5 h-5 text-primary" />
          <span className="font-medium">{panel.assetName}</span>
          {panel.manufacturer && (
            <Badge variant="outline" className="text-xs">
              {panel.manufacturer} {panel.model && `- ${panel.model}`}
            </Badge>
          )}
        </div>
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
        {panels.map((panel) => {
          const stats = getPanelStats(panel);
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

      {panels.map((panel) => (
        <TabsContent key={panel.assetId} value={panel.assetId} className="mt-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b">
              <Server className="w-5 h-5 text-primary" />
              <span className="font-medium">{panel.assetName}</span>
              {panel.manufacturer && (
                <Badge variant="outline" className="text-xs">
                  {panel.manufacturer} {panel.model && `- ${panel.model}`}
                </Badge>
              )}
              {panel.location && (
                <span className="text-sm text-muted-foreground">
                  📍 {panel.location}
                </span>
              )}
              {/* Copy to All button - only show for multi-panel and not readonly */}
              {panels.length > 1 && !readonly && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  onClick={() => copyToAllPanels(panel.assetId)}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy to All Panels
                </Button>
              )}
            </div>
            <ServiceReportChecklist
              checklist={panel.checklist}
              onChange={(c) => updatePanelChecklist(panel.assetId, c)}
              readonly={readonly}
            />
          </div>
        </TabsContent>
      ))}
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
  }));
}
