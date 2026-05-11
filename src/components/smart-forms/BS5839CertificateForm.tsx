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
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TypedSignature } from "@/components/ui/typed-signature";
import { ChevronLeft, ChevronRight, Plus, Trash2, Save, FileDown, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  BS5839Payload, DefectEntry, VariationEntry, SmartFormSubmission,
  buildEmptyPayload, createSmartFormSubmission, updateSmartFormSubmission,
  validatePayload, percentageTested, DEFAULT_CHECKLIST,
} from "@/services/smartFormService";
import { generateBS5839CertificatePDF } from "@/lib/smartFormCertificatePdfGenerator";
import { uploadCertificateToSharePoint } from "@/lib/certSharePointUpload";
import { autoRegisterCertToSite } from "@/services/newCertificateService";
import { createDefect, type DefectCategory } from "@/services/defectService";

const STEPS = [
  "Header", "Premises", "System", "Service Org", "Checklist",
  "Device Testing", "Standby Power", "False Alarms", "Defects", "Variations",
  "Status", "Engineer", "Client", "Preview",
] as const;

const SYSTEM_CATEGORIES = ["M", "L1", "L2", "L3", "L4", "L5", "P1", "P2"];
const SYSTEM_TYPES = ["Addressable", "Conventional", "Wireless", "Hybrid"];
const TEST_METHODS = ["25%", "50%", "100%", "Risk-based", "Other"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: SmartFormSubmission | null;
  prefill?: Partial<BS5839Payload>;
  visitId?: string | null;
  customerId?: string | null;
  siteId?: string | null;
  onSaved?: () => void;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function BS5839CertificateForm({
  open, onOpenChange, existing, prefill, visitId, customerId, siteId, onSaved,
}: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [payload, setPayload] = useState<BS5839Payload>(buildEmptyPayload());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setSubmissionId(existing.id);
      setPayload({ ...buildEmptyPayload(), ...existing.payload });
    } else {
      setSubmissionId(null);
      setPayload({ ...buildEmptyPayload(), ...(prefill ?? {}) });
    }
    setStep(0);
  }, [open, existing, prefill]);

  const errors = useMemo(() => validatePayload(payload), [payload]);
  const errorsByStep = useMemo(() => {
    const m: Record<number, string[]> = {};
    errors.forEach((e) => { (m[e.step] ??= []).push(e.message); });
    return m;
  }, [errors]);

  function update<K extends keyof BS5839Payload>(key: K, value: BS5839Payload[K]) {
    setPayload((p) => ({ ...p, [key]: value }));
  }

  async function persist(status?: "draft" | "completed" | "signed") {
    if (!user) { toast.error("Not signed in"); return null; }
    setSaving(true);
    try {
      if (submissionId) {
        const updated = await updateSmartFormSubmission(submissionId, {
          payload, status, completed_at: status === "completed" || status === "signed" ? new Date().toISOString() : null,
        });
        toast.success(status === "completed" ? "Certificate completed" : "Draft saved");
        onSaved?.();
        return updated;
      } else {
        const created = await createSmartFormSubmission({
          payload, visit_id: visitId ?? null, customer_id: customerId ?? null,
          site_id: siteId ?? null, job_number: payload.job_number ?? null,
          engineer_id: user.id, user_id: user.id,
        });
        setSubmissionId(created.id);
        setPayload((p) => ({ ...p, certificate_reference: created.certificate_reference }));
        if (status) {
          const finalised = await updateSmartFormSubmission(created.id, {
            status, completed_at: new Date().toISOString(),
          });
          toast.success("Certificate completed");
          onSaved?.();
          return finalised;
        }
        toast.success("Draft saved");
        onSaved?.();
        return created;
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to save");
      return null;
    } finally {
      setSaving(false);
    }
  }

  function severityToCategory(sev: string | undefined): DefectCategory {
    switch ((sev || "").toLowerCase()) {
      case "critical": return 1;
      case "major":    return 2;
      default:         return 3; // Minor / Advisory / blank
    }
  }

  async function pushDefectsToSiteDefects(submissionIdLocal: string) {
    if (!siteId) return;
    const list = (payload.defects ?? []).filter(d => d?.description?.trim());
    if (list.length === 0) return;
    let ok = 0;
    for (const d of list) {
      try {
        await createDefect({
          site_id: siteId,
          visit_id: visitId ?? null,
          description: [d.description, d.recommended_action ? `Recommended: ${d.recommended_action}` : ""].filter(Boolean).join("\n"),
          location: d.location || null,
          category: severityToCategory(d.severity),
          status: "open",
          raised_by: user?.id ?? null,
          notes: d.bs_reference ? `${d.bs_reference} — from cert ${payload.certificate_reference || submissionIdLocal}` : `From cert ${payload.certificate_reference || submissionIdLocal}`,
        });
        ok++;
      } catch (e) { console.error("defect push failed", e); }
    }
    if (ok > 0) toast.success(`${ok} defect${ok === 1 ? "" : "s"} added to Defects register`);
  }

  async function runPdf(payloadToUse: BS5839Payload): Promise<{ base64: string; fileName: string } | null> {
    try {
      const res = await generateBS5839CertificatePDF(payloadToUse, {
        autoSign: true,
        engineerFallbackName: payload.engineer_declaration_name || payload.engineer_name,
      });
      toast.success("PDF generated");
      return res;
    } catch (err) {
      console.error("PDF generation failed:", err);
      toast.error(`PDF generation failed: ${(err as Error)?.message || "unknown error"}`);
      return null;
    }
  }

  async function handleGeneratePdf() {
    if (errors.length > 0) {
      const first = errors[0];
      toast.error(`${errors.length} issue(s) — first: ${first.message}`, {
        action: { label: "Go to step", onClick: () => setStep(first.step - 1) },
      });
      return;
    }
    const saved = await persist("completed");
    if (!saved) {
      await runPdf(payload);
      return;
    }
    const pdf = await runPdf(saved.payload);

    // Upload to SharePoint and persist pdf_url
    if (pdf && saved.id) {
      try {
        await uploadCertificateToSharePoint({
          submissionId: saved.id,
          siteId: siteId ?? null,
          fileName: pdf.fileName,
          base64: pdf.base64,
        });
      } catch (e) {
        console.error("SharePoint upload failed", e);
        toast.warning("Certificate saved but SharePoint upload failed");
      }
    }

    // Auto-register to site BAFE list
    if (siteId && user && saved.id && saved.certificate_reference) {
      await autoRegisterCertToSite(
        saved.id,
        siteId,
        "bs5839_inspection_servicing",
        saved.certificate_reference,
        new Date().toISOString().slice(0, 10),
        user.id,
        saved.payload as Record<string, unknown>,
      ).catch(console.error);
    }

    // Push defects into the defects register so they flow to quotation
    if (saved.id) await pushDefectsToSiteDefects(saved.id);
  }

  async function handleDownloadDraftPdf() {
    // Bypass validation — useful for previewing partial / draft certificates
    await runPdf({
      ...payload,
      certificate_reference: payload.certificate_reference || "DRAFT-BS5839",
    });
  }

  // ── Step renderers ────────────────────────────────────────────────────────
  const stepNum = step + 1;
  const stepName = STEPS[step];
  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 border-b shrink-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <DialogTitle className="text-base flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">BETA</Badge>
                BS 5839-1:2025 Inspection &amp; Servicing Certificate
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Step {stepNum}/{STEPS.length} — <span className="font-medium">{stepName}</span>
                {payload.certificate_reference && <> · <span className="font-mono">{payload.certificate_reference}</span></>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {errors.length > 0 ? (
                <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" />{errors.length} issue(s)</Badge>
              ) : (
                <Badge className="bg-green-600/15 text-green-700 border-green-600/30 gap-1"><CheckCircle2 className="h-3 w-3" />Valid</Badge>
              )}
            </div>
          </div>
          <Progress value={progress} className="h-1 mt-3" />
        </DialogHeader>

        {/* Step pills */}
        <div className="px-4 py-2 border-b shrink-0 overflow-x-auto">
          <div className="flex gap-1.5 min-w-max">
            {STEPS.map((s, i) => {
              const active = i === step;
              const hasErr = (errorsByStep[i + 1] ?? []).length > 0;
              return (
                <button
                  key={s}
                  onClick={() => setStep(i)}
                  className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
                    active ? "bg-primary text-primary-foreground border-primary" :
                    hasErr ? "border-destructive/40 text-destructive hover:bg-destructive/10" :
                    "border-border text-muted-foreground hover:bg-accent/30"
                  }`}
                >
                  {i + 1}. {s}
                </button>
              );
            })}
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 md:p-6 space-y-4">
            {step === 0 && <Step1 payload={payload} update={update} />}
            {step === 1 && <Step2 payload={payload} update={update} />}
            {step === 2 && <Step3 payload={payload} update={update} />}
            {step === 3 && <Step4 payload={payload} update={update} />}
            {step === 4 && <Step5 payload={payload} update={update} />}
            {step === 5 && <Step6 payload={payload} update={update} />}
            {step === 6 && <Step7 payload={payload} update={update} />}
            {step === 7 && <Step8 payload={payload} update={update} />}
            {step === 8 && <Step9 payload={payload} update={update} />}
            {step === 9 && <Step10 payload={payload} update={update} />}
            {step === 10 && <Step11 payload={payload} update={update} />}
            {step === 11 && <Step12 payload={payload} update={update} />}
            {step === 12 && <Step13 payload={payload} update={update} />}
            {step === 13 && <PreviewStep payload={payload} errors={errors} />}
          </div>
        </ScrollArea>

        <div className="border-t p-3 flex items-center justify-between gap-2 shrink-0 bg-background">
          <Button variant="outline" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => persist("draft")} disabled={saving}>
              <Save className="h-4 w-4 mr-1" /> Save Draft
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadDraftPdf} disabled={saving} title="Download a preview PDF without validation">
              <FileDown className="h-4 w-4 mr-1" /> Draft PDF
            </Button>
            {step < STEPS.length - 1 ? (
              <Button size="sm" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button size="sm" onClick={handleGeneratePdf} disabled={saving}>
                <FileDown className="h-4 w-4 mr-1" /> Complete &amp; Download PDF
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Step components ──────────────────────────────────────────────────────────
type StepProps = { payload: BS5839Payload; update: <K extends keyof BS5839Payload>(k: K, v: BS5839Payload[K]) => void };

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}{required && <span className="text-destructive ml-0.5">*</span>}</Label>
      {children}
    </div>
  );
}

function Step1({ payload, update }: StepProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Field label="Certificate Reference"><Input value={payload.certificate_reference || "(auto-generated on save)"} disabled className="font-mono text-xs" /></Field>
      <Field label="Certificate Type"><Input value="Inspection & Servicing" disabled /></Field>
      <Field label="Date of Service" required>
        <Input type="date" value={payload.date_of_service || ""} onChange={(e) => update("date_of_service", e.target.value)} />
      </Field>
      <Field label="Job Number"><Input value={payload.job_number || ""} onChange={(e) => update("job_number", e.target.value)} placeholder="JOB-..." /></Field>
    </div>
  );
}

function Step2({ payload, update }: StepProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Field label="Premises Name" required><Input value={payload.premises_name || ""} onChange={(e) => update("premises_name", e.target.value)} /></Field>
      <Field label="Premises Address" required><Textarea rows={2} value={payload.premises_address || ""} onChange={(e) => update("premises_address", e.target.value)} /></Field>
      <Field label="Responsible Person Name" required><Input value={payload.responsible_person_name || ""} onChange={(e) => update("responsible_person_name", e.target.value)} /></Field>
      <Field label="Responsible Person Contact"><Input value={payload.responsible_person_contact || ""} onChange={(e) => update("responsible_person_contact", e.target.value)} placeholder="Phone or email" /></Field>
      <Field label="Site Contact"><Input value={payload.site_contact || ""} onChange={(e) => update("site_contact", e.target.value)} /></Field>
    </div>
  );
}

function Step3({ payload, update }: StepProps) {
  const cats = payload.system_categories ?? [];
  function toggle(c: string) {
    update("system_categories", cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c]);
  }
  return (
    <div className="space-y-4">
      <Field label="System Category (BS 5839-1)" required>
        <div className="flex flex-wrap gap-1.5">
          {SYSTEM_CATEGORIES.map((c) => (
            <button key={c} type="button" onClick={() => toggle(c)}
              className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                cats.includes(c) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent/30"
              }`}>{c}</button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="System Type">
          <Select value={payload.system_type || undefined} onValueChange={(v) => update("system_type", v as BS5839Payload["system_type"])}>
            <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>{SYSTEM_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Panel Manufacturer"><Input value={payload.panel_manufacturer || ""} onChange={(e) => update("panel_manufacturer", e.target.value)} /></Field>
        <Field label="Panel Model"><Input value={payload.panel_model || ""} onChange={(e) => update("panel_model", e.target.value)} /></Field>
        <Field label="Number of Panels"><Input type="number" min={0} value={payload.number_of_panels ?? ""} onChange={(e) => update("number_of_panels", e.target.value === "" ? "" : Number(e.target.value))} /></Field>
        <Field label="Approx Number of Devices"><Input type="number" min={0} value={payload.approx_number_of_devices ?? ""} onChange={(e) => update("approx_number_of_devices", e.target.value === "" ? "" : Number(e.target.value))} /></Field>
      </div>
      <Field label="Areas Covered"><Textarea rows={2} value={payload.areas_covered || ""} onChange={(e) => update("areas_covered", e.target.value)} /></Field>
      <Field label="System Limitations / Exclusions"><Textarea rows={2} value={payload.system_limitations || ""} onChange={(e) => update("system_limitations", e.target.value)} /></Field>
    </div>
  );
}

function Step4({ payload, update }: StepProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Company Name"><Input value={payload.company_name || ""} onChange={(e) => update("company_name", e.target.value)} /></Field>
        <Field label="Company Address"><Input value={payload.company_address || ""} onChange={(e) => update("company_address", e.target.value)} /></Field>
        <Field label="Engineer Name" required><Input value={payload.engineer_name || ""} onChange={(e) => update("engineer_name", e.target.value)} /></Field>
      </div>
      <label className="flex items-start gap-2 p-3 rounded-md border bg-accent/10 cursor-pointer">
        <Checkbox checked={!!payload.engineer_competency_confirmed} onCheckedChange={(c) => update("engineer_competency_confirmed", !!c)} />
        <span className="text-xs leading-relaxed">I am a competent person as defined in BS 5839-1.</span>
      </label>
    </div>
  );
}

function Step5({ payload, update }: StepProps) {
  const list = payload.checklist ?? DEFAULT_CHECKLIST;
  function setItem(idx: number, patch: Partial<typeof list[number]>) {
    const next = list.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    update("checklist", next);
  }
  return (
    <div className="space-y-2">
      {list.map((c, i) => (
        <Card key={c.key} className="overflow-hidden">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <p className="text-xs font-medium flex-1 min-w-[200px]">{i + 1}. {c.label}</p>
              <div className="flex gap-1">
                {(["Pass", "Fail", "N/A"] as const).map((s) => (
                  <button key={s} type="button" onClick={() => setItem(i, { status: s })}
                    className={`px-3 py-1 rounded-md border text-[11px] font-semibold transition-colors ${
                      c.status === s
                        ? s === "Pass" ? "bg-green-600 text-white border-green-600"
                        : s === "Fail" ? "bg-destructive text-destructive-foreground border-destructive"
                        : "bg-amber-500 text-white border-amber-500"
                        : "border-border hover:bg-accent/30"
                    }`}>{s}</button>
                ))}
              </div>
            </div>
            {c.status === "Fail" && (
              <Textarea rows={2} placeholder="Comment required for failed item…" value={c.comment || ""} onChange={(e) => setItem(i, { comment: e.target.value })} />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Step6({ payload, update }: StepProps) {
  const pct = percentageTested(payload);
  const total = Number(payload.total_devices) || 0;
  const tested = Number(payload.devices_tested) || 0;
  const exceeds = tested > total && total > 0;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Total Devices on System" required><Input type="number" min={0} value={payload.total_devices ?? ""} onChange={(e) => update("total_devices", e.target.value === "" ? "" : Number(e.target.value))} /></Field>
        <Field label="Devices Tested This Visit" required>
          <Input type="number" min={0} value={payload.devices_tested ?? ""} onChange={(e) => update("devices_tested", e.target.value === "" ? "" : Number(e.target.value))} className={exceeds ? "border-destructive" : ""} />
          {exceeds && <p className="text-[11px] text-destructive">Cannot exceed total devices</p>}
        </Field>
        <Field label="% Tested">
          <div className="flex items-center gap-2 h-10 px-3 border rounded-md bg-muted/30 font-mono text-sm">{pct}%</div>
        </Field>
      </div>
      <Field label="Testing Method" required>
        <Select value={payload.testing_method || undefined} onValueChange={(v) => update("testing_method", v as BS5839Payload["testing_method"])}>
          <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent>{TEST_METHODS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      {payload.testing_method === "Other" && (
        <Field label="Other (specify)"><Input value={payload.testing_method_other || ""} onChange={(e) => update("testing_method_other", e.target.value)} /></Field>
      )}
      <Field label="Devices Not Tested"><Textarea rows={2} value={payload.devices_not_tested || ""} onChange={(e) => update("devices_not_tested", e.target.value)} /></Field>
      <Field label="Reason Not Tested"><Textarea rows={2} value={payload.reason_not_tested || ""} onChange={(e) => update("reason_not_tested", e.target.value)} /></Field>
    </div>
  );
}

function Step7({ payload, update }: StepProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Battery Type"><Input value={payload.battery_type || ""} onChange={(e) => update("battery_type", e.target.value)} /></Field>
        <Field label="Battery Age (years)"><Input type="number" min={0} value={payload.battery_age_years ?? ""} onChange={(e) => update("battery_age_years", e.target.value === "" ? "" : Number(e.target.value))} /></Field>
        <Field label="Battery Voltage"><Input value={payload.battery_voltage || ""} onChange={(e) => update("battery_voltage", e.target.value)} placeholder="e.g. 27.2V" /></Field>
        <Field label="Charger Voltage"><Input value={payload.charger_voltage || ""} onChange={(e) => update("charger_voltage", e.target.value)} /></Field>
        <Field label="Charger Operational">
          <Select value={payload.charger_operational || undefined} onValueChange={(v) => update("charger_operational", v as BS5839Payload["charger_operational"])}>
            <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent><SelectItem value="Yes">Yes</SelectItem><SelectItem value="No">No</SelectItem></SelectContent>
          </Select>
        </Field>
        <Field label="Battery Capacity Adequate">
          <Select value={payload.battery_capacity_adequate || undefined} onValueChange={(v) => update("battery_capacity_adequate", v as BS5839Payload["battery_capacity_adequate"])}>
            <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Yes">Yes</SelectItem>
              <SelectItem value="No">No</SelectItem>
              <SelectItem value="Unable to Verify">Unable to Verify</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Test Method"><Textarea rows={2} value={payload.test_method || ""} onChange={(e) => update("test_method", e.target.value)} /></Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Test Device"><Input value={payload.test_device || ""} onChange={(e) => update("test_device", e.target.value)} /></Field>
        <Field label="Serial Number"><Input value={payload.test_device_serial || ""} onChange={(e) => update("test_device_serial", e.target.value)} className="font-mono" /></Field>
      </div>
    </div>
  );
}

function Step8({ payload, update }: StepProps) {
  return (
    <div className="space-y-3">
      <Field label="Number of False Alarms Since Last Visit"><Input type="number" min={0} value={payload.false_alarm_count ?? ""} onChange={(e) => update("false_alarm_count", e.target.value === "" ? "" : Number(e.target.value))} /></Field>
      <Field label="Known Causes"><Textarea rows={2} value={payload.false_alarm_causes || ""} onChange={(e) => update("false_alarm_causes", e.target.value)} /></Field>
      <Field label="Actions Taken"><Textarea rows={2} value={payload.false_alarm_actions || ""} onChange={(e) => update("false_alarm_actions", e.target.value)} /></Field>
      <Field label="Further Recommendations"><Textarea rows={2} value={payload.false_alarm_recommendations || ""} onChange={(e) => update("false_alarm_recommendations", e.target.value)} /></Field>
    </div>
  );
}

function Step9({ payload, update }: StepProps) {
  const defects = payload.defects ?? [];
  function add() {
    const d: DefectEntry = { id: uid(), location: "", description: "", severity: "", recommended_action: "", status: "Open" };
    update("defects", [...defects, d]);
  }
  function patch(id: string, p: Partial<DefectEntry>) {
    update("defects", defects.map((d) => (d.id === id ? { ...d, ...p } : d)));
  }
  function remove(id: string) { update("defects", defects.filter((d) => d.id !== id)); }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{defects.length} defect(s)</p>
        <Button size="sm" variant="outline" onClick={add}><Plus className="h-3.5 w-3.5 mr-1" />Add Defect</Button>
      </div>
      {defects.length === 0 && <p className="text-xs text-muted-foreground italic text-center py-6">No defects added.</p>}
      {defects.map((d, i) => (
        <Card key={d.id}>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold">Defect #{i + 1} <span className="font-mono text-muted-foreground">({d.id})</span></p>
              <Button size="icon" variant="ghost" onClick={() => remove(d.id)} className="text-destructive h-7 w-7"><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Field label="Location" required><Input value={d.location} onChange={(e) => patch(d.id, { location: e.target.value })} /></Field>
              <Field label="Severity">
                <Select value={d.severity || undefined} onValueChange={(v) => patch(d.id, { severity: v as DefectEntry["severity"] })}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Critical">Critical</SelectItem>
                    <SelectItem value="Major">Major</SelectItem>
                    <SelectItem value="Minor">Minor</SelectItem>
                    <SelectItem value="Advisory">Advisory</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="BS Reference"><Input value={d.bs_reference || ""} onChange={(e) => patch(d.id, { bs_reference: e.target.value })} placeholder="e.g. BS 5839-1 cl.25" /></Field>
              <Field label="Status">
                <Select value={d.status || undefined} onValueChange={(v) => patch(d.id, { status: v as DefectEntry["status"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Open">Open</SelectItem>
                    <SelectItem value="Closed">Closed</SelectItem>
                    <SelectItem value="Requires Quote">Requires Quote</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Description" required><Textarea rows={2} value={d.description} onChange={(e) => patch(d.id, { description: e.target.value })} /></Field>
            <Field label="Recommended Action" required><Textarea rows={2} value={d.recommended_action} onChange={(e) => patch(d.id, { recommended_action: e.target.value })} /></Field>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Step10({ payload, update }: StepProps) {
  const variations = payload.variations ?? [];
  function add() {
    const v: VariationEntry = { id: uid(), description: "", justification: "", agreed_with_responsible_person: "" };
    update("variations", [...variations, v]);
  }
  function patch(id: string, p: Partial<VariationEntry>) {
    update("variations", variations.map((v) => (v.id === id ? { ...v, ...p } : v)));
  }
  function remove(id: string) { update("variations", variations.filter((v) => v.id !== id)); }
  return (
    <div className="space-y-3">
      <Field label="Variations Present?">
        <div className="flex gap-2">
          {(["Yes", "No"] as const).map((v) => (
            <button key={v} type="button" onClick={() => update("variations_present", v)}
              className={`px-4 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                payload.variations_present === v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent/30"
              }`}>{v}</button>
          ))}
        </div>
      </Field>
      {payload.variations_present === "Yes" && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{variations.length} variation(s)</p>
            <Button size="sm" variant="outline" onClick={add}><Plus className="h-3.5 w-3.5 mr-1" />Add Variation</Button>
          </div>
          {variations.map((v, i) => (
            <Card key={v.id}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold">Variation #{i + 1}</p>
                  <Button size="icon" variant="ghost" onClick={() => remove(v.id)} className="text-destructive h-7 w-7"><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
                <Field label="Description"><Textarea rows={2} value={v.description} onChange={(e) => patch(v.id, { description: e.target.value })} /></Field>
                <Field label="Justification"><Textarea rows={2} value={v.justification} onChange={(e) => patch(v.id, { justification: e.target.value })} /></Field>
                <Field label="Agreed with Responsible Person?">
                  <Select value={v.agreed_with_responsible_person || undefined} onValueChange={(val) => patch(v.id, { agreed_with_responsible_person: val as VariationEntry["agreed_with_responsible_person"] })}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent><SelectItem value="Yes">Yes</SelectItem><SelectItem value="No">No</SelectItem></SelectContent>
                  </Select>
                </Field>
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}

function Step11({ payload, update }: StepProps) {
  return (
    <div className="space-y-3">
      <Field label="Overall System Status" required>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {(["Satisfactory", "Satisfactory with Observations", "Unsatisfactory"] as const).map((s) => (
            <button key={s} type="button" onClick={() => update("overall_status", s)}
              className={`px-3 py-3 rounded-md border text-xs font-semibold transition-colors text-left ${
                payload.overall_status === s
                  ? s === "Satisfactory" ? "bg-green-600 text-white border-green-600"
                  : s === "Unsatisfactory" ? "bg-destructive text-destructive-foreground border-destructive"
                  : "bg-amber-500 text-white border-amber-500"
                  : "border-border hover:bg-accent/30"
              }`}>{s}</button>
          ))}
        </div>
      </Field>
      <Field label="Final Remarks" required><Textarea rows={5} value={payload.final_remarks || ""} onChange={(e) => update("final_remarks", e.target.value)} /></Field>
    </div>
  );
}

function Step12({ payload, update }: StepProps) {
  return (
    <div className="space-y-3">
      <div className="p-3 rounded-md border bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900 text-xs italic">
        I certify that the inspection and servicing of the fire detection and fire alarm system has been carried out in accordance with BS 5839-1:2025 and that the system status is as stated above.
      </div>
      <Field label="Engineer Name"><Input value={payload.engineer_declaration_name || payload.engineer_name || ""} onChange={(e) => update("engineer_declaration_name", e.target.value)} /></Field>
      <Field label="Signature">
        <TypedSignature value={(payload.engineer_signature || "").replace(/^typed:/, "")} onChange={(v) => update("engineer_signature", v ? `typed:${v}` : "")} placeholder="Type engineer name to sign" />
        <p className="text-[11px] text-muted-foreground mt-1">Leave blank to auto-sign with the engineer's name on the PDF.</p>
      </Field>
      <Field label="Date"><Input type="date" value={payload.engineer_signed_date || ""} onChange={(e) => update("engineer_signed_date", e.target.value)} /></Field>
    </div>
  );
}

function Step13({ payload, update }: StepProps) {
  return (
    <div className="space-y-3">
      <Field label="Client Name"><Input value={payload.client_name || ""} onChange={(e) => update("client_name", e.target.value)} /></Field>
      <Field label="Signature">
        <TypedSignature value={(payload.client_signature || "").replace(/^typed:/, "")} onChange={(v) => update("client_signature", v ? `typed:${v}` : "")} placeholder="Type client name to sign on-site" />
      </Field>
      <Field label="Date"><Input type="date" value={payload.client_signed_date || ""} onChange={(e) => update("client_signed_date", e.target.value)} /></Field>
    </div>
  );
}

function PreviewStep({ payload, errors }: { payload: BS5839Payload; errors: { step: number; message: string }[] }) {
  const pct = percentageTested(payload);
  const statusClass =
    payload.overall_status === "Satisfactory" ? "bg-green-600 text-white"
    : payload.overall_status === "Unsatisfactory" ? "bg-destructive text-destructive-foreground"
    : payload.overall_status ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground";
  return (
    <div className="space-y-4">
      {errors.length > 0 && (
        <div className="p-3 rounded-md border border-destructive/40 bg-destructive/5 space-y-1">
          <p className="text-xs font-semibold text-destructive flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" />Resolve {errors.length} issue(s) before generating</p>
          <ul className="text-[11px] text-destructive/90 list-disc pl-5">
            {errors.slice(0, 8).map((e, i) => <li key={i}>Step {e.step}: {e.message}</li>)}
            {errors.length > 8 && <li>… and {errors.length - 8} more</li>}
          </ul>
        </div>
      )}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Certificate</p>
              <p className="text-sm font-bold">BS 5839-1:2025 Inspection &amp; Servicing</p>
              <p className="text-[11px] font-mono text-muted-foreground">{payload.certificate_reference || "(auto on save)"}</p>
            </div>
            <div className={`px-3 py-1.5 rounded-md text-xs font-semibold ${statusClass}`}>{payload.overall_status || "Pending"}</div>
          </div>
          <Separator />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div><span className="text-muted-foreground">Premises:</span> <span className="font-medium">{payload.premises_name || "—"}</span></div>
            <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{payload.date_of_service || "—"}</span></div>
            <div><span className="text-muted-foreground">Responsible Person:</span> <span className="font-medium">{payload.responsible_person_name || "—"}</span></div>
            <div><span className="text-muted-foreground">Engineer:</span> <span className="font-medium">{payload.engineer_name || "—"}</span></div>
            <div><span className="text-muted-foreground">System:</span> <span className="font-medium">{(payload.system_categories ?? []).join(", ") || "—"} {payload.system_type && `· ${payload.system_type}`}</span></div>
            <div><span className="text-muted-foreground">Devices:</span> <span className="font-medium">{payload.devices_tested ?? 0} / {payload.total_devices ?? 0} ({pct}%)</span></div>
          </div>
          <Separator />
          <div>
            <p className="text-[10px] uppercase text-muted-foreground tracking-wide mb-1">Defects</p>
            <p className="text-xs">{(payload.defects ?? []).length} recorded</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground tracking-wide mb-1">Final Remarks</p>
            <p className="text-xs whitespace-pre-wrap">{payload.final_remarks || "—"}</p>
          </div>
        </CardContent>
      </Card>
      <p className="text-[11px] text-muted-foreground text-center">Click <strong>Complete &amp; Download PDF</strong> below to finalise.</p>
    </div>
  );
}
