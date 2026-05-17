/**
 * Emergency Lighting Certificate — single-page document form
 * BS 5266-1:2016 · BS EN 50172:2004 · BS EN 1838:2013
 *
 * Four sub-types (commissioning, periodic EPM6C, monthly log, annual discharge)
 * are selected at the top of the document.
 */

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { TypedSignature } from "@/components/ui/typed-signature";
import { Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import {
  DocBlock, DocBody, DocDialogShell, DocField, SmallField,
  StickyFooter, StickyHeader, TitleBlock, AISummarySection,
  SitePrefillBlock, PhotoAnalysisBlock, PdfPreviewBlock,
  TriStateRow, type TriStatus, LegendSwatch,
} from "./_DocLayout";
import { ClientSummaryPanel } from "./ClientSummaryPanel";

// ── Payload types ────────────────────────────────────────────────────────────
export type ELFormType = "commissioning" | "periodic" | "monthly_log" | "annual_discharge";

export interface ELChecklistItem {
  clause: string;
  description: string;
  result: "✓" | "7" | "N/A" | "";
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
  cert_reference: string;
  form_type: ELFormType;
  cert_date: string;
  standard_references: string;

  premises_name: string;
  premises_address: string;
  premises_postcode: string;
  responsible_person: string;
  responsible_email: string;

  system_type: "Self-contained" | "Central battery" | "Generator" | "";
  system_mode: "Maintained" | "Non-maintained" | "Sustained" | "Combined" | "";
  duration_rating: "1 hour" | "2 hours" | "3 hours" | "";
  total_luminaires: number | "";
  total_exit_signs: number | "";
  logbook_on_site: boolean;
  eicr_reference: string;
  previous_cert_date: string;

  checklist: ELChecklistItem[];
  monthly_entries: ELMonthlyEntry[];
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

  defects: ELDefect[];

  overall_status: "Satisfactory" | "Satisfactory with Deviations" | "Unsatisfactory" | "";
  deviations_summary: string;
  recommendation_interval_months: 6 | 12;
  next_inspection_date: string;

  engineer_name: string;
  engineer_company?: string;
  engineer_date: string;
  engineer_signature: string;
  client_name: string;
  client_date: string;
  client_signature: string;
}

// ── EPM6C checklist (Annex M of BS 5266-1) ───────────────────────────────────
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
  const prefix = formType === "commissioning" ? "ELC"
    : formType === "monthly_log" ? "ELM"
    : formType === "annual_discharge" ? "ELA" : "ELP";
  const ref = `${prefix}-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
  return {
    cert_reference: ref, form_type: formType, cert_date: now,
    standard_references: "BS 5266-1:2016 · BS EN 50172:2004 · BS EN 1838:2013",
    premises_name: "", premises_address: "", premises_postcode: "",
    responsible_person: "", responsible_email: "",
    system_type: "", system_mode: "", duration_rating: "",
    total_luminaires: "", total_exit_signs: "",
    logbook_on_site: false, eicr_reference: "", previous_cert_date: "",
    checklist: DEFAULT_EPM6C.map((c) => ({ ...c })),
    monthly_entries: [], annual_entries: [], defects: [],
    overall_status: "", deviations_summary: "",
    recommendation_interval_months: 12, next_inspection_date: "",
    engineer_name: "", engineer_date: now, engineer_signature: "",
    client_name: "", client_date: now, client_signature: "",
  };
}

function uid() { return Math.random().toString(36).slice(2, 10); }

// EPM6C uses ✓ / 7 / N/A — convert to/from TriStatus
function toTri(r: ELChecklistItem["result"]): TriStatus {
  if (r === "✓") return "YES";
  if (r === "7") return "NO";
  if (r === "N/A") return "N/A";
  return "";
}
function fromTri(s: TriStatus): ELChecklistItem["result"] {
  if (s === "YES") return "✓";
  if (s === "NO") return "7";
  if (s === "N/A") return "N/A";
  return "";
}

// ── Component ────────────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  visitId?: string | null;
  siteId?: string | null;
  onSaved?: () => void;
}

export default function EmergencyLightingForm({ open, onOpenChange, visitId, siteId, onSaved }: Props) {
  const { user } = useAuth();
  const [payload, setPayload] = useState<ELPayload>(buildEmpty("periodic"));
  const [saving, setSaving] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setPayload(buildEmpty("periodic"));
      setSubmissionId(null);
      setAiOpen(false);
    }
  }, [open]);

  function up(p: Partial<ELPayload>) { setPayload((prev) => ({ ...prev, ...p })); }

  function setFormType(ft: ELFormType) {
    setPayload((prev) => {
      const empty = buildEmpty(ft);
      // Preserve user-entered premises etc, swap reference + type
      return { ...prev, form_type: ft, cert_reference: empty.cert_reference };
    });
  }

  async function save(status: "draft" | "completed" = "draft") {
    setSaving(true);
    try {
      const row = {
        form_type: `el_${payload.form_type}`,
        certificate_reference: payload.cert_reference,
        status,
        payload: payload as unknown as Record<string, unknown>,
        visit_id: visitId ?? null,
        site_id: siteId ?? null,
        user_id: user?.id,
        ...(status === "completed" ? { completed_at: new Date().toISOString() } : {}),
      };
      if (submissionId) {
        const { error } = await supabase.from("smart_form_submissions")
          .update(row as any).eq("id", submissionId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("smart_form_submissions")
          .insert(row as any).select("id").single();
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
    await save("completed");
    try {
      const { generateELCertificatePDF } = await import("@/lib/emergencyLightingPdfGenerator");
      await generateELCertificatePDF(payload as any);
    } catch {
      toast.error("PDF generation failed");
    }
  }

  // Checklist ops
  function setChecklistItem(idx: number, patch: Partial<ELChecklistItem>) {
    up({ checklist: payload.checklist.map((c, i) => (i === idx ? { ...c, ...patch } : c)) });
  }

  // Defects
  function addDefect() {
    up({ defects: [...payload.defects, { id: uid(), location: "", description: "", priority: "", remediated: false }] });
  }
  function patchDefect(id: string, p: Partial<ELDefect>) {
    up({ defects: payload.defects.map((d) => (d.id === id ? { ...d, ...p } : d)) });
  }
  function removeDefect(id: string) {
    up({ defects: payload.defects.filter((d) => d.id !== id) });
  }

  // Monthly / annual rows
  function addMonthly() {
    up({
      monthly_entries: [
        ...payload.monthly_entries,
        {
          test_month: format(new Date(), "MMM yyyy"),
          test_date: format(new Date(), "yyyy-MM-dd"),
          test_type: "Functional",
          duration_mins: "", total_luminaires: "", pass_count: "", fail_count: "",
          result: "", defects_noted: "", tester_name: "",
        },
      ],
    });
  }
  function patchMonthly(idx: number, p: Partial<ELMonthlyEntry>) {
    up({ monthly_entries: payload.monthly_entries.map((m, i) => (i === idx ? { ...m, ...p } : m)) });
  }
  function removeMonthly(idx: number) {
    up({ monthly_entries: payload.monthly_entries.filter((_, i) => i !== idx) });
  }

  function addAnnual() {
    up({
      annual_entries: [
        ...payload.annual_entries,
        {
          test_date: format(new Date(), "yyyy-MM-dd"),
          duration_hours: "", duration_achieved_hours: "",
          total_luminaires: "", pass_count: "", fail_count: "",
          fail_locations: "", result: "",
        },
      ],
    });
  }
  function patchAnnual(idx: number, p: Partial<ELPayload["annual_entries"][number]>) {
    up({ annual_entries: payload.annual_entries.map((a, i) => (i === idx ? { ...a, ...p } : a)) });
  }
  function removeAnnual(idx: number) {
    up({ annual_entries: payload.annual_entries.filter((_, i) => i !== idx) });
  }

  const showChecklist = payload.form_type === "commissioning" || payload.form_type === "periodic";
  const showMonthly = payload.form_type === "monthly_log";
  const showAnnual = payload.form_type === "annual_discharge";

  return (
    <DocDialogShell open={open} onOpenChange={onOpenChange}>
      <StickyHeader
        title="BS 5266-1 — Emergency Lighting Certificate"
        reference={payload.cert_reference}
        onSaveDraft={() => save("draft")}
        onComplete={handleDownload}
        saving={saving}
        meta={
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Zap className="h-3 w-3" />BS 5266-1
          </Badge>
        }
      />

      <DocBody>
        <PdfPreviewBlock
          payload={payload}

        />
        <SitePrefillBlock
          formType={`el_${payload.form_type}`}
          siteId={siteId}
          onPrefillApplied={(fields) => up(fields as any)}
        />
        <TitleBlock
          title="Emergency Lighting Certificate"
          subtitle="BS 5266-1:2016 · BS EN 1838:2013 · BAFE SP203-1"
          reference={payload.cert_reference}
          date={payload.cert_date}
          onDateChange={(v) => up({ cert_date: v })}
        />
        <p className="text-[11px] italic text-muted-foreground px-1">
          Inspection and testing carried out in accordance with BS 5266-1:2016 Clause 7 — Testing. Annual discharge test conducted per BS 5266-1:2016 Clause 7.3. EPM6C notation: ✓ = Satisfactory, 7 = Deviation (note required), N/A = Not applicable.
        </p>
        <PhotoAnalysisBlock
          submissionId={submissionId}
          context={["Emergency lighting", payload.client_name].filter(Boolean).join(", ")}
          existingDefects={payload.defects || []}
          onAddDefects={(defects) => up({ defects: [ ...(payload.defects || []), ...defects ] } as any)}
        />

        {/* Type + identity */}
        <DocBlock title="CERTIFICATE TYPE">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1 md:col-span-2">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Certificate type</label>
              <Select value={payload.form_type} onValueChange={(v) => setFormType(v as ELFormType)}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="commissioning">Commissioning Certificate</SelectItem>
                  <SelectItem value="periodic">Periodic Inspection (EPM6C)</SelectItem>
                  <SelectItem value="monthly_log">Monthly Test Log</SelectItem>
                  <SelectItem value="annual_discharge">Annual Full Discharge Test</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <SmallField label="Reference" value={payload.cert_reference} onChange={(v) => up({ cert_reference: v })} />
          </div>
        </DocBlock>

        {/* Site / contact */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DocBlock title="PREMISES">
            <DocField label="Name" value={payload.premises_name} onChange={(v) => up({ premises_name: v })} />
            <DocField label="Address" value={payload.premises_address} onChange={(v) => up({ premises_address: v })} multiline />
            <DocField label="Postcode" value={payload.premises_postcode} onChange={(v) => up({ premises_postcode: v })} />
          </DocBlock>
          <DocBlock title="RESPONSIBLE PERSON">
            <DocField label="Name" value={payload.responsible_person} onChange={(v) => up({ responsible_person: v })} />
            <DocField label="Email" type="email" value={payload.responsible_email} onChange={(v) => up({ responsible_email: v })} />
            <DocField label="Previous cert" type="date" value={payload.previous_cert_date} onChange={(v) => up({ previous_cert_date: v })} />
            <DocField label="EICR ref" value={payload.eicr_reference} onChange={(v) => up({ eicr_reference: v })} />
          </DocBlock>
        </div>

        {/* System bar */}
        <DocBlock title="SYSTEM">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Type</label>
              <Select value={payload.system_type || undefined} onValueChange={(v) => up({ system_type: v as any })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Self-contained">Self-contained</SelectItem>
                  <SelectItem value="Central battery">Central battery</SelectItem>
                  <SelectItem value="Generator">Generator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Mode</label>
              <Select value={payload.system_mode || undefined} onValueChange={(v) => up({ system_mode: v as any })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Maintained">Maintained</SelectItem>
                  <SelectItem value="Non-maintained">Non-maintained</SelectItem>
                  <SelectItem value="Sustained">Sustained</SelectItem>
                  <SelectItem value="Combined">Combined</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Duration</label>
              <Select value={payload.duration_rating || undefined} onValueChange={(v) => up({ duration_rating: v as any })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1 hour">1 hour</SelectItem>
                  <SelectItem value="2 hours">2 hours</SelectItem>
                  <SelectItem value="3 hours">3 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <SmallField label="Luminaires" type="number" value={payload.total_luminaires} onChange={(v) => up({ total_luminaires: v === "" ? "" : Number(v) })} />
            <SmallField label="Exit signs" type="number" value={payload.total_exit_signs} onChange={(v) => up({ total_exit_signs: v === "" ? "" : Number(v) })} />
          </div>
          <label className="flex items-center gap-2 text-xs mt-2">
            <Checkbox checked={payload.logbook_on_site} onCheckedChange={(c) => up({ logbook_on_site: !!c })} />
            <span>Logbook present on site</span>
          </label>
        </DocBlock>

        {/* Sub-type body */}
        {showChecklist && (
          <div className="bg-white border border-border rounded-md overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-bold">EPM6C Checklist (Annex M, BS 5266-1)</h3>
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
                {payload.checklist.map((c, idx) => (
                  <TriStateRow
                    key={c.clause}
                    number={c.clause}
                    label={c.description}
                    status={toTri(c.result)}
                    onStatus={(s) => setChecklistItem(idx, { result: fromTri(s) })}
                    comment={c.notes}
                    onComment={(v) => setChecklistItem(idx, { notes: v })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showMonthly && (
          <DocBlock
            title="MONTHLY TEST LOG"
            actions={
              <Button size="sm" variant="secondary" className="h-6 text-[10px] px-2" onClick={addMonthly}>
                <Plus className="h-3 w-3 mr-1" />Add row
              </Button>
            }
          >
            {payload.monthly_entries.length === 0 && (
              <p className="text-xs text-muted-foreground italic text-center py-3">No entries yet.</p>
            )}
            {payload.monthly_entries.map((m, idx) => (
              <div key={idx} className="border border-border rounded p-3 bg-muted/10 space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs font-semibold">Entry #{idx + 1}</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeMonthly(idx)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <SmallField label="Month" value={m.test_month} onChange={(v) => patchMonthly(idx, { test_month: v })} />
                  <SmallField label="Test date" type="date" value={m.test_date} onChange={(v) => patchMonthly(idx, { test_date: v })} />
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Type</label>
                    <Select value={m.test_type} onValueChange={(v) => patchMonthly(idx, { test_type: v as any })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Functional">Functional</SelectItem>
                        <SelectItem value="Duration">Duration</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <SmallField label="Mins" type="number" value={m.duration_mins} onChange={(v) => patchMonthly(idx, { duration_mins: v === "" ? "" : Number(v) })} />
                  <SmallField label="Total" type="number" value={m.total_luminaires} onChange={(v) => patchMonthly(idx, { total_luminaires: v === "" ? "" : Number(v) })} />
                  <SmallField label="Pass" type="number" value={m.pass_count} onChange={(v) => patchMonthly(idx, { pass_count: v === "" ? "" : Number(v) })} />
                  <SmallField label="Fail" type="number" value={m.fail_count} onChange={(v) => patchMonthly(idx, { fail_count: v === "" ? "" : Number(v) })} />
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Result</label>
                    <Select value={m.result || undefined} onValueChange={(v) => patchMonthly(idx, { result: v as any })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Satisfactory">Satisfactory</SelectItem>
                        <SelectItem value="Unsatisfactory">Unsatisfactory</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Input className="h-8 text-xs" placeholder="Defects noted" value={m.defects_noted} onChange={(e) => patchMonthly(idx, { defects_noted: e.target.value })} />
                <Input className="h-8 text-xs" placeholder="Tester name" value={m.tester_name} onChange={(e) => patchMonthly(idx, { tester_name: e.target.value })} />
              </div>
            ))}
          </DocBlock>
        )}

        {showAnnual && (
          <DocBlock
            title="ANNUAL FULL DISCHARGE TEST"
            actions={
              <Button size="sm" variant="secondary" className="h-6 text-[10px] px-2" onClick={addAnnual}>
                <Plus className="h-3 w-3 mr-1" />Add test
              </Button>
            }
          >
            {payload.annual_entries.length === 0 && (
              <p className="text-xs text-muted-foreground italic text-center py-3">No tests recorded.</p>
            )}
            {payload.annual_entries.map((a, idx) => (
              <div key={idx} className="border border-border rounded p-3 bg-muted/10 space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs font-semibold">Test #{idx + 1}</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeAnnual(idx)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <SmallField label="Test date" type="date" value={a.test_date} onChange={(v) => patchAnnual(idx, { test_date: v })} />
                  <SmallField label="Required (h)" type="number" value={a.duration_hours} onChange={(v) => patchAnnual(idx, { duration_hours: v === "" ? "" : Number(v) })} />
                  <SmallField label="Achieved (h)" type="number" value={a.duration_achieved_hours} onChange={(v) => patchAnnual(idx, { duration_achieved_hours: v === "" ? "" : Number(v) })} />
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Result</label>
                    <Select value={a.result || undefined} onValueChange={(v) => patchAnnual(idx, { result: v as any })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Pass">Pass</SelectItem>
                        <SelectItem value="Fail">Fail</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <SmallField label="Total" type="number" value={a.total_luminaires} onChange={(v) => patchAnnual(idx, { total_luminaires: v === "" ? "" : Number(v) })} />
                  <SmallField label="Pass" type="number" value={a.pass_count} onChange={(v) => patchAnnual(idx, { pass_count: v === "" ? "" : Number(v) })} />
                  <SmallField label="Fail" type="number" value={a.fail_count} onChange={(v) => patchAnnual(idx, { fail_count: v === "" ? "" : Number(v) })} />
                </div>
                <Textarea rows={2} className="text-xs" placeholder="Locations of failed luminaires" value={a.fail_locations} onChange={(e) => patchAnnual(idx, { fail_locations: e.target.value })} />
              </div>
            ))}
          </DocBlock>
        )}

        {/* Defects */}
        <DocBlock
          title="DEFECTS & RECOMMENDATIONS"
          actions={
            <Button size="sm" variant="secondary" className="h-6 text-[10px] px-2" onClick={addDefect}>
              <Plus className="h-3 w-3 mr-1" />Add
            </Button>
          }
        >
          {payload.defects.length === 0 && (
            <p className="text-xs text-muted-foreground italic text-center py-3">No defects recorded.</p>
          )}
          {payload.defects.map((d, i) => (
            <div key={d.id} className="border border-border rounded p-3 bg-muted/10 space-y-2">
              <div className="flex justify-between">
                <span className="text-xs font-semibold">Defect #{i + 1}</span>
                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeDefect(d.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <Input className="h-8 text-xs" placeholder="Location" value={d.location} onChange={(e) => patchDefect(d.id, { location: e.target.value })} />
                <Select value={d.priority || undefined} onValueChange={(v) => patchDefect(d.id, { priority: v as any })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Priority" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Urgent">Urgent</SelectItem>
                    <SelectItem value="Required">Required</SelectItem>
                    <SelectItem value="Advisory">Advisory</SelectItem>
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={d.remediated} onCheckedChange={(c) => patchDefect(d.id, { remediated: !!c })} />
                  <span>Remediated</span>
                </label>
              </div>
              <Textarea rows={2} className="text-xs" placeholder="Description" value={d.description} onChange={(e) => patchDefect(d.id, { description: e.target.value })} />
              {d.remediated && (
                <Input type="date" className="h-8 text-xs" value={d.remediation_date || ""} onChange={(e) => patchDefect(d.id, { remediation_date: e.target.value })} />
              )}
            </div>
          ))}
        </DocBlock>

        {/* Status & next */}
        <DocBlock title="OVERALL STATUS">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1 md:col-span-2">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Overall</label>
              <Select value={payload.overall_status || undefined} onValueChange={(v) => up({ overall_status: v as any })}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Satisfactory">Satisfactory</SelectItem>
                  <SelectItem value="Satisfactory with Deviations">Satisfactory with Deviations</SelectItem>
                  <SelectItem value="Unsatisfactory">Unsatisfactory</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <SmallField label="Next inspection" type="date" value={payload.next_inspection_date} onChange={(v) => up({ next_inspection_date: v })} />
          </div>
          <Textarea rows={3} placeholder="Deviations summary" value={payload.deviations_summary} onChange={(e) => up({ deviations_summary: e.target.value })} className="text-xs mt-2" />
        </DocBlock>

        {/* Signatures */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DocBlock title="ENGINEER">
            <DocField label="Name" value={payload.engineer_name} onChange={(v) => up({ engineer_name: v })} />
            <DocField label="Date" type="date" value={payload.engineer_date} onChange={(v) => up({ engineer_date: v })} />
            <div className="text-[11px] text-muted-foreground mb-1 mt-1">Signature</div>
            <TypedSignature value={payload.engineer_signature || ""} onChange={(v) => up({ engineer_signature: v })} placeholder="Type or draw signature" />
          </DocBlock>
          <DocBlock title="CLIENT">
            <DocField label="Name" value={payload.client_name} onChange={(v) => up({ client_name: v })} />
            <DocField label="Date" type="date" value={payload.client_date} onChange={(v) => up({ client_date: v })} />
            <div className="text-[11px] text-muted-foreground mb-1 mt-1">Signature</div>
            <TypedSignature value={payload.client_signature || ""} onChange={(v) => up({ client_signature: v })} placeholder="Customer signature" />
          </DocBlock>
        </div>

        <AISummarySection open={aiOpen} onOpenChange={setAiOpen}>
          <ClientSummaryPanel payload={payload as any} />
        </AISummarySection>
      </DocBody>

      <StickyFooter
        standardLabel="BS 5266-1:2016 compliant"
        onClose={() => onOpenChange(false)}
        onComplete={handleDownload}
        saving={saving}
      />
    </DocDialogShell>
  );
}
