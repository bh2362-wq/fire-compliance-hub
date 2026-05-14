/**
 * Dry Riser Certificate Form
 * BS 9990:2015 · RR(FS)O 2005
 *
 * Two sub-types: 6-monthly visual inspection, annual hydraulic pressure test
 * Steps: Header → Premises → System → Visual → Pressure Test (annual only) → Status → Signatures
 */

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SmartSignature } from "@/components/ui/smart-signature";
import { ChevronLeft, ChevronRight, Plus, Trash2, Save, FileDown, CheckCircle2, Droplets } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

// ── Payload ───────────────────────────────────────────────────────────────────
export type DRFormType = "visual" | "pressure_test";
export type InspResult = "Pass" | "Fail" | "N/A";

export interface DRVisualCheck {
  id: string;
  description: string;
  result: InspResult | "";
  notes: string;
}

export interface DRFloorRecord {
  id: string;
  floor: string;
  valve_result: InspResult | "";
  box_result: InspResult | "";
  signage: boolean;
  pressure_bar: number | "";
  notes: string;
}

export interface DRPayload {
  cert_reference: string;
  form_type: DRFormType;
  cert_date: string;

  premises_name: string;
  premises_address: string;
  premises_postcode: string;
  responsible_person: string;
  responsible_email: string;

  building_height_m: number | "";
  num_floors: number | "";
  num_risers: number | "";
  riser_diameter_mm: number | "";
  inlet_type: string;
  inlet_location: string;
  previous_cert_date: string;

  visual_checks: DRVisualCheck[];

  // Pressure test (annual only)
  test_pressure_bar: number | "";
  test_duration_mins: number | "";
  pressure_start_bar: number | "";
  pressure_end_bar: number | "";
  leaks_found: boolean;
  leak_locations: string;
  air_release_functional: boolean;
  drain_functional: boolean;
  pressure_test_result: "Pass" | "Fail" | "";

  floor_records: DRFloorRecord[];

  overall_status: "Compliant" | "Non-Compliant" | "Compliant with Observations" | "";
  remarks: string;
  next_visual_date: string;
  next_annual_date: string;

  engineer_name: string;
  engineer_date: string;
  engineer_signature: string;
  client_name: string;
  client_date: string;
  client_signature: string;
}

const DEFAULT_VISUAL_CHECKS: DRVisualCheck[] = [
  { id: "1", description: "Inlet cabinet — undamaged, signage legible, glass intact",       result: "", notes: "" },
  { id: "2", description: "Blanking caps — present and secured on all breeching outlets",   result: "", notes: "" },
  { id: "3", description: "Landing valves — closed, handwheels present and undamaged",      result: "", notes: "" },
  { id: "4", description: "Valve rubber seals — not perished or damaged",                   result: "", notes: "" },
  { id: "5", description: "Pipework — no visible corrosion, damage or mechanical defect",   result: "", notes: "" },
  { id: "6", description: "Landing valve boxes — undamaged, accessible, signage visible",   result: "", notes: "" },
  { id: "7", description: "Inlet access — fire service inlet clear and unobstructed",       result: "", notes: "" },
  { id: "8", description: "Air release valve — present and accessible at head of riser",    result: "", notes: "" },
];

function buildEmpty(ft: DRFormType = "visual"): DRPayload {
  const now = format(new Date(), "yyyy-MM-dd");
  const pre = ft === "visual" ? "DRV" : "DRP";
  return {
    cert_reference: `${pre}-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
    form_type: ft, cert_date: now,
    premises_name: "", premises_address: "", premises_postcode: "",
    responsible_person: "", responsible_email: "",
    building_height_m: "", num_floors: "", num_risers: "",
    riser_diameter_mm: 100, inlet_type: "2-way breeching — BS 5041-1",
    inlet_location: "", previous_cert_date: "",
    visual_checks: DEFAULT_VISUAL_CHECKS.map(c => ({ ...c })),
    test_pressure_bar: 12, test_duration_mins: 15,
    pressure_start_bar: "", pressure_end_bar: "",
    leaks_found: false, leak_locations: "",
    air_release_functional: true, drain_functional: true, pressure_test_result: "",
    floor_records: [],
    overall_status: "", remarks: "", next_visual_date: "", next_annual_date: "",
    engineer_name: "", engineer_date: now, engineer_signature: "",
    client_name: "", client_date: now, client_signature: "",
  };
}

function uid() { return Math.random().toString(36).slice(2, 10); }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  visitId?: string | null;
  siteId?: string | null;
  onSaved?: () => void;
}

export default function DryRiserForm({ open, onOpenChange, visitId, siteId, onSaved }: Props) {
  const { user } = useAuth();
  const [formType, setFormType] = useState<DRFormType>("visual");
  const [payload, setPayload] = useState<DRPayload>(buildEmpty("visual"));
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  const STEPS = formType === "pressure_test"
    ? ["Header", "Premises", "System", "Visual Inspection", "Pressure Test", "Floor Records", "Status", "Signatures", "Preview"]
    : ["Header", "Premises", "System", "Visual Inspection", "Status", "Signatures", "Preview"];

  useEffect(() => {
    if (open) { setPayload(buildEmpty(formType)); setStep(0); setSubmissionId(null); }
  }, [open]);

  function up(partial: Partial<DRPayload>) { setPayload(prev => ({ ...prev, ...partial })); }

  function handleFormTypeChange(ft: DRFormType) {
    setFormType(ft);
    const updated = buildEmpty(ft);
    setPayload(prev => ({ ...updated, ...prev, form_type: ft, cert_reference: updated.cert_reference }));
  }

  async function save(status: "draft" | "completed" = "draft") {
    setSaving(true);
    try {
      const row = {
        form_type: `dr_${payload.form_type}`,
        certificate_reference: payload.cert_reference,
        status, payload: payload as unknown as Record<string, unknown>,
        visit_id: visitId ?? null, site_id: siteId ?? null, user_id: user?.id,
        ...(status === "completed" ? { completed_at: new Date().toISOString() } : {}),
      };
      if (submissionId) {
        await supabase.from("smart_form_submissions").update(row as any).eq("id", submissionId);
      } else {
        const { data, error } = await supabase.from("smart_form_submissions").insert(row as any).select("id").single();
        if (error) throw error;
        setSubmissionId((data as any).id);
      }
      toast.success(status === "completed" ? "Certificate completed" : "Draft saved");
      if (status === "completed") onSaved?.();
    } catch (e) { console.error(e); toast.error("Save failed"); }
    finally { setSaving(false); }
  }

  async function handleDownload() {
    try {
      const { generateDryRiserPDF } = await import("@/lib/dryRiserPdfGenerator");
      await generateDryRiserPDF(payload as any);
    } catch { toast.error("PDF generation failed"); }
  }

  const isLast = step === STEPS.length - 1;
  const prog = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Droplets className="w-5 h-5 text-blue-500" />
            Dry Riser Certificate
            <Badge variant="outline" className="text-[10px] ml-1">BS 9990:2015</Badge>
          </DialogTitle>
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>{STEPS[step]}</span>
              <span>{step + 1} / {STEPS.length}</span>
            </div>
            <Progress value={prog} className="h-1.5" />
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          {step === 0 && <StepHeader payload={payload} up={up} formType={formType} setFormType={handleFormTypeChange} />}
          {step === 1 && <StepPremises payload={payload} up={up} />}
          {step === 2 && <StepSystem payload={payload} up={up} />}
          {step === 3 && <StepVisual payload={payload} up={up} />}
          {formType === "pressure_test" && step === 4 && <StepPressure payload={payload} up={up} />}
          {formType === "pressure_test" && step === 5 && <StepFloors payload={payload} up={up} />}
          {/* Status, Sigs, Preview offset for pressure_test */}
          {((formType === "pressure_test" && step === 6) || (formType === "visual" && step === 4)) && <StepStatus payload={payload} up={up} formType={formType} />}
          {((formType === "pressure_test" && step === 7) || (formType === "visual" && step === 5)) && <StepSignatures payload={payload} up={up} />}
          {((formType === "pressure_test" && step === 8) || (formType === "visual" && step === 6)) && <StepPreview payload={payload} onDownload={handleDownload} />}
        </ScrollArea>

        <div className="flex items-center justify-between px-6 py-3 border-t shrink-0 bg-muted/30">
          <Button variant="ghost" size="sm" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => save("draft")} disabled={saving}>
              <Save className="w-3.5 h-3.5 mr-1" /> Save Draft
            </Button>
            {isLast ? (
              <Button size="sm" onClick={() => save("completed")} disabled={saving}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Complete
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStep(s => s + 1)}>
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StepHeader({ payload, up, formType, setFormType }: { payload: DRPayload; up: (p: Partial<DRPayload>) => void; formType: DRFormType; setFormType: (v: DRFormType) => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5"><Label>Inspection Type</Label>
        <Select value={formType} onValueChange={v => setFormType(v as DRFormType)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="visual">6-Monthly Visual Inspection</SelectItem>
            <SelectItem value="pressure_test">Annual Hydraulic Pressure Test</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label>Certificate Reference</Label>
          <Input value={payload.cert_reference} onChange={e => up({ cert_reference: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Date</Label>
          <Input type="date" value={payload.cert_date} onChange={e => up({ cert_date: e.target.value })} /></div>
      </div>
    </div>
  );
}

function StepPremises({ payload, up }: { payload: DRPayload; up: (p: Partial<DRPayload>) => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5"><Label>Premises Name</Label>
        <Input value={payload.premises_name} onChange={e => up({ premises_name: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>Address</Label>
        <Textarea rows={2} value={payload.premises_address} onChange={e => up({ premises_address: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label>Postcode</Label>
          <Input value={payload.premises_postcode} onChange={e => up({ premises_postcode: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Responsible Person</Label>
          <Input value={payload.responsible_person} onChange={e => up({ responsible_person: e.target.value })} /></div>
      </div>
      <div className="space-y-1.5"><Label>Responsible Person Email</Label>
        <Input type="email" value={payload.responsible_email} onChange={e => up({ responsible_email: e.target.value })} /></div>
    </div>
  );
}

function StepSystem({ payload, up }: { payload: DRPayload; up: (p: Partial<DRPayload>) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label>Building Height (m)</Label>
          <Input type="number" value={payload.building_height_m as number || ""} onChange={e => up({ building_height_m: parseFloat(e.target.value) || "" })} /></div>
        <div className="space-y-1.5"><Label>Number of Floors</Label>
          <Input type="number" value={payload.num_floors as number || ""} onChange={e => up({ num_floors: parseInt(e.target.value) || "" })} /></div>
        <div className="space-y-1.5"><Label>Number of Risers</Label>
          <Input type="number" value={payload.num_risers as number || ""} onChange={e => up({ num_risers: parseInt(e.target.value) || "" })} /></div>
        <div className="space-y-1.5"><Label>Pipe Diameter (mm)</Label>
          <Input type="number" value={payload.riser_diameter_mm as number || ""} onChange={e => up({ riser_diameter_mm: parseInt(e.target.value) || "" })} /></div>
      </div>
      <div className="space-y-1.5"><Label>Inlet Type</Label>
        <Input value={payload.inlet_type} onChange={e => up({ inlet_type: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>Inlet Location</Label>
        <Input value={payload.inlet_location} onChange={e => up({ inlet_location: e.target.value })} placeholder="e.g. North elevation, adjacent main entrance" /></div>
      <div className="space-y-1.5"><Label>Previous Certificate Date</Label>
        <Input type="date" value={payload.previous_cert_date} onChange={e => up({ previous_cert_date: e.target.value })} /></div>
    </div>
  );
}

function StepVisual({ payload, up }: { payload: DRPayload; up: (p: Partial<DRPayload>) => void }) {
  const resultBg = { "Pass": "bg-green-50 border-green-200 text-green-700", "Fail": "bg-red-50 border-red-200 text-red-700", "N/A": "bg-slate-50 border-slate-200 text-slate-500", "": "bg-white" };
  function upCheck(id: string, field: keyof DRVisualCheck, value: string) {
    up({ visual_checks: payload.visual_checks.map(c => c.id === id ? { ...c, [field]: value } : c) });
  }
  return (
    <div className="space-y-3">
      {payload.visual_checks.map(check => (
        <Card key={check.id} className={`border ${check.result === "Fail" ? "border-red-200 bg-red-50/20" : ""}`}>
          <CardContent className="py-3 px-4 space-y-2">
            <div className="flex items-start gap-3">
              <p className="text-sm flex-1">{check.description}</p>
              <div className="flex gap-1 shrink-0">
                {(["Pass", "Fail", "N/A"] as InspResult[]).map(r => (
                  <button key={r} onClick={() => upCheck(check.id, "result", check.result === r ? "" : r)}
                    className={`px-2.5 py-1 text-xs font-bold rounded border transition-colors ${check.result === r ? resultBg[r] : "bg-muted/40 border-border text-muted-foreground"}`}
                  >{r}</button>
                ))}
              </div>
            </div>
            {check.result === "Fail" && (
              <Input placeholder="Notes / action required..." value={check.notes} onChange={e => upCheck(check.id, "notes", e.target.value)} className="text-sm h-8 bg-white" />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function StepPressure({ payload, up }: { payload: DRPayload; up: (p: Partial<DRPayload>) => void }) {
  const drop = payload.pressure_start_bar && payload.pressure_end_bar
    ? Math.max(0, Number(payload.pressure_start_bar) - Number(payload.pressure_end_bar)).toFixed(2)
    : "";
  return (
    <div className="space-y-4">
      <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 rounded-md text-xs text-blue-700">
        <strong>BS 9990:2015 Cl. 7.3.1.3:</strong> Test pressure minimum 12 bar (1,034 kPa) for 15 minutes. Maximum allowable pressure drop: 0.5 bar.
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label>Test Pressure (bar)</Label>
          <Input type="number" step="0.1" value={payload.test_pressure_bar as number || ""} onChange={e => up({ test_pressure_bar: parseFloat(e.target.value) || "" })} /></div>
        <div className="space-y-1.5"><Label>Test Duration (mins)</Label>
          <Input type="number" value={payload.test_duration_mins as number || ""} onChange={e => up({ test_duration_mins: parseInt(e.target.value) || "" })} /></div>
        <div className="space-y-1.5"><Label>Pressure at Start (bar)</Label>
          <Input type="number" step="0.01" value={payload.pressure_start_bar as number || ""} onChange={e => up({ pressure_start_bar: parseFloat(e.target.value) || "" })} /></div>
        <div className="space-y-1.5"><Label>Pressure at End (bar)</Label>
          <Input type="number" step="0.01" value={payload.pressure_end_bar as number || ""} onChange={e => up({ pressure_end_bar: parseFloat(e.target.value) || "" })} /></div>
      </div>
      {drop && (
        <div className={`p-2 rounded text-sm font-medium ${Number(drop) <= 0.5 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          Pressure drop: {drop} bar {Number(drop) <= 0.5 ? "✓ Within tolerance" : "⚠ Exceeds 0.5 bar tolerance"}
        </div>
      )}
      <div className="space-y-3">
        {[
          ["leaks_found", "Leaks found during test"],
          ["air_release_functional", "Air release valve functional"],
          ["drain_functional", "Drain valve functional"],
        ].map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={(payload as any)[key]} onChange={e => up({ [key]: e.target.checked } as any)} className="accent-primary" />
            <span className="text-sm">{label}</span>
          </label>
        ))}
      </div>
      {payload.leaks_found && (
        <div className="space-y-1.5"><Label>Leak Locations</Label>
          <Textarea rows={2} value={payload.leak_locations} onChange={e => up({ leak_locations: e.target.value })} /></div>
      )}
      <div className="space-y-1.5"><Label>Test Result</Label>
        <Select value={payload.pressure_test_result} onValueChange={v => up({ pressure_test_result: v as "Pass" | "Fail" })}>
          <SelectTrigger><SelectValue placeholder="Select result" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Pass">Pass</SelectItem>
            <SelectItem value="Fail">Fail</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function StepFloors({ payload, up }: { payload: DRPayload; up: (p: Partial<DRPayload>) => void }) {
  function add() {
    up({ floor_records: [...payload.floor_records, { id: uid(), floor: "", valve_result: "", box_result: "", signage: true, pressure_bar: "", notes: "" }] });
  }
  function remove(id: string) { up({ floor_records: payload.floor_records.filter(f => f.id !== id) }); }
  function upF(id: string, field: keyof DRFloorRecord, value: any) {
    up({ floor_records: payload.floor_records.map(f => f.id === id ? { ...f, [field]: value } : f) });
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Record results for key floors (Ground, mid-point, top).</p>
      {payload.floor_records.map((fr, i) => (
        <Card key={fr.id} className="border">
          <CardContent className="py-3 px-4">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-semibold">Floor {i + 1}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(fr.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1"><Label className="text-xs">Floor Level</Label>
                <Input value={fr.floor} onChange={e => upF(fr.id, "floor", e.target.value)} className="h-8 text-sm" placeholder="e.g. Ground" /></div>
              <div className="space-y-1"><Label className="text-xs">Valve</Label>
                <Select value={fr.valve_result} onValueChange={v => upF(fr.id, "valve_result", v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent><SelectItem value="Pass">Pass</SelectItem><SelectItem value="Fail">Fail</SelectItem><SelectItem value="N/A">N/A</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label className="text-xs">Box</Label>
                <Select value={fr.box_result} onValueChange={v => upF(fr.id, "box_result", v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent><SelectItem value="Pass">Pass</SelectItem><SelectItem value="Fail">Fail</SelectItem><SelectItem value="N/A">N/A</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label className="text-xs">Pressure (bar)</Label>
                <Input type="number" step="0.01" value={fr.pressure_bar as number || ""} onChange={e => upF(fr.id, "pressure_bar", parseFloat(e.target.value) || "")} className="h-8 text-sm" /></div>
              <div className="flex items-center gap-2 col-span-2 pt-4">
                <input type="checkbox" checked={fr.signage} onChange={e => upF(fr.id, "signage", e.target.checked)} className="accent-primary" />
                <Label className="text-xs font-normal">Signage present</Label>
              </div>
              <div className="col-span-3 space-y-1"><Label className="text-xs">Notes</Label>
                <Input value={fr.notes} onChange={e => upF(fr.id, "notes", e.target.value)} className="h-8 text-sm" placeholder="Optional" /></div>
            </div>
          </CardContent>
        </Card>
      ))}
      <Button variant="outline" size="sm" onClick={add} className="w-full"><Plus className="w-3.5 h-3.5 mr-1" /> Add Floor Record</Button>
    </div>
  );
}

function StepStatus({ payload, up, formType }: { payload: DRPayload; up: (p: Partial<DRPayload>) => void; formType: DRFormType }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5"><Label>Overall Compliance Status</Label>
        <Select value={payload.overall_status} onValueChange={v => up({ overall_status: v as any })}>
          <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Compliant">Compliant</SelectItem>
            <SelectItem value="Compliant with Observations">Compliant with Observations</SelectItem>
            <SelectItem value="Non-Compliant">Non-Compliant</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5"><Label>Remarks</Label>
        <Textarea rows={3} value={payload.remarks} onChange={e => up({ remarks: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label>Next Visual Inspection</Label>
          <Input type="date" value={payload.next_visual_date} onChange={e => up({ next_visual_date: e.target.value })} /></div>
        {formType === "pressure_test" && (
          <div className="space-y-1.5"><Label>Next Annual Pressure Test</Label>
            <Input type="date" value={payload.next_annual_date} onChange={e => up({ next_annual_date: e.target.value })} /></div>
        )}
      </div>
    </div>
  );
}

function StepSignatures({ payload, up }: { payload: DRPayload; up: (p: Partial<DRPayload>) => void }) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Engineer / Competent Person</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Name</Label><Input value={payload.engineer_name} onChange={e => up({ engineer_name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={payload.engineer_date} onChange={e => up({ engineer_date: e.target.value })} /></div>
        </div>
        <div className="space-y-1.5"><Label>Signature</Label>
          <TypedSignature value={payload.engineer_signature} onChange={v => up({ engineer_signature: v })} /></div>
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Client / Responsible Person</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Name</Label><Input value={payload.client_name} onChange={e => up({ client_name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={payload.client_date} onChange={e => up({ client_date: e.target.value })} /></div>
        </div>
        <div className="space-y-1.5"><Label>Signature (optional)</Label>
          <TypedSignature value={payload.client_signature} onChange={v => up({ client_signature: v })} /></div>
      </div>
    </div>
  );
}

function StepPreview({ payload, onDownload }: { payload: DRPayload; onDownload: () => void }) {
  const failCount = payload.visual_checks.filter(c => c.result === "Fail").length;
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-lg border bg-muted/20 space-y-2">
        {[
          ["Certificate Ref",  payload.cert_reference],
          ["Type",             payload.form_type === "visual" ? "6-Monthly Visual Inspection" : "Annual Hydraulic Pressure Test"],
          ["Date",             payload.cert_date],
          ["Premises",         payload.premises_name],
          ["Building Height",  payload.building_height_m ? `${payload.building_height_m}m` : ""],
          ["Risers",           String(payload.num_risers)],
          ...(payload.form_type === "pressure_test" ? [["Pressure Test", payload.pressure_test_result || "—"]] : []),
          ["Status",           payload.overall_status],
          ["Engineer",         payload.engineer_name],
        ].filter(([,v]) => v).map(([k, v]) => (
          <div key={k} className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">{k}</span>
            <span className="font-medium">{v}</span>
          </div>
        ))}
      </div>
      {failCount > 0 && <p className="text-sm text-red-600">⚠ {failCount} visual check{failCount !== 1 ? "s" : ""} failed</p>}
      <Button onClick={onDownload} className="w-full" variant="outline">
        <FileDown className="w-4 h-4 mr-2" /> Download PDF
      </Button>
    </div>
  );
}
