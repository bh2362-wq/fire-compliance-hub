import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SmartSignature } from "@/components/ui/smart-signature";
import {
  Plus, Trash2, Save, FileDown,
  AlertCircle, CheckCircle2, Wind, Gauge, Clock, Zap,
} from "lucide-react";
import { DocDialogShell, StickyHeader, StickyFooter, DocBody, DocBlock, TitleBlock } from "./_DocLayout";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  buildEmptyASDPayload, createASDSubmission, updateASDSubmission,
  validateASDPayload, calcFlowWithin20, TRANSPORT_TIME_LIMITS,
  ASD_MANUFACTURERS, ASD_PIPE_MATERIALS, ASD_PANEL_TYPES,
  type ASDPayload, type ASDPipeRecord, type ASDClass,
} from "@/services/asdCommissioningService";
import { generateASDCommissioningPDF } from "@/lib/asdCommissioningPdfGenerator";

// ── Steps ──────────────────────────────────────────────────────────────────────
const STEPS = [
  "Installation Type",
  "Premises",
  "System Details",
  "Pre-Mod Record",
  "Pre-Commission",
  "Pipe Integrity",
  "Flow Rates",
  "Transport Time",
  "Alarm Thresholds",
  "Fault & Panel Tests",
  "PSU & Battery",
  "Declaration",
] as const;

// ── Props ──────────────────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  siteId?: string | null;
  customerId?: string | null;
  visitId?: string | null;
  prefill?: Partial<ASDPayload>;
  onSaved?: () => void;
}

function uid() { return Math.random().toString(36).slice(2, 10); }

function CheckRow({ label, checked, onCheck, note }: { label: string; checked: boolean; onCheck: (v: boolean) => void; note?: string }) {
  return (
    <div className={cn("flex items-start gap-3 p-2.5 rounded-lg border transition-colors", checked ? "border-green-300/60 bg-green-50 dark:bg-green-950/20" : "border-border")}>
      <Checkbox checked={checked} onCheckedChange={v => onCheck(!!v)} className="mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <p className="text-xs font-medium">{label}</p>
        {note && <p className="text-[10px] text-muted-foreground mt-0.5">{note}</p>}
      </div>
      {checked && <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0 mt-0.5" />}
    </div>
  );
}

function ResultSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("h-8 text-xs", value === "Pass" ? "border-green-400/60 text-green-700" : value === "Fail" ? "border-red-400/60 text-red-700" : "")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="Pass">✓ Pass</SelectItem>
        <SelectItem value="Fail">✗ Fail</SelectItem>
        <SelectItem value="N/A">— N/A</SelectItem>
      </SelectContent>
    </Select>
  );
}

// ── Main form ──────────────────────────────────────────────────────────────────
export default function ASDCommissioningForm({ open, onOpenChange, siteId, customerId, visitId, prefill, onSaved }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [payload, setPayload] = useState<ASDPayload>(buildEmptyASDPayload());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setSubmissionId(null);
    setPayload({ ...buildEmptyASDPayload(), ...(prefill ?? {}) });
  }, [open]);

  const errors = useMemo(() => validateASDPayload(payload), [payload]);
  const errorsByStep = useMemo(() => {
    const m: Record<number, string[]> = {};
    errors.forEach(e => { (m[e.step] ??= []).push(e.message); });
    return m;
  }, [errors]);

  function update<K extends keyof ASDPayload>(key: K, value: ASDPayload[K]) {
    setPayload(p => ({ ...p, [key]: value }));
  }

  // Auto-set transport time limit when class changes
  function setClass(cls: ASDClass) {
    setPayload(p => ({ ...p, sensitivity_class: cls, transport_time_limit: TRANSPORT_TIME_LIMITS[cls] }));
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  async function handleSave(complete = false) {
    if (!user) return;
    setSaving(true);
    try {
      if (submissionId) {
        await updateASDSubmission(submissionId, payload, complete ? "completed" : "draft");
      } else {
        const sub = await createASDSubmission(payload, {
          siteId: siteId || undefined, customerId: customerId || undefined,
          visitId: visitId || undefined, userId: user.id,
        });
        setSubmissionId(sub.id);
      }
      toast.success(complete ? "ASD commissioning certificate saved" : "Draft saved");
      if (complete) { onSaved?.(); onOpenChange(false); }
    } catch (err: any) {
      toast.error(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleGeneratePDF() {
    await handleSave(false);
    await generateASDCommissioningPDF(payload);
  }

  // ── Pipe records helpers ────────────────────────────────────────────────────
  function addPipe() {
    const p: ASDPipeRecord = { id: uid(), pipe_reference: `Pipe ${payload.pipe_records.length + 1}`, design_flow_lpm: 0, measured_flow_lpm: 0, within_20_percent: false, notes: "" };
    update("pipe_records", [...payload.pipe_records, p]);
  }
  function removePipe(id: string) {
    update("pipe_records", payload.pipe_records.filter(p => p.id !== id));
  }
  function updatePipe(id: string, field: keyof ASDPipeRecord, value: any) {
    update("pipe_records", payload.pipe_records.map(p => {
      if (p.id !== id) return p;
      const next = { ...p, [field]: value };
      if (field === "design_flow_lpm" || field === "measured_flow_lpm") {
        next.within_20_percent = calcFlowWithin20(
          field === "design_flow_lpm" ? value : p.design_flow_lpm,
          field === "measured_flow_lpm" ? value : p.measured_flow_lpm
        );
      }
      return next;
    }));
  }

  const isModification = payload.installation_type === "modification";
  const skipPreMod = !isModification;
  const effectiveStep = (s: number) => isModification ? s : s >= 3 ? s + 1 : s; // skip pre-mod step for new installs

  // ── Step content ────────────────────────────────────────────────────────────

  function renderStep() {
    switch (step) {
      // ── Step 0: Installation type ───────────────────────────────────────────
      case 0: return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(["new", "modification"] as const).map(t => (
              <button key={t} type="button" onClick={() => update("installation_type", t)}
                className={cn("p-4 rounded-xl border-2 text-left transition-all space-y-1",
                  payload.installation_type === t ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}>
                <p className="font-semibold text-sm capitalize">{t === "new" ? "New Installation" : "Modification of Existing"}</p>
                <p className="text-xs text-muted-foreground">
                  {t === "new"
                    ? "Full commissioning of a newly installed ASD system"
                    : "Post-modification commissioning following changes to an existing ASD system"}
                </p>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Certificate Reference *</Label>
              <Input value={payload.cert_reference} onChange={e => update("cert_reference", e.target.value)} placeholder="e.g. ASD-COMM-2026-001" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Date of Commissioning</Label>
              <Input type="date" value={payload.cert_date} onChange={e => update("cert_date", e.target.value)} />
            </div>
          </div>
          {isModification && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 text-xs text-amber-800">
              <p className="font-semibold flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" />Modification commissioning</p>
              <p className="mt-1">You will be asked to record the pre-modification configuration in Step 4 before proceeding to testing. Only affected areas need to be re-tested.</p>
            </div>
          )}
        </div>
      );

      // ── Step 1: Premises ────────────────────────────────────────────────────
      case 1: return (
        <div className="space-y-3">
          {[
            ["Premises Name *", "premises_name", "text", "e.g. Server Room B — Palantir"],
            ["Address", "premises_address", "text", "Full site address"],
            ["Postcode", "premises_postcode", "text", ""],
            ["Responsible Person", "responsible_person", "text", "Name of site responsible person"],
            ["Responsible Person Email", "responsible_email", "email", ""],
          ].map(([label, key, type, placeholder]) => (
            <div key={key} className="space-y-1.5">
              <Label className="text-xs font-semibold">{label as string}</Label>
              <Input type={type as string} value={(payload as any)[key as string]} onChange={e => update(key as any, e.target.value)} placeholder={placeholder as string} />
            </div>
          ))}
        </div>
      );

      // ── Step 2: System details ──────────────────────────────────────────────
      case 2: return (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">ASD Manufacturer *</Label>
              <Select value={payload.asd_manufacturer} onValueChange={v => update("asd_manufacturer", v)}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{ASD_MANUFACTURERS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Model / Part Number *</Label>
              <Input value={payload.asd_model} onChange={e => update("asd_model", e.target.value)} placeholder="e.g. VESDA VLP-500" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Serial Number</Label>
              <Input value={payload.asd_serial_number} onChange={e => update("asd_serial_number", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Software Version</Label>
              <Input value={payload.software_version} onChange={e => update("software_version", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">EN 54-20 Sensitivity Class</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["A", "B", "C"] as ASDClass[]).map(cls => (
                <button key={cls} type="button" onClick={() => setClass(cls)}
                  className={cn("p-3 rounded-lg border text-left transition-all",
                    payload.sensitivity_class === cls ? "border-primary bg-primary/10" : "border-border hover:border-primary/40")}>
                  <p className="font-bold text-sm">Class {cls}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {cls === "A" ? "Very High Sensitivity\n≤0.05 dB/m | ≤60s" : cls === "B" ? "Enhanced Sensitivity\n≤0.15 dB/m | ≤90s" : "Normal Sensitivity\n≤2 dB/m | ≤120s"}
                  </p>
                  <p className="text-[10px] font-medium text-primary mt-1">Max transport: {TRANSPORT_TIME_LIMITS[cls]}s</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Number of Pipes</Label>
              <Input type="number" min={1} value={payload.num_pipes} onChange={e => update("num_pipes", parseInt(e.target.value) || 1)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Total Sampling Holes</Label>
              <Input type="number" min={0} value={payload.num_sampling_holes} onChange={e => update("num_sampling_holes", parseInt(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Pipe Material</Label>
              <Select value={payload.pipe_material} onValueChange={v => update("pipe_material", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ASD_PIPE_MATERIALS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Protected Area Description</Label>
            <Textarea value={payload.protected_area} onChange={e => update("protected_area", e.target.value)} rows={2} placeholder="e.g. Server room — 1st floor, 200m², raised floor with underfloor cabling" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Design Software Used</Label>
            <Input value={payload.design_software_used} onChange={e => update("design_software_used", e.target.value)} placeholder="e.g. VESDA Designer / FAAST Design Tool / Manual calculation" />
          </div>
        </div>
      );

      // ── Step 3: Pre-modification record (modification only) ─────────────────
      case 3: return isModification ? (
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200/60 text-xs text-blue-800">
            Record the system configuration <strong>before</strong> the modification. This forms the baseline for comparing post-modification performance.
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Existing System Configuration</Label>
            <Textarea value={payload.pre_mod_config_description} onChange={e => update("pre_mod_config_description", e.target.value)} rows={3} placeholder="Describe existing pipe layout, number of holes, current sensitivity class, threshold settings…" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Description of Modification *</Label>
            <Textarea value={payload.modification_description} onChange={e => update("modification_description", e.target.value)} rows={3} placeholder="Describe what changed — additional pipes, new sampling holes, detector replacement, threshold change…" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Areas Affected</Label>
            <Input value={payload.areas_affected} onChange={e => update("areas_affected", e.target.value)} placeholder="e.g. Pipe 2 — east side server racks" />
          </div>
          <CheckRow label="Pre-modification flow rates documented" checked={payload.pre_mod_flow_documented} onCheck={v => update("pre_mod_flow_documented", v)} note="Record existing flow readings before starting work" />
          <CheckRow label="Pre-modification threshold settings documented" checked={payload.pre_mod_threshold_documented} onCheck={v => update("pre_mod_threshold_documented", v)} />
        </div>
      ) : (
        <div className="text-center py-10 text-muted-foreground">
          <p className="text-sm">This step is not applicable for new installations.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setStep(s => s + 1)}>Skip →</Button>
        </div>
      );

      // ── Step 4: Pre-commissioning inspection ────────────────────────────────
      case 4: return (
        <div className="space-y-2">
          <div className="p-3 mb-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 text-xs text-amber-800">
            <strong>FIA CoP requirement:</strong> The protected area must be in its final operational state before testing begins — AC running, floors and ceilings intact, equipment installed and operating normally.
          </div>
          {[
            ["Area in final operational state", "area_final_state", "AC running, raised floors down, all equipment operational"],
            ["Pipework visually inspected — no damage, sags or kinks", "pipework_visually_inspected", "Check for swarf, debris inside pipes if newly installed"],
            ["All pipework correctly labelled", "pipework_labelled", "Xtralis red/white pipe labelled along length; capillary points labelled"],
            ["All sampling holes open and unobstructed", "sampling_holes_open", "Check no holes blocked by insulation, paint, or debris"],
            ["Sampling hole count verified against design", "sampling_holes_count_verified", ""],
            ["Inlet filter installed and clean", "filter_installed", "Dirty filter will restrict flow and affect sensitivity"],
            ["Test points identified and accessible", "test_points_identified", "Required for transport time and functional testing"],
            ["Detector unit accessible for commissioning", "detector_accessible", ""],
          ].map(([label, key, note]) => (
            <CheckRow key={key} label={label as string} checked={(payload as any)[key as string]} onCheck={v => update(key as any, v)} note={note as string || undefined} />
          ))}
          <div className="space-y-1.5 mt-2">
            <Label className="text-xs font-semibold">Pre-commissioning Notes</Label>
            <Textarea value={payload.pre_commission_notes} onChange={e => update("pre_commission_notes", e.target.value)} rows={2} placeholder="Any observations or issues noted during pre-commission inspection…" />
          </div>
        </div>
      );

      // ── Step 5: Pipe integrity test ─────────────────────────────────────────
      case 5: return (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Test Method</Label>
              <Select value={payload.integrity_test_method} onValueChange={v => update("integrity_test_method", v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pressure">Pressure test</SelectItem>
                  <SelectItem value="Vacuum">Vacuum test</SelectItem>
                  <SelectItem value="Smoke">Smoke propagation</SelectItem>
                  <SelectItem value="N/A">Not performed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Test Result</Label>
              <ResultSelect value={payload.integrity_test_result} onChange={v => update("integrity_test_result", v as any)} />
            </div>
            {payload.integrity_test_method !== "N/A" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Test Pressure / Vacuum (Pa)</Label>
                  <Input type="number" value={payload.integrity_test_pressure_pa} onChange={e => update("integrity_test_pressure_pa", parseFloat(e.target.value) || 0)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Duration (minutes)</Label>
                  <Input type="number" min={1} value={payload.integrity_test_duration_mins} onChange={e => update("integrity_test_duration_mins", parseInt(e.target.value) || 5)} />
                </div>
              </>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Notes</Label>
            <Textarea value={payload.integrity_test_notes} onChange={e => update("integrity_test_notes", e.target.value)} rows={2} placeholder="Any leaks found, corrective action taken, re-test results…" />
          </div>
        </div>
      );

      // ── Step 6: Flow rate verification ─────────────────────────────────────
      case 6: return (
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200/60 text-xs text-blue-800">
            <strong>FIA CoP §8.3:</strong> All flow readings must be recorded at commissioning. Future maintenance checks should confirm values within <strong>±20%</strong> of these baseline figures. Flow normalisation may only be performed at Level 3 access.
          </div>

          {payload.pipe_records.map((pipe, idx) => {
            const deviation = pipe.design_flow_lpm > 0
              ? Math.abs((pipe.measured_flow_lpm - pipe.design_flow_lpm) / pipe.design_flow_lpm * 100)
              : null;
            return (
              <Card key={pipe.id} className={cn("overflow-hidden", !pipe.within_20_percent && pipe.measured_flow_lpm > 0 ? "border-red-300/60" : pipe.within_20_percent ? "border-green-300/60" : "")}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Gauge className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <Input value={pipe.pipe_reference} onChange={e => updatePipe(pipe.id, "pipe_reference", e.target.value)} className="flex-1 font-semibold text-sm h-7" placeholder="Pipe reference" />
                    {payload.pipe_records.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive flex-shrink-0" onClick={() => removePipe(pipe.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Design Flow (L/min)</Label>
                      <Input type="number" min={0} step={0.1} value={pipe.design_flow_lpm} onChange={e => updatePipe(pipe.id, "design_flow_lpm", parseFloat(e.target.value) || 0)} className="h-7 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Measured Flow (L/min)</Label>
                      <Input type="number" min={0} step={0.1} value={pipe.measured_flow_lpm} onChange={e => updatePipe(pipe.id, "measured_flow_lpm", parseFloat(e.target.value) || 0)}
                        className={cn("h-7 text-sm", pipe.measured_flow_lpm > 0 && (pipe.within_20_percent ? "border-green-400/60" : "border-red-400/60"))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Deviation / Status</Label>
                      <div className="h-7 flex items-center">
                        {deviation !== null ? (
                          <Badge className={cn("text-[9px]", pipe.within_20_percent ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")}>
                            {pipe.within_20_percent ? "✓" : "✗"} {deviation.toFixed(1)}%
                          </Badge>
                        ) : <span className="text-[10px] text-muted-foreground">—</span>}
                      </div>
                    </div>
                  </div>
                  <Input value={pipe.notes} onChange={e => updatePipe(pipe.id, "notes", e.target.value)} placeholder="Notes for this pipe…" className="text-xs h-7" />
                </CardContent>
              </Card>
            );
          })}

          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={addPipe}>
            <Plus className="h-3.5 w-3.5" />Add Pipe
          </Button>

          <CheckRow
            label="Flow normalisation performed"
            checked={payload.flow_normalisation_performed}
            onCheck={v => update("flow_normalisation_performed", v)}
            note="EN 54-20: flow normalisation can only be performed as a voluntary action at Level 3 access"
          />
          {payload.flow_normalisation_performed && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Access Level Used</Label>
              <Input value={payload.flow_normalisation_access_level} onChange={e => update("flow_normalisation_access_level", e.target.value)} placeholder="Level 3" />
            </div>
          )}
        </div>
      );

      // ── Step 7: Transport time test ─────────────────────────────────────────
      case 7: return (
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200/60 text-xs text-blue-800">
            <strong>EN 54-20 requirement:</strong> Transport time from the furthest sampling hole must not exceed{" "}
            <strong>{payload.transport_time_limit}s (Class {payload.sensitivity_class})</strong>.
            Measure from moment of aerosol application to alarm indication.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Furthest Sampling Hole Location</Label>
              <Input value={payload.furthest_hole_location} onChange={e => update("furthest_hole_location", e.target.value)} placeholder="e.g. Pipe 2, Hole 8 — NE corner rack top" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Test Method</Label>
              <Select value={payload.transport_time_test_method} onValueChange={v => update("transport_time_test_method", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Calibrated aerosol">Calibrated test aerosol</SelectItem>
                  <SelectItem value="Canned smoke">Canned smoke</SelectItem>
                  <SelectItem value="Detector simulation">Detector simulation tool</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Measured Transport Time (seconds)</Label>
              <Input type="number" min={0} value={payload.transport_time_measured_s}
                onChange={e => {
                  const val = parseInt(e.target.value) || 0;
                  setPayload(p => ({ ...p, transport_time_measured_s: val, transport_time_pass: val > 0 && val <= p.transport_time_limit }));
                }}
                className={cn("", payload.transport_time_measured_s > 0 && (payload.transport_time_pass ? "border-green-400/60" : "border-red-400/60"))}
              />
            </div>
            <div className="space-y-1 flex flex-col justify-end">
              <Label className="text-[10px] text-muted-foreground">Result vs Class {payload.sensitivity_class} limit ({payload.transport_time_limit}s)</Label>
              {payload.transport_time_measured_s > 0 ? (
                <Badge className={cn("text-xs w-fit", payload.transport_time_pass ? "bg-green-100 text-green-800 border-green-300/60" : "bg-red-100 text-red-800 border-red-300/60")}>
                  {payload.transport_time_pass ? `✓ Pass — ${payload.transport_time_measured_s}s` : `✗ Fail — ${payload.transport_time_measured_s}s exceeds ${payload.transport_time_limit}s`}
                </Badge>
              ) : <span className="text-xs text-muted-foreground">—</span>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Notes</Label>
            <Textarea value={payload.transport_time_notes} onChange={e => update("transport_time_notes", e.target.value)} rows={2} placeholder="Ambient conditions, air conditioning airflow, any repeat tests…" />
          </div>
        </div>
      );

      // ── Step 8: Alarm thresholds ────────────────────────────────────────────
      case 8: return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Sensitivity Test Method</Label>
            <Select value={payload.sensitivity_test_method} onValueChange={v => update("sensitivity_test_method", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Calibrated test aerosol">Calibrated test aerosol</SelectItem>
                <SelectItem value="Manufacturer tool">Manufacturer commissioning tool</SelectItem>
                <SelectItem value="Canned smoke">Canned smoke (indicative only)</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted/40 text-[10px] font-semibold text-muted-foreground">
              <div className="col-span-3">Level</div>
              <div className="col-span-4">Set Value (dB/m or %/m)</div>
              <div className="col-span-3">Test Result</div>
              <div className="col-span-2">Notes</div>
            </div>
            {payload.thresholds.map((t, idx) => (
              <div key={t.level} className="grid grid-cols-12 gap-2 px-3 py-2 border-t items-center">
                <div className="col-span-3">
                  <Badge variant="outline" className={cn("text-[10px]",
                    t.level === "Alert" ? "border-yellow-400/60 text-yellow-700" :
                    t.level === "Action" ? "border-orange-400/60 text-orange-700" :
                    "border-red-400/60 text-red-700"
                  )}>{t.level}</Badge>
                </div>
                <div className="col-span-4">
                  <Input value={t.set_value_obs} onChange={e => {
                    const ts = [...payload.thresholds];
                    ts[idx] = { ...ts[idx], set_value_obs: e.target.value };
                    update("thresholds", ts);
                  }} placeholder="e.g. 0.05 dB/m" className="h-7 text-xs" />
                </div>
                <div className="col-span-3">
                  <ResultSelect value={t.test_result} onChange={v => {
                    const ts = [...payload.thresholds];
                    ts[idx] = { ...ts[idx], test_result: v as any };
                    update("thresholds", ts);
                    update("all_thresholds_pass", payload.thresholds.every((t2, i) => i === idx ? v === "Pass" : t2.test_result === "Pass" || t2.test_result === "N/A"));
                  }} />
                </div>
                <div className="col-span-2">
                  <Input value={t.notes} onChange={e => {
                    const ts = [...payload.thresholds];
                    ts[idx] = { ...ts[idx], notes: e.target.value };
                    update("thresholds", ts);
                  }} placeholder="" className="h-7 text-xs" />
                </div>
              </div>
            ))}
          </div>
        </div>
      );

      // ── Step 9: Airflow fault + panel integration ────────────────────────────
      case 9: return (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Airflow Fault Test</p>
            <div className="space-y-2">
              <CheckRow label="Airflow fault test performed" checked={payload.airflow_fault_test_performed} onCheck={v => update("airflow_fault_test_performed", v)} note="Simulate blocked pipe or sampling holes to verify fault indication" />
              {payload.airflow_fault_test_performed && (
                <>
                  <CheckRow label="Low airflow fault correctly indicated on CIE" checked={payload.low_flow_fault_indicated} onCheck={v => update("low_flow_fault_indicated", v)} note="EN 54-20: ±20% flow change must be detected" />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Time to Fault Indication (seconds)</Label>
                      <Input type="number" min={0} value={payload.low_flow_fault_time_s} onChange={e => update("low_flow_fault_time_s", parseInt(e.target.value) || 0)} />
                    </div>
                  </div>
                  <CheckRow label="Single hole blockage tested" checked={payload.single_hole_blockage_tested} onCheck={v => update("single_hole_blockage_tested", v)} note="Required where malicious damage risk exists (e.g. prison)" />
                  {payload.single_hole_blockage_tested && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Single Hole Test Result</Label>
                      <ResultSelect value={payload.single_hole_result} onChange={v => update("single_hole_result", v as any)} />
                    </div>
                  )}
                </>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Airflow Fault Test Notes</Label>
                <Textarea value={payload.airflow_fault_notes} onChange={e => update("airflow_fault_notes", e.target.value)} rows={2} />
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Panel Integration Test</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Panel Manufacturer</Label>
                <Input value={payload.panel_manufacturer} onChange={e => update("panel_manufacturer", e.target.value)} placeholder="e.g. Gent, Advanced, Hochiki" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Panel Model</Label>
                <Input value={payload.panel_model} onChange={e => update("panel_model", e.target.value)} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-xs font-semibold">Zone / Address / Input</Label>
                <Input value={payload.panel_zone_address} onChange={e => update("panel_zone_address", e.target.value)} placeholder="e.g. Loop 2, Address 14 — ASD Alert" />
              </div>
            </div>
            <div className="space-y-2">
              {([
                ["Alert signal correctly signalled at CIE", "alert_signal_tested"],
                ["Action signal correctly signalled at CIE", "action_signal_tested"],
                ["Fire 1 signal correctly signalled at CIE", "fire1_signal_tested"],
                ["Fire 2 signal correctly signalled at CIE", "fire2_signal_tested"],
                ["Isolate / disable function tested", "isolate_disable_tested"],
              ] as [string, keyof ASDPayload][]).map(([label, key]) => (
                <CheckRow key={key} label={label} checked={payload[key] as boolean} onCheck={v => update(key, v)} />
              ))}
            </div>
            <div className="space-y-1.5 mt-2">
              <Label className="text-xs font-semibold">Panel Integration Notes</Label>
              <Textarea value={payload.panel_integration_notes} onChange={e => update("panel_integration_notes", e.target.value)} rows={2} />
            </div>
          </div>
        </div>
      );

      // ── Step 10: PSU & Battery ──────────────────────────────────────────────
      case 10: return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">PSU Supply Voltage (V)</Label>
              <Input type="number" step={0.1} value={payload.psu_voltage_v} onChange={e => update("psu_voltage_v", parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Battery Type</Label>
              <Input value={payload.battery_type} onChange={e => update("battery_type", e.target.value)} placeholder="e.g. Sealed lead acid 12V 7Ah" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Battery Age (years)</Label>
              <Input type="number" min={0} value={payload.battery_age_years} onChange={e => update("battery_age_years", parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Battery Voltage (V)</Label>
              <Input type="number" step={0.1} value={payload.battery_voltage_v} onChange={e => update("battery_voltage_v", parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          <CheckRow label="PSU / mains fault correctly indicated" checked={payload.psu_fault_signalled} onCheck={v => update("psu_fault_signalled", v)} note="Remove mains supply, verify fault indication on panel and ASD unit" />
          <CheckRow label="Battery disconnect fault correctly indicated" checked={payload.battery_fault_signalled} onCheck={v => update("battery_fault_signalled", v)} note="Disconnect standby battery, verify fault indication" />
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">PSU / Battery Notes</Label>
            <Textarea value={payload.psu_notes} onChange={e => update("psu_notes", e.target.value)} rows={2} />
          </div>
        </div>
      );

      // ── Step 11: Declaration ────────────────────────────────────────────────
      case 11: return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Overall System Status</Label>
            <Select value={payload.overall_status} onValueChange={v => update("overall_status", v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Fully Operational">Fully Operational</SelectItem>
                <SelectItem value="Operational with Observations">Operational with Observations</SelectItem>
                <SelectItem value="Not Operational">Not Operational</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {payload.overall_status !== "Fully Operational" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Status Notes</Label>
              <Textarea value={payload.status_notes} onChange={e => update("status_notes", e.target.value)} rows={2} placeholder="Describe outstanding items or observations…" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Standards / References</Label>
            <Input value={payload.standard_references} onChange={e => update("standard_references", e.target.value)} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-xs font-bold">Engineer</p>
              <Input value={payload.engineer_name} onChange={e => update("engineer_name", e.target.value)} placeholder="Full name" />
              <Input type="date" value={payload.engineer_date} onChange={e => update("engineer_date", e.target.value)} />
              <SmartSignature value={payload.engineer_signature || ""} onChange={(v) => update("engineer_signature", v)} />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold">Client / Responsible Person</p>
              <Input value={payload.client_name} onChange={e => update("client_name", e.target.value)} placeholder="Full name" />
              <Input type="date" value={payload.client_date} onChange={e => update("client_date", e.target.value)} />
              <SmartSignature value={payload.client_signature || ""} onChange={(v) => update("client_signature", v)} showAbsent />
            </div>
          </div>
        </div>
      );

      default: return null;
    }
  }

  const totalSteps = isModification ? STEPS.length : STEPS.length - 1; // hide pre-mod step for new installs
  const displaySteps = isModification ? STEPS : STEPS.filter((_, i) => i !== 3);
  const displayStep = isModification ? step : step >= 3 ? step - 1 : step;
  const progressPct = (step / (STEPS.length - 1)) * 100;
  const stepErrors = errorsByStep[step] || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Wind className="w-5 h-5 text-primary" />
            ASD Commissioning Certificate
            {payload.cert_reference && <Badge variant="outline" className="text-[10px] font-mono">{payload.cert_reference}</Badge>}
            {isModification && <Badge className="text-[9px] bg-amber-100 text-amber-800 border-amber-300/60 hover:bg-amber-100">Modification</Badge>}
          </DialogTitle>
          <div className="space-y-1 mt-1">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{displaySteps[displayStep >= 0 ? displayStep : 0]}</span>
              <span>{step + 1} / {STEPS.length}</span>
            </div>
            <Progress value={progressPct} className="h-1" />
          </div>
          {/* Step pills */}
          <div className="flex gap-1 overflow-x-auto pb-1 mt-1">
            {displaySteps.map((s, i) => {
              const actualStep = isModification ? i : i >= 3 ? i + 1 : i;
              const hasErr = !!(errorsByStep[actualStep]?.length);
              return (
                <button key={s} onClick={() => setStep(actualStep)}
                  className={cn(
                    "text-[9px] px-2 py-0.5 rounded border whitespace-nowrap flex-shrink-0 transition-colors",
                    actualStep === step ? "bg-primary text-primary-foreground border-primary" :
                    hasErr ? "border-destructive/60 text-destructive" :
                    "border-border text-muted-foreground hover:bg-accent/30"
                  )}>
                  {s}
                </button>
              );
            })}
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          {stepErrors.length > 0 && (
            <div className="flex items-start gap-2 mb-3 p-2.5 rounded-lg border border-destructive/40 bg-destructive/5 text-xs text-destructive">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <div>{stepErrors.map((e, i) => <p key={i}>{e}</p>)}</div>
            </div>
          )}
          {renderStep()}
        </ScrollArea>

        <div className="border-t px-6 py-3 flex items-center justify-between gap-2 flex-shrink-0 bg-background">
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStep(s => s - 1)} disabled={saving}>
                <ChevronLeft className="w-4 h-4 mr-1" />Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => handleSave(false)} disabled={saving}>
              <Save className="w-4 h-4 mr-1" />{saving ? "Saving…" : "Save Draft"}
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => {
                if (!isModification && step === 2) setStep(4); // skip pre-mod step
                else setStep(s => s + 1);
              }}>
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleGeneratePDF} disabled={saving}>
                  <FileDown className="w-4 h-4 mr-1" />PDF
                </Button>
                <Button onClick={() => handleSave(true)} disabled={saving || errors.length > 0}>
                  <CheckCircle2 className="w-4 h-4 mr-1" />Complete
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
