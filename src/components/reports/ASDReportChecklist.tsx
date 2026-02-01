import { Check, X, Minus, EyeOff, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ASDChecklist,
  ASD_CHECKLIST_LABELS,
  ASD_SECTION_LABELS,
  ENVIRONMENT_CLASSES,
} from "@/services/asdChecklistService";

interface ASDReportChecklistProps {
  checklist: ASDChecklist;
  onChange: (checklist: ASDChecklist) => void;
  readonly?: boolean;
}

type CheckValue = boolean | null;

type SectionKey = 
  | "pre_service_actions"
  | "airflow_readings"
  | "faults_and_repairs"
  | "cleaning_activities"
  | "system_checks"
  | "additional_activities"
  | "environment_and_filter_info";

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
  const updatePreServiceAction = (key: keyof ASDChecklist["pre_service_actions"], value: CheckValue) => {
    onChange({
      ...checklist,
      pre_service_actions: {
        ...checklist.pre_service_actions,
        [key]: value,
      },
    });
  };

  const updateAirflowReading = (
    pipe: "pipe_1" | "pipe_2" | "pipe_3" | "pipe_4",
    field: "before" | "after",
    value: string
  ) => {
    onChange({
      ...checklist,
      airflow_readings: {
        ...checklist.airflow_readings,
        [pipe]: {
          ...checklist.airflow_readings[pipe],
          [field]: value,
        },
      },
    });
  };

  const updateFaultsAndRepairs = (key: string, value: CheckValue | string) => {
    onChange({
      ...checklist,
      faults_and_repairs: {
        ...checklist.faults_and_repairs,
        [key]: value,
      },
    });
  };

  const updateCleaningActivity = (key: keyof ASDChecklist["cleaning_activities"], value: CheckValue) => {
    onChange({
      ...checklist,
      cleaning_activities: {
        ...checklist.cleaning_activities,
        [key]: value,
      },
    });
  };

  const updateSystemCheck = (key: keyof ASDChecklist["system_checks"], value: CheckValue) => {
    onChange({
      ...checklist,
      system_checks: {
        ...checklist.system_checks,
        [key]: value,
      },
    });
  };

  const updateAdditionalActivities = (value: string) => {
    onChange({
      ...checklist,
      additional_activities: value,
    });
  };

  const updateEnvironmentInfo = (key: string, value: string) => {
    onChange({
      ...checklist,
      environment_and_filter_info: {
        ...checklist.environment_and_filter_info,
        [key]: value,
      },
    });
  };

  const isSectionExcluded = (section: SectionKey) => {
    return checklist.excluded_sections?.includes(section) ?? false;
  };

  const toggleSectionExclusion = (section: SectionKey) => {
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

  const getChecklistStats = (items: Record<string, CheckValue>) => {
    const values = Object.values(items);
    const passed = values.filter((v) => v === true).length;
    const failed = values.filter((v) => v === false).length;
    const total = values.length;
    return { passed, failed, pending: total - passed - failed };
  };

  const preServiceStats = getChecklistStats(checklist.pre_service_actions);
  const cleaningStats = getChecklistStats(checklist.cleaning_activities);
  const systemStats = getChecklistStats(checklist.system_checks);

  const SectionHeader = ({
    sectionKey,
    title,
    stats,
  }: {
    sectionKey: SectionKey;
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

  return (
    <div className="space-y-6">
      {/* Pre-Service Actions */}
      <div className={cn("space-y-3", isSectionExcluded("pre_service_actions") && "opacity-50")}>
        <SectionHeader
          sectionKey="pre_service_actions"
          title={ASD_SECTION_LABELS.pre_service_actions}
          stats={preServiceStats}
        />
        <div className="space-y-2">
          {Object.entries(ASD_CHECKLIST_LABELS.pre_service_actions).map(([key, label]) => (
            <ChecklistItem
              key={key}
              label={label}
              value={checklist.pre_service_actions[key as keyof ASDChecklist["pre_service_actions"]]}
              onChange={(value) => updatePreServiceAction(key as keyof ASDChecklist["pre_service_actions"], value)}
              readonly={readonly}
            />
          ))}
        </div>
      </div>

      {/* Airflow Readings */}
      <div className={cn("space-y-3", isSectionExcluded("airflow_readings") && "opacity-50")}>
        <SectionHeader
          sectionKey="airflow_readings"
          title={ASD_SECTION_LABELS.airflow_readings}
        />
        <div className="bg-muted/30 rounded-lg p-4 border">
          <div className="grid grid-cols-3 gap-2 mb-2 text-sm font-medium text-muted-foreground">
            <div>Pipe</div>
            <div>Before Service</div>
            <div>After Service</div>
          </div>
          {(["pipe_1", "pipe_2", "pipe_3", "pipe_4"] as const).map((pipe, index) => (
            <div key={pipe} className="grid grid-cols-3 gap-2 items-center py-2">
              <Label className="text-sm">Pipe {index + 1}</Label>
              <Input
                type="text"
                value={checklist.airflow_readings[pipe].before}
                onChange={(e) => updateAirflowReading(pipe, "before", e.target.value)}
                placeholder="L/min"
                disabled={readonly}
                className="h-9"
              />
              <Input
                type="text"
                value={checklist.airflow_readings[pipe].after}
                onChange={(e) => updateAirflowReading(pipe, "after", e.target.value)}
                placeholder="L/min"
                disabled={readonly}
                className="h-9"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Faults & Repairs */}
      <div className={cn("space-y-3", isSectionExcluded("faults_and_repairs") && "opacity-50")}>
        <SectionHeader
          sectionKey="faults_and_repairs"
          title={ASD_SECTION_LABELS.faults_and_repairs}
        />
        <div className="space-y-3">
          <ChecklistItem
            label={ASD_CHECKLIST_LABELS.faults_and_repairs.detector_faults_present}
            value={checklist.faults_and_repairs.detector_faults_present}
            onChange={(value) => updateFaultsAndRepairs("detector_faults_present", value)}
            readonly={readonly}
          />
          <div className="space-y-2">
            <Label className="text-sm">Actions Taken</Label>
            <Textarea
              value={checklist.faults_and_repairs.actions_taken}
              onChange={(e) => updateFaultsAndRepairs("actions_taken", e.target.value)}
              placeholder="Describe actions taken to resolve faults..."
              disabled={readonly}
              className="min-h-[80px]"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Parts Replaced</Label>
            <Textarea
              value={checklist.faults_and_repairs.parts_replaced}
              onChange={(e) => updateFaultsAndRepairs("parts_replaced", e.target.value)}
              placeholder="List any parts replaced..."
              disabled={readonly}
              className="min-h-[60px]"
            />
          </div>
        </div>
      </div>

      {/* Cleaning Activities */}
      <div className={cn("space-y-3", isSectionExcluded("cleaning_activities") && "opacity-50")}>
        <SectionHeader
          sectionKey="cleaning_activities"
          title={ASD_SECTION_LABELS.cleaning_activities}
          stats={cleaningStats}
        />
        <div className="space-y-2">
          {Object.entries(ASD_CHECKLIST_LABELS.cleaning_activities).map(([key, label]) => (
            <ChecklistItem
              key={key}
              label={label}
              value={checklist.cleaning_activities[key as keyof ASDChecklist["cleaning_activities"]]}
              onChange={(value) => updateCleaningActivity(key as keyof ASDChecklist["cleaning_activities"], value)}
              readonly={readonly}
            />
          ))}
        </div>
      </div>

      {/* System Checks */}
      <div className={cn("space-y-3", isSectionExcluded("system_checks") && "opacity-50")}>
        <SectionHeader
          sectionKey="system_checks"
          title={ASD_SECTION_LABELS.system_checks}
          stats={systemStats}
        />
        <div className="space-y-2">
          {Object.entries(ASD_CHECKLIST_LABELS.system_checks).map(([key, label]) => (
            <ChecklistItem
              key={key}
              label={label}
              value={checklist.system_checks[key as keyof ASDChecklist["system_checks"]]}
              onChange={(value) => updateSystemCheck(key as keyof ASDChecklist["system_checks"], value)}
              readonly={readonly}
            />
          ))}
        </div>
      </div>

      {/* Additional Activities */}
      <div className={cn("space-y-3", isSectionExcluded("additional_activities") && "opacity-50")}>
        <SectionHeader
          sectionKey="additional_activities"
          title={ASD_SECTION_LABELS.additional_activities}
        />
        <Textarea
          value={checklist.additional_activities}
          onChange={(e) => updateAdditionalActivities(e.target.value)}
          placeholder="Any additional activities performed..."
          disabled={readonly}
          className="min-h-[100px]"
        />
      </div>

      {/* Environment & Filter Information */}
      <div className={cn("space-y-3", isSectionExcluded("environment_and_filter_info") && "opacity-50")}>
        <SectionHeader
          sectionKey="environment_and_filter_info"
          title={ASD_SECTION_LABELS.environment_and_filter_info}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm">Environment Class</Label>
            <Select
              value={checklist.environment_and_filter_info.environment_class}
              onValueChange={(value) => updateEnvironmentInfo("environment_class", value)}
              disabled={readonly}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {ENVIRONMENT_CLASSES.map((cls) => (
                  <SelectItem key={cls.value} value={cls.value}>
                    {cls.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Filter Replacement Frequency</Label>
            <Input
              type="text"
              value={checklist.environment_and_filter_info.filter_replacement_frequency_months}
              onChange={(e) => updateEnvironmentInfo("filter_replacement_frequency_months", e.target.value)}
              placeholder="e.g., 12 months"
              disabled={readonly}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
