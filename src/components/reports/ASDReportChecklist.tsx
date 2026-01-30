import { Check, X, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  ASDChecklist,
  ASD_CHECKLIST_LABELS,
  ASD_SECTION_LABELS,
} from "@/services/asdChecklistService";

interface ASDReportChecklistProps {
  checklist: ASDChecklist;
  onChange: (checklist: ASDChecklist) => void;
  readonly?: boolean;
}

type CheckValue = boolean | null;

const ChecklistItem = ({
  label,
  value,
  onChange,
  readonly,
}: {
  label: string;
  value: CheckValue;
  onChange: (value: CheckValue) => void;
  readonly?: boolean;
}) => {
  const cycleValue = () => {
    if (readonly) return;
    if (value === null) onChange(true);
    else if (value === true) onChange(false);
    else onChange(null);
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between py-2 px-3 rounded-lg border transition-colors",
        value === true && "bg-success/10 border-success/30",
        value === false && "bg-destructive/10 border-destructive/30",
        value === null && "bg-muted/50 border-border",
        !readonly && "cursor-pointer hover:bg-muted"
      )}
      onClick={cycleValue}
    >
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex items-center gap-1">
        {value === true && (
          <div className="w-6 h-6 rounded-full bg-success flex items-center justify-center">
            <Check className="w-4 h-4 text-success-foreground" />
          </div>
        )}
        {value === false && (
          <div className="w-6 h-6 rounded-full bg-destructive flex items-center justify-center">
            <X className="w-4 h-4 text-destructive-foreground" />
          </div>
        )}
        {value === null && (
          <div className="w-6 h-6 rounded-full bg-muted-foreground/30 flex items-center justify-center">
            <Minus className="w-4 h-4 text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
};

export function ASDReportChecklist({
  checklist,
  onChange,
  readonly = false,
}: ASDReportChecklistProps) {
  const updateChecklistItem = (
    section: keyof ASDChecklist,
    item: string,
    value: CheckValue | string
  ) => {
    onChange({
      ...checklist,
      [section]: {
        ...(checklist[section] || {}),
        [item]: value,
      },
    });
  };

  const getSectionStats = (section: keyof ASDChecklist) => {
    const sectionData = checklist[section];
    if (!sectionData || typeof sectionData !== 'object') {
      return { passed: 0, failed: 0, total: 0, pending: 0 };
    }
    const items = Object.entries(sectionData as Record<string, CheckValue | string>)
      .filter(([key]) => !key.includes('Time') || key === 'transportTimeRecorded')
      .map(([_, v]) => v);
    const passed = items.filter((v) => v === true).length;
    const failed = items.filter((v) => v === false).length;
    const total = items.length;
    return { passed, failed, total, pending: total - passed - failed };
  };

  return (
    <div className="space-y-6">
      {(Object.keys(ASD_SECTION_LABELS) as Array<keyof ASDChecklist>).map((sectionKey) => {
        const sectionLabels = ASD_CHECKLIST_LABELS[sectionKey];
        if (!sectionLabels) return null;
        
        const sectionData = checklist[sectionKey] as Record<string, CheckValue | string> | undefined;
        const stats = getSectionStats(sectionKey);

        return (
          <div key={sectionKey} className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-foreground">
                {ASD_SECTION_LABELS[sectionKey]}
              </h4>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-success">{stats.passed} Pass</span>
                <span className="text-destructive">{stats.failed} Fail</span>
                <span className="text-muted-foreground">{stats.pending} N/A</span>
              </div>
            </div>
            <div className="space-y-2">
              {Object.entries(sectionLabels).map(([itemKey, label]) => {
                // Special handling for transport time input
                if (itemKey === 'transportTime') {
                  return (
                    <div key={itemKey} className="flex items-center gap-3 py-2 px-3 rounded-lg border bg-muted/50">
                      <span className="text-sm text-foreground flex-1">{label}</span>
                      <Input
                        type="text"
                        value={sectionData?.transportTime as string || ''}
                        onChange={(e) => updateChecklistItem(sectionKey, itemKey, e.target.value)}
                        placeholder="e.g., 45s"
                        className="w-24"
                        disabled={readonly}
                      />
                    </div>
                  );
                }

                return (
                  <ChecklistItem
                    key={itemKey}
                    label={label}
                    value={sectionData ? (sectionData[itemKey] as CheckValue) : null}
                    onChange={(value) => updateChecklistItem(sectionKey, itemKey, value)}
                    readonly={readonly}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
