import { useState, useEffect } from "react";
import {
  ResponsiveDialog,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogBody,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  SYSTEM_TYPES,
  SYSTEM_TYPE_LABELS,
  BUILDING_TYPES,
  BUILDING_TYPE_LABELS,
  JOB_CATEGORIES,
  JOB_CATEGORY_LABELS,
  REGIONS,
  REGION_LABELS,
  BS5839_CATEGORIES,
  type SystemType,
  type BuildingType,
  type JobCategory,
  type Region,
  type Bs5839Category,
} from "@/types/cost-intelligence";

interface ClassifyJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  jobLabel?: string;
  onSaved?: () => void;
}

export function ClassifyJobDialog({ open, onOpenChange, jobId, jobLabel, onSaved }: ClassifyJobDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [systemType, setSystemType] = useState<SystemType | "">("");
  const [buildingType, setBuildingType] = useState<BuildingType | "">("");
  const [jobCategory, setJobCategory] = useState<JobCategory | "">("");
  const [region, setRegion] = useState<Region | "">("");
  const [bs5839, setBs5839] = useState<Bs5839Category | "">("");
  const [deviceCount, setDeviceCount] = useState<string>("");
  const [loopCount, setLoopCount] = useState<string>("");
  const [giaSqm, setGiaSqm] = useState<string>("");
  const [scopeSummary, setScopeSummary] = useState("");

  useEffect(() => {
    if (!open || !jobId) return;
    setLoading(true);
    (async () => {
      const { data } = await (supabase as any)
        .schema("cost_intelligence")
        .from("job_classifications")
        .select("*")
        .eq("job_id", jobId)
        .maybeSingle();
      if (data) {
        setSystemType(data.system_type ?? "");
        setBuildingType(data.building_type ?? "");
        setJobCategory(data.job_category ?? "");
        setRegion(data.region ?? "");
        setBs5839(data.bs5839_category ?? "");
        setDeviceCount(data.device_count_total != null ? String(data.device_count_total) : "");
        setLoopCount(data.loop_count != null ? String(data.loop_count) : "");
        setGiaSqm(data.gia_sqm != null ? String(data.gia_sqm) : "");
        setScopeSummary(data.scope_summary ?? "");
      } else {
        setSystemType(""); setBuildingType(""); setJobCategory("");
        setRegion(""); setBs5839(""); setDeviceCount("");
        setLoopCount(""); setGiaSqm(""); setScopeSummary("");
      }
      setLoading(false);
    })();
  }, [open, jobId]);

  const handleSave = async () => {
    if (!systemType || !buildingType || !jobCategory) {
      toast.error("System type, building type and job category are required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        job_id: jobId,
        system_type: systemType,
        building_type: buildingType,
        job_category: jobCategory,
        region: region || null,
        bs5839_category: bs5839 || null,
        device_count_total: deviceCount ? parseInt(deviceCount) : 0,
        loop_count: loopCount ? parseInt(loopCount) : 0,
        gia_sqm: giaSqm ? parseFloat(giaSqm) : null,
        scope_summary: scopeSummary || null,
        classified_by: (await supabase.auth.getUser()).data.user?.id ?? null,
        classified_at: new Date().toISOString(),
      };
      const { error } = await (supabase as any)
        .schema("cost_intelligence")
        .from("job_classifications")
        .upsert(payload, { onConflict: "job_id" });
      if (error) throw error;
      toast.success("Job classified");
      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to save classification");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle>Classify Job</ResponsiveDialogTitle>
        <ResponsiveDialogDescription>
          Tag {jobLabel || "this job"} so it contributes to the cost intelligence benchmark pool.
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>
      <ResponsiveDialogBody>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScopeFields
            systemType={systemType} setSystemType={setSystemType}
            buildingType={buildingType} setBuildingType={setBuildingType}
            jobCategory={jobCategory} setJobCategory={setJobCategory}
            region={region} setRegion={setRegion}
            bs5839={bs5839} setBs5839={setBs5839}
            deviceCount={deviceCount} setDeviceCount={setDeviceCount}
            loopCount={loopCount} setLoopCount={setLoopCount}
            giaSqm={giaSqm} setGiaSqm={setGiaSqm}
          />
        )}
        <div className="space-y-2 mt-4">
          <Label>Scope summary (optional)</Label>
          <Textarea
            value={scopeSummary}
            onChange={(e) => setScopeSummary(e.target.value)}
            placeholder="One-line description of the scope of works..."
            className="min-h-[60px]"
          />
        </div>
      </ResponsiveDialogBody>
      <ResponsiveDialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving || loading}>
          {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save classification"}
        </Button>
      </ResponsiveDialogFooter>
    </ResponsiveDialog>
  );
}

// Shared scope fields — reused inside the quote dialog as well.
export interface ScopeFieldsProps {
  systemType: SystemType | "";
  setSystemType: (v: SystemType | "") => void;
  buildingType: BuildingType | "";
  setBuildingType: (v: BuildingType | "") => void;
  jobCategory: JobCategory | "";
  setJobCategory: (v: JobCategory | "") => void;
  region: Region | "";
  setRegion: (v: Region | "") => void;
  bs5839: Bs5839Category | "";
  setBs5839: (v: Bs5839Category | "") => void;
  deviceCount: string;
  setDeviceCount: (v: string) => void;
  loopCount: string;
  setLoopCount: (v: string) => void;
  giaSqm: string;
  setGiaSqm: (v: string) => void;
}

export function ScopeFields(p: ScopeFieldsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label className="text-xs">System type *</Label>
        <Select value={p.systemType} onValueChange={(v) => p.setSystemType(v as SystemType)}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Select..." /></SelectTrigger>
          <SelectContent className="pointer-events-auto">
            {SYSTEM_TYPES.map(t => <SelectItem key={t} value={t}>{SYSTEM_TYPE_LABELS[t]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Building type *</Label>
        <Select value={p.buildingType} onValueChange={(v) => p.setBuildingType(v as BuildingType)}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Select..." /></SelectTrigger>
          <SelectContent className="pointer-events-auto">
            {BUILDING_TYPES.map(t => <SelectItem key={t} value={t}>{BUILDING_TYPE_LABELS[t]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Job category</Label>
        <Select value={p.jobCategory} onValueChange={(v) => p.setJobCategory(v as JobCategory)}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Select..." /></SelectTrigger>
          <SelectContent className="pointer-events-auto">
            {JOB_CATEGORIES.map(t => <SelectItem key={t} value={t}>{JOB_CATEGORY_LABELS[t]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Region</Label>
        <Select value={p.region} onValueChange={(v) => p.setRegion(v as Region)}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Select..." /></SelectTrigger>
          <SelectContent className="pointer-events-auto">
            {REGIONS.map(t => <SelectItem key={t} value={t}>{REGION_LABELS[t]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">BS 5839 category</Label>
        <Select value={p.bs5839} onValueChange={(v) => p.setBs5839(v as Bs5839Category)}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Select..." /></SelectTrigger>
          <SelectContent className="pointer-events-auto">
            {BS5839_CATEGORIES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Devices</Label>
          <Input type="number" min={0} value={p.deviceCount} onChange={(e) => p.setDeviceCount(e.target.value)} className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Loops</Label>
          <Input type="number" min={0} value={p.loopCount} onChange={(e) => p.setLoopCount(e.target.value)} className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">GIA m²</Label>
          <Input type="number" min={0} step="0.01" value={p.giaSqm} onChange={(e) => p.setGiaSqm(e.target.value)} className="h-9" />
        </div>
      </div>
    </div>
  );
}
