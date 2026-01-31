import { Check, X, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AIRewriteButton } from "./AIRewriteButton";
import {
  BS5839Checklist,
  CHECKLIST_LABELS,
  SECTION_LABELS,
} from "@/services/serviceReportService";

interface SecondaryPanelChecklistProps {
  checklist: BS5839Checklist;
  onChange: (checklist: BS5839Checklist) => void;
  defects: string;
  onDefectsChange: (defects: string) => void;
  recommendations: string;
  onRecommendationsChange: (recommendations: string) => void;
  readonly?: boolean;
}

type CheckValue = boolean | null;

// Only show sections 8, 9, 10 for secondary panels
const SECONDARY_PANEL_SECTIONS: Array<keyof BS5839Checklist> = [
  "faultMonitoring",
  "standbyPowerSupplies",
  "controlEquipment",
];

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

export function SecondaryPanelChecklist({
  checklist,
  onChange,
  defects,
  onDefectsChange,
  recommendations,
  onRecommendationsChange,
  readonly = false,
}: SecondaryPanelChecklistProps) {
  const updateChecklistItem = (
    section: keyof BS5839Checklist,
    item: string,
    value: CheckValue
  ) => {
    onChange({
      ...checklist,
      [section]: {
        ...(checklist[section] || {}),
        [item]: value,
      },
    });
  };

  const getSectionStats = (section: keyof BS5839Checklist) => {
    const sectionData = checklist[section];
    if (!sectionData || typeof sectionData !== "object") {
      return { yes: 0, no: 0, total: 0, na: 0 };
    }
    const items = Object.values(sectionData as Record<string, CheckValue>);
    const yes = items.filter((v) => v === true).length;
    const no = items.filter((v) => v === false).length;
    const total = items.length;
    return { yes, no, total, na: total - yes - no };
  };

  return (
    <div className="space-y-6">
      {/* Sections 8, 9, 10 */}
      {SECONDARY_PANEL_SECTIONS.map((sectionKey) => {
        const sectionLabels = CHECKLIST_LABELS[sectionKey];
        if (!sectionLabels) return null;

        const sectionData = checklist[sectionKey] as
          | Record<string, CheckValue>
          | undefined;
        const stats = getSectionStats(sectionKey);

        return (
          <div key={sectionKey} className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-foreground">
                {SECTION_LABELS[sectionKey]}
              </h4>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-success">{stats.yes} Yes</span>
                <span className="text-destructive">{stats.no} No</span>
                <span className="text-muted-foreground">{stats.na} N/A</span>
              </div>
            </div>
            <div className="space-y-2">
              {Object.entries(sectionLabels).map(([itemKey, label]) => (
                <ChecklistItem
                  key={itemKey}
                  label={label}
                  value={sectionData ? sectionData[itemKey] : null}
                  onChange={(value) =>
                    updateChecklistItem(sectionKey, itemKey, value)
                  }
                  readonly={readonly}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Defects & Recommendations Section */}
      <div className="space-y-4 pt-4 border-t border-border">
        <h4 className="font-medium text-foreground">Defects & Recommendations</h4>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="panel-defects">Defects Found</Label>
            {!readonly && (
              <AIRewriteButton
                text={defects}
                type="defects"
                onRewrite={onDefectsChange}
              />
            )}
          </div>
          <Textarea
            id="panel-defects"
            placeholder="Enter any defects found for this panel..."
            value={defects}
            onChange={(e) => onDefectsChange(e.target.value)}
            disabled={readonly}
            rows={3}
            className="resize-none"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="panel-recommendations">Recommendations</Label>
            {!readonly && (
              <AIRewriteButton
                text={recommendations}
                type="recommendations"
                onRewrite={onRecommendationsChange}
              />
            )}
          </div>
          <Textarea
            id="panel-recommendations"
            placeholder="Enter any recommendations for this panel..."
            value={recommendations}
            onChange={(e) => onRecommendationsChange(e.target.value)}
            disabled={readonly}
            rows={3}
            className="resize-none"
          />
        </div>
      </div>
    </div>
  );
}
