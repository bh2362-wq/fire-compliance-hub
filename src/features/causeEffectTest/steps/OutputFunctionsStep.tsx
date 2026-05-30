import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  reportId: string;
}

interface OutputCheck {
  id: string;
  report_id: string;
  ordinal: number;
  function_name: string;
  expected: string | null;
  actual: string | null;
  result: "pass" | "fail" | "na" | null;
}

// Standard rows from §3.3 of the test template. Seeded on first load
// when the report has no ce_output_checks yet so engineers don't have
// to type the function names manually.
const STANDARD_FUNCTIONS: { name: string; expected: string }[] = [
  { name: "Alarm Sounders", expected: "All sounders activate" },
  { name: "Visual Alarm Devices", expected: "All VADs activate" },
  { name: "Fire Brigade Signal", expected: "Signal transmitted" },
  { name: "ARC Transmission", expected: "Signal received by ARC" },
  { name: "Fire Door Releases", expected: "Doors released" },
  { name: "HVAC Shutdown", expected: "Plant shutdown confirmed" },
  { name: "Smoke Control", expected: "Extract / AOV activation" },
  { name: "Lift Homing", expected: "Lift(s) returned to ground" },
  { name: "EM Lock Releases", expected: "Locks released" },
];

const RESULT_LABELS: Record<NonNullable<OutputCheck["result"]>, string> = {
  pass: "Pass",
  fail: "Fail",
  na: "N/A",
};

export function OutputFunctionsStep({ reportId }: Props) {
  const { toast } = useToast();
  const [checks, setChecks] = useState<OutputCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await (supabase as any)
          .from("ce_output_checks")
          .select("*")
          .eq("report_id", reportId)
          .order("ordinal");
        if (error) throw error;
        if (cancelled) return;
        if (!data || data.length === 0) {
          // First open — seed the standard rows.
          const payload = STANDARD_FUNCTIONS.map((f, i) => ({
            report_id: reportId,
            ordinal: (i + 1) * 10,
            function_name: f.name,
            expected: f.expected,
          }));
          const { data: seeded, error: seedErr } = await (supabase as any)
            .from("ce_output_checks")
            .insert(payload)
            .select("*");
          if (seedErr) throw seedErr;
          setChecks(((seeded as OutputCheck[]) || []).sort((a, b) => a.ordinal - b.ordinal));
        } else {
          setChecks(data as OutputCheck[]);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : JSON.stringify(e);
        toast({ title: "Couldn't load output checks", description: message, variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportId, toast]);

  const updateRow = async (row: OutputCheck, patch: Partial<OutputCheck>) => {
    const merged = { ...row, ...patch };
    setChecks((prev) => prev.map((c) => (c.id === row.id ? merged : c)));
    setSavingId(row.id);
    const { error } = await (supabase as any)
      .from("ce_output_checks")
      .update(patch)
      .eq("id", row.id);
    setSavingId(null);
    if (error) {
      toast({ title: "Couldn't save row", description: error.message, variant: "destructive" });
    }
  };

  const addRow = async () => {
    const nextOrdinal = (checks.at(-1)?.ordinal ?? 0) + 10;
    const { data, error } = await (supabase as any)
      .from("ce_output_checks")
      .insert({
        report_id: reportId,
        ordinal: nextOrdinal,
        function_name: "Other",
      })
      .select("*")
      .single();
    if (error || !data) {
      toast({ title: "Couldn't add row", description: error?.message ?? "", variant: "destructive" });
      return;
    }
    setChecks((prev) => [...prev, data as OutputCheck]);
  };

  const removeRow = async (row: OutputCheck) => {
    setChecks((prev) => prev.filter((c) => c.id !== row.id));
    const { error } = await (supabase as any).from("ce_output_checks").delete().eq("id", row.id);
    if (error) toast({ title: "Couldn't remove row", description: error.message, variant: "destructive" });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold">Output functions verified</h3>
        <p className="text-xs text-muted-foreground">
          Set the result for each output. Edit the expected response or add a custom
          row for anything else specific to the site.
        </p>
      </div>

      <div className="space-y-2">
        {checks.map((row) => (
          <div key={row.id} className="rounded-lg border bg-card p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Input
                value={row.function_name}
                onChange={(e) => updateRow(row, { function_name: e.target.value })}
                className="font-medium text-sm"
                placeholder="Function name"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 flex-shrink-0"
                onClick={() => removeRow(row)}
                title="Remove row"
                aria-label="Remove output check"
              >
                <Trash2 className="w-4 h-4 text-muted-foreground" />
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Expected response</Label>
                <Input
                  value={row.expected ?? ""}
                  onChange={(e) => updateRow(row, { expected: e.target.value || null })}
                  className="text-xs"
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Actual response</Label>
                <Input
                  value={row.actual ?? ""}
                  onChange={(e) => updateRow(row, { actual: e.target.value || null })}
                  className="text-xs"
                  placeholder="What happened on test"
                />
              </div>
            </div>

            <div className="flex gap-1.5 pt-0.5">
              {(["pass", "fail", "na"] as const).map((r) => {
                const active = row.result === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => updateRow(row, { result: r })}
                    className={`flex-1 h-9 rounded-md border text-xs font-medium transition-colors ${
                      active
                        ? r === "pass"
                          ? "bg-emerald-600 text-white border-emerald-700"
                          : r === "fail"
                            ? "bg-destructive text-white border-destructive"
                            : "bg-muted text-foreground border-border"
                        : "bg-background hover:bg-accent"
                    }`}
                  >
                    {RESULT_LABELS[r]}
                    {savingId === row.id && active && <Loader2 className="inline w-3 h-3 ml-1 animate-spin" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <Button variant="outline" size="sm" className="w-full" onClick={addRow}>
        <Plus className="w-3.5 h-3.5 mr-1.5" /> Add output check
      </Button>
    </div>
  );
}
