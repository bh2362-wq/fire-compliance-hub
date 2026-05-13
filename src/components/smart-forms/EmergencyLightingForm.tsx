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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Save, FileDown,
  AlertCircle, CheckCircle2, Zap, BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  buildEmptyELPayload, createELSubmission, updateELSubmission,
  validateELPayload, createMonthlyEntry, createAnnualEntry,
  type ELPayload, type ELFormType, type ELResult, type ELMonthlyEntry, type ELAnnualEntry,
} from "@/services/emergencyLightingService";
import { generateELCertificatePDF } from "@/lib/emergencyLightingPdfGenerator";

const FORM_TYPE_LABELS: Record<ELFormType, string> = {
  commissioning: "Commissioning Certificate",
  periodic: "Periodic Inspection (EPM6C)",
  monthly_log: "Monthly Test Log",
  annual_discharge: "Annual Discharge Test",
};

const STEPS = [
  "Form Type", "Premises", "System", "Inspection", "Test Records", "Defects", "Declaration"
] as const;

const RESULT_CLASSES: Record<ELResult, string> = {
  "✓": "bg-green-50 border-green-300 text-green-700",
  "7": "bg-amber-50 border-amber-300 text-amber-700",
  "N/A": "bg-muted/30 border-border text-muted-foreground",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  siteId?: string | null;
  customerId?: string | null;
  visitId?: string | null;
  prefill?: Partial<ELPayload>;
  onSaved?: () => void;
}

function uid() { return Math.random().toString(36).slice(2, 10); }

export default function EmergencyLightingForm({ open, onOpenChange, siteId, customerId, visitId, prefill, onSaved }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [payload, setPayload] = useState<ELPayload>(buildEmptyELPayload("periodic"));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(0); setSubmissionId(null);
    setPayload({ ...buildEmptyELPayload("periodic"), ...(prefill ?? {}) });
  }, [open]);

  const errors = useMemo(() => validateELPayload(payload), [payload]);

  function update<K extends keyof ELPayload>(key: K, value: ELPayload[K]) {
    setPayload(p => ({ ...p, [key]: value }));
  }

  function updateChecklist(idx: number, field: "result" | "notes", value: string) {
    const cl = [...payload.checklist];
    cl[idx] = { ...cl[idx], [field]: value };
    update("checklist", cl);
  }

  async function handleSave(complete = false) {
    if (!user) return;
    setSaving(true);
    try {
      if (submissionId) {
        await updateELSubmission(submissionId, payload, complete ? "completed" : "draft");
      } else {
        const sub = await createELSubmission(payload, {
          siteId: siteId || undefined, customerId: customerId || undefined,
          visitId: visitId || undefined, userId: user.id,
        });
        setSubmissionId(sub.id);
      }
      toast.success(complete ? "Certificate saved" : "Draft saved");
      if (complete) { onSaved?.(); onOpenChange(false); }
    } catch (err: any) { toast.error(err.message || "Save failed"); }
    finally { setSaving(false); }
  }

  async function handlePDF() {
    await handleSave(false);
    await generateELCertificatePDF(payload);
  }

  function renderStep() {
    switch (step) {

      // ── Step 0: Form type ─────────────────────────────────────────────────
      case 0: return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(["commissioning","periodic","monthly_log","annual_discharge"] as ELFormType[]).map(t => (
              <button key={t} type="button" onClick={() => update("form_type", t)}
                className={cn("p-4 rounded-xl border-2 text-left transition-all",
                  payload.form_type === t ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}>
                <p className="font-semibold text-sm">{FORM_TYPE_LABELS[t]}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {t === "commissioning" ? "New installation — Annex C BS 5266-1"
                  : t === "periodic" ? "Periodic inspection — Annex M / EPM6C model"
                  : t === "monthly_log" ? "Monthly functional test log — BS EN 50172"
                  : "Annual full rated discharge test"}
                </p>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Certificate Reference *</Label>
              <Input value={payload.cert_reference} onChange={e => update("cert_reference", e.target.value)} placeholder="e.g. EL-2026-001" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Certificate Date</Label>
              <Input type="date" value={payload.cert_date} onChange={e => update("cert_date", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Next Inspection Due</Label>
              <Input type="date" value={payload.next_inspection_date} onChange={e => update("next_inspection_date", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Recommended Interval</Label>
              <Select value={String(payload.recommendation_interval_months)} onValueChange={v => update("recommendation_interval_months", parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Monthly</SelectItem>
                  <SelectItem value="6">6 months</SelectItem>
                  <SelectItem value="12">12 months (annual)</SelectItem>
                  <SelectItem value="24">24 months</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      );

      // ── Step 1: Premises ──────────────────────────────────────────────────
      case 1: return (
        <div className="space-y-3">
          {[
            ["Premises Name *","premises_name","text",""],
            ["Address","premises_address","text",""],
            ["Postcode","premises_postcode","text",""],
            ["Responsible Person","responsible_person","text",""],
            ["Email","responsible_email","email",""],
            ["Phone","responsible_phone","tel",""],
            ["Occupancy / Building Type","occupancy_type","text","e.g. Office, School, Hotel"],
          ].map(([label,key,type,ph]) => (
            <div key={key} className="space-y-1.5">
              <Label className="text-xs font-semibold">{label}</Label>
              <Input type={type} value={(payload as any)[key]} onChange={e => update(key as any, e.target.value)} placeholder={ph} />
            </div>
          ))}
        </div>
      );

      // ── Step 2: System details ────────────────────────────────────────────
      case 2: return (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">System Type</Label>
              <Select value={payload.system_type} onValueChange={v => update("system_type", v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Self-contained","Central battery","Generator","Combined"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Mode of Operation</Label>
              <Select value={payload.system_mode} onValueChange={v => update("system_mode", v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Non-maintained","Maintained","Combined","Sustained"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Duration Rating</Label>
              <Select value={payload.duration_rating} onValueChange={v => update("duration_rating", v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1 hour">1 hour</SelectItem>
                  <SelectItem value="3 hours">3 hours (standard)</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Total Emergency Luminaires</Label>
              <Input type="number" min={0} value={payload.total_luminaires} onChange={e => update("total_luminaires", parseInt(e.target.value)||0)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Total Exit/Safety Signs</Label>
              <Input type="number" min={0} value={payload.total_exit_signs} onChange={e => update("total_exit_signs", parseInt(e.target.value)||0)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Previous Certificate Date</Label>
              <Input type="date" value={payload.previous_cert_date} onChange={e => update("previous_cert_date", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">EICR Reference (if applicable)</Label>
            <Input value={payload.eicr_reference} onChange={e => update("eicr_reference", e.target.value)} placeholder="EICR ref / date — wiring must have been inspected to BS 7671" />
          </div>
          <div className="space-y-2 pt-1">
            {([
              ["has_central_battery","Central battery system present"],
              ["has_generator","Standby generator present"],
              ["has_automatic_testing","Automatic test facility installed"],
              ["logbook_on_site","Log book available on site"],
            ] as [keyof ELPayload, string][]).map(([key,label]) => (
              <div key={key} className="flex items-center gap-2.5">
                <Checkbox checked={payload[key] as boolean} onCheckedChange={v => update(key, !!v)} />
                <Label className="text-xs cursor-pointer">{label}</Label>
              </div>
            ))}
          </div>
        </div>
      );

      // ── Step 3: Inspection checklist (Annex M / EPM6C) ───────────────────
      case 3: return (
        <div className="space-y-2">
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200/60 text-xs text-blue-800">
            <strong>EPM6C / Annex M notation:</strong> ✓ = Satisfactory &nbsp;|&nbsp; 7 = Deviation found &nbsp;|&nbsp; N/A = Not applicable to this installation
          </div>
          {payload.checklist.map((item, idx) => (
            <div key={item.clause} className={cn("border rounded-lg p-2.5 space-y-1.5 transition-colors", RESULT_CLASSES[item.result])}>
              <div className="flex items-start gap-2">
                <span className="text-[10px] font-mono text-muted-foreground w-6 flex-shrink-0 mt-0.5">{item.clause}</span>
                <p className="flex-1 text-xs leading-relaxed">{item.description}</p>
                <div className="flex gap-1 flex-shrink-0">
                  {(["✓","7","N/A"] as ELResult[]).map(r => (
                    <button key={r} onClick={() => updateChecklist(idx, "result", r)}
                      className={cn("text-[9px] px-2 py-0.5 rounded border transition-colors",
                        item.result === r ? "bg-foreground text-background border-foreground" : "border-border hover:bg-accent/30")}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              {item.result === "7" && (
                <Input value={item.notes} onChange={e => updateChecklist(idx, "notes", e.target.value)}
                  placeholder="Describe deviation…" className="text-xs h-7" />
              )}
            </div>
          ))}
          {payload.checklist.some(c => c.result === "7") && (
            <div className="space-y-1.5 pt-2">
              <Label className="text-xs font-semibold">Deviations Summary</Label>
              <Textarea value={payload.deviations_summary} onChange={e => update("deviations_summary", e.target.value)} rows={3} placeholder="Summarise all deviations identified during this inspection…" />
            </div>
          )}
        </div>
      );

      // ── Step 4: Test records ──────────────────────────────────────────────
      case 4: return (
        <Tabs defaultValue={payload.form_type === "annual_discharge" ? "annual" : "monthly"}>
          <TabsList className="h-8">
            <TabsTrigger value="monthly" className="text-xs">Monthly Tests</TabsTrigger>
            <TabsTrigger value="annual" className="text-xs">Annual Discharge</TabsTrigger>
          </TabsList>

          <TabsContent value="monthly" className="mt-3 space-y-3">
            <div className="text-[11px] text-muted-foreground">
              BS EN 50172: A short functional test must be carried out monthly. Duration should be sufficient to show the lamp operates but not deplete the battery (typically ¼ to ⅓ of rated duration).
            </div>
            {payload.monthly_entries.map((entry, idx) => (
              <div key={entry.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 justify-between">
                  <p className="text-xs font-semibold">{entry.test_month || `Month ${idx + 1}`}</p>
                  <button onClick={() => update("monthly_entries", payload.monthly_entries.filter(e => e.id !== entry.id))} className="text-destructive hover:opacity-70">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    ["Date","test_date","date"],["Month","test_month","text"],
                    ["Luminaires tested","total_luminaires","number"],["Pass","pass_count","number"],
                    ["Fail","fail_count","number"],["Duration (mins)","duration_mins","number"],
                  ].map(([label,field,type]) => (
                    <div key={field} className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">{label}</Label>
                      <Input type={type} value={(entry as any)[field]} onChange={e => {
                        const entries = [...payload.monthly_entries];
                        entries[idx] = { ...entries[idx], [field]: type === "number" ? parseInt(e.target.value)||0 : e.target.value };
                        update("monthly_entries", entries);
                      }} className="h-7 text-xs" />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Defects noted</Label>
                    <Input value={entry.defects_noted} onChange={e => { const es=[...payload.monthly_entries]; es[idx]={...es[idx],defects_noted:e.target.value}; update("monthly_entries",es); }} className="h-7 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Engineer</Label>
                    <Input value={entry.engineer_name} onChange={e => { const es=[...payload.monthly_entries]; es[idx]={...es[idx],engineer_name:e.target.value}; update("monthly_entries",es); }} className="h-7 text-xs" />
                  </div>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => update("monthly_entries", [...payload.monthly_entries, createMonthlyEntry()])}>
              <Plus className="w-3.5 h-3.5" />Add Monthly Entry
            </Button>
          </TabsContent>

          <TabsContent value="annual" className="mt-3 space-y-3">
            <div className="text-[11px] text-muted-foreground">
              BS EN 50172: A full rated duration test must be carried out annually. All luminaires must operate for the full rated duration (1 or 3 hours) without failure.
            </div>
            {payload.annual_entries.map((entry, idx) => (
              <div key={entry.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 justify-between">
                  <p className="text-xs font-semibold">Annual Discharge — {entry.test_date}</p>
                  <button onClick={() => update("annual_entries", payload.annual_entries.filter(e => e.id !== entry.id))} className="text-destructive hover:opacity-70">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    ["Test Date","test_date","date"],["Rated Duration (hrs)","duration_hours","number"],
                    ["Duration Achieved (hrs)","duration_achieved_hours","number"],["Luminaires Tested","total_luminaires","number"],
                    ["Pass","pass_count","number"],["Fail","fail_count","number"],
                  ].map(([label,field,type]) => (
                    <div key={field} className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">{label}</Label>
                      <Input type={type} value={(entry as any)[field]} onChange={e => {
                        const entries = [...payload.annual_entries];
                        entries[idx] = { ...entries[idx], [field]: type === "number" ? parseFloat(e.target.value)||0 : e.target.value };
                        update("annual_entries", entries);
                      }} className={cn("h-7 text-xs", field === "duration_achieved_hours" && entry.duration_achieved_hours > 0 && entry.duration_achieved_hours < entry.duration_hours ? "border-red-400/60" : "")} />
                    </div>
                  ))}
                </div>
                {entry.fail_count > 0 && (
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Failed luminaire locations</Label>
                    <Input value={entry.fail_locations} onChange={e => { const es=[...payload.annual_entries]; es[idx]={...es[idx],fail_locations:e.target.value}; update("annual_entries",es); }} className="h-7 text-xs" placeholder="List locations of failed luminaires" />
                  </div>
                )}
                <div className="flex items-center gap-2.5">
                  <Checkbox checked={entry.recharge_period_noted} onCheckedChange={v => { const es=[...payload.annual_entries]; es[idx]={...es[idx],recharge_period_noted:!!v}; update("annual_entries",es); }} />
                  <Label className="text-xs">Recharge period noted ({entry.recharge_hours}h) — system not returned to service until fully recharged</Label>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => update("annual_entries", [...payload.annual_entries, createAnnualEntry()])}>
              <Plus className="w-3.5 h-3.5" />Add Annual Test
            </Button>
          </TabsContent>
        </Tabs>
      );

      // ── Step 5: Defects ───────────────────────────────────────────────────
      case 5: return (
        <div className="space-y-3">
          {payload.defects.map((defect, idx) => (
            <div key={defect.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2 justify-between">
                <Badge variant="outline" className={cn("text-[9px]", defect.priority === "Urgent" ? "border-red-300/60 text-red-700" : "")}>
                  {defect.priority}
                </Badge>
                <button onClick={() => update("defects", payload.defects.filter(d => d.id !== defect.id))} className="text-destructive hover:opacity-70">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">Location</Label>
                  <Input value={defect.location} onChange={e => { const ds=[...payload.defects]; ds[idx]={...ds[idx],location:e.target.value}; update("defects",ds); }} className="h-7 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Priority</Label>
                  <Select value={defect.priority} onValueChange={v => { const ds=[...payload.defects]; ds[idx]={...ds[idx],priority:v as any}; update("defects",ds); }}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="Urgent">Urgent</SelectItem><SelectItem value="Routine">Routine</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Description</Label>
                <Textarea value={defect.description} onChange={e => { const ds=[...payload.defects]; ds[idx]={...ds[idx],description:e.target.value}; update("defects",ds); }} rows={2} className="text-xs" />
              </div>
              <div className="flex items-center gap-2.5">
                <Checkbox checked={defect.remediated} onCheckedChange={v => { const ds=[...payload.defects]; ds[idx]={...ds[idx],remediated:!!v}; update("defects",ds); }} />
                <Label className="text-xs">Remediated on this visit</Label>
                {defect.remediated && (
                  <Input type="date" value={defect.remediation_date} onChange={e => { const ds=[...payload.defects]; ds[idx]={...ds[idx],remediation_date:e.target.value}; update("defects",ds); }} className="h-7 text-xs ml-2" />
                )}
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => update("defects", [...payload.defects, { id: uid(), location: "", description: "", priority: "Routine" as const, remediated: false, remediation_date: "" }])}>
            <Plus className="w-3.5 h-3.5" />Add Defect
          </Button>
        </div>
      );

      // ── Step 6: Declaration ───────────────────────────────────────────────
      case 6: return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Overall Status</Label>
            <Select value={payload.overall_status} onValueChange={v => update("overall_status", v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Satisfactory">Satisfactory</SelectItem>
                <SelectItem value="Satisfactory with observations">Satisfactory with observations</SelectItem>
                <SelectItem value="Unsatisfactory">Unsatisfactory</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {payload.overall_status !== "Satisfactory" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Status Notes</Label>
              <Textarea value={payload.status_notes} onChange={e => update("status_notes", e.target.value)} rows={2} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Standards Reference</Label>
            <Input value={payload.standard_references} onChange={e => update("standard_references", e.target.value)} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-xs font-bold">Engineer</p>
              <Input value={payload.engineer_name} onChange={e => update("engineer_name", e.target.value)} placeholder="Full name" />
              <Input value={payload.engineer_company} onChange={e => update("engineer_company", e.target.value)} placeholder="Company" />
              <Input type="date" value={payload.engineer_date} onChange={e => update("engineer_date", e.target.value)} />
              <TypedSignature value={payload.engineer_signature} onChange={v => update("engineer_signature", v)} placeholder="Engineer signature" />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold">Client / Responsible Person</p>
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
  const hasErrors = errors.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            Emergency Lighting — {FORM_TYPE_LABELS[payload.form_type]}
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
                  <Button onClick={() => handleSave(true)} disabled={saving || hasErrors}><CheckCircle2 className="w-4 h-4 mr-1"/>Complete</Button>
                </div>
            }
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
