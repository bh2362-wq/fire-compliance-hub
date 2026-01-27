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
import { AlertCircle, CheckCircle2, Edit3 } from "lucide-react";
import { Switch } from "@/components/ui/switch";

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

interface ColumnMappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableColumns: string[];
  suggestedMapping: Partial<ColumnMapping>;
  sampleData: Record<string, unknown>[];
  onConfirm: (mapping: ColumnMapping, manualValues: ManualValues) => void;
}

const UNMAPPED_VALUE = "__unmapped__";
const MANUAL_VALUE = "__manual__";

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
  }, [suggestedMapping, open]);

  const handleChange = (field: keyof ColumnMapping, value: string) => {
    if (value === MANUAL_VALUE) {
      setUseManual((prev) => ({ ...prev, [field]: true }));
      setMapping((prev) => ({ ...prev, [field]: null }));
    } else {
      setUseManual((prev) => ({ ...prev, [field]: false }));
      setMapping((prev) => ({
        ...prev,
        [field]: value === UNMAPPED_VALUE ? null : value,
      }));
      setManualValues((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleManualValueChange = (field: keyof ColumnMapping, value: string) => {
    setManualValues((prev) => ({ ...prev, [field]: value }));
  };

  const toggleManual = (field: keyof ColumnMapping, enabled: boolean) => {
    setUseManual((prev) => ({ ...prev, [field]: enabled }));
    if (enabled) {
      setMapping((prev) => ({ ...prev, [field]: null }));
    } else {
      setManualValues((prev) => ({ ...prev, [field]: undefined }));
    }
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
      onConfirm(mapping, manualValues);
    }
  };

  const renderColumnSelect = (
    field: keyof ColumnMapping,
    label: string,
    required: boolean,
    placeholder?: string
  ) => {
    const currentValue = mapping[field];
    const isManual = useManual[field];
    const hasValue = isManual ? !!(manualValues[field]?.trim()) : !!currentValue;
    const fieldValid = isFieldValid(field, required);

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Label htmlFor={`map-${field}`}>
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
            className="bg-accent/30"
          />
        ) : (
          <>
            <Select
              value={currentValue || UNMAPPED_VALUE}
              onValueChange={(val) => handleChange(field, val)}
            >
              <SelectTrigger id={`map-${field}`}>
                <SelectValue placeholder="Select column..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNMAPPED_VALUE}>
                  <span className="text-muted-foreground">-- Not mapped --</span>
                </SelectItem>
                {availableColumns.map((col) => (
                  <SelectItem key={col} value={col}>
                    {col}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Show sample value */}
            {currentValue && sampleData.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Sample: {String(sampleData[0][currentValue] ?? "—")}
              </p>
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
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Map Columns</DialogTitle>
          <DialogDescription>
            Map your file's columns to the expected fields. Toggle "Manual" to enter a static value for all rows.
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

          {/* Sample Data Preview */}
          {sampleData.length > 0 && (
            <div className="p-3 bg-muted/30 rounded-lg overflow-x-auto">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Sample data (first row):
              </p>
              <div className="grid gap-1 text-xs">
                {availableColumns.slice(0, 6).map((col) => (
                  <div key={col} className="flex gap-2">
                    <span className="font-medium text-foreground min-w-[100px] truncate">{col}:</span>
                    <span className="text-muted-foreground truncate">
                      {String(sampleData[0][col] ?? "—")}
                    </span>
                  </div>
                ))}
                {availableColumns.length > 6 && (
                  <p className="text-muted-foreground mt-1">...and {availableColumns.length - 6} more columns</p>
                )}
              </div>
            </div>
          )}

          {/* Required Fields */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Required Fields</p>
            <div className="grid grid-cols-1 gap-4">
              {renderColumnSelect("loop", "Loop / Circuit", true, "e.g., Loop 1")}
              {renderColumnSelect("address", "Address / Point", true, "e.g., 001")}
              {renderColumnSelect("type", "Device Type", true, "e.g., Smoke Detector")}
            </div>
          </div>

          {/* Optional Fields */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Optional Fields</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
