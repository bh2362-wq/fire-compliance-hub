import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Wind, Copy, MapPin, Star, AlertTriangle } from "lucide-react";
import { ASDReportChecklist } from "./ASDReportChecklist";
import { ASDChecklist, getDefaultASDChecklist } from "@/services/asdChecklistService";
import { useToast } from "@/hooks/use-toast";

export interface ASDChecklistData {
  assetId: string;
  assetName: string;
  manufacturer?: string;
  model?: string;
  location?: string;
  checklist: ASDChecklist;
  defects?: string;
  recommendations?: string;
  systemCondition?: string;
}

interface MultiASDChecklistProps {
  units: ASDChecklistData[];
  onChange: (units: ASDChecklistData[]) => void;
  readonly?: boolean;
}

export function MultiASDChecklist({
  units,
  onChange,
  readonly = false,
}: MultiASDChecklistProps) {
  const [activeUnit, setActiveUnit] = useState(units[0]?.assetId || "");
  const { toast } = useToast();

  const updateUnitChecklist = (assetId: string, checklist: ASDChecklist) => {
    const updatedUnits = units.map((u) =>
      u.assetId === assetId ? { ...u, checklist } : u
    );
    onChange(updatedUnits);
  };

  const updateUnitField = (assetId: string, field: keyof ASDChecklistData, value: string) => {
    const updatedUnits = units.map((u) =>
      u.assetId === assetId ? { ...u, [field]: value } : u
    );
    onChange(updatedUnits);
  };

  const copyToAllUnits = (sourceAssetId: string) => {
    const sourceUnit = units.find((u) => u.assetId === sourceAssetId);
    if (!sourceUnit) return;

    const updatedUnits = units.map((u) => {
      if (u.assetId === sourceAssetId) return u;
      return {
        ...u,
        checklist: JSON.parse(JSON.stringify(sourceUnit.checklist)) as ASDChecklist,
      };
    });

    onChange(updatedUnits);
    toast({
      title: "Checklist copied",
      description: `Copied ${sourceUnit.assetName} checklist to ${units.length - 1} other unit${units.length > 2 ? "s" : ""}. You can now edit each unit individually.`,
    });
  };

  const getUnitStats = (unit: ASDChecklistData) => {
    const checklist = unit.checklist;
    let yes = 0;
    let no = 0;
    let total = 0;

    // Count pre_service_actions
    Object.values(checklist.pre_service_actions).forEach((value) => {
      if (typeof value === "boolean" || value === null) {
        total++;
        if (value === true) yes++;
        if (value === false) no++;
      }
    });

    // Count cleaning_activities
    Object.values(checklist.cleaning_activities).forEach((value) => {
      if (typeof value === "boolean" || value === null) {
        total++;
        if (value === true) yes++;
        if (value === false) no++;
      }
    });

    // Count system_checks
    Object.values(checklist.system_checks).forEach((value) => {
      if (typeof value === "boolean" || value === null) {
        total++;
        if (value === true) yes++;
        if (value === false) no++;
      }
    });

    return { yes, no, na: total - yes - no };
  };

  const renderUnitDetails = (unit: ASDChecklistData, isPrimary: boolean) => (
    <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-border mb-4">
      <div className="flex items-center gap-2">
        <Wind className="w-5 h-5 text-primary" />
        <span className="font-semibold text-foreground">{unit.assetName}</span>
        {isPrimary && (
          <Badge variant="default" className="text-xs bg-primary">
            <Star className="w-3 h-3 mr-1" />
            Primary Unit
          </Badge>
        )}
      </div>
      
      {(unit.manufacturer || unit.model) && (
        <Badge variant="outline" className="text-xs">
          {unit.manufacturer}
          {unit.manufacturer && unit.model && " - "}
          {unit.model}
        </Badge>
      )}
      
      {unit.location && (
        <Badge variant="secondary" className="text-xs">
          <MapPin className="w-3 h-3 mr-1" />
          {unit.location}
        </Badge>
      )}
    </div>
  );

  if (units.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Wind className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No ASD units found in service contracts.</p>
        <p className="text-sm mt-1">Add ASD units to the site's service contract to begin.</p>
      </div>
    );
  }

  if (units.length === 1) {
    const unit = units[0];
    return (
      <div className="space-y-6">
        {renderUnitDetails(unit, true)}
        <ASDReportChecklist
          checklist={unit.checklist}
          onChange={(c) => updateUnitChecklist(unit.assetId, c)}
          readonly={readonly}
        />
        
        {/* Defects & Recommendations Section */}
        <div className="space-y-4 pt-4 border-t">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning" />
            <h4 className="font-medium text-foreground">Defects & Recommendations</h4>
          </div>
          
          <div className="space-y-2">
            <Label className="text-sm">System Condition</Label>
            <Select
              value={unit.systemCondition || ""}
              onValueChange={(value) => updateUnitField(unit.assetId, "systemCondition", value)}
              disabled={readonly}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select condition" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="satisfactory">Satisfactory</SelectItem>
                <SelectItem value="requires_attention">Requires Attention</SelectItem>
                <SelectItem value="unsatisfactory">Unsatisfactory</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label className="text-sm">Defects Found</Label>
            <Textarea
              value={unit.defects || ""}
              onChange={(e) => updateUnitField(unit.assetId, "defects", e.target.value)}
              placeholder="Describe any defects found during the service..."
              disabled={readonly}
              className="min-h-[100px]"
            />
          </div>
          
          <div className="space-y-2">
            <Label className="text-sm">Recommendations</Label>
            <Textarea
              value={unit.recommendations || ""}
              onChange={(e) => updateUnitField(unit.assetId, "recommendations", e.target.value)}
              placeholder="Enter any recommendations for the customer..."
              disabled={readonly}
              className="min-h-[100px]"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <Tabs value={activeUnit} onValueChange={setActiveUnit} className="w-full">
      <TabsList className="w-full flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
        {units.map((unit, index) => {
          const isPrimary = index === 0;
          const stats = getUnitStats(unit);
          return (
            <TabsTrigger
              key={unit.assetId}
              value={unit.assetId}
              className="flex-1 min-w-[120px] flex flex-col items-center gap-0.5 py-2"
            >
              <div className="flex items-center gap-1">
                <Wind className="w-4 h-4" />
                <span className="text-xs font-medium truncate max-w-[100px]">
                  {unit.assetName}
                </span>
                {isPrimary && <Star className="w-3 h-3 text-primary" />}
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

      {units.map((unit, index) => {
        const isPrimary = index === 0;
        
        return (
          <TabsContent key={unit.assetId} value={unit.assetId} className="mt-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                {renderUnitDetails(unit, isPrimary)}
                
                {/* Copy to All button - only show for multi-unit and not readonly */}
                {units.length > 1 && !readonly && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => copyToAllUnits(unit.assetId)}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy to All Units
                  </Button>
                )}
              </div>

              <ASDReportChecklist
                checklist={unit.checklist}
                onChange={(c) => updateUnitChecklist(unit.assetId, c)}
                readonly={readonly}
              />
              
              {/* Defects & Recommendations Section */}
              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-warning" />
                  <h4 className="font-medium text-foreground">Defects & Recommendations</h4>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm">System Condition</Label>
                  <Select
                    value={unit.systemCondition || ""}
                    onValueChange={(value) => updateUnitField(unit.assetId, "systemCondition", value)}
                    disabled={readonly}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select condition" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="satisfactory">Satisfactory</SelectItem>
                      <SelectItem value="requires_attention">Requires Attention</SelectItem>
                      <SelectItem value="unsatisfactory">Unsatisfactory</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm">Defects Found</Label>
                  <Textarea
                    value={unit.defects || ""}
                    onChange={(e) => updateUnitField(unit.assetId, "defects", e.target.value)}
                    placeholder="Describe any defects found during the service..."
                    disabled={readonly}
                    className="min-h-[100px]"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm">Recommendations</Label>
                  <Textarea
                    value={unit.recommendations || ""}
                    onChange={(e) => updateUnitField(unit.assetId, "recommendations", e.target.value)}
                    placeholder="Enter any recommendations for the customer..."
                    disabled={readonly}
                    className="min-h-[100px]"
                  />
                </div>
              </div>
            </div>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

export function initializeASDChecklists(
  assets: Array<{
    id: string;
    item_name: string;
    manufacturer?: string | null;
    model?: string | null;
    location?: string | null;
  }>
): ASDChecklistData[] {
  return assets.map((asset) => ({
    assetId: asset.id,
    assetName: asset.item_name,
    manufacturer: asset.manufacturer || undefined,
    model: asset.model || undefined,
    location: asset.location || undefined,
    checklist: getDefaultASDChecklist(),
    defects: "",
    recommendations: "",
    systemCondition: "",
  }));
}
