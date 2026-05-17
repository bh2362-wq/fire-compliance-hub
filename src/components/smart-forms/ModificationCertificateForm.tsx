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
  ModificationPayload, CommissioningTestResult, InstallVariationEntry, OutstandingWorkEntry,
  DEFAULT_POST_MOD_TESTS, ModificationReason,
  createNewCertSubmission, updateNewCertSubmission, validateModification,
} from "@/services/newCertificateService";
import { checkDuplicateJobCert, autoRegisterCertToSite } from "@/services/newCertificateService";
import { generateModificationCertificatePDF } from "@/lib/modificationCertificatePdfGenerator";
import { AIRewriteButton } from "@/components/reports/AIRewriteButton";

const STEPS = [
  "Header", "Premises", "Responsible Person", "Existing System",
  "Modification Details", "After Modification", "Post-Mod Tests",
  "Variations", "Outstanding Works", "System Status",
  "Declaration", "RP Acknowledgement", "Preview",
] as const;

const SYSTEM_CATS = ["L1", "L2", "L3", "L4", "L5", "M", "P1", "P2"];
const MOD_REASONS: ModificationReason[] = [
  "Extension of coverage", "Change of occupancy", "False alarm reduction",
  "System upgrade", "Panel replacement", "Device replacement",
  "Zone reconfiguration", "Addition of ancillary", "Other",
];

function uid() { return Math.random().toString(36).slice(2, 10); }
function emptyPayload(): ModificationPayload {
  return { post_mod_tests: DEFAULT_POST_MOD_TESTS.map((t) => ({ ...t })) };
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  visitId?: string | null;
  siteId?: string | null;
  customerId?: string | null;
  prefill?: Partial<ModificationPayload>;
  onSaved?: () => void;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}{required && <span className="text-destructive ml-0.5">*</span>}</Label>
      {children}
    </div>
  );
}

export default function ModificationCertificateForm({ open, onOpenChange, visitId, siteId, customerId, prefill, onSaved }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [payload, setPayload] = useState<ModificationPayload>(emptyPayload());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(0);
      setSubmissionId(null);
      setPayload(prefill ? { ...emptyPayload(), ...prefill } : emptyPayload());
    }
  }, [open, prefill]);

  const errors = useMemo(() => validateModification(payload), [payload]);
  const errorsByStep = useMemo(() => {
    const m: Record<number, string[]> = {};
    errors.forEach((e) => { (m[e.step] ??= []).push(e.message); });
    return m;
  }, [errors]);

  function up<K extends keyof ModificationPayload>(k: K, v: ModificationPayload[K]) {
    setPayload((p) => ({ ...p, [k]: v }));
  }

  function toggleCat(field: "existing_system_category" | "new_system_category", c: string) {
    const cats = (payload[field] as string[]) ?? [];
    up(field, cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c]);
  }

  function setTestResult(idx: number, patch: Partial<CommissioningTestResult>) {
    const tests = (payload.post_mod_tests ?? []).map((t, i) => i === idx ? { ...t, ...patch } : t);
    up("post_mod_tests", tests);
  }

  async function persist(status?: "draft" | "completed") {
    if (!user) { toast.error("Not signed in"); return null; }
    setSaving(true);
    try {
      if (submissionId) {
        const r = await updateNewCertSubmission(submissionId, { payload, status, completed_at: status === "completed" ? new Date().toISOString() : null });
        if (status === "completed" && r?.id && siteId) {
          const p = (r.payload || payload) as any;
          const issueDate = p.date_of_modification || new Date().toISOString().split('T')[0];
          await autoRegisterCertToSite(r.id, siteId, "bs5839_modification", r.certificate_reference || "", issueDate, user.id, r.payload as any).catch(console.error);
        }
        toast.success(status === "completed" ? "Certificate completed" : "Draft saved"); onSaved?.(); return r;
      } else {
        const r = await createNewCertSubmission({ form_type: "bs5839_modification", payload, visit_id: visitId ?? null, site_id: siteId ?? null, customer_id: customerId ?? null, job_number: payload.job_number ?? null, user_id: user.id, engineer_id: user.id });
        setSubmissionId(r.id);
        if (r.certificate_reference) up("certificate_reference", r.certificate_reference);
        if (status === "completed" && submissionId && siteId) {
          const p = (r.payload || payload) as any;
          const issueDate = p.date_of_modification || new Date().toISOString().split('T')[0];
          await autoRegisterCertToSite(submissionId, siteId, "bs5839_modification", r.certificate_reference || "", issueDate, user.id, p).catch(console.error);
        }
        toast.success(status === "completed" ? "Certificate completed" : "Draft saved"); onSaved?.(); return r;
      }
    } catch (err) { console.error(err); toast.error("Failed to save"); return null; }
    finally { setSaving(false); }
  }

  async function handleGeneratePdf() {
    // Job duplicate check — one cert per job per type per site
    if (payload.job_number?.trim() && siteId) {
      const dup = await checkDuplicateJobCert(siteId, "bs5839_modification", payload.job_number);
      if (dup) {
        toast.warning(
          `A completed modification cert already exists for job ${payload.job_number} — ref: ${dup.certificate_reference}. Edit that cert or use a new job number.`,
          { duration: 7000 }
        );
        return;
      }
    }
    if (errors.length > 0) {
      toast.error(`${errors.length} issue(s) — first: ${errors[0].message}`, { action: { label: "Go", onClick: () => setStep(errors[0].step - 1) } });
      return;
    }
    const saved = await persist("completed");
    await generateModificationCertificatePDF((saved?.payload ?? payload) as ModificationPayload, { autoSign: true });
  }

  const F = Field;

  const YNField = ({ field, label }: { field: keyof ModificationPayload; label: string }) => (
    <div className="flex items-center gap-2 p-2.5 rounded-md border bg-accent/5">
      <Select value={(payload[field] as string) || undefined} onValueChange={(v) => up(field, v as any)}>
        <SelectTrigger className="w-16 h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
        <SelectContent><SelectItem value="Yes">Yes</SelectItem><SelectItem value="No">No</SelectItem></SelectContent>
      </Select>
      <span className="text-xs flex-1">{label}</span>
    </div>
  );

  const renderStep = (idx: number = step) => {
    switch (idx) {
      case 0: return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <F label="Certificate Reference"><Input value={payload.certificate_reference || "(auto-generated on save)"} disabled className="font-mono text-xs" /></F>
          <F label="Date of Modification" required><Input type="date" value={payload.date_of_modification || ""} onChange={(e) => up("date_of_modification", e.target.value)} /></F>
          <F label="Job Number"><Input value={payload.job_number || ""} onChange={(e) => up("job_number", e.target.value)} /></F>
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
          <F label="Email"><Input value={payload.responsible_person_email || ""} onChange={(e) => up("responsible_person_email", e.target.value)} /></F>
        </div>
      );
      case 3: return (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">Enter the reference numbers from the original certificates for the system being modified (BS 5839-1 Cl. 46.1).</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <F label="Original Installation Certificate Ref."><Input value={payload.original_installation_cert_ref || ""} onChange={(e) => up("original_installation_cert_ref", e.target.value)} className="font-mono" /></F>
            <F label="Original Commissioning Certificate Ref."><Input value={payload.original_commissioning_cert_ref || ""} onChange={(e) => up("original_commissioning_cert_ref", e.target.value)} className="font-mono" /></F>
            <F label="Previous Modification Cert. Ref. (if any)"><Input value={payload.previous_modification_cert_ref || ""} onChange={(e) => up("previous_modification_cert_ref", e.target.value)} className="font-mono" placeholder="N/A if first modification" /></F>
          </div>
          <F label="Existing System Category (before modification)">
            <div className="flex flex-wrap gap-1.5">
              {SYSTEM_CATS.map((c) => (
                <button key={c} type="button" onClick={() => toggleCat("existing_system_category", c)}
                  className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${(payload.existing_system_category ?? []).includes(c) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent/30"}`}>
                  {c}
                </button>
              ))}
            </div>
          </F>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <F label="Existing Panel Manufacturer"><Input value={payload.existing_panel_manufacturer || ""} onChange={(e) => up("existing_panel_manufacturer", e.target.value)} /></F>
            <F label="Existing Panel Model"><Input value={payload.existing_panel_model || ""} onChange={(e) => up("existing_panel_model", e.target.value)} /></F>
          </div>
        </div>
      );
      case 4: return (
        <div className="space-y-4">
          <F label="Reason for Modification" required>
            <Select value={payload.reason_for_modification || undefined} onValueChange={(v) => up("reason_for_modification", v as ModificationReason)}>
              <SelectTrigger><SelectValue placeholder="Select reason…" /></SelectTrigger>
              <SelectContent>{MOD_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </F>
          {payload.reason_for_modification === "Other" && (
            <F label="Reason (specify)"><Input value={payload.reason_other || ""} onChange={(e) => up("reason_other", e.target.value)} /></F>
          )}
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mt-4 mb-2">Scope of Works</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <YNField field="devices_added" label="Devices added" />
            {payload.devices_added === "Yes" && <F label="Number of devices added"><Input type="number" min={0} value={payload.devices_added_count ?? ""} onChange={(e) => up("devices_added_count", e.target.value === "" ? "" : Number(e.target.value))} /></F>}
            <YNField field="devices_removed" label="Devices removed" />
            {payload.devices_removed === "Yes" && <F label="Number removed"><Input type="number" min={0} value={payload.devices_removed_count ?? ""} onChange={(e) => up("devices_removed_count", e.target.value === "" ? "" : Number(e.target.value))} /></F>}
            <YNField field="zones_added" label="Zones added" />
            {payload.zones_added === "Yes" && <F label="Zones added count"><Input type="number" min={0} value={payload.zones_added_count ?? ""} onChange={(e) => up("zones_added_count", e.target.value === "" ? "" : Number(e.target.value))} /></F>}
            <YNField field="zones_removed" label="Zones removed" />
            {payload.zones_removed === "Yes" && <F label="Zones removed count"><Input type="number" min={0} value={payload.zones_removed_count ?? ""} onChange={(e) => up("zones_removed_count", e.target.value === "" ? "" : Number(e.target.value))} /></F>}
            <YNField field="panel_changes" label="Panel changes" />
            {payload.panel_changes === "Yes" && <div className="md:col-span-2"><F label="Panel changes description"><Input value={payload.panel_changes_description || ""} onChange={(e) => up("panel_changes_description", e.target.value)} /></F></div>}
            <YNField field="cable_additions" label="Cable additions" />
            {payload.cable_additions === "Yes" && <div className="md:col-span-2"><F label="Cable description"><Input value={payload.cable_additions_description || ""} onChange={(e) => up("cable_additions_description", e.target.value)} /></F></div>}
            <YNField field="ancillary_changes" label="Ancillary changes" />
            {payload.ancillary_changes === "Yes" && <div className="md:col-span-2"><F label="Ancillary description"><Input value={payload.ancillary_description || ""} onChange={(e) => up("ancillary_description", e.target.value)} /></F></div>}
          </div>
          <F label="Full Description of Modification Works" required>
            <Textarea rows={5} value={payload.description_of_modifications || ""} onChange={(e) => up("description_of_modifications", e.target.value)} placeholder="Describe all works carried out, devices installed/removed, zones created/deleted, cable routes, panel programming changes..." />
          </F>
        </div>
      );
      case 5: return (
        <div className="space-y-4">
          <F label="Has the system category changed after modification?">
            <div className="flex gap-2">
              {(["Yes", "No"] as const).map((v) => (
                <button key={v} type="button" onClick={() => up("system_category_changed", v)}
                  className={`px-4 py-1.5 rounded-md border text-xs font-medium transition-colors ${payload.system_category_changed === v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent/30"}`}>
                  {v}
                </button>
              ))}
            </div>
          </F>
          {payload.system_category_changed === "Yes" && (
            <F label="System Category After Modification">
              <div className="flex flex-wrap gap-1.5">
                {SYSTEM_CATS.map((c) => (
                  <button key={c} type="button" onClick={() => toggleCat("new_system_category", c)}
                    className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${(payload.new_system_category ?? []).includes(c) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent/30"}`}>
                    {c}
                  </button>
                ))}
              </div>
            </F>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <F label="Standard Installed To">
              <Select value={payload.standard_modified_to || undefined} onValueChange={(v) => up("standard_modified_to", v)}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent><SelectItem value="BS 5839-1:2017+A2:2019">BS 5839-1:2017+A2:2019</SelectItem><SelectItem value="BS 5839-1:2025">BS 5839-1:2025</SelectItem></SelectContent>
              </Select>
            </F>
            <F label="Cable Types Used"><Input value={payload.cable_types_used || ""} onChange={(e) => up("cable_types_used", e.target.value)} placeholder="e.g. Enhanced, MICC" /></F>
          </div>
          <F label="Areas Affected by Modification"><Textarea rows={3} value={payload.areas_affected || ""} onChange={(e) => up("areas_affected", e.target.value)} placeholder="List zones, floors, areas affected..." /></F>
        </div>
      );
      case 6: return (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground mb-2">Test all modified and new elements per BS 5839-1 Cl. 46.2. Confirm no degradation to unmodified parts of the system.</p>
          {(payload.post_mod_tests ?? []).map((t, i) => (
            <Card key={i} className="overflow-hidden">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1">
                    <p className="text-xs font-medium">{i + 1}. {t.item}</p>
                    <p className="text-[10px] text-muted-foreground">{t.bs_clause}</p>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {(["N/A", "Pass", "Partial", "Fail"] as const).map((r) => (
                      <button key={r} type="button" onClick={() => setTestResult(i, { result: r })}
                        className={`px-2.5 py-1 rounded border text-[11px] font-semibold transition-colors ${
                          t.result === r
                            ? r === "Pass" ? "bg-green-600 text-white border-green-600"
                            : r === "Fail" ? "bg-destructive text-white border-destructive"
                            : r === "Partial" ? "bg-amber-500 text-white border-amber-500"
                            : "bg-muted text-muted-foreground border-border"
                            : "border-border hover:bg-accent/30"
                        }`}>{r}</button>
                    ))}
                  </div>
                </div>
                {(t.result === "Fail" || t.result === "Partial") && (
                  <Textarea className="text-xs min-h-[48px]" placeholder="Comment required…" value={t.comment || ""} onChange={(e) => setTestResult(i, { comment: e.target.value })} />
                )}
              </CardContent>
            </Card>
          ))}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            <F label="New devices added and tested"><Input type="number" min={0} value={payload.new_devices_tested ?? ""} onChange={(e) => up("new_devices_tested", e.target.value === "" ? "" : Number(e.target.value))} /></F>
            <F label="Modified devices re-tested"><Input type="number" min={0} value={payload.modified_devices_tested ?? ""} onChange={(e) => up("modified_devices_tested", e.target.value === "" ? "" : Number(e.target.value))} /></F>
          </div>
        </div>
      );
      case 7: {
        const variations = payload.variations ?? [];
        const add = () => up("variations", [...variations, { id: uid(), description: "", justification: "", agreed_with_rp: "", bs_clause: "" } as InstallVariationEntry]);
        const patch = (id: string, p: Partial<InstallVariationEntry>) => up("variations", variations.map((v) => v.id === id ? { ...v, ...p } : v));
        const remove = (id: string) => up("variations", variations.filter((v) => v.id !== id));
        return (
          <div className="space-y-3">
            <div className="flex gap-2">
              {(["Yes", "No"] as const).map((v) => (
                <button key={v} type="button" onClick={() => up("variations_present", v)}
                  className={`px-4 py-1.5 rounded-md border text-xs font-medium transition-colors ${payload.variations_present === v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent/30"}`}>
                  Variations: {v}
                </button>
              ))}
            </div>
            {payload.variations_present === "Yes" && (
              <>
                <div className="flex justify-end"><Button size="sm" variant="outline" onClick={add}><Plus className="h-3.5 w-3.5 mr-1" />Add Variation</Button></div>
                {variations.map((v, i) => (
                  <Card key={v.id}><CardContent className="p-3 space-y-2">
                    <div className="flex justify-between"><p className="text-xs font-semibold">Variation #{i + 1}</p>
                      <Button size="icon" variant="ghost" onClick={() => remove(v.id)} className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div className="space-y-1.5"><Label className="text-xs">Description</Label><Textarea rows={2} value={v.description} onChange={(e) => patch(v.id, { description: e.target.value })} /></div>
                      <div className="space-y-1.5"><Label className="text-xs">Justification</Label><Textarea rows={2} value={v.justification} onChange={(e) => patch(v.id, { justification: e.target.value })} /></div>
                      <div className="space-y-1.5"><Label className="text-xs">BS Clause Reference</Label><Input value={v.bs_clause || ""} onChange={(e) => patch(v.id, { bs_clause: e.target.value })} /></div>
                      <div className="space-y-1.5"><Label className="text-xs">Agreed with RP?</Label>
                        <Select value={v.agreed_with_rp || undefined} onValueChange={(val) => patch(v.id, { agreed_with_rp: val as any })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="Yes">Yes</SelectItem><SelectItem value="No">No</SelectItem></SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent></Card>
                ))}
              </>
            )}
            {payload.variations_present === "No" && <p className="text-xs text-muted-foreground italic p-3 border rounded-md bg-muted/30">No variations.</p>}
          </div>
        );
      }
      case 8: {
        const works = payload.outstanding_works ?? [];
        const add = () => up("outstanding_works", [...works, { id: uid(), description: "", target_date: "", responsibility: "" }]);
        const patch = (id: string, p: Partial<OutstandingWorkEntry>) => up("outstanding_works", works.map((w) => w.id === id ? { ...w, ...p } : w));
        const remove = (id: string) => up("outstanding_works", works.filter((w) => w.id !== id));
        return (
          <div className="space-y-3">
            <div className="flex gap-2">
              {(["Yes", "No"] as const).map((v) => (
                <button key={v} type="button" onClick={() => up("outstanding_works_present", v)}
                  className={`px-4 py-1.5 rounded-md border text-xs font-medium transition-colors ${payload.outstanding_works_present === v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent/30"}`}>
                  Outstanding works: {v}
                </button>
              ))}
            </div>
            {payload.outstanding_works_present === "Yes" && (
              <>
                <div className="flex justify-end"><Button size="sm" variant="outline" onClick={add}><Plus className="h-3.5 w-3.5 mr-1" />Add Item</Button></div>
                {works.map((w, i) => (
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
            {payload.outstanding_works_present === "No" && <p className="text-xs text-muted-foreground italic p-3 border rounded-md bg-muted/30">No outstanding works.</p>}
          </div>
        );
      }
      case 9: return (
        <div className="space-y-3">
          <F label="Post-Modification System Status" required>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {(["Satisfactory", "Satisfactory with Observations", "Unsatisfactory"] as const).map((s) => (
                <button key={s} type="button" onClick={() => up("system_status", s)}
                  className={`px-3 py-3 rounded-md border text-xs font-semibold text-left transition-colors ${
                    payload.system_status === s
                      ? s === "Satisfactory" ? "bg-green-600 text-white border-green-600"
                      : s === "Unsatisfactory" ? "bg-destructive text-white border-destructive"
                      : "bg-amber-500 text-white border-amber-500"
                      : "border-border hover:bg-accent/30"
                  }`}>{s}</button>
              ))}
            </div>
          </F>
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs font-medium">Final Remarks</Label>
              <AIRewriteButton text={payload.final_remarks || ""} type="comments" onRewrite={(v) => up("final_remarks", v)} />
            </div>
            <Textarea rows={4} value={payload.final_remarks || ""} onChange={(e) => up("final_remarks", e.target.value)} placeholder="Note any observations, recommendations, or conditions..." />
          </div>
        </div>
      );
      case 10: return (
        <div className="space-y-4">
          <div className="p-3 rounded-md border bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 text-xs italic leading-relaxed">
            I certify that the modifications to the fire detection and fire alarm system described in this certificate have been carried out in accordance with BS 5839-1:2025. The post-modification tests recorded above have been completed and the system status is as stated. Any parts of the system not affected by these modifications remain in the condition described in the original certificates.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <F label="Company Name"><Input value={payload.company_name || ""} onChange={(e) => up("company_name", e.target.value)} /></F>
            <F label="FIA Member Number"><Input value={payload.fia_member_number || ""} onChange={(e) => up("fia_member_number", e.target.value)} /></F>
            <F label="Engineer Name" required><Input value={payload.engineer_name || ""} onChange={(e) => up("engineer_name", e.target.value)} /></F>
            <F label="Position"><Input value={payload.engineer_position || ""} onChange={(e) => up("engineer_position", e.target.value)} /></F>
          </div>
          <label className="flex items-start gap-2 p-3 rounded-md border bg-accent/10 cursor-pointer">
            <Checkbox checked={!!payload.engineer_competency_confirmed} onCheckedChange={(c) => up("engineer_competency_confirmed", !!c)} />
            <span className="text-xs leading-relaxed">I am a competent person as defined in BS 5839-1 and have the requisite knowledge, skills and experience to carry out this modification work.</span>
          </label>
          <F label="Signature"><SmartSignature value={payload.engineer_signature || ""} onChange={(v) => up("engineer_signature", v)} /></F>
          <F label="Date Signed"><Input type="date" value={payload.engineer_signed_date || ""} onChange={(e) => up("engineer_signed_date", e.target.value)} /></F>
        </div>
      );
      case 11: return (
        <div className="space-y-4">
          <div className="p-3 rounded-md border bg-blue-50 dark:bg-blue-950/20 border-blue-200 text-xs italic leading-relaxed">
            I acknowledge receipt of this modification certificate and confirm that I have been informed of the nature and extent of the modifications carried out and any outstanding works.
          </div>
          <F label="Responsible Person Name"><Input value={payload.rp_name_signed || ""} onChange={(e) => up("rp_name_signed", e.target.value)} /></F>
          <F label="Signature (on-site or leave blank)"><SmartSignature value={payload.rp_signature || ""} onChange={(v) => up("rp_signature", v)} showAbsent /></F>
          <F label="Date Signed"><Input type="date" value={payload.rp_signed_date || ""} onChange={(e) => up("rp_signed_date", e.target.value)} /></F>
        </div>
      );
      case 12: return (
        <div className="space-y-4">
          {errors.length > 0 && (
            <div className="p-3 rounded-md border border-destructive/40 bg-destructive/5 space-y-1">
              <p className="text-xs font-semibold text-destructive flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" />Resolve {errors.length} issue(s)</p>
              <ul className="text-[11px] text-destructive/90 list-disc pl-5">{errors.map((e, i) => <li key={i}>Step {e.step}: {e.message}</li>)}</ul>
            </div>
          )}
          <Card><CardContent className="p-4 space-y-2">
            <p className="text-[10px] uppercase text-muted-foreground">BS 5839-1:2025 Modification Certificate</p>
            <p className="text-sm font-bold">{payload.premises_name || "—"}</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-muted-foreground">Date:</span> {payload.date_of_modification || "—"}</div>
              <div><span className="text-muted-foreground">Reason:</span> {payload.reason_for_modification || "—"}</div>
              <div><span className="text-muted-foreground">Status:</span> {payload.system_status || "—"}</div>
              <div><span className="text-muted-foreground">Engineer:</span> {payload.engineer_name || "—"}</div>
              <div><span className="text-muted-foreground">Tests passed:</span> {(payload.post_mod_tests ?? []).filter((t) => t.result === "Pass").length} / {(payload.post_mod_tests ?? []).length}</div>
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
        title="FD/05 — Fire Alarm Modification Certificate · BS 5839-1:2017+A2:2019"
        reference={payload.certificate_reference}
        status={errors.length > 0 ? "issues" : "valid"}
        onSaveDraft={() => persist("draft")}
        onComplete={handleGeneratePdf}
        saving={saving}
        meta={
          errors.length > 0
            ? <Badge variant="destructive" className="gap-1 text-[10px]"><AlertCircle className="h-3 w-3" />{errors.length} issue(s)</Badge>
            : <Badge variant="outline" className="text-[10px]">FD/05</Badge>
        }
      />
      <DocBody>
        <SitePrefillBlock
          formType="bs5839_modification"
          siteId={siteId}
          onPrefillApplied={(fields) => setPayload((prev) => ({ ...prev, ...(fields as any) }))}
        />
        <TitleBlock
          title="Fire Alarm System — Modification Certificate"
          subtitle="BS 5839-1:2017+A2:2019 · BAFE SP203-1 FD/05"
          reference={payload.certificate_reference}
          date={payload.date_of_modification}
          onDateChange={(v) => up("date_of_modification", v)}
        />
        <p className="text-[11px] italic text-muted-foreground px-1">
          Issued following modifications carried out in accordance with BS 5839-1:2017+A2:2019 Clause 24 and BAFE SP203-1 Section 5 (FD/05).
        </p>
        <PhotoAnalysisBlock
          submissionId={submissionId}
          context={[payload.premises_name, "BS5839 modification"].filter(Boolean).join(", ")}
          existingDefects={(payload as any).ai_photo_defects || []}
          onAddDefects={(defects) => setPayload((p) => ({ ...p, ai_photo_defects: [ ...(((p as any).ai_photo_defects) || []), ...defects ] } as any))}
        />
        {STEPS.slice(0, -1).map((label, i) => (
          <DocBlock key={label} title={`${i + 1}. ${label}`}>
            {renderStep(i)}
          </DocBlock>
        ))}

        <AIAssistBlock
          payload={payload as any}
          formLabel="BS 5839-1 Modification Certificate"
          extraInstruction="Summarise the modification works carried out, confirm post-modification testing passed, and note any change in system category."
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
        standardLabel="BS 5839-1:2017+A2:2019 Clause 24 · BAFE SP203-1 (FD/05)"
        onClose={() => onOpenChange(false)}
        onComplete={handleGeneratePdf}
        saving={saving}
      />
    </DocDialogShell>
  );
}
