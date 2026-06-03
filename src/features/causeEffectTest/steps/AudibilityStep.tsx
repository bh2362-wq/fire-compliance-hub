import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { CauseEffectTestReport } from "../useCauseEffectTestDraft";

interface Props {
  report: CauseEffectTestReport;
  onPatch: (updates: Partial<CauseEffectTestReport>) => void;
  reportId: string;
}

interface Reading {
  id: string;
  report_id: string;
  ordinal: number;
  location: string;
  floor: string | null;
  ambient_db: number | null;
  alarm_db: number | null;
  required_db: number | null;
  result: "pass" | "fail" | null;
  notes: string | null;
}

function computeResult(alarm: number | null, required: number | null): "pass" | "fail" | null {
  if (alarm == null || required == null) return null;
  return alarm >= required ? "pass" : "fail";
}

export function AudibilityStep({ report, onPatch, reportId }: Props) {
  const { toast } = useToast();
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("ce_audibility_readings")
        .select("*")
        .eq("report_id", reportId)
        .order("ordinal");
      if (cancelled) return;
      if (error) {
        toast({ title: "Couldn't load readings", description: error.message, variant: "destructive" });
      } else {
        setReadings((data as Reading[]) ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reportId, toast]);

  const addReading = async () => {
    const nextOrdinal = (readings.at(-1)?.ordinal ?? 0) + 10;
    const { data, error } = await (supabase as any)
      .from("ce_audibility_readings")
      .insert({
        report_id: reportId,
        ordinal: nextOrdinal,
        location: "",
        required_db: 65,
      })
      .select("*")
      .single();
    if (error || !data) {
      toast({ title: "Couldn't add row", description: error?.message ?? "", variant: "destructive" });
      return;
    }
    setReadings((prev) => [...prev, data as Reading]);
  };

  const updateRow = async (row: Reading, patch: Partial<Reading>) => {
    let merged: Reading = { ...row, ...patch };
    // Auto-recompute result whenever alarm_db or required_db change.
    if ("alarm_db" in patch || "required_db" in patch) {
      merged = { ...merged, result: computeResult(merged.alarm_db, merged.required_db) };
    }
    setReadings((prev) => prev.map((r) => (r.id === row.id ? merged : r)));
    const dbPatch: Partial<Reading> = { ...patch };
    if ("alarm_db" in patch || "required_db" in patch) dbPatch.result = merged.result;
    const { error } = await (supabase as any)
      .from("ce_audibility_readings")
      .update(dbPatch)
      .eq("id", row.id);
    if (error) toast({ title: "Couldn't save row", description: error.message, variant: "destructive" });
  };

  const removeRow = async (row: Reading) => {
    setReadings((prev) => prev.filter((r) => r.id !== row.id));
    const { error } = await (supabase as any).from("ce_audibility_readings").delete().eq("id", row.id);
    if (error) toast({ title: "Couldn't remove row", description: error.message, variant: "destructive" });
  };

  const passCount = readings.filter((r) => r.result === "pass").length;
  const failCount = readings.filter((r) => r.result === "fail").length;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Audibility</h3>
        <p className="text-xs text-muted-foreground">
          Fills §4.1 (test equipment) and §4.2 (sound level measurements) of the printed report.
          Required dB defaults to 65 (general areas); set to 75 for sleeping accommodation.
        </p>
      </div>

      {/* Sound-level meter — populates report §4.1 */}
      <div className="space-y-2 rounded-lg border bg-card p-3">
        <Label className="text-sm font-medium">§4.1 — Sound level meter</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Make / model</Label>
            <Input
              value={report.sound_meter_make_model ?? ""}
              onChange={(e) => onPatch({ sound_meter_make_model: e.target.value || null })}
              placeholder="e.g. Cirrus CR:162C"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Serial number</Label>
            <Input
              value={report.sound_meter_serial ?? ""}
              onChange={(e) => onPatch({ sound_meter_serial: e.target.value || null })}
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Calibration due</Label>
            <Input
              type="date"
              value={report.sound_meter_cal_due ?? ""}
              onChange={(e) => onPatch({ sound_meter_cal_due: e.target.value || null })}
            />
          </div>
          <div className="flex items-end gap-2 pb-1">
            <Checkbox
              id="cal-on-file"
              checked={!!report.sound_meter_cal_on_file}
              onCheckedChange={(v) => onPatch({ sound_meter_cal_on_file: v === true })}
            />
            <Label htmlFor="cal-on-file" className="text-xs">
              Calibration certificate on file
            </Label>
          </div>
        </div>
      </div>

      {/* §4.2 — readings list. Header makes the wizard ↔ PDF mapping explicit. */}
      <div className="flex items-center justify-between gap-2 pt-2">
        <Label className="text-sm font-medium">§4.2 — Sound level measurements</Label>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">{readings.length} reading{readings.length === 1 ? "" : "s"}</span>
          {passCount > 0 && <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">{passCount} pass</Badge>}
          {failCount > 0 && <Badge variant="destructive">{failCount} fail</Badge>}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {readings.map((row) => (
            <div key={row.id} className="rounded-lg border bg-card p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={row.location}
                  onChange={(e) => updateRow(row, { location: e.target.value })}
                  placeholder="Location"
                  className="font-medium text-sm"
                />
                <Input
                  value={row.floor ?? ""}
                  onChange={(e) => updateRow(row, { floor: e.target.value || null })}
                  placeholder="Floor"
                  className="text-xs w-24"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0"
                  onClick={() => removeRow(row)}
                  aria-label="Remove reading"
                >
                  <Trash2 className="w-4 h-4 text-muted-foreground" />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Ambient dB(A)</Label>
                  <Input
                    inputMode="decimal"
                    value={row.ambient_db ?? ""}
                    onChange={(e) =>
                      updateRow(row, { ambient_db: e.target.value === "" ? null : Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Alarm dB(A)</Label>
                  <Input
                    inputMode="decimal"
                    value={row.alarm_db ?? ""}
                    onChange={(e) =>
                      updateRow(row, { alarm_db: e.target.value === "" ? null : Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Required dB(A)</Label>
                  <Input
                    inputMode="decimal"
                    value={row.required_db ?? ""}
                    onChange={(e) =>
                      updateRow(row, { required_db: e.target.value === "" ? null : Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Input
                  value={row.notes ?? ""}
                  onChange={(e) => updateRow(row, { notes: e.target.value || null })}
                  placeholder="Notes (sleeping accommodation, doors closed, etc.)"
                  className="text-xs"
                />
                {row.result === "pass" && (
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] flex-shrink-0">PASS</Badge>
                )}
                {row.result === "fail" && (
                  <Badge variant="destructive" className="text-[10px] flex-shrink-0">FAIL</Badge>
                )}
              </div>
            </div>
          ))}
          {readings.length === 0 && (
            <div className="rounded-lg border border-dashed text-center py-6 text-sm text-muted-foreground">
              No readings yet. Add one for each location you measure.
            </div>
          )}
        </div>
      )}

      <Button variant="outline" size="sm" className="w-full" onClick={addReading}>
        <Plus className="w-3.5 h-3.5 mr-1.5" /> Add reading
      </Button>
    </div>
  );
}
