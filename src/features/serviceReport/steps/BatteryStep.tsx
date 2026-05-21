import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  listMutations,
  queueMutation,
  removeMutation,
  QueuedMutationRecord,
} from "@/lib/offlineQueue";
import { runSync } from "@/lib/syncWorker";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

interface Props {
  reportId: string;
}

type DisplayTest = {
  id: string;
  label: string;
  voltage: number | null;
  current: number | null;
  loadResult: "pass" | "fail" | "not_tested" | null;
  recommendation: "retain" | "replace" | null;
  pendingSync: boolean;
  queueEntryId: string | null;
};

function fromServer(t: BatteryTest): DisplayTest {
  return {
    id: t.id,
    label: t.panel_or_psu_label,
    voltage: t.terminal_voltage_v,
    current: t.charge_current_ma,
    loadResult: t.load_test_result,
    recommendation: t.recommendation,
    pendingSync: false,
    queueEntryId: null,
  };
}

function fromQueue(rec: QueuedMutationRecord): DisplayTest | null {
  if (rec.mutation.kind !== "battery-create") return null;
  const p = rec.mutation.payload;
  return {
    id: rec.mutation.id,
    label: p.panel_or_psu_label,
    voltage: p.terminal_voltage_v,
    current: p.charge_current_ma,
    loadResult: p.load_test_result,
    recommendation: p.recommendation,
    pendingSync: true,
    queueEntryId: rec.id,
  };
}

export function BatteryStep({ reportId }: Props) {
  const { toast } = useToast();
  const online = useOnlineStatus();
  const [tests, setTests] = useState<DisplayTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [label, setLabel] = useState("");
  const [voltage, setVoltage] = useState("");
  const [current, setCurrent] = useState("");
  const [loadResult, setLoadResult] = useState<"pass" | "fail" | "not_tested">("pass");
  const [recommendation, setRecommendation] = useState<"retain" | "replace">("retain");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let server: DisplayTest[] = [];
      if (online) {
        try {
          const all = await listBatteryTests(reportId);
          server = all.map(fromServer);
        } catch {
          server = [];
        }
      }
      const queued = await listMutations().catch(() => [] as QueuedMutationRecord[]);
      const queuedRows = queued
        .filter(
          (r) =>
            r.mutation.kind === "battery-create" &&
            r.mutation.payload.service_report_id === reportId,
        )
        .map(fromQueue)
        .filter((x): x is DisplayTest => x !== null);
      const serverIds = new Set(server.map((d) => d.id));
      setTests([...server, ...queuedRows.filter((d) => !serverIds.has(d.id))]);
    } catch (e) {
      toast({
        title: "Could not load battery tests",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [reportId, online, toast]);

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
      const id = crypto.randomUUID();
      const payload = {
        service_report_id: reportId,
        panel_or_psu_label: label.trim(),
        install_date: null,
        terminal_voltage_v: voltage ? Number(voltage) : null,
        charge_current_ma: current ? Number(current) : null,
        load_test_result: loadResult,
        recommendation,
        notes: null,
      };

      if (online) {
        try {
          await createBatteryTest({ id, ...payload });
        } catch {
          await queueMutation({ kind: "battery-create", id, payload });
        }
      } else {
        await queueMutation({ kind: "battery-create", id, payload });
      }

      setLabel("");
      setVoltage("");
      setCurrent("");
      setLoadResult("pass");
      setRecommendation("retain");
      setAdding(false);
      await load();
      if (online) void runSync();
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

  const handleRemove = async (t: DisplayTest) => {
    try {
      if (t.queueEntryId) {
        await removeMutation(t.queueEntryId);
        await load();
        return;
      }
      await deleteBatteryTest(t.id);
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
                <div className="text-sm space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{t.label}</p>
                    {t.pendingSync && (
                      <Badge
                        variant="outline"
                        className="bg-amber-50 text-amber-800 border-amber-200"
                      >
                        Pending sync
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t.voltage != null ? `${t.voltage}V` : "—V"}
                    {" · "}
                    {t.current != null ? `${t.current}mA` : "—mA"}
                    {" · Load: "}
                    {t.loadResult ?? "—"}
                    {" · "}
                    {t.recommendation ?? "—"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemove(t)}
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
