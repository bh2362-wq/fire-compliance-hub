import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { AIRewriteButton } from "@/components/reports/AIRewriteButton";
import type { CauseEffectTestReport } from "../useCauseEffectTestDraft";

interface Props {
  report: CauseEffectTestReport;
  onPatch: (updates: Partial<CauseEffectTestReport>) => void;
  reportId: string;
  /** Visit + site IDs are needed by the "Import findings from defects"
      action which reads from site_defects (keyed by visit_id + site_id,
      not report_id since C&E reports don't FK to service_reports). */
  visitId: string;
  siteId: string;
}

// Heuristic — pick the ce_issues.kind a site_defect should land under
// by scanning its text for cause-effect-specific keywords (interface,
// output, lift, BMS, door holder, shutdown, relay). Anything else
// defaults to audibility, which is what most extracted C&E findings
// turn out to be (sound levels, missing VADs, etc).
function classifyCEKind(text: string): "audibility" | "cause_effect" {
  const hay = text.toLowerCase();
  if (
    /\b(lift|bms|cause and effect|interface|output|door holder|shutdown|relay)\b/.test(hay)
  ) {
    return "cause_effect";
  }
  return "audibility";
}

// Map our site_defects.category (1/2/3) to ce_issues.severity. DB
// CHECK constraint allows only ('critical', 'non_critical') —
// cat 1 → critical (life-safety), cat 2+3 → non_critical (impaired
// but operational).
const CE_SEVERITY: Record<number, "critical" | "non_critical"> = {
  1: "critical",
  2: "non_critical",
  3: "non_critical",
};

interface Issue {
  id: string;
  report_id: string;
  kind: "cause_effect" | "audibility";
  description: string | null;
  location: string | null;
  measured_db: number | null;
  required_db: number | null;
  severity: "critical" | "non_critical" | null;
  action_required: string | null;
}

interface Remedial {
  id: string;
  report_id: string;
  priority: "urgent" | "routine" | null;
  description: string | null;
  location: string | null;
  estimated_cost: number | null;
}

export function FindingsRemedialsStep({ report, onPatch, reportId, visitId, siteId }: Props) {
  const { toast } = useToast();
  void report; // silence unused-prop warning — kept for API symmetry
  const [issues, setIssues] = useState<Issue[]>([]);
  const [remedials, setRemedials] = useState<Remedial[]>([]);
  const [loading, setLoading] = useState(true);
  // Count of site_defects on this visit. Drives the "Import from defects"
  // button label so the engineer sees up-front whether there's anything
  // worth importing.
  const [defectCount, setDefectCount] = useState(0);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [iRes, rRes, dRes] = await Promise.all([
        (supabase as any).from("ce_issues").select("*").eq("report_id", reportId),
        (supabase as any).from("ce_remedials").select("*").eq("report_id", reportId),
        (supabase as any)
          .from("site_defects")
          .select("id", { count: "exact", head: true })
          .eq("visit_id", visitId),
      ]);
      if (cancelled) return;
      if (iRes.error) toast({ title: "Couldn't load issues", description: iRes.error.message, variant: "destructive" });
      if (rRes.error) toast({ title: "Couldn't load remedials", description: rRes.error.message, variant: "destructive" });
      setIssues((iRes.data as Issue[]) ?? []);
      setRemedials((rRes.data as Remedial[]) ?? []);
      setDefectCount(dRes.count ?? 0);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reportId, visitId, toast]);

  // Read every site_defect on this visit and turn each into a ce_issues
  // row (with kind classified by keyword heuristic + severity mapped
  // from category). Dedupes by description match against existing
  // ce_issues so re-running the action doesn't double up.
  const importFromDefects = async () => {
    setImporting(true);
    try {
      const { data: defectsData, error: defErr } = await (supabase as any)
        .from("site_defects")
        .select("id, description, location, category, status")
        .eq("visit_id", visitId);
      if (defErr) throw defErr;
      const defects = (defectsData ?? []) as Array<{
        id: string;
        description: string;
        location: string | null;
        category: number;
        status: string;
      }>;
      if (defects.length === 0) {
        toast({ title: "No defects to import", description: "Paste notes or add defects first." });
        return;
      }
      // Build a set of existing ce_issues descriptions so we don't
      // create dupes when this button gets pressed twice.
      const existingDescriptions = new Set(
        issues
          .map((i) => (i.description ?? "").trim().toLowerCase())
          .filter((s) => s.length > 0),
      );
      const toInsert = defects
        .filter((d) => {
          const norm = (d.description ?? "").trim().toLowerCase();
          return norm.length > 0 && !existingDescriptions.has(norm);
        })
        .map((d) => {
          const haystack = `${d.description} ${d.location ?? ""}`;
          return {
            report_id: reportId,
            kind: classifyCEKind(haystack),
            location: d.location,
            description: d.description,
            severity: CE_SEVERITY[d.category] ?? "non_critical",
          };
        });
      if (toInsert.length === 0) {
        toast({
          title: "Nothing new to import",
          description: `All ${defects.length} defect${defects.length === 1 ? "" : "s"} on this visit are already on the findings list.`,
        });
        return;
      }
      const { data: inserted, error: insErr } = await (supabase as any)
        .from("ce_issues")
        .insert(toInsert)
        .select("*");
      if (insErr) throw insErr;
      const rows = (inserted ?? []) as Issue[];
      setIssues((prev) => [...prev, ...rows]);
      const skipped = defects.length - rows.length;
      toast({
        title: `Imported ${rows.length} finding${rows.length === 1 ? "" : "s"}`,
        description:
          skipped > 0
            ? `${skipped} already on the list, skipped.`
            : `From ${defects.length} site defect${defects.length === 1 ? "" : "s"}.`,
      });
    } catch (e) {
      toast({
        title: "Import failed",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  const addIssue = async (kind: Issue["kind"]) => {
    const { data, error } = await (supabase as any)
      .from("ce_issues")
      .insert({ report_id: reportId, kind })
      .select("*")
      .single();
    if (error || !data) {
      toast({ title: "Couldn't add issue", description: error?.message ?? "", variant: "destructive" });
      return;
    }
    setIssues((prev) => [...prev, data as Issue]);
  };

  const updateIssue = async (row: Issue, patch: Partial<Issue>) => {
    setIssues((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...patch } : r)));
    const { error } = await (supabase as any).from("ce_issues").update(patch).eq("id", row.id);
    if (error) toast({ title: "Couldn't save issue", description: error.message, variant: "destructive" });
  };

  const removeIssue = async (row: Issue) => {
    setIssues((prev) => prev.filter((r) => r.id !== row.id));
    const { error } = await (supabase as any).from("ce_issues").delete().eq("id", row.id);
    if (error) toast({ title: "Couldn't remove issue", description: error.message, variant: "destructive" });
  };

  const addRemedial = async () => {
    const { data, error } = await (supabase as any)
      .from("ce_remedials")
      .insert({ report_id: reportId, priority: "routine" })
      .select("*")
      .single();
    if (error || !data) {
      toast({ title: "Couldn't add remedial", description: error?.message ?? "", variant: "destructive" });
      return;
    }
    setRemedials((prev) => [...prev, data as Remedial]);
  };

  const updateRemedial = async (row: Remedial, patch: Partial<Remedial>) => {
    setRemedials((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...patch } : r)));
    const { error } = await (supabase as any).from("ce_remedials").update(patch).eq("id", row.id);
    if (error) toast({ title: "Couldn't save remedial", description: error.message, variant: "destructive" });
  };

  const removeRemedial = async (row: Remedial) => {
    setRemedials((prev) => prev.filter((r) => r.id !== row.id));
    const { error } = await (supabase as any).from("ce_remedials").delete().eq("id", row.id);
    if (error) toast({ title: "Couldn't remove remedial", description: error.message, variant: "destructive" });
  };

  // Turn each Findings issue into a draft remedial: action_required becomes
  // the description (falling back to "Address: <issue>" when the engineer
  // left it blank), severity maps to priority. Skips issues that already
  // have a matching remedial so re-clicking the button doesn't dupe.
  const [generating, setGenerating] = useState(false);
  const generateFromIssues = async () => {
    if (issues.length === 0) return;
    setGenerating(true);
    try {
      const existingKeys = new Set(
        remedials.map((r) => `${(r.description ?? "").trim().toLowerCase()}|${(r.location ?? "").trim().toLowerCase()}`),
      );
      const rows = issues
        .map((i) => {
          const description = i.action_required?.trim()
            ? i.action_required.trim()
            : i.description?.trim()
              ? `Address: ${i.description.trim()}`
              : null;
          if (!description) return null;
          const key = `${description.toLowerCase()}|${(i.location ?? "").trim().toLowerCase()}`;
          if (existingKeys.has(key)) return null;
          return {
            report_id: reportId,
            description,
            location: i.location,
            priority: i.severity === "critical" ? "urgent" : "routine",
            estimated_cost: null as number | null,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (rows.length === 0) {
        toast({ title: "Nothing to add", description: "All issues already have a matching remedial." });
        return;
      }

      const { data, error } = await (supabase as any)
        .from("ce_remedials")
        .insert(rows)
        .select("*");

      if (error || !data) {
        toast({ title: "Couldn't generate remedials", description: error?.message ?? "", variant: "destructive" });
        return;
      }

      setRemedials((prev) => [...prev, ...(data as Remedial[])]);
      toast({ title: `Added ${data.length} remedial${data.length === 1 ? "" : "s"} from issues` });
    } finally {
      setGenerating(false);
    }
  };

  const ceIssues = issues.filter((i) => i.kind === "cause_effect");
  const audIssues = issues.filter((i) => i.kind === "audibility");
  const totalCost = remedials.reduce((sum, r) => sum + (r.estimated_cost ?? 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold">Findings &amp; remedials</h3>
        <p className="text-xs text-muted-foreground">
          Issues raised during the test and the remedial work needed to bring the system back to compliance.
        </p>
      </div>

      {/* Import from site_defects — for engineers who pasted notes (or
          added defects via the defect register) and want them auto-
          classified into ce_issues. Dedupes on description. */}
      <div className="rounded-lg border border-dashed border-primary/30 bg-primary/[0.04] p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Defects on this visit</p>
          <p className="text-xs text-muted-foreground">
            {defectCount === 0
              ? "No site defects logged yet. Paste notes or add defects on another step first."
              : `${defectCount} defect${defectCount === 1 ? "" : "s"} ready to classify into findings. Cause-effect keywords (lift, BMS, output, door holder…) route to the cause &amp; effect section; everything else to audibility.`}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={importFromDefects}
          disabled={importing || defectCount === 0}
          className="shrink-0"
        >
          {importing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              Importing…
            </>
          ) : (
            <>
              <Wand2 className="w-3.5 h-3.5 mr-1.5" />
              Import from defects
            </>
          )}
        </Button>
      </div>

      {/* Cause &amp; effect issues */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Cause &amp; effect issues</Label>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => addIssue("cause_effect")}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add
          </Button>
        </div>
        {ceIssues.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No cause &amp; effect issues identified.</p>
        ) : (
          ceIssues.map((row) => (
            <div key={row.id} className="rounded-lg border bg-card p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={row.description ?? ""}
                  onChange={(e) => updateIssue(row, { description: e.target.value || null })}
                  placeholder="Issue description"
                  className="text-sm font-medium"
                />
                <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={() => removeIssue(row)} aria-label="Remove">
                  <Trash2 className="w-4 h-4 text-muted-foreground" />
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input
                  value={row.location ?? ""}
                  onChange={(e) => updateIssue(row, { location: e.target.value || null })}
                  placeholder="Location / zone"
                  className="text-xs"
                />
                <Select
                  value={row.severity ?? ""}
                  onValueChange={(v) => updateIssue(row, { severity: v as Issue["severity"] })}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Severity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="non_critical">Non-critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Input
                value={row.action_required ?? ""}
                onChange={(e) => updateIssue(row, { action_required: e.target.value || null })}
                placeholder="Action required"
                className="text-xs"
              />
              <div className="flex justify-end">
                <AIRewriteButton
                  text={row.action_required ?? ""}
                  type="bs5839_guidance"
                  onRewrite={(v) => updateIssue(row, { action_required: v || null })}
                  context={`Cause & effect issue. Description: ${row.description ?? "—"}. Location: ${row.location ?? "—"}. Severity: ${row.severity ?? "—"}.`}
                />
              </div>
            </div>
          ))
        )}
      </section>

      {/* Audibility issues */}
      <section className="space-y-2 pt-2 border-t">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Audibility issues</Label>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => addIssue("audibility")}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add
          </Button>
        </div>
        {audIssues.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No audibility issues identified.</p>
        ) : (
          audIssues.map((row) => (
            <div key={row.id} className="rounded-lg border bg-card p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={row.description ?? ""}
                  onChange={(e) => updateIssue(row, { description: e.target.value || null })}
                  placeholder="Issue description"
                  className="text-sm font-medium"
                />
                <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={() => removeIssue(row)} aria-label="Remove">
                  <Trash2 className="w-4 h-4 text-muted-foreground" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={row.location ?? ""}
                  onChange={(e) => updateIssue(row, { location: e.target.value || null })}
                  placeholder="Location"
                  className="text-xs"
                />
                <div className="grid grid-cols-2 gap-1.5">
                  <Input
                    inputMode="decimal"
                    value={row.measured_db ?? ""}
                    onChange={(e) =>
                      updateIssue(row, { measured_db: e.target.value === "" ? null : Number(e.target.value) })
                    }
                    placeholder="Measured dB"
                    className="text-xs"
                  />
                  <Input
                    inputMode="decimal"
                    value={row.required_db ?? ""}
                    onChange={(e) =>
                      updateIssue(row, { required_db: e.target.value === "" ? null : Number(e.target.value) })
                    }
                    placeholder="Required dB"
                    className="text-xs"
                  />
                </div>
              </div>
              <Input
                value={row.action_required ?? ""}
                onChange={(e) => updateIssue(row, { action_required: e.target.value || null })}
                placeholder="Action required"
                className="text-xs"
              />
              <div className="flex justify-end">
                <AIRewriteButton
                  text={row.action_required ?? ""}
                  type="bs5839_guidance"
                  onRewrite={(v) => updateIssue(row, { action_required: v || null })}
                  context={`Audibility issue. Description: ${row.description ?? "—"}. Location: ${row.location ?? "—"}. Measured: ${row.measured_db ?? "—"} dB. Required: ${row.required_db ?? "—"} dB.`}
                />
              </div>
            </div>
          ))
        )}
      </section>

      {/* General observations */}
      <section className="space-y-2 pt-2 border-t">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Label className="text-sm font-medium">General observations</Label>
          <div className="flex items-center gap-1">
            <AIRewriteButton
              text={report.general_observations ?? ""}
              type="comments"
              onRewrite={(v) => onPatch({ general_observations: v || null })}
            />
            <AIRewriteButton
              text={report.general_observations ?? ""}
              type="bs5839_guidance"
              onRewrite={(v) => onPatch({ general_observations: v || null })}
            />
          </div>
        </div>
        <Textarea
          rows={3}
          value={report.general_observations ?? ""}
          onChange={(e) => onPatch({ general_observations: e.target.value || null })}
          placeholder="Anything else worth noting from the test — type a rough draft then tap Improve with AI."
        />
      </section>

      {/* Remedials */}
      <section className="space-y-2 pt-2 border-t">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-sm font-medium">Remedial works required</Label>
          <div className="flex items-center gap-1">
            {issues.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={generateFromIssues}
                disabled={generating}
                title="Create remedial entries from each Findings issue"
              >
                {generating ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5 mr-1" />
                )}
                Generate from issues
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={addRemedial}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add
            </Button>
          </div>
        </div>
        {remedials.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            {issues.length > 0
              ? "No remedials yet — tap “Generate from issues” to draft one per issue, then refine."
              : "No remedial works required — system is compliant."}
          </p>
        ) : (
          <>
            {remedials.map((row) => (
              <div key={row.id} className="rounded-lg border bg-card p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={row.description ?? ""}
                    onChange={(e) => updateRemedial(row, { description: e.target.value || null })}
                    placeholder="Remedial description"
                    className="text-sm font-medium"
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={() => removeRemedial(row)} aria-label="Remove">
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Select
                    value={row.priority ?? ""}
                    onValueChange={(v) => updateRemedial(row, { priority: v as Remedial["priority"] })}
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue placeholder="Priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="routine">Routine</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={row.location ?? ""}
                    onChange={(e) => updateRemedial(row, { location: e.target.value || null })}
                    placeholder="Location"
                    className="text-xs"
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">£</span>
                    <Input
                      inputMode="decimal"
                      value={row.estimated_cost ?? ""}
                      onChange={(e) =>
                        updateRemedial(row, { estimated_cost: e.target.value === "" ? null : Number(e.target.value) })
                      }
                      placeholder="Est. cost"
                      className="text-xs"
                    />
                  </div>
                </div>
              </div>
            ))}
            <p className="text-xs text-right text-muted-foreground pr-1">
              Total est. £{totalCost.toFixed(2)}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
