import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { SmartSignature } from "@/components/ui/smart-signature";
import { Save, FileDown, AlertCircle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { DocDialogShell, StickyHeader, StickyFooter, DocBody, DocBlock, TitleBlock, AIAssistBlock } from "./_DocLayout";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  CommissioningPayload, CommissioningTestResult, OutstandingWorkEntry,
  DEFAULT_COMMISSIONING_TESTS,
  createNewCertSubmission, updateNewCertSubmission, validateCommissioning,
} from "@/services/newCertificateService";
import { checkDuplicateJobCert, autoRegisterCertToSite } from "@/services/newCertificateService";
import { generateCommissioningCertificatePDF } from "@/lib/commissioningCertificatePdfGenerator";

const STEPS = [
  "Header", "Premises", "Responsible Person", "System Details",
  "Commissioning Tests", "Device Testing", "System Status",
  "Outstanding Items", "Declaration", "RP Acknowledgement", "Preview",
] as const;

const SYSTEM_CATS = ["L1", "L2", "L3", "L4", "L5", "M", "P1", "P2"];
const TEST_RESULTS = ["Pass", "Fail", "N/A", "Partial"] as const;

function uid() { return Math.random().toString(36).slice(2, 10); }
function emptyPayload(): CommissioningPayload {
  return { commissioning_tests: DEFAULT_COMMISSIONING_TESTS.map((t) => ({ ...t })) };
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  visitId?: string | null;
  siteId?: string | null;
  customerId?: string | null;
  prefill?: Partial<CommissioningPayload>;
  onSaved?: () => void;
}

export default function CommissioningCertificateForm({ open, onOpenChange, visitId, siteId, customerId, prefill, onSaved }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [payload, setPayload] = useState<CommissioningPayload>(emptyPayload());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(0);
      setSubmissionId(null);
      setPayload(prefill ? { ...emptyPayload(), ...prefill } : emptyPayload());
    }
  }, [open, prefill]);

  const errors = useMemo(() => validateCommissioning(payload), [payload]);
  const errorsByStep = useMemo(() => {
    const m: Record<number, string[]> = {};
    errors.forEach((e) => { (m[e.step] ??= []).push(e.message); });
    return m;
  }, [errors]);

  function up<K extends keyof CommissioningPayload>(k: K, v: CommissioningPayload[K]) {
    setPayload((p) => ({ ...p, [k]: v }));
  }

  function toggleCat(c: string) {
    const cats = payload.system_categories ?? [];
    up("system_categories", cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c]);
  }

  function setTestResult(idx: number, patch: Partial<CommissioningTestResult>) {
    const tests = (payload.commissioning_tests ?? []).map((t, i) => i === idx ? { ...t, ...patch } : t);
    up("commissioning_tests", tests);
  }

  const pctComm = (() => {
    const t = Number(payload.devices_commissioned || 0) + Number(payload.devices_not_commissioned || 0);
    const c = Number(payload.devices_commissioned || 0);
    return t > 0 ? Math.round((c / t) * 100) : 0;
  })();

  async function persist(status?: "draft" | "completed") {
    if (!user) { toast.error("Not signed in"); return null; }
    setSaving(true);
    try {
      if (submissionId) {
        const r = await updateNewCertSubmission(submissionId, { payload, status, completed_at: status === "completed" ? new Date().toISOString() : null });
        if (status === "completed" && r?.id && siteId) {
          const p = (r.payload || payload) as any;
          const issueDate = p.date_of_commissioning || new Date().toISOString().split('T')[0];
          await autoRegisterCertToSite(r.id, siteId, "bs5839_commissioning", r.certificate_reference || "", issueDate, user.id, r.payload as any).catch(console.error);
        }
        toast.success(status === "completed" ? "Certificate completed" : "Draft saved"); onSaved?.(); return r;
      } else {
        const r = await createNewCertSubmission({ form_type: "bs5839_commissioning", payload, visit_id: visitId ?? null, site_id: siteId ?? null, customer_id: customerId ?? null, job_number: payload.job_number ?? null, user_id: user.id, engineer_id: user.id });
        setSubmissionId(r.id);
        if (r.certificate_reference) up("certificate_reference", r.certificate_reference);
        if (status === "completed" && submissionId && siteId) {
          const p = (r.payload || payload) as any;
          const issueDate = p.date_of_commissioning || new Date().toISOString().split('T')[0];
          await autoRegisterCertToSite(submissionId, siteId, "bs5839_commissioning", r.certificate_reference || "", issueDate, user.id, p).catch(console.error);
        }
        toast.success(status === "completed" ? "Certificate completed" : "Draft saved"); onSaved?.(); return r;
      }
    } catch (err) { console.error(err); toast.error("Failed to save"); return null; }
    finally { setSaving(false); }
  }

  async function handleGeneratePdf() {
    // Job duplicate check — one cert per job per type per site
    if (payload.job_number?.trim() && siteId) {
      const dup = await checkDuplicateJobCert(siteId, "bs5839_commissioning", payload.job_number);
      if (dup) {
        toast.warning(
          `A completed commissioning cert already exists for job ${payload.job_number} — ref: ${dup.certificate_reference}. Edit that cert or use a new job number.`,
          { duration: 7000 }
        );
        return;
      }
    }
    if (errors.length > 0) {
      toast.error(`${errors.length} issue(s) — first: ${errors[0].message}`, { action: { label: "Go to step", onClick: () => setStep(errors[0].step - 1) } });
      return;
    }
    const saved = await persist("completed");
    await generateCommissioningCertificatePDF((saved?.payload ?? payload) as CommissioningPayload, { autoSign: true });
  }

  const F = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}{required && <span className="text-destructive ml-0.5">*</span>}</Label>
      {children}
    </div>
  );

  const renderStep = (idx: number = step) => {
    switch (idx) {
      case 0: return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <F label="Certificate Reference"><Input value={payload.certificate_reference || "(auto-generated on save)"} disabled className="font-mono text-xs" /></F>
          <F label="Date of Commissioning" required><Input type="date" value={payload.date_of_commissioning || ""} onChange={(e) => up("date_of_commissioning", e.target.value)} /></F>
          <F label="Job Number"><Input value={payload.job_number || ""} onChange={(e) => up("job_number", e.target.value)} /></F>
          <F label="Related Installation Certificate Reference"><Input value={payload.installation_cert_ref || ""} onChange={(e) => up("installation_cert_ref", e.target.value)} placeholder="INST-..." className="font-mono" /></F>
        </div>
      );
      case 1: return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <F label="Premises Name" required><Input value={payload.premises_name || ""} onChange={(e) => up("premises_name", e.target.value)} /></F>
          <div className="md:col-span-2"><F label="Address" required><Textarea rows={2} value={payload.premises_address || ""} onChange={(e) => up("premises_address", e.target.value)} /></F></div>
          <F label="Postcode"><Input value={payload.premises_postcode || ""} onChange={(e) => up("premises_postcode", e.target.value)} /></F>
        </div>
      );
      case 2: return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <F label="Responsible Person Name" required><Input value={payload.responsible_person_name || ""} onChange={(e) => up("responsible_person_name", e.target.value)} /></F>
          <F label="Telephone"><Input value={payload.responsible_person_telephone || ""} onChange={(e) => up("responsible_person_telephone", e.target.value)} /></F>
          <F label="Email"><Input type="email" value={payload.responsible_person_email || ""} onChange={(e) => up("responsible_person_email", e.target.value)} /></F>
        </div>
      );
      case 3: return (
        <div className="space-y-4">
          <F label="System Category (BS 5839-1)" required>
            <div className="flex flex-wrap gap-1.5">
              {SYSTEM_CATS.map((c) => (
                <button key={c} type="button" onClick={() => toggleCat(c)}
                  className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${(payload.system_categories ?? []).includes(c) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent/30"}`}>
                  {c}
                </button>
              ))}
            </div>
          </F>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <F label="System Type">
              <Select value={payload.system_type || undefined} onValueChange={(v) => up("system_type", v as any)}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{["Addressable", "Conventional", "Wireless", "Hybrid"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </F>
            <F label="Panel Manufacturer"><Input value={payload.panel_manufacturer || ""} onChange={(e) => up("panel_manufacturer", e.target.value)} /></F>
            <F label="Panel Model"><Input value={payload.panel_model || ""} onChange={(e) => up("panel_model", e.target.value)} /></F>
            <F label="Panel Serial Number"><Input value={payload.panel_serial_number || ""} onChange={(e) => up("panel_serial_number", e.target.value)} className="font-mono" /></F>
            <F label="Total Devices on System"><Input type="number" min={0} value={payload.total_devices_on_system ?? ""} onChange={(e) => up("total_devices_on_system", e.target.value === "" ? "" : Number(e.target.value))} /></F>
          </div>
        </div>
      );
      case 4: return (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground mb-2">Mark each commissioning test per BS 5839-1:2025 Cl. 45. Failed items require a comment.</p>
          {(payload.commissioning_tests ?? []).map((t, i) => (
            <Card key={i} className="overflow-hidden">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-xs font-medium">{i + 1}. {t.item}</p>
                    <p className="text-[10px] text-muted-foreground">{t.bs_clause}</p>
                  </div>
                  <div className="flex gap-1 items-center flex-wrap">
                    {(["N/A", "Pass", "Partial", "Fail"] as const).map((r) => (
                      <button key={r} type="button" onClick={() => setTestResult(i, { result: r })}
                        className={`px-2.5 py-1 rounded border text-[11px] font-semibold transition-colors ${
                          t.result === r
                            ? r === "Pass" ? "bg-green-600 text-white border-green-600"
                            : r === "Fail" ? "bg-destructive text-white border-destructive"
                            : r === "Partial" ? "bg-amber-500 text-white border-amber-500"
                            : "bg-muted text-muted-foreground border-border"
                            : "border-border hover:bg-accent/30 text-xs"
                        }`}>{r}</button>
                    ))}
                  </div>
                </div>
                {(t.result === "Fail" || t.result === "Partial") && (
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <Input type="number" placeholder="No. tested" value={t.count_tested ?? ""} onChange={(e) => setTestResult(i, { count_tested: e.target.value ? Number(e.target.value) : undefined })} className="text-xs" />
                    <Input type="number" placeholder="Total" value={t.count_total ?? ""} onChange={(e) => setTestResult(i, { count_total: e.target.value ? Number(e.target.value) : undefined })} className="text-xs" />
                    <Textarea className="col-span-3 text-xs min-h-[48px]" placeholder="Comment required…" value={t.comment || ""} onChange={(e) => setTestResult(i, { comment: e.target.value })} />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      );
      case 5: return (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <F label="Devices Commissioned"><Input type="number" min={0} value={payload.devices_commissioned ?? ""} onChange={(e) => up("devices_commissioned", e.target.value === "" ? "" : Number(e.target.value))} /></F>
            <F label="Devices Not Commissioned"><Input type="number" min={0} value={payload.devices_not_commissioned ?? ""} onChange={(e) => up("devices_not_commissioned", e.target.value === "" ? "" : Number(e.target.value))} /></F>
            <F label="% Commissioned">
              <div className="flex items-center h-10 px-3 border rounded-md bg-muted/30 font-mono text-sm">{pctComm}%</div>
            </F>
          </div>
          <F label="Reason for Any Not Commissioned"><Textarea rows={2} value={payload.devices_not_commissioned_reason || ""} onChange={(e) => up("devices_not_commissioned_reason", e.target.value)} placeholder="e.g. Access not available to plant room - to be re-visited..." /></F>
        </div>
      );
      case 6: return (
        <div className="space-y-3">
          <F label="System Operational Status" required>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {(["Fully Operational", "Operational with Conditions", "Not Operational"] as const).map((s) => (
                <button key={s} type="button" onClick={() => up("system_operational", s)}
                  className={`px-3 py-3 rounded-md border text-xs font-semibold text-left transition-colors ${
                    payload.system_operational === s
                      ? s === "Fully Operational" ? "bg-green-600 text-white border-green-600"
                      : s === "Not Operational" ? "bg-destructive text-white border-destructive"
                      : "bg-amber-500 text-white border-amber-500"
                      : "border-border hover:bg-accent/30"
                  }`}>{s}</button>
              ))}
            </div>
          </F>
          {payload.system_operational === "Operational with Conditions" && (
            <F label="Conditions"><Textarea rows={3} value={payload.operational_conditions || ""} onChange={(e) => up("operational_conditions", e.target.value)} placeholder="Describe conditions under which system is operational..." /></F>
          )}
          {payload.system_operational === "Not Operational" && (
            <F label="Reasons"><Textarea rows={3} value={payload.not_operational_reasons || ""} onChange={(e) => up("not_operational_reasons", e.target.value)} /></F>
          )}
        </div>
      );
      case 7: return (
        <OutstandingItemsStep
          items={payload.outstanding_items ?? []}
          present={payload.outstanding_items_present}
          setPresent={(v) => up("outstanding_items_present", v)}
          setItems={(items) => up("outstanding_items", items)}
        />
      );
      case 8: return (
        <div className="space-y-4">
          <div className="p-3 rounded-md border bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 text-xs italic leading-relaxed">
            I certify that the fire detection and fire alarm system described in this certificate has been commissioned in accordance with BS 5839-1:2025. The tests recorded in this certificate have been carried out and the system is in the operational status stated above.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <F label="Company Name"><Input value={payload.company_name || ""} onChange={(e) => up("company_name", e.target.value)} /></F>
            <F label="FIA Member Number"><Input value={payload.fia_member_number || ""} onChange={(e) => up("fia_member_number", e.target.value)} /></F>
            <F label="Engineer Name" required><Input value={payload.engineer_name || ""} onChange={(e) => up("engineer_name", e.target.value)} /></F>
            <F label="Position"><Input value={payload.engineer_position || ""} onChange={(e) => up("engineer_position", e.target.value)} /></F>
          </div>
          <label className="flex items-start gap-2 p-3 rounded-md border bg-accent/10 cursor-pointer">
            <Checkbox checked={!!payload.engineer_competency_confirmed} onCheckedChange={(c) => up("engineer_competency_confirmed", !!c)} />
            <span className="text-xs leading-relaxed">I am a competent person as defined in BS 5839-1 and am suitably qualified to commission this system.</span>
          </label>
          <F label="Signature"><SmartSignature value={payload.engineer_signature || ""} onChange={(v) => up("engineer_signature", v)} /></F>
          <F label="Date Signed"><Input type="date" value={payload.engineer_signed_date || ""} onChange={(e) => up("engineer_signed_date", e.target.value)} /></F>
        </div>
      );
      case 9: return (
        <div className="space-y-4">
          <div className="p-3 rounded-md border bg-blue-50 dark:bg-blue-950/20 border-blue-200 text-xs italic leading-relaxed">
            I acknowledge receipt of this commissioning certificate. I confirm that the system has been demonstrated to me, that I have been instructed on its operation, routine testing and maintenance requirements, and that I have received the log book, as-installed drawings and O&M manual (as applicable).
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {([["rp_briefed_on_operation", "Instructed on system operation"], ["rp_received_logbook", "Log book received"], ["rp_received_drawings", "As-installed drawings received"], ["rp_received_manual", "O&M manual received"]] as [keyof CommissioningPayload, string][]).map(([field, label]) => (
              <div key={field} className="flex items-center gap-2 p-2 rounded-md border bg-accent/10">
                <Select value={(payload[field] as string) || undefined} onValueChange={(v) => up(field, v as any)}>
                  <SelectTrigger className="w-20 h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent><SelectItem value="Yes">Yes</SelectItem><SelectItem value="No">No</SelectItem></SelectContent>
                </Select>
                <span className="text-xs">{label}</span>
              </div>
            ))}
          </div>
          <F label="Responsible Person Name"><Input value={payload.rp_name_signed || ""} onChange={(e) => up("rp_name_signed", e.target.value)} /></F>
          <F label="Signature (on-site or leave blank)"><SmartSignature value={payload.rp_signature || ""} onChange={(v) => up("rp_signature", v)} showAbsent /></F>
          <F label="Date Signed"><Input type="date" value={payload.rp_signed_date || ""} onChange={(e) => up("rp_signed_date", e.target.value)} /></F>
        </div>
      );
      case 10: return (
        <div className="space-y-4">
          {errors.length > 0 && (
            <div className="p-3 rounded-md border border-destructive/40 bg-destructive/5 space-y-1">
              <p className="text-xs font-semibold text-destructive flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" />Resolve {errors.length} issue(s)</p>
              <ul className="text-[11px] text-destructive/90 list-disc pl-5">{errors.map((e, i) => <li key={i}>Step {e.step}: {e.message}</li>)}</ul>
            </div>
          )}
          <Card><CardContent className="p-4 space-y-2">
            <p className="text-[10px] uppercase text-muted-foreground tracking-wide">BS 5839-1:2025 Commissioning Certificate</p>
            <p className="text-sm font-bold">{payload.premises_name || "—"}</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-muted-foreground">Date:</span> {payload.date_of_commissioning || "—"}</div>
              <div><span className="text-muted-foreground">Category:</span> {(payload.system_categories ?? []).join(", ") || "—"}</div>
              <div><span className="text-muted-foreground">Status:</span> {payload.system_operational || "—"}</div>
              <div><span className="text-muted-foreground">Commissioned:</span> {pctComm}%</div>
              <div><span className="text-muted-foreground">Tests passed:</span> {(payload.commissioning_tests ?? []).filter((t) => t.result === "Pass").length} / {(payload.commissioning_tests ?? []).length}</div>
              <div><span className="text-muted-foreground">Engineer:</span> {payload.engineer_name || "—"}</div>
            </div>
          </CardContent></Card>
        </div>
      );
      default: return null;
    }
  };

  return (
    <DocDialogShell open={open} onOpenChange={onOpenChange}>
      <StickyHeader
        title="FD/03 — Fire Alarm Commissioning Certificate · BS 5839-1:2017+A2:2019 Annex C"
        reference={payload.certificate_reference}
        status={errors.length > 0 ? "issues" : "valid"}
        onSaveDraft={() => persist("draft")}
        onComplete={handleGeneratePdf}
        saving={saving}
        meta={
          errors.length > 0
            ? <Badge variant="destructive" className="gap-1 text-[10px]"><AlertCircle className="h-3 w-3" />{errors.length} issue(s)</Badge>
            : <Badge variant="outline" className="text-[10px]">FD/03</Badge>
        }
      />
      <DocBody>
        <TitleBlock
          title="Fire Alarm System — Commissioning Certificate"
          subtitle="BS 5839-1:2017+A2:2019 Annex C · BAFE SP203-1 FD/03"
          reference={payload.certificate_reference}
          date={payload.date_of_commissioning}
          onDateChange={(v) => up("date_of_commissioning", v)}
        />
        <p className="text-[11px] italic text-muted-foreground px-1">
          Issued in accordance with BS 5839-1:2017+A2:2019 Clause 23 — Commissioning and BAFE SP203-1 Section 5 (FD/03).
        </p>
        {STEPS.slice(0, -1).map((label, i) => (
          <DocBlock key={label} title={`${i + 1}. ${label}`}>
            {renderStep(i)}
          </DocBlock>
        ))}

        <AIAssistBlock
          payload={payload as any}
          formLabel="BS 5839-1 Commissioning Certificate"
          extraInstruction="Confirm the system has been commissioned and is operational; mention any items not yet commissioned and the next service due date."
        />
        {errors.length > 0 && (
          <div className="p-3 rounded-md border border-destructive/40 bg-destructive/5 space-y-1">
            <p className="text-xs font-semibold text-destructive flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" />Resolve {errors.length} issue(s)
            </p>
            <ul className="text-[11px] text-destructive/90 list-disc pl-5">
              {errors.map((e, i) => <li key={i}>{STEPS[e.step - 1]}: {e.message}</li>)}
            </ul>
          </div>
        )}
      </DocBody>
      <StickyFooter
        standardLabel="BS 5839-1:2025 Commissioning Certificate"
        onClose={() => onOpenChange(false)}
        onComplete={handleGeneratePdf}
        saving={saving}
      />
    </DocDialogShell>
  );
}

function OutstandingItemsStep({ items, present, setPresent, setItems }: { items: OutstandingWorkEntry[]; present?: string; setPresent: (v: any) => void; setItems: (v: OutstandingWorkEntry[]) => void }) {
  const uid = () => Math.random().toString(36).slice(2, 10);
  const add = () => setItems([...items, { id: uid(), description: "", target_date: "", responsibility: "" }]);
  const patch = (id: string, p: Partial<OutstandingWorkEntry>) => setItems(items.map((w) => w.id === id ? { ...w, ...p } : w));
  const remove = (id: string) => setItems(items.filter((w) => w.id !== id));
  return (
    <div className="space-y-3">
      <div className="flex gap-2 mb-2">
        {(["Yes", "No"] as const).map((v) => (
          <button key={v} type="button" onClick={() => setPresent(v)}
            className={`px-4 py-1.5 rounded-md border text-xs font-medium transition-colors ${present === v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent/30"}`}>
            Outstanding items: {v}
          </button>
        ))}
      </div>
      {present === "Yes" && (
        <>
          <div className="flex justify-end"><Button size="sm" variant="outline" onClick={add}><Plus className="h-3.5 w-3.5 mr-1" />Add Item</Button></div>
          {items.length === 0 && <p className="text-xs text-muted-foreground italic text-center py-4">No items added.</p>}
          {items.map((w, i) => (
            <Card key={w.id}><CardContent className="p-3 space-y-2">
              <div className="flex justify-between"><p className="text-xs font-semibold">Item #{i + 1}</p>
                <Button size="icon" variant="ghost" onClick={() => remove(w.id)} className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="md:col-span-3 space-y-1.5"><Label className="text-xs">Description</Label><Textarea rows={2} value={w.description} onChange={(e) => patch(w.id, { description: e.target.value })} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Target Date</Label><Input type="date" value={w.target_date || ""} onChange={(e) => patch(w.id, { target_date: e.target.value })} /></div>
                <div className="md:col-span-2 space-y-1.5"><Label className="text-xs">Responsibility</Label><Input value={w.responsibility || ""} onChange={(e) => patch(w.id, { responsibility: e.target.value })} /></div>
              </div>
            </CardContent></Card>
          ))}
        </>
      )}
      {present === "No" && <p className="text-xs text-muted-foreground italic p-3 border rounded-md bg-muted/30">No outstanding items.</p>}
    </div>
  );
}
