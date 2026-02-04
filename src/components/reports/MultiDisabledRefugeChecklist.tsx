import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Phone } from "lucide-react";
import { toast } from "sonner";
import {
  DisabledRefugeChecklist as DisabledRefugeChecklistType,
  getDefaultDisabledRefugeChecklist,
} from "@/services/disabledRefugeChecklistService";
import { DisabledRefugeChecklist } from "./DisabledRefugeChecklist";

interface DisabledRefugeAsset {
  id: string;
  item_name: string;
  manufacturer?: string | null;
  model?: string | null;
  location?: string | null;
}

export interface DisabledRefugeChecklistData {
  assetId: string;
  assetName: string;
  manufacturer?: string;
  model?: string;
  location?: string;
  checklist: DisabledRefugeChecklistType;
  defects: string;
  recommendations: string;
  systemCondition: string;
}

interface MultiDisabledRefugeChecklistProps {
  units: DisabledRefugeChecklistData[];
  onChange: (units: DisabledRefugeChecklistData[]) => void;
  readonly?: boolean;
}

export function initializeDisabledRefugeChecklists(
  assets: DisabledRefugeAsset[]
): DisabledRefugeChecklistData[] {
  return assets.map((asset) => ({
    assetId: asset.id,
    assetName: asset.item_name,
    manufacturer: asset.manufacturer || "",
    model: asset.model || "",
    location: asset.location || "",
    checklist: getDefaultDisabledRefugeChecklist(),
    defects: "",
    recommendations: "",
    systemCondition: "",
  }));
}

export function MultiDisabledRefugeChecklist({
  units,
  onChange,
  readonly = false,
}: MultiDisabledRefugeChecklistProps) {
  const [activeUnit, setActiveUnit] = useState(units[0]?.assetId || "");

  const updateUnit = (assetId: string, updates: Partial<DisabledRefugeChecklistData>) => {
    onChange(
      units.map((u) => (u.assetId === assetId ? { ...u, ...updates } : u))
    );
  };

  const copyToAllUnits = () => {
    const sourceUnit = units.find((u) => u.assetId === activeUnit);
    if (!sourceUnit || units.length < 2) return;

    onChange(
      units.map((u) =>
        u.assetId === activeUnit
          ? u
          : {
              ...u,
              checklist: JSON.parse(JSON.stringify(sourceUnit.checklist)),
            }
      )
    );
    toast.success("Checklist copied to all units");
  };

  if (units.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No disabled refuge units configured for this site.
      </div>
    );
  }

  if (units.length === 1) {
    const unit = units[0];
    return (
      <div className="space-y-6">
        {/* Unit Info */}
        <div className="bg-muted/30 rounded-lg p-4 border">
          <div className="flex items-center gap-2 mb-3">
            <Phone className="w-4 h-4 text-primary" />
            <span className="font-medium">{unit.assetName}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-muted-foreground">
            {unit.manufacturer && <div>Manufacturer: {unit.manufacturer}</div>}
            {unit.model && <div>Model: {unit.model}</div>}
            {unit.location && <div>Location: {unit.location}</div>}
          </div>
        </div>

        {/* Checklist */}
        <DisabledRefugeChecklist
          checklist={unit.checklist}
          onChange={(checklist) => updateUnit(unit.assetId, { checklist })}
          readonly={readonly}
        />

        {/* Defects & Recommendations */}
        <div className="space-y-4 border-t pt-4">
          <div className="space-y-2">
            <Label>System Condition</Label>
            <Input
              value={unit.systemCondition}
              onChange={(e) => updateUnit(unit.assetId, { systemCondition: e.target.value })}
              placeholder="e.g., Satisfactory, Requires Attention"
              disabled={readonly}
            />
          </div>
          <div className="space-y-2">
            <Label>Defects Found</Label>
            <Textarea
              value={unit.defects}
              onChange={(e) => updateUnit(unit.assetId, { defects: e.target.value })}
              placeholder="List any defects found..."
              disabled={readonly}
              className="min-h-[80px]"
            />
          </div>
          <div className="space-y-2">
            <Label>Recommendations</Label>
            <Textarea
              value={unit.recommendations}
              onChange={(e) => updateUnit(unit.assetId, { recommendations: e.target.value })}
              placeholder="Any recommendations for remedial work..."
              disabled={readonly}
              className="min-h-[80px]"
            />
          </div>
        </div>
      </div>
    );
  }

  // Multiple units - show tabs
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {units.length} disabled refuge units
        </div>
        {!readonly && units.length > 1 && (
          <Button
            variant="outline"
            size="sm"
            onClick={copyToAllUnits}
            className="gap-1"
          >
            <Copy className="w-3 h-3" />
            Copy to All
          </Button>
        )}
      </div>

      <Tabs value={activeUnit} onValueChange={setActiveUnit}>
        <TabsList className="w-full flex-wrap h-auto gap-1 p-1">
          {units.map((unit, idx) => (
            <TabsTrigger
              key={unit.assetId}
              value={unit.assetId}
              className="flex-1 min-w-[100px] text-xs sm:text-sm"
            >
              <span className="truncate">
                {unit.assetName || `Unit ${idx + 1}`}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {units.map((unit) => (
          <TabsContent key={unit.assetId} value={unit.assetId} className="mt-4">
            {/* Unit Info */}
            <div className="bg-muted/30 rounded-lg p-4 border mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Phone className="w-4 h-4 text-primary" />
                <span className="font-medium">{unit.assetName}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-muted-foreground">
                {unit.manufacturer && <div>Manufacturer: {unit.manufacturer}</div>}
                {unit.model && <div>Model: {unit.model}</div>}
                {unit.location && <div>Location: {unit.location}</div>}
              </div>
            </div>

            {/* Checklist */}
            <DisabledRefugeChecklist
              checklist={unit.checklist}
              onChange={(checklist) => updateUnit(unit.assetId, { checklist })}
              readonly={readonly}
            />

            {/* Defects & Recommendations */}
            <div className="space-y-4 border-t pt-4 mt-4">
              <div className="space-y-2">
                <Label>System Condition</Label>
                <Input
                  value={unit.systemCondition}
                  onChange={(e) => updateUnit(unit.assetId, { systemCondition: e.target.value })}
                  placeholder="e.g., Satisfactory, Requires Attention"
                  disabled={readonly}
                />
              </div>
              <div className="space-y-2">
                <Label>Defects Found</Label>
                <Textarea
                  value={unit.defects}
                  onChange={(e) => updateUnit(unit.assetId, { defects: e.target.value })}
                  placeholder="List any defects found..."
                  disabled={readonly}
                  className="min-h-[80px]"
                />
              </div>
              <div className="space-y-2">
                <Label>Recommendations</Label>
                <Textarea
                  value={unit.recommendations}
                  onChange={(e) => updateUnit(unit.assetId, { recommendations: e.target.value })}
                  placeholder="Any recommendations for remedial work..."
                  disabled={readonly}
                  className="min-h-[80px]"
                />
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
