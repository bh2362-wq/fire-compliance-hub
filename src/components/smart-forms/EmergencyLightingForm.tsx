/**
 * Emergency Lighting Certificate Form
 * BS 5266-1:2016 · BS EN 50172:2004 · BS EN 1838:2013
 *
 * 4 sub-types: commissioning, periodic (EPM6C), monthly log, annual discharge
 * Steps: Header → Premises → System → Checklist/Log → Defects → Status → Signatures → Preview
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
import { SmartSignature } from "@/components/ui/smart-signature";
import { ChevronLeft, ChevronRight, Plus, Trash2, Save, FileDown, AlertCircle, CheckCircle2, Zap } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

// ── Payload type ──────────────────────────────────────────────────────────────
export type ELFormType = "commissioning" | "periodic" | "monthly_log" | "annual_discharge";
export type ChecklistResult = "✓" | "7" | "N/A";

export interface ELChecklistItem {
  clause: string;
  description: string;
  result: ChecklistResult | "";
  notes: string;
}

export interface ELDefect {
  id: string;
  location: string;
  description: string;
  priority: "Urgent" | "Required" | "Advisory" | "";
  remediated: boolean;
  remediation_date?: string;
}

export interface ELMonthlyEntry {
  test_month: string;
  test_date: string;
  test_type: "Functional" | "Duration";
  duration_mins: number | "";
  total_luminaires: number | "";
  pass_count: number | "";
  fail_count: number | "";
  result: "Satisfactory" | "Unsatisfactory" | "";
  defects_noted: string;
  tester_name: string;
}

export interface ELPayload {
  // Header
  cert_reference: string;
  form_type: ELFormType;
  cert_date: string;
  standard_references: string;

  // Premises
  premises_name: string;
  premises_address: string;
  premises_postcode: string;
  responsible_person: string;
  responsible_email: string;

  // System
  system_type: "Self-contained" | "Central battery" | "Generator" | "";
  system_mode: "Maintained" | "Non-maintained" | "Sustained" | "Combined" | "";
  duration_rating: "1 hour" | "2 hours" | "3 hours" | "";
  total_luminaires: number | "";
  total_exit_signs: number | "";
  logbook_on_site: boolean;
  eicr_reference: string;
  previous_cert_date: string;

  // Checklist (periodic / commissioning)
  checklist: ELChecklistItem[];

  // Monthly entries
  monthly_entries: ELMonthlyEntry[];

  // Annual discharge
  annual_entries: {
    test_date: string;
    duration_hours: number | "";
    duration_achieved_hours: number | "";
    total_luminaires: number | "";
    pass_count: number | "";
    fail_count: number | "";
    fail_locations: string;
    result: "Pass" | "Fail" | "";
  }[];

  // Defects
  defects: ELDefect[];

  // Status
  overall_status: "Satisfactory" | "Satisfactory with Deviations" | "Unsatisfactory" | "";
  deviations_summary: string;
  recommendation_interval_months: 6 | 12;
  next_inspection_date: string;

  // Signatures
  engineer_name: string;
  engineer_date: string;
  engineer_signature: string;
  client_name: string;
  client_date: string;
  client_signature: string;
}

// ── Default EPM6C checklist (Annex M of BS 5266-1) ────────────────────────────
const DEFAULT_EPM6C: ELChecklistItem[] = [
  { clause: "1",  description: "Emergency luminaires correctly positioned as per design drawings", result: "", notes: "" },
  { clause: "2",  description: "Adequate illumination provided on escape routes and open areas under test", result: "", notes: "" },
  { clause: "3",  description: "Emergency signs correctly positioned and legible", result: "", notes: "" },
  { clause: "4",  description: "All luminaires operational — no failed or missing units", result: "", notes: "" },
  { clause: "11", description: "Duration test — all luminaires operated for full rated duration without failure", result: "", notes: "" },
  { clause: "12", description: "System operated satisfactorily under all test conditions", result: "", notes: "" },
  { clause: "17", description: "Log book with satisfactory commissioning test record available on site", result: "", notes: "" },
  { clause: "18", description: "Monthly and annual test records available and up to date", result: "", notes: "" },
  { clause: "19", description: "Remedial action from previous inspection completed", result: "", notes: "" },
  { clause: "20", description: "Responsible person trained on monthly test procedures", result: "", notes: "" },
];

function buildEmpty(formType: ELFormType = "periodic"): ELPayload {
  const now = format(new Date(), "yyyy-MM-dd");
  const prefix = formType === "commissioning" ? "ELC" : formType === "monthly_log" ? "ELM" : formType === "annual_discharge" ? "ELA" : "ELP";
  const ref = `${prefix}-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
  return {
    cert_reference: ref,
    form_type: formType,
    cert_date: now,
    standard_references: "BS 5266-1:2016 · BS EN 50172:2004 · BS EN 1838:2013",
    premises_name: "", premises_address: "", premises_postcode: "",
    responsible_person: "", responsible_email: "",
    system_type: "", system_mode: "", duration_rating: "",
    total_luminaires: "", total_exit_signs: "",
    logbook_on_site: false, eicr_reference: "", previous_cert_date: "",
    checklist: DEFAULT_EPM6C.map(c => ({ ...c })),
    monthly_entries: [],
    annual_entries: [],
    defects: [],
    overall_status: "", deviations_summary: "",
    recommendation_interval_months: 6,
    next_inspection_date: "",
    engineer_name: "", engineer_date: now, engineer_signature: "",
    client_name: "", client_date: now, client_signature: "",
  };
}

// ── Steps ─────────────────────────────────────────────────────────────────────
const STEPS_BASE = ["Header", "Premises", "System"];
const STEPS_MAP: Record<ELFormType, string[]> = {
  commissioning:    [...STEPS_BASE, "Checklist", "Defects", "Status", "Signatures", "Preview"],
  periodic:         [...STEPS_BASE, "EPM6C Checklist", "Defects", "Status", "Signatures", "Preview"],
  monthly_log:      [...STEPS_BASE, "Monthly Log", "Defects", "Status", "Signatures", "Preview"],
  annual_discharge: [...STEPS_BASE, "Annual Test", "Defects", "Status", "Signatures", "Preview"],
};

function uid() { return Math.random().toString(36).slice(2, 10); }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  visitId?: string | null;
  siteId?: string | null;
  onSaved?: () => void;
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function EmergencyLightingForm({ open, onOpenChange, visitId, siteId, onSaved }: Props) {
  const { user } = useAuth();
  const [formType, setFormType] = useState<ELFormType>("periodic");
  const [payload, setPayload] = useState<ELPayload>(buildEmpty("periodic"));
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  const STEPS = STEPS_MAP[formType];

  useEffect(() => {
    if (open) {
      setPayload(buildEmpty(formType));
      setStep(0);
      setSubmissionId(null);
    }
  }, [open]);

  useEffect(() => {
    const updated = buildEmpty(formType);
    setPayload(prev => ({ ...updated, ...prev, form_type: formType,
      cert_reference: buildEmpty(formType).cert_reference,
    }));
  }, [formType]);

  function up(partial: Partial<ELPayload>) {
    setPayload(prev => ({ ...prev, ...partial }));
  }

  async function save(status: "draft" | "completed" = "draft") {
    setSaving(true);
    try {
      const row = {
        form_type: `el_${formType}`,
        certificate_reference: payload.cert_reference,
        status,
        payload: payload as unknown as Record<string, unknown>,
        visit_id: visitId ?? null,
        site_id: siteId ?? null,
        user_id: user?.id,
        ...(status === "completed" ? { completed_at: new Date().toISOString() } : {}),
      };
      if (submissionId) {
        const { error } = await supabase.from("smart_form_submissions").update(row as any).eq("id", submissionId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("smart_form_submissions").insert(row as any).select("id").single();
        if (error) throw error;
        setSubmissionId((data as any).id);
      }
      toast.success(status === "completed" ? "Certificate completed" : "Draft saved");
      if (status === "completed") onSaved?.();
    } catch (e) {
      console.error(e);
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDownload() {
    try {
      // Dynamic import to avoid circular dependency
      const { generateELCertificatePDF } = await import("@/lib/emergencyLightingPdfGenerator");
      await generateELCertificatePDF(payload as any);
    } catch { toast.error("PDF generation failed"); }
  }

  const isLast = step === STEPS.length - 1;
  const prog = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            Emergency Lighting Certificate
            <Badge variant="outline" className="text-[10px] ml-1">BS 5266-1:2016</Badge>
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
          {step === 0 && (
            <StepHeader payload={payload} up={up} formType={formType} setFormType={setFormType} />
          )}
          {step === 1 && <StepPremises payload={payload} up={up} />}
          {step === 2 && <StepSystem payload={payload} up={up} />}
          {step === 3 && (
            <>
              {(formType === "commissioning" || formType === "periodic") && (
                <StepChecklist payload={payload} up={up} />
              )}
              {formType === "monthly_log" && <StepMonthlyLog payload={payload} up={up} />}
              {formType === "annual_discharge" && <StepAnnualDischarge payload={payload} up={up} />}
            </>
          )}
          {step === 4 && <StepDefects payload={payload} up={up} />}
          {step === 5 && <StepStatus payload={payload} up={up} />}
          {step === 6 && <StepSignatures payload={payload} up={up} />}
          {step === 7 && <StepPreview payload={payload} onDownload={handleDownload} />}
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
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                Complete
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))}>
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Step 0: Header ────────────────────────────────────────────────────────────
function StepHeader({ payload, up, formType, setFormType }: {
  payload: ELPayload; up: (p: Partial<ELPayload>) => void;
  formType: ELFormType; setFormType: (t: ELFormType) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Certificate Type</Label>
        <Select value={formType} onValueChange={(v) => setFormType(v as ELFormType)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="commissioning">Commissioning Certificate</SelectItem>
            <SelectItem value="periodic">Periodic Inspection Certificate (EPM6C)</SelectItem>
            <SelectItem value="monthly_log">Monthly Test Log</SelectItem>
            <SelectItem value="annual_discharge">Annual Full Discharge Test</SelectItem>
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
      <div className="space-y-1.5">
        <Label>Standard References</Label>
        <Input value={payload.standard_references} onChange={e => up({ standard_references: e.target.value })} />
      </div>
    </div>
  );
}

// ── Step 1: Premises ──────────────────────────────────────────────────────────
function StepPremises({ payload, up }: { payload: ELPayload; up: (p: Partial<ELPayload>) => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Premises Name</Label>
        <Input value={payload.premises_name} onChange={e => up({ premises_name: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Address</Label>
        <Textarea rows={2} value={payload.premises_address} onChange={e => up({ premises_address: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Postcode</Label>
          <Input value={payload.premises_postcode} onChange={e => up({ premises_postcode: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Responsible Person</Label>
          <Input value={payload.responsible_person} onChange={e => up({ responsible_person: e.target.value })} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Responsible Person Email</Label>
        <Input type="email" value={payload.responsible_email} onChange={e => up({ responsible_email: e.target.value })} />
      </div>
    </div>
  );
}

// ── Step 2: System ────────────────────────────────────────────────────────────
function StepSystem({ payload, up }: { payload: ELPayload; up: (p: Partial<ELPayload>) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>System Type</Label>
          <Select value={payload.system_type} onValueChange={v => up({ system_type: v as any })}>
            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Self-contained">Self-contained</SelectItem>
              <SelectItem value="Central battery">Central battery</SelectItem>
              <SelectItem value="Generator">Generator</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Mode of Operation</Label>
          <Select value={payload.system_mode} onValueChange={v => up({ system_mode: v as any })}>
            <SelectTrigger><SelectValue placeholder="Select mode" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Maintained">Maintained</SelectItem>
              <SelectItem value="Non-maintained">Non-maintained</SelectItem>
              <SelectItem value="Sustained">Sustained</SelectItem>
              <SelectItem value="Combined">Combined</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Duration Rating</Label>
          <Select value={payload.duration_rating} onValueChange={v => up({ duration_rating: v as any })}>
            <SelectTrigger><SelectValue placeholder="Select duration" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1 hour">1 hour</SelectItem>
              <SelectItem value="2 hours">2 hours</SelectItem>
              <SelectItem value="3 hours">3 hours</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Total Luminaires</Label>
          <Input type="number" value={payload.total_luminaires as number || ""} onChange={e => up({ total_luminaires: parseInt(e.target.value) || "" })} />
        </div>
        <div className="space-y-1.5">
          <Label>Total Exit Signs</Label>
          <Input type="number" value={payload.total_exit_signs as number || ""} onChange={e => up({ total_exit_signs: parseInt(e.target.value) || "" })} />
        </div>
        <div className="space-y-1.5">
          <Label>EICR Reference</Label>
          <Input value={payload.eicr_reference} onChange={e => up({ eicr_reference: e.target.value })} placeholder="Optional" />
        </div>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Checkbox id="logbook" checked={payload.logbook_on_site} onCheckedChange={v => up({ logbook_on_site: !!v })} />
        <Label htmlFor="logbook">Log book available on site</Label>
      </div>
      <div className="space-y-1.5">
        <Label>Previous Certificate Date</Label>
        <Input type="date" value={payload.previous_cert_date} onChange={e => up({ previous_cert_date: e.target.value })} />
      </div>
    </div>
  );
}

// ── Step 3a: EPM6C Checklist ───────────────────────────────────────────────────
function StepChecklist({ payload, up }: { payload: ELPayload; up: (p: Partial<ELPayload>) => void }) {
  function updateItem(idx: number, field: keyof ELChecklistItem, value: string) {
    const checklist = payload.checklist.map((c, i) =>
      i === idx ? { ...c, [field]: value } : c
    );
    up({ checklist });
  }

  const resultBg: Record<string, string> = {
    "✓":  "bg-green-50 border-green-200 text-green-700",
    "7":  "bg-amber-50 border-amber-200 text-amber-700",
    "N/A":"bg-slate-50 border-slate-200 text-slate-500",
    "":   "bg-white",
  };

  return (
    <div className="space-y-3">
      <div className="p-3 bg-muted/30 rounded-md text-xs text-muted-foreground">
        <strong>Notation:</strong> ✓ = Satisfactory &nbsp;·&nbsp; 7 = Deviation identified &nbsp;·&nbsp; N/A = Not applicable
      </div>
      {payload.checklist.map((item, i) => (
        <Card key={item.clause} className={`border ${item.result === "7" ? "border-amber-200 bg-amber-50/30" : ""}`}>
          <CardContent className="py-3 px-4 space-y-2">
            <div className="flex items-start gap-3">
              <span className="text-xs font-mono font-bold text-muted-foreground w-6 shrink-0 pt-0.5">§{item.clause}</span>
              <p className="text-sm flex-1">{item.description}</p>
              <div className="flex gap-1 shrink-0">
                {(["✓", "7", "N/A"] as ChecklistResult[]).map(r => (
                  <button
                    key={r}
                    onClick={() => updateItem(i, "result", item.result === r ? "" : r)}
                    className={`px-2.5 py-1 text-xs font-bold rounded border transition-colors ${
                      item.result === r ? resultBg[r] : "bg-muted/40 border-border text-muted-foreground"
                    }`}
                  >{r}</button>
                ))}
              </div>
            </div>
            {item.result === "7" && (
              <Input
                placeholder="Notes / deviation details..."
                value={item.notes}
                onChange={e => updateItem(i, "notes", e.target.value)}
                className="text-sm h-8 bg-white"
              />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Step 3b: Monthly Log ──────────────────────────────────────────────────────
function StepMonthlyLog({ payload, up }: { payload: ELPayload; up: (p: Partial<ELPayload>) => void }) {
  function addEntry() {
    up({ monthly_entries: [...payload.monthly_entries, {
      test_month: format(new Date(), "yyyy-MM"),
      test_date: format(new Date(), "yyyy-MM-dd"),
      test_type: "Functional",
      duration_mins: "",
      total_luminaires: payload.total_luminaires,
      pass_count: "", fail_count: "",
      result: "", defects_noted: "", tester_name: payload.engineer_name,
    }] });
  }
  function removeEntry(i: number) {
    up({ monthly_entries: payload.monthly_entries.filter((_, idx) => idx !== i) });
  }
  function updateEntry(i: number, field: keyof ELMonthlyEntry, value: any) {
    up({ monthly_entries: payload.monthly_entries.map((e, idx) => idx === i ? { ...e, [field]: value } : e) });
  }

  return (
    <div className="space-y-4">
      {payload.monthly_entries.map((entry, i) => (
        <Card key={i} className="border">
          <CardContent className="py-3 px-4">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-semibold">Test Entry {i + 1}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeEntry(i)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Month</Label>
                <Input type="month" value={entry.test_month} onChange={e => updateEntry(i, "test_month", e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Test Date</Label>
                <Input type="date" value={entry.test_date} onChange={e => updateEntry(i, "test_date", e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Test Type</Label>
                <Select value={entry.test_type} onValueChange={v => updateEntry(i, "test_type", v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Functional">Functional</SelectItem>
                    <SelectItem value="Duration">Duration</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Duration (mins)</Label>
                <Input type="number" value={entry.duration_mins as number || ""} onChange={e => updateEntry(i, "duration_mins", parseInt(e.target.value) || "")} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Pass Count</Label>
                <Input type="number" value={entry.pass_count as number || ""} onChange={e => updateEntry(i, "pass_count", parseInt(e.target.value) || "")} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fail Count</Label>
                <Input type="number" value={entry.fail_count as number || ""} onChange={e => updateEntry(i, "fail_count", parseInt(e.target.value) || "")} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Result</Label>
                <Select value={entry.result} onValueChange={v => updateEntry(i, "result", v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Satisfactory">Satisfactory</SelectItem>
                    <SelectItem value="Unsatisfactory">Unsatisfactory</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tester Name</Label>
                <Input value={entry.tester_name} onChange={e => updateEntry(i, "tester_name", e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Defects Noted</Label>
                <Input value={entry.defects_noted} onChange={e => updateEntry(i, "defects_noted", e.target.value)} placeholder="None" className="h-8 text-sm" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      <Button variant="outline" size="sm" onClick={addEntry} className="w-full">
        <Plus className="w-3.5 h-3.5 mr-1" /> Add Month
      </Button>
    </div>
  );
}

// ── Step 3c: Annual Discharge ─────────────────────────────────────────────────
function StepAnnualDischarge({ payload, up }: { payload: ELPayload; up: (p: Partial<ELPayload>) => void }) {
  const entry = payload.annual_entries[0] ?? {
    test_date: payload.cert_date, duration_hours: "", duration_achieved_hours: "",
    total_luminaires: payload.total_luminaires, pass_count: "", fail_count: "",
    fail_locations: "", result: "",
  };
  function upEntry(field: string, value: any) {
    up({ annual_entries: [{ ...entry, [field]: value }] });
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Test Date</Label>
          <Input type="date" value={entry.test_date} onChange={e => upEntry("test_date", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Rated Duration (hours)</Label>
          <Input type="number" step="0.5" value={entry.duration_hours as number || ""} onChange={e => upEntry("duration_hours", parseFloat(e.target.value) || "")} />
        </div>
        <div className="space-y-1.5">
          <Label>Duration Achieved (hours)</Label>
          <Input type="number" step="0.5" value={entry.duration_achieved_hours as number || ""} onChange={e => upEntry("duration_achieved_hours", parseFloat(e.target.value) || "")} />
        </div>
        <div className="space-y-1.5">
          <Label>Total Luminaires</Label>
          <Input type="number" value={entry.total_luminaires as number || ""} onChange={e => upEntry("total_luminaires", parseInt(e.target.value) || "")} />
        </div>
        <div className="space-y-1.5">
          <Label>Pass Count</Label>
          <Input type="number" value={entry.pass_count as number || ""} onChange={e => upEntry("pass_count", parseInt(e.target.value) || "")} />
        </div>
        <div className="space-y-1.5">
          <Label>Fail Count</Label>
          <Input type="number" value={entry.fail_count as number || ""} onChange={e => upEntry("fail_count", parseInt(e.target.value) || "")} />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>Failed Luminaire Locations</Label>
          <Textarea rows={2} value={entry.fail_locations} onChange={e => upEntry("fail_locations", e.target.value)} placeholder="Locations of any failed units" />
        </div>
        <div className="space-y-1.5">
          <Label>Overall Result</Label>
          <Select value={entry.result} onValueChange={v => upEntry("result", v)}>
            <SelectTrigger><SelectValue placeholder="Select result" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Pass">Pass</SelectItem>
              <SelectItem value="Fail">Fail</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

// ── Step 4: Defects ───────────────────────────────────────────────────────────
function StepDefects({ payload, up }: { payload: ELPayload; up: (p: Partial<ELPayload>) => void }) {
  function add() {
    up({ defects: [...payload.defects, { id: uid(), location: "", description: "", priority: "", remediated: false }] });
  }
  function remove(id: string) {
    up({ defects: payload.defects.filter(d => d.id !== id) });
  }
  function upD(id: string, f: keyof ELDefect, v: any) {
    up({ defects: payload.defects.map(d => d.id === id ? { ...d, [f]: v } : d) });
  }
  return (
    <div className="space-y-4">
      {payload.defects.length === 0 && (
        <div className="py-8 text-center text-muted-foreground text-sm border rounded-lg bg-muted/20">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
          No defects recorded
        </div>
      )}
      {payload.defects.map((d, i) => (
        <Card key={d.id} className="border">
          <CardContent className="py-3 px-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold">Defect {i + 1}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(d.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Location</Label>
                <Input value={d.location} onChange={e => upD(d.id, "location", e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Priority</Label>
                <Select value={d.priority} onValueChange={v => upD(d.id, "priority", v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Urgent">Urgent</SelectItem>
                    <SelectItem value="Required">Required</SelectItem>
                    <SelectItem value="Advisory">Advisory</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Description</Label>
                <Textarea rows={2} value={d.description} onChange={e => upD(d.id, "description", e.target.value)} className="text-sm" />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id={`rem-${d.id}`} checked={d.remediated} onCheckedChange={v => upD(d.id, "remediated", !!v)} />
                <Label htmlFor={`rem-${d.id}`} className="text-xs">Remediated</Label>
              </div>
              {d.remediated && (
                <div className="space-y-1">
                  <Label className="text-xs">Remediation Date</Label>
                  <Input type="date" value={d.remediation_date || ""} onChange={e => upD(d.id, "remediation_date", e.target.value)} className="h-8 text-sm" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
      <Button variant="outline" size="sm" onClick={add} className="w-full">
        <Plus className="w-3.5 h-3.5 mr-1" /> Add Defect
      </Button>
    </div>
  );
}

// ── Step 5: Status ────────────────────────────────────────────────────────────
function StepStatus({ payload, up }: { payload: ELPayload; up: (p: Partial<ELPayload>) => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Overall Status</Label>
        <Select value={payload.overall_status} onValueChange={v => up({ overall_status: v as any })}>
          <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Satisfactory">Satisfactory</SelectItem>
            <SelectItem value="Satisfactory with Deviations">Satisfactory with Deviations</SelectItem>
            <SelectItem value="Unsatisfactory">Unsatisfactory</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {(payload.overall_status === "Satisfactory with Deviations" || payload.overall_status === "Unsatisfactory") && (
        <div className="space-y-1.5">
          <Label>Deviations / Observations Summary</Label>
          <Textarea rows={3} value={payload.deviations_summary} onChange={e => up({ deviations_summary: e.target.value })} />
        </div>
      )}
      <div className="space-y-1.5">
        <Label>Recommended Inspection Interval</Label>
        <Select value={String(payload.recommendation_interval_months)} onValueChange={v => up({ recommendation_interval_months: parseInt(v) as 6 | 12 })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="6">6 months</SelectItem>
            <SelectItem value="12">12 months</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Next Inspection Date</Label>
        <Input type="date" value={payload.next_inspection_date} onChange={e => up({ next_inspection_date: e.target.value })} />
      </div>
    </div>
  );
}

// ── Step 6: Signatures ────────────────────────────────────────────────────────
function StepSignatures({ payload, up }: { payload: ELPayload; up: (p: Partial<ELPayload>) => void }) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Engineer / Competent Person</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={payload.engineer_name} onChange={e => up({ engineer_name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={payload.engineer_date} onChange={e => up({ engineer_date: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Signature</Label>
          <TypedSignature value={payload.engineer_signature} onChange={v => up({ engineer_signature: v })} />
        </div>
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Client / Responsible Person</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={payload.client_name} onChange={e => up({ client_name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={payload.client_date} onChange={e => up({ client_date: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Signature (optional — can be captured on site)</Label>
          <TypedSignature value={payload.client_signature} onChange={v => up({ client_signature: v })} />
        </div>
      </div>
    </div>
  );
}

// ── Step 7: Preview ───────────────────────────────────────────────────────────
function StepPreview({ payload, onDownload }: { payload: ELPayload; onDownload: () => void }) {
  const formTypeLabels: Record<ELFormType, string> = {
    commissioning: "Commissioning Certificate",
    periodic: "Periodic Inspection (EPM6C)",
    monthly_log: "Monthly Test Log",
    annual_discharge: "Annual Discharge Test",
  };
  const rows = [
    ["Certificate Ref",   payload.cert_reference],
    ["Form Type",         formTypeLabels[payload.form_type]],
    ["Date",              payload.cert_date],
    ["Premises",          payload.premises_name],
    ["Address",           payload.premises_address],
    ["System Type",       payload.system_type],
    ["Duration",          payload.duration_rating],
    ["Luminaires",        String(payload.total_luminaires)],
    ["Status",            payload.overall_status],
    ["Engineer",          payload.engineer_name],
  ];
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-lg border bg-muted/20 space-y-2">
        {rows.filter(([,v]) => v).map(([k, v]) => (
          <div key={k} className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">{k}</span>
            <span className="font-medium">{v}</span>
          </div>
        ))}
      </div>
      {payload.defects.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-amber-600">
          <AlertCircle className="w-4 h-4" />
          {payload.defects.length} defect{payload.defects.length !== 1 ? "s" : ""} recorded
        </div>
      )}
      <Button onClick={onDownload} className="w-full" variant="outline">
        <FileDown className="w-4 h-4 mr-2" /> Download PDF
      </Button>
    </div>
  );
}
