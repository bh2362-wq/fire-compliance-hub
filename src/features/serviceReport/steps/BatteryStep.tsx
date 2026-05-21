import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  BatteryTest,
  createBatteryTest,
  deleteBatteryTest,
  listBatteryTests,
} from "@/services/batteryTestService";

interface Props {
  reportId: string;
}

export function BatteryStep({ reportId }: Props) {
  const { toast } = useToast();
  const [tests, setTests] = useState<BatteryTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // New-test draft.
  const [label, setLabel] = useState("");
  const [voltage, setVoltage] = useState("");
  const [current, setCurrent] = useState("");
  const [loadResult, setLoadResult] = useState<"pass" | "fail" | "not_tested">("pass");
  const [recommendation, setRecommendation] = useState<"retain" | "replace">("retain");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTests(await listBatteryTests(reportId));
    } catch (e) {
      toast({
        title: "Could not load battery tests",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [reportId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = async () => {
    if (!label.trim()) {
      toast({ title: "Panel or PSU label required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await createBatteryTest({
        service_report_id: reportId,
        panel_or_psu_label: label.trim(),
        install_date: null,
        terminal_voltage_v: voltage ? Number(voltage) : null,
        charge_current_ma: current ? Number(current) : null,
        load_test_result: loadResult,
        recommendation,
        notes: null,
      });
      setLabel("");
      setVoltage("");
      setCurrent("");
      setLoadResult("pass");
      setRecommendation("retain");
      setAdding(false);
      await load();
    } catch (e) {
      toast({
        title: "Could not save battery test",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await deleteBatteryTest(id);
      await load();
    } catch (e) {
      toast({
        title: "Could not remove test",
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Battery tests</h3>
        <p className="text-xs text-muted-foreground">
          One entry per panel or PSU. Voltage in volts, current in milliamps.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : tests.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No battery tests recorded yet.</p>
      ) : (
        <ul className="space-y-2">
          {tests.map((t) => (
            <li key={t.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm">
                  <p className="font-medium">{t.panel_or_psu_label}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.terminal_voltage_v != null ? `${t.terminal_voltage_v}V` : "—V"}
                    {" · "}
                    {t.charge_current_ma != null ? `${t.charge_current_ma}mA` : "—mA"}
                    {" · Load: "}
                    {t.load_test_result ?? "—"}
                    {" · "}
                    {t.recommendation ?? "—"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemove(t.id)}
                  aria-label="Remove battery test"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="rounded-lg border bg-card p-3 space-y-3">
          <div>
            <Label className="text-xs">Panel or PSU label</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Main panel, PSU 1"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Voltage (V)</Label>
              <Input
                inputMode="decimal"
                value={voltage}
                onChange={(e) => setVoltage(e.target.value)}
                placeholder="27.4"
              />
            </div>
            <div>
              <Label className="text-xs">Charge current (mA)</Label>
              <Input
                inputMode="numeric"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                placeholder="120"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Load test</Label>
            <Select value={loadResult} onValueChange={(v) => setLoadResult(v as never)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pass">Pass</SelectItem>
                <SelectItem value="fail">Fail</SelectItem>
                <SelectItem value="not_tested">Not tested</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Recommendation</Label>
            <Select value={recommendation} onValueChange={(v) => setRecommendation(v as never)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="retain">Retain</SelectItem>
                <SelectItem value="replace">Replace</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setAdding(false)} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={submitting} className="flex-1">
              {submitting ? "Saving…" : "Add test"}
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => setAdding(true)} variant="outline" className="w-full">
          <Plus className="mr-2 h-4 w-4" />
          Add battery test
        </Button>
      )}
    </div>
  );
}
