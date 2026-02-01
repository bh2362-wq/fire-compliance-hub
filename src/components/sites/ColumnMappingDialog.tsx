import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AlertCircle, CheckCircle2, Edit3, Replace, ChevronDown, ChevronUp } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export interface ColumnMapping {
  loop: string | null;
  address: string | null;
  type: string | null;
  location: string | null;
  zone: string | null;
}

export interface ManualValues {
  loop?: string;
  address?: string;
  type?: string;
  location?: string;
  zone?: string;
}

export interface BulkReplace {
  find: string;
  replace: string;
}

export interface BulkReplaceMap {
  loop?: BulkReplace;
  address?: BulkReplace;
  type?: BulkReplace;
  location?: BulkReplace;
  zone?: BulkReplace;
}

interface ColumnMappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableColumns: string[];
  suggestedMapping: Partial<ColumnMapping>;
  sampleData: Record<string, unknown>[];
  onConfirm: (mapping: ColumnMapping, manualValues: ManualValues, bulkReplaces: BulkReplaceMap) => void;
}

const UNMAPPED_VALUE = "__unmapped__";

const ColumnMappingDialog = ({
  open,
  onOpenChange,
  availableColumns,
  suggestedMapping,
  sampleData,
  onConfirm,
}: ColumnMappingDialogProps) => {
  const [mapping, setMapping] = useState<ColumnMapping>({
    loop: null,
    address: null,
    type: null,
    location: null,
    zone: null,
  });

  const [useManual, setUseManual] = useState<Record<keyof ColumnMapping, boolean>>({
    loop: false,
    address: false,
    type: false,
    location: false,
    zone: false,
  });

  const [manualValues, setManualValues] = useState<ManualValues>({});
  const [bulkReplaces, setBulkReplaces] = useState<BulkReplaceMap>({});
  const [expandedBulkEdit, setExpandedBulkEdit] = useState<Record<keyof ColumnMapping, boolean>>({
    loop: false,
    address: false,
    type: false,
    location: false,
    zone: false,
  });

  useEffect(() => {
    setMapping({
      loop: suggestedMapping.loop || null,
      address: suggestedMapping.address || null,
      type: suggestedMapping.type || null,
      location: suggestedMapping.location || null,
      zone: suggestedMapping.zone || null,
    });
    setUseManual({
      loop: false,
      address: false,
      type: false,
      location: false,
      zone: false,
    });
    setManualValues({});
    setBulkReplaces({});
    setExpandedBulkEdit({
      loop: false,
      address: false,
      type: false,
      location: false,
      zone: false,
    });
  }, [suggestedMapping, open]);

  const handleChange = (field: keyof ColumnMapping, value: string) => {
    setUseManual((prev) => ({ ...prev, [field]: false }));
    setMapping((prev) => ({
      ...prev,
      [field]: value === UNMAPPED_VALUE ? null : value,
    }));
    setManualValues((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleManualValueChange = (field: keyof ColumnMapping, value: string) => {
    setManualValues((prev) => ({ ...prev, [field]: value }));
  };

  const toggleManual = (field: keyof ColumnMapping, enabled: boolean) => {
    setUseManual((prev) => ({ ...prev, [field]: enabled }));
    if (enabled) {
      setMapping((prev) => ({ ...prev, [field]: null }));
      // Clear bulk replace when switching to manual
      setBulkReplaces((prev) => ({ ...prev, [field]: undefined }));
    } else {
      setManualValues((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleBulkReplaceChange = (field: keyof ColumnMapping, type: 'find' | 'replace', value: string) => {
    setBulkReplaces((prev) => ({
      ...prev,
      [field]: {
        find: type === 'find' ? value : (prev[field]?.find || ''),
        replace: type === 'replace' ? value : (prev[field]?.replace || ''),
      },
    }));
  };

  const toggleBulkEdit = (field: keyof ColumnMapping) => {
    setExpandedBulkEdit((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const clearBulkReplace = (field: keyof ColumnMapping) => {
    setBulkReplaces((prev) => ({ ...prev, [field]: undefined }));
  };

  const isFieldValid = (field: keyof ColumnMapping, required: boolean): boolean => {
    if (!required) return true;
    if (useManual[field]) {
      return !!(manualValues[field]?.trim());
    }
    return !!mapping[field];
  };

  const isValid = 
    isFieldValid("loop", true) && 
    isFieldValid("address", true) && 
    isFieldValid("type", true);

  const handleConfirm = () => {
    if (isValid) {
      // Only include bulk replaces that have both find and replace values
      const cleanedBulkReplaces: BulkReplaceMap = {};
      Object.entries(bulkReplaces).forEach(([key, value]) => {
        if (value && value.find) {
          cleanedBulkReplaces[key as keyof ColumnMapping] = value;
        }
      });
      onConfirm(mapping, manualValues, cleanedBulkReplaces);
    }
  };

  // Get sample value with bulk replace preview
  const getSampleWithReplace = (field: keyof ColumnMapping): string | null => {
    const colName = mapping[field];
    if (!colName || sampleData.length === 0) return null;
    
    const originalValue = String(sampleData[0][colName] ?? "");
    const bulkReplace = bulkReplaces[field];
    
    if (bulkReplace?.find) {
      return originalValue.replace(new RegExp(escapeRegExp(bulkReplace.find), 'g'), bulkReplace.replace || '');
    }
    
    return originalValue;
  };

  const escapeRegExp = (string: string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  const renderColumnSelect = (
    field: keyof ColumnMapping,
    label: string,
    required: boolean,
    placeholder?: string
  ) => {
    const currentValue = mapping[field];
    const isManual = useManual[field];
    const fieldValid = isFieldValid(field, required);
    const bulkReplace = bulkReplaces[field];
    const hasBulkReplace = bulkReplace?.find;
    const isExpanded = expandedBulkEdit[field];

    return (
      <div className="space-y-2 p-3 bg-muted/20 rounded-lg border border-border/50">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Label htmlFor={`map-${field}`} className="font-medium">
              {label} {required && <span className="text-destructive">*</span>}
            </Label>
            {required && (
              fieldValid ? (
                <CheckCircle2 className="w-4 h-4 text-success" />
              ) : (
                <AlertCircle className="w-4 h-4 text-destructive" />
              )
            )}
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor={`manual-${field}`} className="text-xs text-muted-foreground cursor-pointer">
              <Edit3 className="w-3 h-3 inline mr-1" />
              Manual
            </Label>
            <Switch
              id={`manual-${field}`}
              checked={isManual}
              onCheckedChange={(checked) => toggleManual(field, checked)}
              className="scale-75"
            />
          </div>
        </div>

        {isManual ? (
          <Input
            id={`manual-input-${field}`}
            placeholder={placeholder || `Enter ${label.toLowerCase()}...`}
            value={manualValues[field] || ""}
            onChange={(e) => handleManualValueChange(field, e.target.value)}
            className="bg-background"
          />
        ) : (
          <>
            <Select
              value={currentValue || UNMAPPED_VALUE}
              onValueChange={(val) => handleChange(field, val)}
            >
              <SelectTrigger id={`map-${field}`} className="bg-background">
                <SelectValue placeholder="Select column..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNMAPPED_VALUE}>
                  <span className="text-muted-foreground">-- Not mapped --</span>
                </SelectItem>
                {availableColumns
                  .filter((col) => col && col.trim() !== "")
                  .map((col) => (
                    <SelectItem key={col} value={col}>
                      {col}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>

            {/* Sample value and bulk edit option */}
            {currentValue && sampleData.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Sample: <span className={hasBulkReplace ? "line-through text-muted-foreground/50" : "font-medium text-foreground"}>
                      {String(sampleData[0][currentValue] ?? "—")}
                    </span>
                    {hasBulkReplace && (
                      <span className="ml-1 font-medium text-primary">
                        → {getSampleWithReplace(field)}
                      </span>
                    )}
                  </span>
                </div>

                {/* Bulk Edit Collapsible */}
                <Collapsible open={isExpanded} onOpenChange={() => toggleBulkEdit(field)}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground">
                      <Replace className="w-3 h-3" />
                      Bulk Find & Replace
                      {hasBulkReplace && <span className="ml-1 text-primary">(active)</span>}
                      {isExpanded ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <div className="p-3 bg-background rounded-lg border border-border space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Find</Label>
                          <Input
                            placeholder="Text to find..."
                            value={bulkReplace?.find || ""}
                            onChange={(e) => handleBulkReplaceChange(field, 'find', e.target.value)}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Replace with</Label>
                          <Input
                            placeholder="Replacement text..."
                            value={bulkReplace?.replace || ""}
                            onChange={(e) => handleBulkReplaceChange(field, 'replace', e.target.value)}
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>
                      {hasBulkReplace && (
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">
                            Will replace "<span className="font-medium text-foreground">{bulkReplace?.find}</span>" 
                            with "<span className="font-medium text-primary">{bulkReplace?.replace || '(empty)'}</span>" 
                            in all rows
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => clearBulkReplace(field)}
                          >
                            Clear
                          </Button>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}
          </>
        )}

        {isManual && manualValues[field] && (
          <p className="text-xs text-muted-foreground">
            All rows will use: <span className="font-medium text-foreground">{manualValues[field]}</span>
          </p>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Map Columns</DialogTitle>
          <DialogDescription>
            Map your file's columns to the expected fields. Use "Bulk Find & Replace" to transform values.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Column Preview */}
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Detected columns in your file:
            </p>
            <div className="flex flex-wrap gap-1">
              {availableColumns.map((col) => (
                <span
                  key={col}
                  className="px-2 py-0.5 text-xs bg-background border border-border rounded"
                >
                  {col}
                </span>
              ))}
            </div>
          </div>

          {/* Required Fields */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Required Fields</p>
            <div className="space-y-3">
              {renderColumnSelect("loop", "Loop / Circuit", true, "e.g., Loop 1")}
              {renderColumnSelect("address", "Address / Point", true, "e.g., 001")}
              {renderColumnSelect("type", "Device Type", true, "e.g., Smoke Detector")}
            </div>
          </div>

          {/* Optional Fields */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Optional Fields</p>
            <div className="space-y-3">
              {renderColumnSelect("location", "Location", false, "e.g., Main Hall")}
              {renderColumnSelect("zone", "Zone", false, "e.g., Zone A")}
            </div>
          </div>

          {!isValid && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <div className="flex items-center gap-2 text-destructive text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>Please map or manually enter all required fields</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="hero" onClick={handleConfirm} disabled={!isValid}>
            Apply Mapping
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ColumnMappingDialog;
