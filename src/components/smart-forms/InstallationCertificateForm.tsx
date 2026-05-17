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
import { DocDialogShell, StickyHeader, StickyFooter, DocBody, DocBlock, TitleBlock, AIAssistBlock, SitePrefillBlock, PhotoAnalysisBlock, PdfPreviewBlock } from "./_DocLayout";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  InstallationPayload, InstallVariationEntry, OutstandingWorkEntry,
  createNewCertSubmission, updateNewCertSubmission, validateInstallation,
} from "@/services/newCertificateService";
import { checkDuplicateJobCert, autoRegisterCertToSite } from "@/services/newCertificateService";
import { generateInstallationCertificatePDF } from "@/lib/installationCertificatePdfGenerator";

const STEPS = [
  "Header", "Premises", "Responsible Person", "System Details",
  "Installation", "Variations", "Outstanding Works",
  "Declaration", "Acknowledgement", "Preview",
] as const;

const SYSTEM_CATS = ["L1", "L2", "L3", "L4", "L5", "M", "P1", "P2"];
const WORK_TYPES = ["New Installation", "Extension", "Replacement", "Takeover"];
const STANDARDS = ["BS 5839-1:2017+A2:2019", "BS 5839-1:2025"];

function uid() { return Math.random().toString(36).slice(2, 10); }
function emptyPayload(): InstallationPayload { return {}; }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  visitId?: string | null;
  siteId?: string | null;
  customerId?: string | null;
  prefill?: Partial<InstallationPayload>;
  onSaved?: () => void;
}

export default function InstallationCertificateForm({ open, onOpenChange, visitId, siteId, customerId, prefill, onSaved }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [payload, setPayload] = useState<InstallationPayload>(emptyPayload());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(0);
      setSubmissionId(null);
      setPayload(prefill ? { ...emptyPayload(), ...prefill } : emptyPayload());
    }
  }, [open, prefill]);

  const errors = useMemo(() => validateInstallation(payload), [payload]);
  const errorsByStep = useMemo(() => {
    const m: Record<number, string[]> = {};
    errors.forEach((e) => { (m[e.step] ??= []).push(e.message); });
    return m;
  }, [errors]);

  function up<K extends keyof InstallationPayload>(k: K, v: InstallationPayload[K]) {
    setPayload((p) => ({ ...p, [k]: v }));
  }

  function toggleCat(c: string) {
    const cats = payload.system_categories ?? [];
    up("system_categories", cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c]);
  }

  async function persist(status?: "draft" | "completed") {
    if (!user) { toast.error("Not signed in"); return null; }
    setSaving(true);
    try {
      if (submissionId) {
        const r = await updateNewCertSubmission(submissionId, { payload, status, completed_at: status === "completed" ? new Date().toISOString() : null });
        toast.success(status === "completed" ? "Certificate completed" : "Draft saved");
        onSaved?.(); return r;
      } else {
        const r = await createNewCertSubmission({ form_type: "bs5839_installation", payload, visit_id: visitId ?? null, site_id: siteId ?? null, customer_id: customerId ?? null, job_number: payload.job_number ?? null, user_id: user.id, engineer_id: user.id });
        setSubmissionId(r.id);
        if (r.certificate_reference) up("certificate_reference", r.certificate_reference);
        toast.success(status === "completed" ? "Certificate completed" : "Draft saved");
        onSaved?.(); return r;
      }
    } catch (err) { console.error(err); toast.error("Failed to save"); return null; }
    finally { setSaving(false); }
  }

  async function handleGeneratePdf() {
    // Job duplicate check — one cert per job per type per site
    if (payload.job_number?.trim() && siteId) {
      const dup = await checkDuplicateJobCert(siteId, "bs5839_installation", payload.job_number);
      if (dup) {
        toast.warning(
          `A completed installation cert already exists for job ${payload.job_number} — ref: ${dup.certificate_reference}. Edit that cert or use a new job number.`,
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
    await generateInstallationCertificatePDF((saved?.payload ?? payload) as InstallationPayload, { autoSign: true });
  }

  async function handleDraftPdf() {
    await generateInstallationCertificatePDF({ ...payload, certificate_reference: payload.certificate_reference || "DRAFT-INSTALL" });
  }


  // ── Field helpers ──────────────────────────────────────────────────────────
  const F = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}{required && <span className="text-destructive ml-0.5">*</span>}</Label>
      {children}
    </div>
  );

  const YNSelect = ({ field }: { field: keyof InstallationPayload }) => (
    <Select value={(payload[field] as string) || undefined} onValueChange={(v) => up(field, v as any)}>
      <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
      <SelectContent><SelectItem value="Yes">Yes</SelectItem><SelectItem value="No">No</SelectItem></SelectContent>
    </Select>
  );

  // ── Step renderers ─────────────────────────────────────────────────────────
  const renderStep = (idx: number = step) => {
    switch (idx) {
      case 0: return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <F label="Certificate Reference"><Input value={payload.certificate_reference || "(auto-generated on save)"} disabled className="font-mono text-xs" /></F>
          <F label="Nature of Works" required>
            <Select value={payload.work_type || undefined} onValueChange={(v) => up("work_type", v as any)}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>{WORK_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </F>
          <F label="Date of Completion" required><Input type="date" value={payload.date_of_completion || ""} onChange={(e) => up("date_of_completion", e.target.value)} /></F>
          <F label="Job / Contract Reference"><Input value={payload.job_number || ""} onChange={(e) => up("job_number", e.target.value)} placeholder="JOB-..." /></F>
        </div>
      );
      case 1: return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <F label="Premises Name" required><Input value={payload.premises_name || ""} onChange={(e) => up("premises_name", e.target.value)} /></F>
          <div className="md:col-span-2"><F label="Address" required><Textarea rows={2} value={payload.premises_address || ""} onChange={(e) => up("premises_address", e.target.value)} /></F></div>
          <F label="Postcode"><Input value={payload.premises_postcode || ""} onChange={(e) => up("premises_postcode", e.target.value)} /></F>
          <F label="Occupancy Type"><Input value={payload.occupancy_type || ""} onChange={(e) => up("occupancy_type", e.target.value)} placeholder="e.g. Office, Hotel, Healthcare" /></F>
        </div>
      );
      case 2: return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <F label="Responsible Person Name" required><Input value={payload.responsible_person_name || ""} onChange={(e) => up("responsible_person_name", e.target.value)} /></F>
          <F label="Position / Title"><Input value={payload.responsible_person_position || ""} onChange={(e) => up("responsible_person_position", e.target.value)} /></F>
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
            <F label="Panel Software Version"><Input value={payload.panel_software_version || ""} onChange={(e) => up("panel_software_version", e.target.value)} placeholder="e.g. v4.2" /></F>
            <F label="Panel Serial Number"><Input value={payload.panel_serial_number || ""} onChange={(e) => up("panel_serial_number", e.target.value)} className="font-mono" /></F>
            <F label="Number of Zones"><Input type="number" min={0} value={payload.number_of_zones ?? ""} onChange={(e) => up("number_of_zones", e.target.value === "" ? "" : Number(e.target.value))} /></F>
            <F label="Total Devices Installed"><Input type="number" min={0} value={payload.total_devices_installed ?? ""} onChange={(e) => up("total_devices_installed", e.target.value === "" ? "" : Number(e.target.value))} /></F>
          </div>
          <F label="Areas Covered by System"><Textarea rows={2} value={payload.areas_covered || ""} onChange={(e) => up("areas_covered", e.target.value)} placeholder="All floors, stairwells, plant rooms..." /></F>
          <F label="Areas Excluded from System"><Textarea rows={2} value={payload.areas_excluded || ""} onChange={(e) => up("areas_excluded", e.target.value)} placeholder="None, or list exclusions..." /></F>
        </div>
      );
      case 4: return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <F label="Standard Installed To">
              <Select value={payload.standard_installed_to || undefined} onValueChange={(v) => up("standard_installed_to", v)}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{STANDARDS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </F>
            <F label="Cable Types Used"><Input value={payload.cable_types_used || ""} onChange={(e) => up("cable_types_used", e.target.value)} placeholder="e.g. Enhanced, Fire-rated MICC" /></F>
            <F label="Standby Power Type"><Input value={payload.standby_power_type || ""} onChange={(e) => up("standby_power_type", e.target.value)} placeholder="e.g. Sealed lead-acid" /></F>
            <F label="Battery Capacity (Ah)"><Input value={payload.battery_capacity_ah || ""} onChange={(e) => up("battery_capacity_ah", e.target.value)} /></F>
            <F label="As-Installed Drawings Provided"><YNSelect field="as_installed_drawings_provided" /></F>
            <F label="O&M Manual Provided"><YNSelect field="om_manual_provided" /></F>
            <F label="System Log Book Provided"><YNSelect field="logbook_provided" /></F>
          </div>
          <F label="Description of Installation Works" required>
            <Textarea rows={5} value={payload.description_of_works || ""} onChange={(e) => up("description_of_works", e.target.value)} placeholder="Describe all installation works carried out, including scope, devices installed, wiring routes, panel location..." />
          </F>
        </div>
      );
      case 5: return <VariationsStep payload={payload} up={up} />;
      case 6: return <OutstandingStep payload={payload} up={up} field="outstanding_works" presentField="outstanding_works_present" />;
      case 7: return (
        <div className="space-y-4">
          <div className="p-3 rounded-md border bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 text-xs italic leading-relaxed">
            I/We certify that the fire detection and fire alarm system described in this certificate has been installed in accordance with BS 5839-1:2025 (or the version current at the time of design) and the agreed specification. The system is ready for commissioning. Any variations from the specification are recorded in this certificate.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <F label="Company Name"><Input value={payload.company_name || ""} onChange={(e) => up("company_name", e.target.value)} /></F>
            <F label="FIA Member Number"><Input value={payload.fia_member_number || ""} onChange={(e) => up("fia_member_number", e.target.value)} /></F>
            <F label="BAFE SP203 Registration (if applicable)"><Input value={payload.bafe_registration || ""} onChange={(e) => up("bafe_registration", e.target.value)} /></F>
            <F label="Engineer Name" required><Input value={payload.engineer_name || ""} onChange={(e) => up("engineer_name", e.target.value)} /></F>
            <F label="Position"><Input value={payload.engineer_position || ""} onChange={(e) => up("engineer_position", e.target.value)} /></F>
          </div>
          <label className="flex items-start gap-2 p-3 rounded-md border bg-accent/10 cursor-pointer">
            <Checkbox checked={!!payload.engineer_competency_confirmed} onCheckedChange={(c) => up("engineer_competency_confirmed", !!c)} />
            <span className="text-xs leading-relaxed">I am a competent person as defined in BS 5839-1 and have the knowledge, skills and experience necessary to carry out this installation.</span>
          </label>
          <F label="Signature">
            <SmartSignature value={payload.engineer_signature || ""} onChange={(v) => up("engineer_signature", v)} />
          </F>
          <F label="Date Signed"><Input type="date" value={payload.engineer_signed_date || ""} onChange={(e) => up("engineer_signed_date", e.target.value)} /></F>
        </div>
      );
      case 8: return (
        <div className="space-y-4">
          <div className="p-3 rounded-md border bg-blue-50 dark:bg-blue-950/20 border-blue-200 text-xs italic leading-relaxed">
            I acknowledge receipt of this installation certificate and confirm I have been informed of the extent of the installation and any outstanding works. I accept responsibility for the ongoing maintenance of this system.
          </div>
          <F label="Responsible Person Name">
            <Input value={payload.rp_name_signed || ""} onChange={(e) => up("rp_name_signed", e.target.value)} placeholder="Name of person signing on behalf of premises" />
          </F>
          <F label="Signature (on-site capture or leave blank)">
            <SmartSignature value={payload.rp_signature || ""} onChange={(v) => up("rp_signature", v)} showAbsent />
          </F>
          <F label="Date Signed"><Input type="date" value={payload.rp_signed_date || ""} onChange={(e) => up("rp_signed_date", e.target.value)} /></F>
        </div>
      );
      case 9: return (
        <div className="space-y-4">
          {errors.length > 0 && (
            <div className="p-3 rounded-md border border-destructive/40 bg-destructive/5 space-y-1">
              <p className="text-xs font-semibold text-destructive flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" />Resolve {errors.length} issue(s) before generating</p>
              <ul className="text-[11px] text-destructive/90 list-disc pl-5">
                {errors.map((e, i) => <li key={i}>Step {e.step}: {e.message}</li>)}
              </ul>
            </div>
          )}
          <Card><CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Certificate Type</p>
                <p className="text-sm font-bold">BS 5839-1:2025 Installation Certificate</p>
                <p className="text-[11px] font-mono text-muted-foreground">{payload.certificate_reference || "(auto on save)"}</p>
              </div>
              <Badge variant="outline">{payload.work_type || "—"}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs pt-2">
              <div><span className="text-muted-foreground">Premises:</span> <span className="font-medium">{payload.premises_name || "—"}</span></div>
              <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{payload.date_of_completion || "—"}</span></div>
              <div><span className="text-muted-foreground">Category:</span> <span className="font-medium">{(payload.system_categories ?? []).join(", ") || "—"}</span></div>
              <div><span className="text-muted-foreground">Devices:</span> <span className="font-medium">{payload.total_devices_installed ?? "—"}</span></div>
              <div><span className="text-muted-foreground">Engineer:</span> <span className="font-medium">{payload.engineer_name || "—"}</span></div>
              <div><span className="text-muted-foreground">Variations:</span> <span className="font-medium">{payload.variations_present || "Not declared"}</span></div>
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
        title="FD/02 — Fire Alarm Installation Certificate · BS 5839-1:2017+A2:2019 Annex E"
        reference={payload.certificate_reference}
        status={errors.length > 0 ? "issues" : "valid"}
        onSaveDraft={() => persist("draft")}
        onComplete={handleGeneratePdf}
        saving={saving}
        meta={
          errors.length > 0 ? (
            <Badge variant="destructive" className="gap-1 text-[10px]"><AlertCircle className="h-3 w-3" />{errors.length} issue(s)</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">FD/02</Badge>
          )
        }
      />
      <DocBody>
        <SitePrefillBlock
          formType="bs5839_installation"
          siteId={siteId}
          onPrefillApplied={(fields) => setPayload((prev) => ({ ...prev, ...(fields as Partial<InstallationPayload>) }))}
        />
        <TitleBlock
          title="Fire Alarm System — Installation Certificate"
          subtitle="BS 5839-1:2017+A2:2019 Annex E · BAFE SP203-1 FD/02"
          reference={payload.certificate_reference}
          date={payload.date_of_completion}
          onDateChange={(v) => up("date_of_completion", v)}
        />
        <p className="text-[11px] italic text-muted-foreground px-1">
          This certificate confirms installation was carried out in accordance with BS 5839-1:2017+A2:2019 Clause 27 and BAFE SP203-1 Section 5 (FD/02).
        </p>
        <PhotoAnalysisBlock
          submissionId={submissionId}
          context={[payload.premises_name, payload.panel_manufacturer, "BS5839 installation"].filter(Boolean).join(", ")}
          existingDefects={(payload as any).ai_photo_defects || []}
          onAddDefects={(defects) => setPayload((p) => ({ ...p, ai_photo_defects: [ ...(((p as any).ai_photo_defects) || []), ...defects ] } as InstallationPayload))}
        />

        {STEPS.slice(0, -1).map((label, i) => (
          <DocBlock key={label} title={`${i + 1}. ${label}`}>
            {renderStep(i)}
          </DocBlock>
        ))}

        <AIAssistBlock
          payload={payload as any}
          formLabel="BS 5839-1 Installation Certificate"
          extraInstruction="Reassure the client that the system is installed and ready for commissioning; flag any outstanding works."
        />

        {errors.length > 0 && (
          <div className="p-3 rounded-md border border-destructive/40 bg-destructive/5 space-y-1">
            <p className="text-xs font-semibold text-destructive flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" />Resolve {errors.length} issue(s) before generating
            </p>
            <ul className="text-[11px] text-destructive/90 list-disc pl-5">
              {errors.map((e, i) => <li key={i}>{STEPS[e.step - 1]}: {e.message}</li>)}
            </ul>
          </div>
        )}
      </DocBody>
      <StickyFooter
        standardLabel="BS 5839-1:2017+A2:2019 Clause 27 · BAFE SP203-1 Section 5 (FD/02)"
        onClose={() => onOpenChange(false)}
        onComplete={handleGeneratePdf}
        saving={saving}
      />
    </DocDialogShell>
  );
}

// ── Sub-components shared across forms ─────────────────────────────────────

function VariationsStep({ payload, up }: { payload: InstallationPayload; up: <K extends keyof InstallationPayload>(k: K, v: any) => void }) {
  const variations = payload.variations ?? [];
  const add = () => up("variations", [...variations, { id: uid(), description: "", justification: "", agreed_with_rp: "", bs_clause: "" } as InstallVariationEntry]);
  const patch = (id: string, p: Partial<InstallVariationEntry>) => up("variations", variations.map((v) => v.id === id ? { ...v, ...p } : v));
  const remove = (id: string) => up("variations", variations.filter((v) => v.id !== id));
  return (
    <div className="space-y-3">
      <div className="flex gap-2 mb-2">
        {(["Yes", "No"] as const).map((v) => (
          <button key={v} type="button" onClick={() => up("variations_present", v)}
            className={`px-4 py-1.5 rounded-md border text-xs font-medium transition-colors ${payload.variations_present === v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent/30"}`}>
            Variations present: {v}
          </button>
        ))}
      </div>
      {payload.variations_present === "Yes" && (
        <>
          <div className="flex justify-end"><Button size="sm" variant="outline" onClick={add}><Plus className="h-3.5 w-3.5 mr-1" />Add Variation</Button></div>
          {variations.length === 0 && <p className="text-xs text-muted-foreground italic text-center py-4">No variations added.</p>}
          {variations.map((v, i) => (
            <Card key={v.id}><CardContent className="p-3 space-y-2">
              <div className="flex justify-between items-center">
                <p className="text-xs font-semibold">Variation #{i + 1}</p>
                <Button size="icon" variant="ghost" onClick={() => remove(v.id)} className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="space-y-1.5"><Label className="text-xs">Description</Label><Textarea rows={2} value={v.description} onChange={(e) => patch(v.id, { description: e.target.value })} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Justification</Label><Textarea rows={2} value={v.justification} onChange={(e) => patch(v.id, { justification: e.target.value })} /></div>
                <div className="space-y-1.5"><Label className="text-xs">BS 5839-1 Clause Reference</Label><Input value={v.bs_clause || ""} onChange={(e) => patch(v.id, { bs_clause: e.target.value })} placeholder="e.g. Cl. 5.2" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Agreed with Responsible Person?</Label>
                  <Select value={v.agreed_with_rp || undefined} onValueChange={(val) => patch(v.id, { agreed_with_rp: val as any })}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent><SelectItem value="Yes">Yes</SelectItem><SelectItem value="No">No</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent></Card>
          ))}
        </>
      )}
      {payload.variations_present === "No" && <p className="text-xs text-muted-foreground italic p-3 border rounded-md bg-muted/30">No variations from the specification to declare.</p>}
    </div>
  );
}

function OutstandingStep({ payload, up, field, presentField }: { payload: any; up: any; field: string; presentField: string }) {
  const works: OutstandingWorkEntry[] = payload[field] ?? [];
  const add = () => up(field, [...works, { id: uid(), description: "", target_date: "", responsibility: "" }]);
  const patch = (id: string, p: Partial<OutstandingWorkEntry>) => up(field, works.map((w: any) => w.id === id ? { ...w, ...p } : w));
  const remove = (id: string) => up(field, works.filter((w: any) => w.id !== id));
  return (
    <div className="space-y-3">
      <div className="flex gap-2 mb-2">
        {(["Yes", "No"] as const).map((v) => (
          <button key={v} type="button" onClick={() => up(presentField, v)}
            className={`px-4 py-1.5 rounded-md border text-xs font-medium transition-colors ${payload[presentField] === v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent/30"}`}>
            Outstanding works: {v}
          </button>
        ))}
      </div>
      {payload[presentField] === "Yes" && (
        <>
          <div className="flex justify-end"><Button size="sm" variant="outline" onClick={add}><Plus className="h-3.5 w-3.5 mr-1" />Add Item</Button></div>
          {works.length === 0 && <p className="text-xs text-muted-foreground italic text-center py-4">No outstanding works added.</p>}
          {works.map((w: any, i: number) => (
            <Card key={w.id}><CardContent className="p-3 space-y-2">
              <div className="flex justify-between items-center">
                <p className="text-xs font-semibold">Item #{i + 1}</p>
                <Button size="icon" variant="ghost" onClick={() => remove(w.id)} className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="md:col-span-3 space-y-1.5"><Label className="text-xs">Description</Label><Textarea rows={2} value={w.description} onChange={(e) => patch(w.id, { description: e.target.value })} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Target Date</Label><Input type="date" value={w.target_date || ""} onChange={(e) => patch(w.id, { target_date: e.target.value })} /></div>
                <div className="md:col-span-2 space-y-1.5"><Label className="text-xs">Responsibility</Label><Input value={w.responsibility || ""} onChange={(e) => patch(w.id, { responsibility: e.target.value })} placeholder="Who will complete this?" /></div>
              </div>
            </CardContent></Card>
          ))}
        </>
      )}
      {payload[presentField] === "No" && <p className="text-xs text-muted-foreground italic p-3 border rounded-md bg-muted/30">No outstanding works at time of certificate issue.</p>}
    </div>
  );
}
