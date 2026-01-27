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
import { AlertCircle, CheckCircle2 } from "lucide-react";

export interface ColumnMapping {
  loop: string | null;
  address: string | null;
  type: string | null;
  location: string | null;
  zone: string | null;
}

interface ColumnMappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableColumns: string[];
  suggestedMapping: Partial<ColumnMapping>;
  sampleData: Record<string, unknown>[];
  onConfirm: (mapping: ColumnMapping) => void;
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

  useEffect(() => {
    setMapping({
      loop: suggestedMapping.loop || null,
      address: suggestedMapping.address || null,
      type: suggestedMapping.type || null,
      location: suggestedMapping.location || null,
      zone: suggestedMapping.zone || null,
    });
  }, [suggestedMapping, open]);

  const handleChange = (field: keyof ColumnMapping, value: string) => {
    setMapping((prev) => ({
      ...prev,
      [field]: value === UNMAPPED_VALUE ? null : value,
    }));
  };

  const isValid = mapping.loop && mapping.address && mapping.type;

  const handleConfirm = () => {
    if (isValid) {
      onConfirm(mapping);
    }
  };

  const renderColumnSelect = (
    field: keyof ColumnMapping,
    label: string,
    required: boolean
  ) => {
    const currentValue = mapping[field];
    const hasValue = !!currentValue;

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor={`map-${field}`}>
            {label} {required && <span className="text-destructive">*</span>}
          </Label>
          {required && (
            hasValue ? (
              <CheckCircle2 className="w-4 h-4 text-success" />
            ) : (
              <AlertCircle className="w-4 h-4 text-destructive" />
            )
          )}
        </div>
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
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Map Columns</DialogTitle>
          <DialogDescription>
            We couldn't automatically detect all required columns. Please map your file's columns to the expected fields.
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
            <div className="grid grid-cols-1 gap-3">
              {renderColumnSelect("loop", "Loop / Circuit", true)}
              {renderColumnSelect("address", "Address / Point", true)}
              {renderColumnSelect("type", "Device Type", true)}
            </div>
          </div>

          {/* Optional Fields */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Optional Fields</p>
            <div className="grid grid-cols-2 gap-3">
              {renderColumnSelect("location", "Location", false)}
              {renderColumnSelect("zone", "Zone", false)}
            </div>
          </div>

          {!isValid && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <div className="flex items-center gap-2 text-destructive text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>Please map all required fields to continue</span>
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