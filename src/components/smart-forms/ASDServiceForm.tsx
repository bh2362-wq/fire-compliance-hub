/**
 * ASD (Aspirating Smoke Detection) Service Certificate Form
 * BS EN 54-20:2006+A1:2012 · FIA CoP ASD Systems 2012 · BS 5839-1:2017
 *
 * Covers: Annual service with airflow baseline verification
 * Steps: Header → Premises → System → Pre-Service → Airflow → Checks → Defects → Status → Signatures
 */

import { useState, useEffect } from "react";
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
import { TypedSignature } from "@/components/ui/typed-signature";
import { ChevronLeft, ChevronRight, Plus, Trash2, Save, FileDown, CheckCircle2, Wind } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

// ── Payload ───────────────────────────────────────────────────────────────────
export type ASDClass = "A" | "B" | "C";

export interface ASDPipeRecord {
  id: string;
  reference: string;
  baseline_flow_lpm: number | "";
  measured_flow_lpm: number | "";
  within_20_percent: boolean;
  notes: string;
}

export interface ASDDefect {
  id: string;
  location: string;
  description: string;
  priority: "Urgent" | "Required" | "Advisory" | "";
}

export interface ASDPayload {
  // Header
  cert_reference: string;
  cert_date: string;
  form_type: "annual_service" | "commissioning";

  // Premises
  premises_name: string;
  premises_address: string;
  premises_postcode: string;
  responsible_person: string;
  responsible_email: string;

  // System
  manufacturer: string;
  model: string;
  serial_number: string;
  asd_class: ASDClass | "";
  num_pipes: number | "";
  num_sampling_holes: number | "";
  panel_interface: string;

  // Pre-service
  pre: {
    airflow_recorded: boolean;
    event_log_downloaded: boolean;
    config_downloaded: boolean;
    docs_given_to_site: boolean;
    service_history_reviewed: boolean;
  };

  // Airflow readings (before / after service)
  pipe_records: ASDPipeRecord[];

  // System checks
  checks: {
    filter_cleaned: boolean;
    pipe_flush: boolean;
    sampling_holes_cleaned: boolean;
    power_supply_checked: boolean;
    battery_checked: boolean;
    fire_alarm_tested: boolean;
    fault_notification_tested: boolean;
    monitoring_confirmed: boolean;
  };

  // Faults
  faults_found: boolean;
  fault_description: string;
  parts_replaced: string;

  // Defects
  defects: ASDDefect[];

  // Status
  overall_status: "Satisfactory" | "Satisfactory with Observations" | "Unsatisfactory" | "";
  remarks: string;
  next_service_date: string;

  // Signatures
  engineer_name: string;
  engineer_date: string;
  engineer_signature: string;
  client_name: string;
  client_date: string;
  client_signature: string;
}

function buildEmpty(): ASDPayload {
  const now = format(new Date(), "yyyy-MM-dd");
  return {
    cert_reference: `ASD-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
    cert_date: now,
    form_type: "annual_service",
    premises_name: "", premises_address: "", premises_postcode: "",
    responsible_person: "", responsible_email: "",
    manufacturer: "Xtralis (VESDA)", model: "", serial_number: "",
    asd_class: "", num_pipes: "", num_sampling_holes: "", panel_interface: "",
    pre: {
      airflow_recorded: false, event_log_downloaded: false,
      config_downloaded: false, docs_given_to_site: false, service_history_reviewed: false,
    },
    pipe_records: [
      { id: "1", reference: "Pipe 1", baseline_flow_lpm: "", measured_flow_lpm: "", within_20_percent: true, notes: "" },
    ],
    checks: {
      filter_cleaned: false, pipe_flush: false, sampling_holes_cleaned: false,
      power_supply_checked: false, battery_checked: false,
      fire_alarm_tested: false, fault_notification_tested: false, monitoring_confirmed: false,
    },
    faults_found: false, fault_description: "", parts_replaced: "",
    defects: [],
    overall_status: "", remarks: "",
    next_service_date: "",
    engineer_name: "", engineer_date: now, engineer_signature: "",
    client_name: "", client_date: now, client_signature: "",
  };
}

const STEPS = ["Header", "Premises", "System", "Pre-Service", "Airflow", "Checks", "Defects", "Status", "Signatures", "Preview"];

function uid() { return Math.random().toString(36).slice(2, 10); }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  visitId?: string | null;
  siteId?: string | null;
  onSaved?: () => void;
}

export default function ASDServiceForm({ open, onOpenChange, visitId, siteId, onSaved }: Props) {
  const { user } = useAuth();
  const [payload, setPayload] = useState<ASDPayload>(buildEmpty());
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setPayload(buildEmpty()); setStep(0); setSubmissionId(null); }
  }, [open]);

  function up(partial: Partial<ASDPayload>) {
    setPayload(prev => ({ ...prev, ...partial }));
  }

  async function save(status: "draft" | "completed" = "draft") {
    setSaving(true);
    try {
      const row = {
        form_type: `asd_${payload.form_type}`,
        certificate_reference: payload.cert_reference,
        status,
        payload: payload as unknown as Record<string, unknown>,
        visit_id: visitId ?? null,
        site_id: siteId ?? null,
        user_id: user?.id,
        ...(status === "completed" ? { completed_at: new Date().toISOString() } : {}),
      };
      if (submissionId) {
        const { error } = await supabase.from("smart_form_submissions").update(row).eq("id", submissionId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("smart_form_submissions").insert(row).select("id").single();
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
      const { generateASDCertificatePDF } = await import("@/lib/asdCertificatePdfGenerator");
      await generateASDCertificatePDF(payload as any);
    } catch { toast.error("PDF generation failed"); }
  }

  const isLast = step === STEPS.length - 1;
  const prog = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Wind className="w-5 h-5 text-sky-500" />
            ASD Service Certificate
            <Badge variant="outline" className="text-[10px] ml-1">BS EN 54-20</Badge>
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
          {step === 0 && <StepHeader payload={payload} up={up} />}
          {step === 1 && <StepPremises payload={payload} up={up} />}
          {step === 2 && <StepSystem payload={payload} up={up} />}
          {step === 3 && <StepPreService payload={payload} up={up} />}
          {step === 4 && <StepAirflow payload={payload} up={up} />}
          {step === 5 && <StepChecks payload={payload} up={up} />}
          {step === 6 && <StepDefects payload={payload} up={up} />}
          {step === 7 && <StepStatus payload={payload} up={up} />}
          {step === 8 && <StepSignatures payload={payload} up={up} />}
          {step === 9 && <StepPreview payload={payload} onDownload={handleDownload} />}
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

function StepHeader({ payload, up }: { payload: ASDPayload; up: (p: Partial<ASDPayload>) => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Certificate Type</Label>
        <Select value={payload.form_type} onValueChange={v => up({ form_type: v as any })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="annual_service">Annual Service Certificate</SelectItem>
            <SelectItem value="commissioning">Commissioning Certificate</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Certificate Reference</Label>
          <Input value={payload.cert_reference} onChange={e => up({ cert_reference: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Date</Label>
          <Input type="date" value={payload.cert_date} onChange={e => up({ cert_date: e.target.value })} />
        </div>
      </div>
    </div>
  );
}

function StepPremises({ payload, up }: { payload: ASDPayload; up: (p: Partial<ASDPayload>) => void }) {
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

function StepSystem({ payload, up }: { payload: ASDPayload; up: (p: Partial<ASDPayload>) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label>Manufacturer</Label>
          <Input value={payload.manufacturer} onChange={e => up({ manufacturer: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Model</Label>
          <Input value={payload.model} onChange={e => up({ model: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Serial Number</Label>
          <Input value={payload.serial_number} onChange={e => up({ serial_number: e.target.value })} /></div>
        <div className="space-y-1.5">
          <Label>EN 54-20 Class</Label>
          <Select value={payload.asd_class} onValueChange={v => up({ asd_class: v as ASDClass })}>
            <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="A">Class A — Very High Sensitivity (≤0.05 dB/m)</SelectItem>
              <SelectItem value="B">Class B — High Sensitivity (≤0.2 dB/m)</SelectItem>
              <SelectItem value="C">Class C — Enhanced Sensitivity (≤1.0 dB/m)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Number of Pipes</Label>
          <Input type="number" value={payload.num_pipes as number || ""} onChange={e => up({ num_pipes: parseInt(e.target.value) || "" })} /></div>
        <div className="space-y-1.5"><Label>Sampling Holes</Label>
          <Input type="number" value={payload.num_sampling_holes as number || ""} onChange={e => up({ num_sampling_holes: parseInt(e.target.value) || "" })} /></div>
      </div>
      <div className="space-y-1.5"><Label>Panel Interface / Zone Address</Label>
        <Input value={payload.panel_interface} onChange={e => up({ panel_interface: e.target.value })} placeholder="e.g. Gent Vigilon Plus, Loop 2, Address 14-17" /></div>
    </div>
  );
}

function BoolCheck({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={v => onChange(!!v)} />
      <Label htmlFor={id} className="font-normal">{label}</Label>
    </div>
  );
}

function StepPreService({ payload, up }: { payload: ASDPayload; up: (p: Partial<ASDPayload>) => void }) {
  const upPre = (k: keyof ASDPayload["pre"], v: boolean) => up({ pre: { ...payload.pre, [k]: v } });
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Complete all pre-service actions before beginning work.</p>
      <Card><CardContent className="py-4 space-y-3">
        <BoolCheck id="pre1" label="Airflow readings recorded before service" checked={payload.pre.airflow_recorded} onChange={v => upPre("airflow_recorded", v)} />
        <BoolCheck id="pre2" label="Event log downloaded from system" checked={payload.pre.event_log_downloaded} onChange={v => upPre("event_log_downloaded", v)} />
        <BoolCheck id="pre3" label="Configuration file downloaded from system" checked={payload.pre.config_downloaded} onChange={v => upPre("config_downloaded", v)} />
        <BoolCheck id="pre4" label="Event log and config given to site manager" checked={payload.pre.docs_given_to_site} onChange={v => upPre("docs_given_to_site", v)} />
        <BoolCheck id="pre5" label="Service history reviewed before work commenced" checked={payload.pre.service_history_reviewed} onChange={v => upPre("service_history_reviewed", v)} />
      </CardContent></Card>
      <div className="space-y-1.5">
        <Label>Faults identified?</Label>
        <div className="flex items-center gap-4">
          {[true, false].map(v => (
            <label key={String(v)} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={payload.faults_found === v} onChange={() => up({ faults_found: v })} className="accent-primary" />
              <span className="text-sm">{v ? "Yes" : "No"}</span>
            </label>
          ))}
        </div>
      </div>
      {payload.faults_found && (
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Fault Description</Label>
            <Textarea rows={3} value={payload.fault_description} onChange={e => up({ fault_description: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Parts Replaced</Label>
            <Textarea rows={2} value={payload.parts_replaced} onChange={e => up({ parts_replaced: e.target.value })} placeholder="None if not applicable" /></div>
        </div>
      )}
    </div>
  );
}

function StepAirflow({ payload, up }: { payload: ASDPayload; up: (p: Partial<ASDPayload>) => void }) {
  function addPipe() {
    const next = payload.pipe_records.length + 1;
    up({ pipe_records: [...payload.pipe_records, { id: uid(), reference: `Pipe ${next}`, baseline_flow_lpm: "", measured_flow_lpm: "", within_20_percent: true, notes: "" }] });
  }
  function removePipe(id: string) { up({ pipe_records: payload.pipe_records.filter(p => p.id !== id) }); }
  function upPipe(id: string, field: keyof ASDPipeRecord, value: any) {
    up({ pipe_records: payload.pipe_records.map(p => p.id === id ? { ...p, [field]: value } : p) });
  }
  // Auto-calculate within_20_percent
  function calcWithin(baseline: number | "", measured: number | ""): boolean {
    if (!baseline || !measured) return true;
    const pct = Math.abs((Number(measured) - Number(baseline)) / Number(baseline)) * 100;
    return pct <= 20;
  }

  return (
    <div className="space-y-4">
      <div className="p-3 bg-sky-50 dark:bg-sky-950/20 border border-sky-200 rounded-md text-xs text-sky-700 dark:text-sky-400">
        <strong>FIA CoP §8.3:</strong> Maintenance readings must remain within ±20% of commissioning baseline. All deviations must be investigated.
      </div>
      {payload.pipe_records.map((pipe, i) => (
        <Card key={pipe.id} className="border">
          <CardContent className="py-3 px-4">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{pipe.reference || `Pipe ${i + 1}`}</span>
                {pipe.baseline_flow_lpm && pipe.measured_flow_lpm && (
                  <Badge variant="outline" className={`text-[10px] ${calcWithin(pipe.baseline_flow_lpm, pipe.measured_flow_lpm) ? "border-green-300 text-green-700" : "border-red-300 text-red-700"}`}>
                    {calcWithin(pipe.baseline_flow_lpm, pipe.measured_flow_lpm) ? "✓ Within 20%" : "⚠ Deviation >20%"}
                  </Badge>
                )}
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removePipe(pipe.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Pipe Reference</Label>
                <Input value={pipe.reference} onChange={e => upPipe(pipe.id, "reference", e.target.value)} className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-xs">Baseline Flow (L/min)</Label>
                <Input type="number" step="0.1" value={pipe.baseline_flow_lpm as number || ""} onChange={e => { const v = parseFloat(e.target.value) || ""; upPipe(pipe.id, "baseline_flow_lpm", v); upPipe(pipe.id, "within_20_percent", calcWithin(v, pipe.measured_flow_lpm)); }} className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-xs">Measured Flow (L/min)</Label>
                <Input type="number" step="0.1" value={pipe.measured_flow_lpm as number || ""} onChange={e => { const v = parseFloat(e.target.value) || ""; upPipe(pipe.id, "measured_flow_lpm", v); upPipe(pipe.id, "within_20_percent", calcWithin(pipe.baseline_flow_lpm, v)); }} className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-xs">Notes</Label>
                <Input value={pipe.notes} onChange={e => upPipe(pipe.id, "notes", e.target.value)} className="h-8 text-sm" placeholder="Optional" /></div>
            </div>
          </CardContent>
        </Card>
      ))}
      <Button variant="outline" size="sm" onClick={addPipe} className="w-full">
        <Plus className="w-3.5 h-3.5 mr-1" /> Add Pipe
      </Button>
    </div>
  );
}

function StepChecks({ payload, up }: { payload: ASDPayload; up: (p: Partial<ASDPayload>) => void }) {
  const upChk = (k: keyof ASDPayload["checks"], v: boolean) => up({ checks: { ...payload.checks, [k]: v } });
  const items: [keyof ASDPayload["checks"], string][] = [
    ["filter_cleaned",           "Filter cleaned or replaced"],
    ["pipe_flush",               "Pipe flush completed"],
    ["sampling_holes_cleaned",   "Sampling holes cleaned"],
    ["power_supply_checked",     "Power supply / UPS checked"],
    ["battery_checked",          "Battery backup checked and charging confirmed"],
    ["fire_alarm_tested",        "Fire alarm tested at detector level"],
    ["fault_notification_tested","Fault notification tested at monitoring system"],
    ["monitoring_confirmed",     "Monitoring centre / ARC confirmed receipt of test signal"],
  ];
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Confirm all post-service checks completed.</p>
      <Card><CardContent className="py-4 space-y-3">
        {items.map(([key, label]) => (
          <BoolCheck key={key} id={key} label={label} checked={payload.checks[key]} onChange={v => upChk(key, v)} />
        ))}
      </CardContent></Card>
    </div>
  );
}

function StepDefects({ payload, up }: { payload: ASDPayload; up: (p: Partial<ASDPayload>) => void }) {
  function add() { up({ defects: [...payload.defects, { id: uid(), location: "", description: "", priority: "" }] }); }
  function remove(id: string) { up({ defects: payload.defects.filter(d => d.id !== id) }); }
  function upD(id: string, f: keyof ASDDefect, v: any) {
    up({ defects: payload.defects.map(d => d.id === id ? { ...d, [f]: v } : d) });
  }
  return (
    <div className="space-y-4">
      {payload.defects.length === 0 && (
        <div className="py-8 text-center text-muted-foreground text-sm border rounded-lg bg-muted/20">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-40" /> No defects recorded
        </div>
      )}
      {payload.defects.map((d, i) => (
        <Card key={d.id} className="border">
          <CardContent className="py-3 px-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-sm font-semibold">Defect {i + 1}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(d.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Location</Label>
                <Input value={d.location} onChange={e => upD(d.id, "location", e.target.value)} className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-xs">Priority</Label>
                <Select value={d.priority} onValueChange={v => upD(d.id, "priority", v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Urgent">Urgent</SelectItem>
                    <SelectItem value="Required">Required</SelectItem>
                    <SelectItem value="Advisory">Advisory</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1"><Label className="text-xs">Description</Label>
                <Textarea rows={2} value={d.description} onChange={e => upD(d.id, "description", e.target.value)} className="text-sm" /></div>
            </div>
          </CardContent>
        </Card>
      ))}
      <Button variant="outline" size="sm" onClick={add} className="w-full"><Plus className="w-3.5 h-3.5 mr-1" /> Add Defect</Button>
    </div>
  );
}

function StepStatus({ payload, up }: { payload: ASDPayload; up: (p: Partial<ASDPayload>) => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5"><Label>Overall Status</Label>
        <Select value={payload.overall_status} onValueChange={v => up({ overall_status: v as any })}>
          <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Satisfactory">Satisfactory</SelectItem>
            <SelectItem value="Satisfactory with Observations">Satisfactory with Observations</SelectItem>
            <SelectItem value="Unsatisfactory">Unsatisfactory</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5"><Label>Remarks / Recommendations</Label>
        <Textarea rows={3} value={payload.remarks} onChange={e => up({ remarks: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>Next Service Date</Label>
        <Input type="date" value={payload.next_service_date} onChange={e => up({ next_service_date: e.target.value })} /></div>
    </div>
  );
}

function StepSignatures({ payload, up }: { payload: ASDPayload; up: (p: Partial<ASDPayload>) => void }) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Engineer / Competent Person</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Name</Label>
            <Input value={payload.engineer_name} onChange={e => up({ engineer_name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Date</Label>
            <Input type="date" value={payload.engineer_date} onChange={e => up({ engineer_date: e.target.value })} /></div>
        </div>
        <div className="space-y-1.5"><Label>Signature</Label>
          <TypedSignature value={payload.engineer_signature} onChange={v => up({ engineer_signature: v })} /></div>
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Client / Responsible Person</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Name</Label>
            <Input value={payload.client_name} onChange={e => up({ client_name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Date</Label>
            <Input type="date" value={payload.client_date} onChange={e => up({ client_date: e.target.value })} /></div>
        </div>
        <div className="space-y-1.5"><Label>Signature (optional)</Label>
          <TypedSignature value={payload.client_signature} onChange={v => up({ client_signature: v })} /></div>
      </div>
    </div>
  );
}

function StepPreview({ payload, onDownload }: { payload: ASDPayload; onDownload: () => void }) {
  const allWithin = payload.pipe_records.every(p => p.within_20_percent);
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-lg border bg-muted/20 space-y-2">
        {[
          ["Certificate Ref",   payload.cert_reference],
          ["Date",             payload.cert_date],
          ["Premises",         payload.premises_name],
          ["System",           `${payload.manufacturer} ${payload.model}`],
          ["Class",            payload.asd_class],
          ["Pipes",            String(payload.pipe_records.length)],
          ["Airflow Status",   allWithin ? "All within ±20%" : "⚠ Deviations found"],
          ["Overall Status",   payload.overall_status],
          ["Engineer",         payload.engineer_name],
        ].filter(([,v]) => v).map(([k, v]) => (
          <div key={k} className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">{k}</span>
            <span className="font-medium">{v}</span>
          </div>
        ))}
      </div>
      {payload.defects.length > 0 && (
        <p className="text-sm text-amber-600">⚠ {payload.defects.length} defect{payload.defects.length !== 1 ? "s" : ""} recorded</p>
      )}
      <Button onClick={onDownload} className="w-full" variant="outline">
        <FileDown className="w-4 h-4 mr-2" /> Download PDF
      </Button>
    </div>
  );
}
