import { Check, X, Minus, EyeOff, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import {
  DisabledRefugeChecklist as DisabledRefugeChecklistType,
  DISABLED_REFUGE_CHECKLIST_LABELS,
  DISABLED_REFUGE_SECTION_LABELS,
} from "@/services/disabledRefugeChecklistService";

interface DisabledRefugeChecklistProps {
  checklist: DisabledRefugeChecklistType;
  onChange: (checklist: DisabledRefugeChecklistType) => void;
  readonly?: boolean;
}

type CheckValue = boolean | null;

type SectionKey = keyof Omit<DisabledRefugeChecklistType, "additional_notes" | "excluded_sections" | "excluded_items">;

const ChecklistItem = ({
  label,
  value,
  onChange,
  readonly,
  isExcluded,
  onToggleExclude,
}: {
  label: string;
  value: CheckValue;
  onChange: (value: CheckValue) => void;
  readonly?: boolean;
  isExcluded?: boolean;
  onToggleExclude?: () => void;
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
        isExcluded && "opacity-50",
        value === true && "bg-success/10 border-success/30",
        value === false && "bg-destructive/10 border-destructive/30",
        value === null && "bg-muted/50 border-border",
        !readonly && "cursor-pointer hover:bg-muted"
      )}
    >
      <div className="flex-1" onClick={cycleValue}>
        <span className={cn("text-sm text-foreground", isExcluded && "line-through")}>{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {/* Exclude toggle */}
        {!readonly && onToggleExclude && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExclude();
            }}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              isExcluded
                ? "text-muted-foreground hover:text-foreground hover:bg-muted"
                : "text-primary hover:bg-primary/10"
            )}
            title={isExcluded ? "Include in PDF" : "Exclude from PDF"}
          >
            {isExcluded ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
        {/* Status indicator */}
        <div onClick={cycleValue}>
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
    </div>
  );
};

export function DisabledRefugeChecklist({
  checklist,
  onChange,
  readonly = false,
}: DisabledRefugeChecklistProps) {
  const updateSectionItem = (section: SectionKey, key: string, value: CheckValue) => {
    const sectionData = checklist[section] as Record<string, CheckValue>;
    onChange({
      ...checklist,
      [section]: {
        ...sectionData,
        [key]: value,
      },
    });
  };

  const updateAdditionalNotes = (value: string) => {
    onChange({
      ...checklist,
      additional_notes: value,
    });
  };

  const isSectionExcluded = (section: string) => {
    return checklist.excluded_sections?.includes(section) ?? false;
  };

  const toggleSectionExclusion = (section: string) => {
    if (readonly) return;
    const currentExcluded = checklist.excluded_sections || [];
    const isExcluded = currentExcluded.includes(section);

    onChange({
      ...checklist,
      excluded_sections: isExcluded
        ? currentExcluded.filter((s) => s !== section)
        : [...currentExcluded, section],
    });
  };

  const isItemExcluded = (section: string, itemKey: string) => {
    const key = `${section}.${itemKey}`;
    return checklist.excluded_items?.includes(key) ?? false;
  };

  const toggleItemExclusion = (section: string, itemKey: string) => {
    if (readonly) return;
    const key = `${section}.${itemKey}`;
    const currentExcluded = checklist.excluded_items || [];
    const isExcluded = currentExcluded.includes(key);

    onChange({
      ...checklist,
      excluded_items: isExcluded
        ? currentExcluded.filter((k) => k !== key)
        : [...currentExcluded, key],
    });
  };

  const getChecklistStats = (items: Record<string, CheckValue>) => {
    const values = Object.values(items);
    const passed = values.filter((v) => v === true).length;
    const failed = values.filter((v) => v === false).length;
    const total = values.length;
    return { passed, failed, pending: total - passed - failed };
  };

  const SectionHeader = ({
    sectionKey,
    title,
    stats,
  }: {
    sectionKey: string;
    title: string;
    stats?: { passed: number; failed: number; pending: number };
  }) => {
    const excluded = isSectionExcluded(sectionKey);
    return (
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h4 className={cn("font-medium", excluded ? "text-muted-foreground line-through" : "text-foreground")}>
            {title}
          </h4>
          {!readonly && (
            <button
              type="button"
              onClick={() => toggleSectionExclusion(sectionKey)}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors",
                excluded
                  ? "bg-muted text-muted-foreground hover:bg-muted/80"
                  : "bg-primary/10 text-primary hover:bg-primary/20"
              )}
              title={excluded ? "Include in PDF" : "Exclude from PDF"}
            >
              {excluded ? (
                <>
                  <EyeOff className="w-3 h-3" />
                  <span className="hidden sm:inline">Excluded</span>
                </>
              ) : (
                <>
                  <Eye className="w-3 h-3" />
                  <span className="hidden sm:inline">In PDF</span>
                </>
              )}
            </button>
          )}
        </div>
        {stats && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-success">{stats.passed} Pass</span>
            <span className="text-destructive">{stats.failed} Fail</span>
            <span className="text-muted-foreground">{stats.pending} N/A</span>
          </div>
        )}
      </div>
    );
  };

  // All checkable sections (excluding additional_notes, excluded_sections, excluded_items)
  const checkableSections: SectionKey[] = [
    "documentation_compliance",
    "control_equipment",
    "power_supplies",
    "refuge_outstations",
    "communication_performance",
    "cabling_installation",
    "signage_identification",
    "testing_maintenance",
    "staff_awareness",
    "final_status",
  ];

  return (
    <div className="space-y-6">
      {checkableSections.map((sectionKey) => {
        const sectionData = checklist[sectionKey] as Record<string, CheckValue>;
        const labels = DISABLED_REFUGE_CHECKLIST_LABELS[sectionKey];
        const stats = getChecklistStats(sectionData);

        return (
          <div
            key={sectionKey}
            className={cn("space-y-3", isSectionExcluded(sectionKey) && "opacity-50")}
          >
            <SectionHeader
              sectionKey={sectionKey}
              title={DISABLED_REFUGE_SECTION_LABELS[sectionKey]}
              stats={stats}
            />
            <div className="space-y-2">
              {Object.entries(labels).map(([itemKey, label]) => (
                <ChecklistItem
                  key={itemKey}
                  label={label}
                  value={sectionData[itemKey]}
                  onChange={(value) => updateSectionItem(sectionKey, itemKey, value)}
                  readonly={readonly}
                  isExcluded={isItemExcluded(sectionKey, itemKey)}
                  onToggleExclude={() => toggleItemExclusion(sectionKey, itemKey)}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Additional Notes */}
      <div className={cn("space-y-3", isSectionExcluded("additional_notes") && "opacity-50")}>
        <SectionHeader
          sectionKey="additional_notes"
          title={DISABLED_REFUGE_SECTION_LABELS.additional_notes}
        />
        <Textarea
          value={checklist.additional_notes}
          onChange={(e) => updateAdditionalNotes(e.target.value)}
          placeholder="Any additional notes or observations..."
          disabled={readonly}
          className="min-h-[100px]"
        />
      </div>
    </div>
  );
}
