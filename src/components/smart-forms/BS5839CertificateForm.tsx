import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TypedSignature } from "@/components/ui/typed-signature";
import {
  Plus, Trash2, Save, FileDown, AlertCircle, CheckCircle2,
  ChevronDown, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  BS5839Payload, ChecklistItem, DefectEntry, SmartFormSubmission,
  buildEmptyPayload, createSmartFormSubmission, updateSmartFormSubmission,
  validatePayload, DEFAULT_CHECKLIST,
} from "@/services/smartFormService";
import { generateBS5839CertificatePDF } from "@/lib/smartFormCertificatePdfGenerator";
import { uploadCertificateToSharePoint } from "@/lib/certSharePointUpload";
import { autoRegisterCertToSite } from "@/services/newCertificateService";
import { createDefect, updateDefect, type DefectCategory } from "@/services/defectService";
import { DefectImportPanel } from "@/components/smart-forms/DefectImportPanel";
import { SitePrefillPanel } from "@/components/smart-forms/SitePrefillPanel";
import { ClientSummaryPanel } from "@/components/smart-forms/ClientSummaryPanel";
import { PhotoAnalysisPanel } from "@/components/smart-forms/PhotoAnalysisPanel";
import { AIRewriteButton } from "@/components/reports/AIRewriteButton";

const SERVICE_TYPES = [
  "Quarterly Service",
  "6 Month Service",
  "Annual Inspection",
  "Commissioning",
  "Emergency Visit",
  "Remedial Works",
];

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

function uid() { return Math.random().toString(36).slice(2, 10); }

/* ─── Status pill helpers ──────────────────────────────────────── */
type YNStatus = "YES" | "NO" | "N/A" | "";
function normalizeStatus(s: ChecklistItem["status"], invert = false): YNStatus {
  if (s === "YES" || s === "NO" || s === "N/A") return s;
  // Map stored Pass/Fail back to the engineer's YES/NO answer,
  // accounting for inverted items where Pass came from a NO answer.
  if (s === "Pass") return invert ? "NO" : "YES";
  if (s === "Fail") return invert ? "YES" : "NO";
  return "";
}
function storeStatus(s: YNStatus, invert = false): ChecklistItem["status"] {
  if (s === "N/A") return "N/A";
  if (s === "") return "";
  // For inverted items (where "No" is the compliant/desired answer),
  // NO → Pass and YES → Fail. Otherwise YES → Pass and NO → Fail.
  const yesIsPass = !invert;
  if (s === "YES") return yesIsPass ? "Pass" : "Fail";
  if (s === "NO") return yesIsPass ? "Fail" : "Pass";
  return "";
}

export default function BS5839CertificateForm({
  open, onOpenChange, existing, prefill, visitId, customerId, siteId, onSaved,
}: Props) {
  const { user } = useAuth();
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [payload, setPayload] = useState<BS5839Payload>(buildEmptyPayload());
  const [saving, setSaving] = useState(false);
  const [linkedSiteId, setLinkedSiteId] = useState<string | null>(siteId ?? null);
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setSubmissionId(existing.id);
      setPayload({ ...buildEmptyPayload(), ...existing.payload });
    } else {
      setSubmissionId(null);
      setPayload({ ...buildEmptyPayload(), ...(prefill ?? {}) });
    }
  }, [open, existing, prefill]);

  const errors = useMemo(() => validatePayload(payload), [payload]);

  function update<K extends keyof BS5839Payload>(key: K, value: BS5839Payload[K]) {
    setPayload((p) => ({ ...p, [key]: value }));
  }

  /* ── Persist / PDF logic (unchanged) ───────────────────────────── */
  async function persist(status?: "draft" | "completed" | "signed") {
    if (!user) { toast.error("Not signed in"); return null; }
    setSaving(true);
    try {
      if (submissionId) {
        const updated = await updateSmartFormSubmission(submissionId, {
          payload, status,
          completed_at: status === "completed" || status === "signed" ? new Date().toISOString() : null,
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
    } finally { setSaving(false); }
  }

  function severityToCategory(sev: string | undefined): DefectCategory {
    switch ((sev || "").toLowerCase()) {
      case "critical": return 1;
      case "major": return 2;
      default: return 3;
    }
  }

  async function pushDefectsToSiteDefects(submissionIdLocal: string) {
    if (!siteId) return;
    const list = (payload.defects ?? []).filter((d: any) => d?.description?.trim());
    if (list.length === 0) return;
    let created = 0, updated = 0;
    for (const d of list as any[]) {
      const registerId: string | undefined = d._register_id;
      if (registerId) {
        if (d.status === "Closed") {
          try {
            await updateDefect(registerId, {
              status: "remediated",
              remediated_at: new Date().toISOString(),
              notes: `Remediated on cert ${payload.certificate_reference || submissionIdLocal}`,
            });
            updated++;
          } catch (e) { console.error("defect update failed", e); }
        } else if (d.status === "Requires Quote") {
          try { await updateDefect(registerId, { status: "quoted" }); updated++; }
          catch (e) { console.error("defect update failed", e); }
        }
      } else {
        try {
          await createDefect({
            site_id: siteId,
            visit_id: visitId ?? null,
            description: [d.description, d.recommended_action ? `Recommended: ${d.recommended_action}` : ""].filter(Boolean).join("\n"),
            location: d.location || null,
            category: severityToCategory(d.severity),
            status: "open",
            raised_by: user?.id ?? null,
            notes: d.bs_reference
              ? `${d.bs_reference} — from cert ${payload.certificate_reference || submissionIdLocal}`
              : `From cert ${payload.certificate_reference || submissionIdLocal}`,
          });
          created++;
        } catch (e) { console.error("defect push failed", e); }
      }
    }
    const msgs: string[] = [];
    if (created > 0) msgs.push(`${created} new defect${created === 1 ? "" : "s"} added to register`);
    if (updated > 0) msgs.push(`${updated} register defect${updated === 1 ? "" : "s"} updated`);
    if (msgs.length > 0) toast.success(msgs.join(" · "));
  }

  async function runPdf(payloadToUse: BS5839Payload) {
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
      const proceed = window.confirm(
        `${errors.length} outstanding issue(s):\n\n` +
        errors.slice(0, 10).map((e, i) => `${i + 1}. ${e.message}`).join("\n") +
        (errors.length > 10 ? `\n…and ${errors.length - 10} more` : "") +
        `\n\nComplete and generate the PDF anyway?`
      );
      if (!proceed) return;
    }
    const saved = await persist("completed");
    if (!saved) { await runPdf(payload); return; }
    const pdf = await runPdf(saved.payload);
    if (pdf && saved.id) {
      try {
        await uploadCertificateToSharePoint({
          submissionId: saved.id, siteId: siteId ?? null,
          fileName: pdf.fileName, base64: pdf.base64,
        });
      } catch (e) {
        console.error("SharePoint upload failed", e);
        toast.warning("Certificate saved but SharePoint upload failed");
      }
    }
    if (siteId && user && saved.id && saved.certificate_reference) {
      await autoRegisterCertToSite(
        saved.id, siteId, "bs5839_inspection_servicing",
        saved.certificate_reference, new Date().toISOString().slice(0, 10),
        user.id, saved.payload as Record<string, unknown>,
      ).catch(console.error);
    }
    if (saved.id) await pushDefectsToSiteDefects(saved.id);
  }

  /* ── Checklist ops ─────────────────────────────────────────────── */
  const checklist = payload.checklist ?? DEFAULT_CHECKLIST;
  function setChecklistItem(idx: number, patch: Partial<ChecklistItem>) {
    const next = checklist.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    update("checklist", next);
  }

  // Group by section
  const sections = useMemo(() => {
    const acc: { name: string; items: { item: ChecklistItem; idx: number }[] }[] = [];
    checklist.forEach((item, idx) => {
      const name = item.section || "General";
      const ex = acc.find(s => s.name === name);
      if (ex) ex.items.push({ item, idx });
      else acc.push({ name, items: [{ item, idx }] });
    });
    return acc;
  }, [checklist]);

  /* ── Defect ops ────────────────────────────────────────────────── */
  const defects = payload.defects ?? [];
  const importedIds = new Set(
    defects.filter((d: any) => d._register_id).map((d: any) => d._register_id as string)
  );
  function addDefect() {
    update("defects", [...defects, { id: uid(), location: "", description: "", severity: "", recommended_action: "", status: "Open" } as DefectEntry]);
  }
  function patchDefect(id: string, p: Partial<DefectEntry>) {
    update("defects", defects.map((d) => d.id === id ? { ...d, ...p } : d));
  }
  function removeDefect(id: string) { update("defects", defects.filter((d) => d.id !== id)); }
  function importDefects(entries: (DefectEntry & { _register_id?: string })[]) {
    update("defects", [...defects, ...entries]);
  }

  const noCount = checklist.filter(c => c.status === "Fail" || c.status === "NO").length;
  const answered = checklist.filter(c => c.status !== "").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[95vh] flex flex-col p-0 gap-0 bg-[#fafaf7]">
        {/* Sticky header */}
        <div className="px-5 py-3 border-b shrink-0 bg-white flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold">FD/01 — Inspection &amp; Servicing Certificate · BS 5839-1:2017+A2:2019</h2>
            {payload.certificate_reference && (
              <span className="font-mono text-xs text-muted-foreground">{payload.certificate_reference}</span>
            )}
            {errors.length > 0 ? (
              <Badge variant="destructive" className="gap-1 text-[10px]"><AlertCircle className="h-3 w-3" />{errors.length} issue(s)</Badge>
            ) : (
              <Badge className="bg-green-600/15 text-green-700 border-green-600/30 gap-1 text-[10px]"><CheckCircle2 className="h-3 w-3" />Valid</Badge>
            )}
            <span className="text-[10px] text-muted-foreground">{answered}/{checklist.length} answered{noCount > 0 && ` · ${noCount} NO`}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => persist("draft")} disabled={saving}>
              <Save className="h-3.5 w-3.5 mr-1" />Save Draft
            </Button>
            <Button size="sm" onClick={handleGeneratePdf} disabled={saving}>
              <FileDown className="h-3.5 w-3.5 mr-1" />Complete &amp; PDF
            </Button>
          </div>
        </div>

        {/* Document scroll area */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto p-5 md:p-6 space-y-5">
            {!existing && (
              <SitePrefillPanel
                formType="bs5839_inspection_servicing"
                siteId={linkedSiteId || siteId}
                onSiteSelected={setLinkedSiteId}
                onPrefillApplied={(fields, batteryHint) => {
                  setPayload(prev => ({ ...prev, ...fields } as BS5839Payload));
                  if (batteryHint) setPayload(prev => ({ ...prev, battery_age_years: batteryHint.suggested_age } as BS5839Payload));
                }}
              />
            )}

            {/* 1. Title block */}
            <div className="bg-white border border-border rounded-md p-5 flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Fire Alarm Service Report</h1>
                <p className="text-sm font-semibold mt-1" style={{ color: "hsl(25 92% 54%)" }}>BS 5839-1:2025</p>
              </div>
              <div className="text-right text-xs space-y-1">
                <div><span className="text-muted-foreground">Ref:</span> <span className="font-mono">{payload.certificate_reference || "(auto)"}</span></div>
                <div><span className="text-muted-foreground">Date:</span> <input type="date" className="border-0 bg-transparent text-right p-0 font-mono text-xs focus:outline-none focus:ring-0" value={payload.date_of_service || ""} onChange={(e) => update("date_of_service", e.target.value)} /></div>
              </div>
            </div>

            {/* 2. SITE / SERVICE side by side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DocBlock title="SITE">
                <DocField label="Site" value={payload.premises_name} onChange={(v) => update("premises_name", v)} />
                <DocField label="Address" value={payload.premises_address} onChange={(v) => update("premises_address", v)} multiline />
                <DocField label="Contact" value={payload.responsible_person_name} onChange={(v) => update("responsible_person_name", v)} />
                <DocField label="Phone" value={payload.responsible_person_contact} onChange={(v) => update("responsible_person_contact", v)} />
              </DocBlock>
              <DocBlock title="SERVICE">
                <div className="grid grid-cols-[110px_1fr] gap-y-2 items-center text-xs">
                  <label className="text-muted-foreground">Type</label>
                  <Select value={(payload as any).service_type || undefined} onValueChange={(v) => update("service_type" as any, v as any)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      {SERVICE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <DocField label="Date" type="date" value={payload.date_of_service} onChange={(v) => update("date_of_service", v)} />
                <DocField label="Engineer" value={payload.engineer_name} onChange={(v) => update("engineer_name", v)} />
                <DocField label="Job no." value={payload.job_number} onChange={(v) => update("job_number", v)} />
              </DocBlock>
            </div>

            {/* 3. SYSTEM bar */}
            <DocBlock title="SYSTEM">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <SmallField label="Panel" value={payload.panel_manufacturer} onChange={(v) => update("panel_manufacturer", v)} />
                <SmallField label="Location" value={(payload as any).panel_location} onChange={(v) => update("panel_location" as any, v as any)} />
                <SmallField label="Category" value={(payload.system_categories ?? []).join(", ")} onChange={(v) => update("system_categories", v.split(",").map(s => s.trim()).filter(Boolean))} />
                <SmallField label="Zones" value={(payload as any).number_of_zones} onChange={(v) => update("number_of_zones" as any, v as any)} />
                <SmallField label="Devices" type="number" value={payload.approx_number_of_devices as any} onChange={(v) => update("approx_number_of_devices", v === "" ? "" : Number(v))} />
              </div>
            </DocBlock>

            {/* 4. CHECKLIST */}
            <div className="bg-white border border-border rounded-md overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-bold">Fire Detection &amp; Fire Alarm Inspection &amp; Servicing Checklist</h3>
                <p className="text-[11px] mt-0.5 font-semibold" style={{ color: "hsl(25 92% 54%)" }}>
                  As recommended in BAFE SP203-1 Clause 9.8 &amp; BS5839-1:2025 Clause 45
                </p>
                <div className="flex gap-3 mt-2 text-[10px] text-muted-foreground">
                  <LegendSwatch color="#2e7d32" label="YES" />
                  <LegendSwatch color="#c62828" label="NO" />
                  <LegendSwatch color="#546e7a" label="N/A" />
                </div>
              </div>

              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="text-left px-3 py-2 font-semibold">Requirement</th>
                    <th className="px-2 py-2 font-semibold w-12">YES</th>
                    <th className="px-2 py-2 font-semibold w-12">NO</th>
                    <th className="px-2 py-2 font-semibold w-12">N/A</th>
                  </tr>
                </thead>
                <tbody>
                  {sections.map(section => (
                    <SectionRows
                      key={section.name}
                      section={section}
                      onChange={(idx, patch) => setChecklistItem(idx, patch)}
                    />
                  ))}
                </tbody>
              </table>

              {/* Footer: condition + next service */}
              <div className="border-t border-border p-3 grid grid-cols-1 md:grid-cols-2 gap-3 bg-muted/20">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Condition</label>
                  <Select value={payload.overall_status || undefined} onValueChange={(v) => update("overall_status", v as BS5839Payload["overall_status"])}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Satisfactory">Satisfactory</SelectItem>
                      <SelectItem value="Satisfactory with Observations">Satisfactory with Observations</SelectItem>
                      <SelectItem value="Unsatisfactory">Unsatisfactory</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Next Service Date</label>
                  <Input type="date" value={payload.next_service_date || ""} onChange={(e) => update("next_service_date", e.target.value)} className="h-9 text-xs" />
                </div>
              </div>
            </div>

            {/* 5. WORK CARRIED OUT */}
            <DocBlock title="WORK CARRIED OUT">
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Work done</label>
                    <AIRewriteButton text={payload.work_carried_out || ""} type="works" onRewrite={(v) => update("work_carried_out", v)} />
                  </div>
                  <Textarea rows={3} value={payload.work_carried_out || ""} onChange={(e) => update("work_carried_out", e.target.value)} className="text-xs mt-1" />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Parts used</label>
                    <AIRewriteButton text={payload.parts_used || ""} type="parts" onRewrite={(v) => update("parts_used", v)} />
                  </div>
                  <Textarea rows={2} value={payload.parts_used || ""} onChange={(e) => update("parts_used", e.target.value)} className="text-xs mt-1" />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Final remarks</label>
                    <AIRewriteButton text={payload.final_remarks || ""} type="comments" onRewrite={(v) => update("final_remarks", v)} />
                  </div>
                  <Textarea rows={2} value={payload.final_remarks || ""} onChange={(e) => update("final_remarks", e.target.value)} className="text-xs mt-1" />
                </div>
                <div className="pt-2">
                  <PhotoAnalysisPanel
                    submissionId={submissionId}
                    context={[
                      payload.certificate_type,
                      payload.premises_name,
                      payload.panel_manufacturer,
                      "BS5839 quarterly inspection"
                    ].filter(Boolean).join(", ")}
                    existingDefects={defects}
                    onAddDefects={(newDefects) => {
                      update("defects", [...defects, ...newDefects]);
                    }}
                  />
                </div>
              </div>
            </DocBlock>

            {/* 6. DEFECTS */}
            <div className="bg-white border border-border rounded-md overflow-hidden">
              <div className="bg-[#3c3c3c] text-white text-[11px] font-bold uppercase tracking-wider px-4 py-2 flex items-center justify-between">
                <span>Defects</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" className="h-6 text-[10px] px-2" onClick={addDefect}>
                    <Plus className="h-3 w-3 mr-1" />Add
                  </Button>
                </div>
              </div>
              <div className="p-3 space-y-3">
                <DefectImportPanel
                  siteId={linkedSiteId || siteId}
                  alreadyImported={importedIds}
                  onImport={importDefects}
                />
                {defects.length === 0 && (
                  <p className="text-xs text-muted-foreground italic text-center py-4">No defects recorded.</p>
                )}
                {defects.map((d: any, i) => (
                  <div key={d.id} className="border border-border rounded p-3 space-y-2 bg-muted/10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold">#{i + 1}</span>
                        {d._register_id && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200">From register</span>}
                      </div>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeDefect(d.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <Input placeholder="Location" value={d.location} onChange={(e) => patchDefect(d.id, { location: e.target.value })} className="h-8 text-xs" />
                      <Select value={d.severity || undefined} onValueChange={(v) => patchDefect(d.id, { severity: v as DefectEntry["severity"] })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Severity" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Critical">Critical</SelectItem>
                          <SelectItem value="Major">Major</SelectItem>
                          <SelectItem value="Minor">Minor</SelectItem>
                          <SelectItem value="Advisory">Advisory</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={d.status || undefined} onValueChange={(v) => patchDefect(d.id, { status: v as DefectEntry["status"] })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Open">Open</SelectItem>
                          <SelectItem value="Closed">Closed</SelectItem>
                          <SelectItem value="Requires Quote">Requires Quote</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Textarea rows={2} placeholder="Description" value={d.description} onChange={(e) => patchDefect(d.id, { description: e.target.value })} className="text-xs" />
                    <Textarea rows={2} placeholder="Recommended action" value={d.recommended_action} onChange={(e) => patchDefect(d.id, { recommended_action: e.target.value })} className="text-xs" />
                  </div>
                ))}
              </div>
            </div>

            {/* 7. SIGNATURES side-by-side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DocBlock title="ENGINEER">
                <DocField label="Name" value={payload.engineer_declaration_name || payload.engineer_name} onChange={(v) => update("engineer_declaration_name", v)} />
                <DocField label="Date" type="date" value={payload.engineer_signed_date} onChange={(v) => update("engineer_signed_date", v)} />
                <div className="text-[11px] text-muted-foreground mb-1 mt-1">Signature</div>
                <TypedSignature value={payload.engineer_signature || ""} onChange={(v) => update("engineer_signature", v)} placeholder="Type or draw signature" />
              </DocBlock>
              <DocBlock title="CLIENT">
                <DocField label="Name" value={payload.client_name} onChange={(v) => update("client_name", v)} />
                <DocField label="Date" type="date" value={payload.client_signed_date} onChange={(v) => update("client_signed_date", v)} />
                <div className="text-[11px] text-muted-foreground mb-1 mt-1">Signature</div>
                <TypedSignature value={payload.client_signature || ""} onChange={(v) => update("client_signature", v)} placeholder="Customer signature" />
              </DocBlock>
            </div>

            {/* 8. AI Client Summary collapsible */}
            <Collapsible open={aiOpen} onOpenChange={setAiOpen}>
              <div className="bg-white border border-border rounded-md overflow-hidden">
                <CollapsibleTrigger asChild>
                  <button className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold">Generate plain-English client email summary (AI)</span>
                    </div>
                    <ChevronDown className={`h-4 w-4 transition-transform ${aiOpen ? "rotate-180" : ""}`} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="p-4 border-t border-border">
                    <ClientSummaryPanel payload={payload} />
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          </div>
        </div>

        {/* Sticky footer */}
        <div className="border-t shrink-0 px-5 py-3 bg-white flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">{payload.company_name || "BHO Fire Ltd"} · BS 5839-1:2025 Compliant</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            <Button size="sm" onClick={handleGeneratePdf} disabled={saving}>
              <FileDown className="h-3.5 w-3.5 mr-1" />Complete &amp; Download PDF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────── */

function DocBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-border rounded-md overflow-hidden">
      <div className="bg-[#3c3c3c] text-white text-[11px] font-bold uppercase tracking-wider px-4 py-2">{title}</div>
      <div className="p-4 space-y-2">{children}</div>
    </div>
  );
}

function DocField({ label, value, onChange, type = "text", multiline = false }: {
  label: string; value: any; onChange: (v: string) => void; type?: string; multiline?: boolean;
}) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-y-2 items-start text-xs">
      <label className="text-muted-foreground pt-2">{label}</label>
      {multiline ? (
        <Textarea rows={2} value={value || ""} onChange={(e) => onChange(e.target.value)} className="text-xs" />
      ) : (
        <Input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} className="h-8 text-xs" />
      )}
    </div>
  );
}

function SmallField({ label, value, onChange, type = "text" }: {
  label: string; value: any; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
      <Input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="h-8 text-xs" />
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
      <span>{label}</span>
    </span>
  );
}

function SectionRows({ section, onChange }: {
  section: { name: string; items: { item: ChecklistItem; idx: number }[] };
  onChange: (idx: number, patch: Partial<ChecklistItem>) => void;
}) {
  return (
    <>
      <tr>
        <td colSpan={4} className="bg-[#3c3c3c] text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1.5">
          {section.name}
        </td>
      </tr>
      {section.items.map(({ item, idx }) => {
        const status = normalizeStatus(item.status, item.invert);
        const isYes = status === "YES";
        const isNo = status === "NO";
        const isNA = status === "N/A";
        const showComment = item.invert ? isYes : isNo;
        const isSpecialNumber = item.special === "number";

        return (
          <React.Fragment key={item.key}>
            <tr className={`border-t border-border ${isNo && !item.invert ? "bg-red-50/40" : isYes && item.invert ? "bg-red-50/40" : ""}`}>
              <td className="px-3 py-2 align-top">
                <div className="flex items-start gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground pt-0.5 w-10 shrink-0">{item.itemNumber || item.key}</span>
                  <span className="text-xs leading-snug">{item.label.replace(new RegExp(`^${item.itemNumber || item.key}\\s*`), "")}</span>
                </div>
              </td>

              {isSpecialNumber ? (
                <td colSpan={3} className="px-2 py-2 align-top">
                  <Input
                    type="number"
                    value={(item as any).value ?? ""}
                    onChange={(e) => onChange(idx, { value: e.target.value === "" ? "" : Number(e.target.value), status: "Pass" } as any)}
                    className="h-7 text-xs w-32 ml-auto"
                  />
                </td>
              ) : (
                <>
                  <StatusCell active={isYes} color="#2e7d32" label="YES" onClick={() => onChange(idx, { status: storeStatus("YES") })} />
                  <StatusCell active={isNo} color="#c62828" label="NO" onClick={() => onChange(idx, { status: storeStatus("NO") })} />
                  <StatusCell active={isNA} color="#546e7a" label="N/A" onClick={() => onChange(idx, { status: storeStatus("N/A") })} />
                </>
              )}
            </tr>
            {showComment && (
              <tr className="bg-red-50/30 border-t border-red-100">
                <td colSpan={4} className="px-3 py-2">
                  <Textarea
                    rows={2}
                    placeholder="Comment required…"
                    value={item.comment || ""}
                    onChange={(e) => onChange(idx, { comment: e.target.value })}
                    className="text-xs"
                  />
                </td>
              </tr>
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}

function StatusCell({ active, color, label, onClick }: {
  active: boolean; color: string; label: string; onClick: () => void;
}) {
  return (
    <td className="px-2 py-2 text-center align-top">
      <button
        type="button"
        onClick={onClick}
        className={`w-9 h-7 rounded border text-[10px] font-bold transition-colors ${
          active ? "text-white border-transparent" : "bg-white border-border text-muted-foreground hover:bg-muted/40"
        }`}
        style={active ? { backgroundColor: color } : undefined}
      >
        {label}
      </button>
    </td>
  );
}
