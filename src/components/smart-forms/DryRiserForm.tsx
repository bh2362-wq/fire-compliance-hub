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
import { ScrollArea } from "@/components/ui/scroll-area";
import { TypedSignature } from "@/components/ui/typed-signature";
import { ChevronLeft, ChevronRight, Plus, Trash2, Save, FileDown, AlertCircle, CheckCircle2, Droplets } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  buildEmptyDRPayload, createDRSubmission, updateDRSubmission,
  validateDRPayload, autoGenerateFloors, createFloorRecord,
  type DRPayload, type DRFormType, type DRTestResult,
} from "@/services/dryRiserService";
import { generateDryRiserPDF } from "@/lib/dryRiserPdfGenerator";

const FORM_LABELS: Record<DRFormType, string> = {
  visual_inspection: "6-Monthly Visual Inspection",
  pressure_test: "Annual Hydraulic Pressure Test",
};

const STEPS = ["Form Type","Premises","System","Visual Check","Floor Records","Pressure Test","Declaration"] as const;

const RESULT_CLASSES: Record<DRTestResult, string> = {
  "Pass": "bg-green-50 border-green-300 text-green-700",
  "Fail": "bg-red-50 border-red-300 text-red-700",
  "N/A": "bg-muted/30 border-border text-muted-foreground",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  siteId?: string | null;
  customerId?: string | null;
  visitId?: string | null;
  onSaved?: () => void;
}

function ResultBtn({ value, onChange }: { value: DRTestResult; onChange: (v: DRTestResult) => void }) {
  return (
    <div className="flex gap-1">
      {(["Pass","Fail","N/A"] as DRTestResult[]).map(r => (
        <button key={r} onClick={() => onChange(r)}
          className={cn("text-[9px] px-2 py-0.5 rounded border transition-colors",
            value === r ? "bg-foreground text-background border-foreground" : "border-border hover:bg-accent/30")}>
          {r === "Pass" ? "✓ Pass" : r === "Fail" ? "✗ Fail" : "N/A"}
        </button>
      ))}
    </div>
  );
}

export default function DryRiserForm({ open, onOpenChange, siteId, customerId, visitId, onSaved }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [payload, setPayload] = useState<DRPayload>(buildEmptyDRPayload());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(0); setSubmissionId(null);
    setPayload(buildEmptyDRPayload());
  }, [open]);

  const errors = useMemo(() => validateDRPayload(payload), [payload]);

  function update<K extends keyof DRPayload>(key: K, value: DRPayload[K]) {
    setPayload(p => ({ ...p, [key]: value }));
  }

  function updateVisual(idx: number, field: "result" | "notes", value: string) {
    const vc = [...payload.visual_checks];
    vc[idx] = { ...vc[idx], [field]: value };
    update("visual_checks", vc);
  }

  async function handleSave(complete = false) {
    if (!user) return; setSaving(true);
    try {
      if (submissionId) await updateDRSubmission(submissionId, payload, complete ? "completed" : "draft");
      else { const sub = await createDRSubmission(payload, { siteId: siteId||undefined, customerId: customerId||undefined, visitId: visitId||undefined, userId: user.id }); setSubmissionId(sub.id); }
      toast.success(complete ? "Certificate saved" : "Draft saved");
      if (complete) { onSaved?.(); onOpenChange(false); }
    } catch (err: any) { toast.error(err.message || "Save failed"); }
    finally { setSaving(false); }
  }

  async function handlePDF() { await handleSave(false); await generateDryRiserPDF(payload); }

  // Group visual checks by category
  const checksByCategory = payload.visual_checks.reduce((acc, check, idx) => {
    if (!acc[check.category]) acc[check.category] = [];
    acc[check.category].push({ ...check, _idx: idx });
    return acc;
  }, {} as Record<string, any[]>);

  function renderStep() {
    switch (step) {

      case 0: return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(["visual_inspection","pressure_test"] as DRFormType[]).map(t => (
              <button key={t} type="button" onClick={() => update("form_type", t)}
                className={cn("p-4 rounded-xl border-2 text-left transition-all", payload.form_type === t ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}>
                <p className="font-semibold text-sm">{FORM_LABELS[t]}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {t === "visual_inspection" ? "Every 6 months — BS 9990:2015 Clause 7.3.1.1\nVisual check of all inlets, landing valves, drain valves and signage"
                  : "Every 12 months — BS 9990:2015 Clause 7.3.1.3\nHydraulic pressure test to 12 bar for minimum 15 minutes"}
                </p>
              </button>
            ))}
          </div>
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 text-xs text-amber-800">
            <strong>Legal requirement:</strong> Dry risers in buildings 18–60m above ground must be visually inspected every 6 months AND pressure tested annually under the Regulatory Reform (Fire Safety) Order 2005 and BS 9990:2015.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Certificate Reference *</Label>
              <Input value={payload.cert_reference} onChange={e => update("cert_reference", e.target.value)} placeholder="e.g. DR-2026-001" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Date of Inspection</Label>
              <Input type="date" value={payload.cert_date} onChange={e => update("cert_date", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Next Inspection Due</Label>
              <Input type="date" value={payload.next_inspection_date} onChange={e => update("next_inspection_date", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Previous Certificate Date</Label>
              <Input type="date" value={payload.previous_cert_date} onChange={e => update("previous_cert_date", e.target.value)} />
            </div>
          </div>
        </div>
      );

      case 1: return (
        <div className="space-y-3">
          {[["Premises Name *","premises_name","text",""],["Address","premises_address","text",""],["Postcode","premises_postcode","text",""],["Responsible Person","responsible_person","text",""],["Responsible Email","responsible_email","email",""]].map(([label,key,type,ph]) => (
            <div key={key} className="space-y-1.5">
              <Label className="text-xs font-semibold">{label}</Label>
              <Input type={type} value={(payload as any)[key]} onChange={e => update(key as any, e.target.value)} placeholder={ph} />
            </div>
          ))}
        </div>
      );

      case 2: return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Building Height (m)</Label><Input type="number" value={payload.building_height_m} onChange={e => update("building_height_m", parseFloat(e.target.value)||0)} /></div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Number of Floors</Label><Input type="number" value={payload.num_floors} onChange={e => update("num_floors", parseInt(e.target.value)||0)} /></div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Number of Risers</Label><Input type="number" min={1} value={payload.num_risers} onChange={e => update("num_risers", parseInt(e.target.value)||1)} /></div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Pipe Diameter (mm)</Label><Input type="number" value={payload.riser_diameter_mm} onChange={e => update("riser_diameter_mm", parseInt(e.target.value)||100)} /></div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs font-semibold">Inlet Type</Label><Input value={payload.inlet_type} onChange={e => update("inlet_type", e.target.value)} placeholder="e.g. 2-way breeching — BS 5041-1" /></div>
          <div className="space-y-1.5"><Label className="text-xs font-semibold">Inlet Location</Label><Input value={payload.inlet_location} onChange={e => update("inlet_location", e.target.value)} placeholder="e.g. North elevation — adjacent to main entrance" /></div>
          {payload.num_floors > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => update("floor_records", autoGenerateFloors(payload.num_floors))}>
              Auto-generate {payload.num_floors} floor records
            </Button>
          )}
        </div>
      );

      case 3: return (
        <div className="space-y-3">
          <div className="text-[11px] text-muted-foreground p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200/60">
            BS 9990:2015 Clause 7: Inspect inlets, landing valves, drain valves, landing valve boxes and signage. Check accessibility for fire service vehicles.
          </div>
          {Object.entries(checksByCategory).map(([category, checks]) => (
            <div key={category}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">{category}</p>
              <div className="space-y-1.5">
                {checks.map((check) => (
                  <div key={check.id} className={cn("border rounded-lg p-2.5 space-y-1.5 transition-colors", RESULT_CLASSES[check.result as DRTestResult])}>
                    <div className="flex items-start gap-2">
                      <p className="flex-1 text-xs leading-relaxed">{check.description}</p>
                      <ResultBtn value={check.result} onChange={v => updateVisual(check._idx, "result", v)} />
                    </div>
                    {check.result === "Fail" && (
                      <Input value={check.notes} onChange={e => updateVisual(check._idx, "notes", e.target.value)} placeholder="Describe defect…" className="text-xs h-7" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Additional Defects / Notes</Label>
            <Textarea value={payload.visual_defects_noted} onChange={e => update("visual_defects_noted", e.target.value)} rows={3} />
          </div>
        </div>
      );

      case 4: return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold">Landing Valve Records — per floor</p>
            <Button variant="outline" size="sm" className="gap-1 text-xs h-7" onClick={() => update("floor_records", [...payload.floor_records, createFloorRecord("")])}>
              <Plus className="w-3 h-3" />Add Floor
            </Button>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <div className="grid grid-cols-12 gap-1 px-3 py-2 bg-muted/40 text-[10px] font-semibold text-muted-foreground">
              <div className="col-span-2">Floor</div>
              <div className="col-span-2">Valve</div>
              <div className="col-span-2">Box</div>
              <div className="col-span-1">Sign</div>
              {payload.form_type === "pressure_test" && <div className="col-span-2">Pressure (bar)</div>}
              <div className="col-span-3">Notes</div>
            </div>
            {payload.floor_records.map((fr, idx) => (
              <div key={fr.id} className="grid grid-cols-12 gap-1 px-3 py-1.5 border-t items-center">
                <div className="col-span-2"><Input value={fr.floor_level} onChange={e => { const frs=[...payload.floor_records]; frs[idx]={...frs[idx],floor_level:e.target.value}; update("floor_records",frs); }} className="h-6 text-xs" placeholder="e.g. 1st" /></div>
                <div className="col-span-2">
                  <select value={fr.valve_condition} onChange={e => { const frs=[...payload.floor_records]; frs[idx]={...frs[idx],valve_condition:e.target.value as DRTestResult}; update("floor_records",frs); }} className="w-full h-6 text-xs border rounded px-1">
                    <option>Pass</option><option>Fail</option><option>N/A</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <select value={fr.box_condition} onChange={e => { const frs=[...payload.floor_records]; frs[idx]={...frs[idx],box_condition:e.target.value as DRTestResult}; update("floor_records",frs); }} className="w-full h-6 text-xs border rounded px-1">
                    <option>Pass</option><option>Fail</option><option>N/A</option>
                  </select>
                </div>
                <div className="col-span-1 flex justify-center">
                  <Checkbox checked={fr.signage_present} onCheckedChange={v => { const frs=[...payload.floor_records]; frs[idx]={...frs[idx],signage_present:!!v}; update("floor_records",frs); }} />
                </div>
                {payload.form_type === "pressure_test" && (
                  <div className="col-span-2"><Input type="number" step={0.1} value={fr.pressure_bar||""} onChange={e => { const frs=[...payload.floor_records]; frs[idx]={...frs[idx],pressure_bar:parseFloat(e.target.value)||undefined}; update("floor_records",frs); }} className="h-6 text-xs" placeholder="bar" /></div>
                )}
                <div className="col-span-3 flex gap-1">
                  <Input value={fr.notes} onChange={e => { const frs=[...payload.floor_records]; frs[idx]={...frs[idx],notes:e.target.value}; update("floor_records",frs); }} className="h-6 text-xs flex-1" />
                  <button onClick={() => update("floor_records", payload.floor_records.filter(f=>f.id!==fr.id))} className="text-destructive hover:opacity-70"><Trash2 className="w-3 h-3"/></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      );

      case 5: return payload.form_type === "pressure_test" ? (
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 text-xs text-amber-800">
            <strong>BS 9990:2015:</strong> System must be pressurised to <strong>12 bar (1034 kPa)</strong> and held for a minimum of <strong>15 minutes</strong>. Monitor all joints, valves and pipework for leaks. Drain fully after test.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Test Pressure (bar)</Label>
              <Input type="number" step={0.1} value={payload.test_pressure_bar} onChange={e => update("test_pressure_bar", parseFloat(e.target.value)||0)} className={payload.test_pressure_bar !== 12 && payload.test_pressure_bar > 0 ? "border-red-400/60" : ""} />
              {payload.test_pressure_bar > 0 && payload.test_pressure_bar !== 12 && <p className="text-[10px] text-red-600">BS 9990 requires 12 bar</p>}
            </div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Duration (minutes)</Label>
              <Input type="number" value={payload.test_duration_mins} onChange={e => update("test_duration_mins", parseInt(e.target.value)||0)} className={payload.test_duration_mins > 0 && payload.test_duration_mins < 15 ? "border-red-400/60" : ""} />
              {payload.test_duration_mins > 0 && payload.test_duration_mins < 15 && <p className="text-[10px] text-red-600">Minimum 15 minutes required</p>}
            </div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Pressure at Start (bar)</Label><Input type="number" step={0.1} value={payload.pressure_at_start_bar} onChange={e => update("pressure_at_start_bar", parseFloat(e.target.value)||0)} /></div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Pressure at End (bar)</Label>
              <Input type="number" step={0.1} value={payload.pressure_at_end_bar} onChange={e => { const val = parseFloat(e.target.value)||0; setPayload(p => ({ ...p, pressure_at_end_bar: val, pressure_drop_bar: parseFloat((p.pressure_at_start_bar - val).toFixed(2)) })); }} />
            </div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Pressure Drop (bar)</Label>
              <div className="h-9 flex items-center px-3 border rounded-md text-sm font-semibold bg-muted/30">
                {payload.pressure_drop_bar.toFixed(2)} bar
                {payload.pressure_drop_bar > 0.5 ? <span className="ml-2 text-red-600 text-xs">⚠ Significant drop</span> : payload.pressure_drop_bar > 0 ? <span className="ml-2 text-green-600 text-xs">✓ Acceptable</span> : null}
              </div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Overall Test Result</Label>
              <div className="flex gap-1">
                {(["Pass","Fail","N/A"] as DRTestResult[]).map(r => (
                  <button key={r} onClick={() => update("pressure_test_result", r)}
                    className={cn("flex-1 text-xs py-2 rounded border transition-colors",
                      payload.pressure_test_result === r ? "bg-foreground text-background border-foreground" : "border-border hover:bg-accent/30")}>
                    {r === "Pass" ? "✓ Pass" : r === "Fail" ? "✗ Fail" : "N/A"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {([["Leaks found","leaks_found"],["Air release valve functional","air_release_functional"],["Drain valve functional","drain_functional"]] as [string, keyof DRPayload][]).map(([label,key]) => (
            <div key={key} className="flex items-center gap-2.5">
              <Checkbox checked={payload[key] as boolean} onCheckedChange={v => update(key, !!v)} />
              <Label className="text-xs">{label}</Label>
            </div>
          ))}
          {payload.leaks_found && (
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Leak Locations</Label><Textarea value={payload.leak_locations} onChange={e => update("leak_locations", e.target.value)} rows={2} placeholder="Describe location and nature of each leak found…" /></div>
          )}
          <div className="space-y-1.5"><Label className="text-xs font-semibold">Pressure Test Notes</Label><Textarea value={payload.pressure_test_notes} onChange={e => update("pressure_test_notes", e.target.value)} rows={2} /></div>
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <Checkbox checked={payload.remedial_works_required} onCheckedChange={v => update("remedial_works_required", !!v)} />
              <Label className="text-xs font-semibold">Remedial works required</Label>
            </div>
            {payload.remedial_works_required && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2"><Label className="text-xs">Description</Label><Textarea value={payload.remedial_description} onChange={e => update("remedial_description", e.target.value)} rows={2} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Urgency</Label>
                  <Select value={payload.remedial_urgency} onValueChange={v => update("remedial_urgency", v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="Immediate">Immediate</SelectItem><SelectItem value="Within 30 days">Within 30 days</SelectItem><SelectItem value="Routine">Routine</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2.5 mt-5">
                  <Checkbox checked={payload.remediated_on_visit} onCheckedChange={v => update("remediated_on_visit", !!v)} />
                  <Label className="text-xs">Remediated on this visit</Label>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <p>Pressure test section not applicable for visual inspection.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setStep(6)}>Skip to Declaration →</Button>
        </div>
      );

      case 6: return (
        <div className="space-y-4">
          <div className="space-y-1.5"><Label className="text-xs font-semibold">Overall Status</Label>
            <Select value={payload.overall_status} onValueChange={v => update("overall_status", v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Compliant">Compliant</SelectItem>
                <SelectItem value="Non-compliant">Non-compliant — Remedial works required</SelectItem>
                <SelectItem value="Non-compliant — Remedial works completed">Non-compliant — Remedial works completed on visit</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {payload.overall_status !== "Compliant" && (
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Status Notes</Label><Textarea value={payload.status_notes} onChange={e => update("status_notes", e.target.value)} rows={2} /></div>
          )}
          <div className="space-y-1.5"><Label className="text-xs font-semibold">Standards</Label><Input value={payload.standard_references} onChange={e => update("standard_references", e.target.value)} /></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-xs font-bold">Engineer</p>
              <Input value={payload.engineer_name} onChange={e => update("engineer_name", e.target.value)} placeholder="Full name" />
              <Input value={payload.engineer_company} onChange={e => update("engineer_company", e.target.value)} placeholder="Company" />
              <Input type="date" value={payload.engineer_date} onChange={e => update("engineer_date", e.target.value)} />
              <TypedSignature value={payload.engineer_signature} onChange={v => update("engineer_signature", v)} placeholder="Engineer signature" />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold">Client</p>
              <Input value={payload.client_name} onChange={e => update("client_name", e.target.value)} placeholder="Full name" />
              <Input type="date" value={payload.client_date} onChange={e => update("client_date", e.target.value)} />
              <TypedSignature value={payload.client_signature} onChange={v => update("client_signature", v)} placeholder="Client signature" />
            </div>
          </div>
        </div>
      );

      default: return null;
    }
  }

  const pct = (step / (STEPS.length - 1)) * 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Droplets className="w-5 h-5 text-blue-500" />
            Dry Riser — {FORM_LABELS[payload.form_type]}
            {payload.cert_reference && <Badge variant="outline" className="text-[10px] font-mono">{payload.cert_reference}</Badge>}
          </DialogTitle>
          <div className="space-y-1 mt-1">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{STEPS[step]}</span><span>{step + 1} / {STEPS.length}</span>
            </div>
            <Progress value={pct} className="h-1" />
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {STEPS.map((s, i) => (
              <button key={s} onClick={() => setStep(i)}
                className={cn("text-[9px] px-2 py-0.5 rounded border whitespace-nowrap flex-shrink-0 transition-colors",
                  i === step ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-accent/30")}>
                {s}
              </button>
            ))}
          </div>
        </DialogHeader>
        <ScrollArea className="flex-1 px-6 py-4">{renderStep()}</ScrollArea>
        <div className="border-t px-6 py-3 flex items-center justify-between gap-2 flex-shrink-0 bg-background">
          <div>{step > 0 && <Button variant="outline" size="sm" onClick={() => setStep(s=>s-1)} disabled={saving}><ChevronLeft className="w-4 h-4 mr-1"/>Back</Button>}</div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => handleSave(false)} disabled={saving}><Save className="w-4 h-4 mr-1"/>{saving?"Saving…":"Save Draft"}</Button>
            {step < STEPS.length - 1
              ? <Button onClick={() => setStep(s=>s+1)}>Next<ChevronRight className="w-4 h-4 ml-1"/></Button>
              : <div className="flex gap-2">
                  <Button variant="outline" onClick={handlePDF} disabled={saving}><FileDown className="w-4 h-4 mr-1"/>PDF</Button>
                  <Button onClick={() => handleSave(true)} disabled={saving || errors.length > 0}><CheckCircle2 className="w-4 h-4 mr-1"/>Complete</Button>
                </div>
            }
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
