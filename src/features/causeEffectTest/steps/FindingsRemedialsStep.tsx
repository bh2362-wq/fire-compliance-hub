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
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { CauseEffectTestReport } from "../useCauseEffectTestDraft";

interface Props {
  report: CauseEffectTestReport;
  onPatch: (updates: Partial<CauseEffectTestReport>) => void;
  reportId: string;
}

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

export function FindingsRemedialsStep({ report, onPatch, reportId }: Props) {
  const { toast } = useToast();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [remedials, setRemedials] = useState<Remedial[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [iRes, rRes] = await Promise.all([
        (supabase as any).from("ce_issues").select("*").eq("report_id", reportId),
        (supabase as any).from("ce_remedials").select("*").eq("report_id", reportId),
      ]);
      if (cancelled) return;
      if (iRes.error) toast({ title: "Couldn't load issues", description: iRes.error.message, variant: "destructive" });
      if (rRes.error) toast({ title: "Couldn't load remedials", description: rRes.error.message, variant: "destructive" });
      setIssues((iRes.data as Issue[]) ?? []);
      setRemedials((rRes.data as Remedial[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reportId, toast]);

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
            </div>
          ))
        )}
      </section>

      {/* General observations */}
      <section className="space-y-2 pt-2 border-t">
        <Label className="text-sm font-medium">General observations</Label>
        <Textarea
          rows={3}
          value={report.general_observations ?? ""}
          onChange={(e) => onPatch({ general_observations: e.target.value || null })}
          placeholder="Anything else worth noting from the test"
        />
      </section>

      {/* Remedials */}
      <section className="space-y-2 pt-2 border-t">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Remedial works required</Label>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={addRemedial}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add
          </Button>
        </div>
        {remedials.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No remedial works required — system is compliant.</p>
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
