import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, Check, X, Search, ClipboardCheck } from "lucide-react";
import { parseCSV, parseTXT, type ParseResult } from "@/lib/parsers/csvParser";
import { parsePDF } from "@/lib/parsers/pdfParser";
import { saveFileUpload } from "@/services/uploadService";

interface Device {
  id: string;
  loop: string | null;
  address: string | null;
  zone: string | null;
  device_type: string | null;
  location: string | null;
}

interface TestRecord {
  device_id: string | null;
  loop: string | null;
  address: string | null;
  status: string;
  tested_at: string | null;
  created_at: string;
  source: string | null;
  fail_reason: string | null;
}

interface RowState {
  device: Device;
  latest: TestRecord | null;
}

type StatusFilter = "all" | "untested" | "passed" | "failed";

const FAIL_REASONS = [
  "No response to test",
  "Damaged",
  "Contaminated",
  "Missing",
  "End of life",
  "Wiring fault",
  "Other",
];

function normalizeStatus(raw: string | null | undefined): "passed" | "failed" | "untested" {
  if (!raw) return "untested";
  const v = raw.toLowerCase();
  if (v.startsWith("pass")) return "passed";
  if (v.startsWith("fail") || v.startsWith("fault")) return "failed";
  return "untested";
}

interface VisitDeviceAccountabilityProps {
  visitId: string;
  siteId: string;
}

export function VisitDeviceAccountability({ visitId, siteId }: VisitDeviceAccountabilityProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [loopFilter, setLoopFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [failModal, setFailModal] = useState<Device | null>(null);
  const [uploading, setUploading] = useState(false);

  const devicesQuery = useQuery({
    queryKey: ["visit-accountability-devices", siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devices")
        .select("id, loop, address, zone, device_type, location")
        .eq("site_id", siteId)
        .order("loop")
        .order("address");
      if (error) throw error;
      return (data ?? []) as Device[];
    },
    enabled: !!siteId,
  });

  const testsQuery = useQuery({
    queryKey: ["visit-accountability-tests", visitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parsed_device_tests")
        .select("device_id, loop, address, status, tested_at, created_at, source, fail_reason")
        .eq("visit_id", visitId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TestRecord[];
    },
    enabled: !!visitId,
  });

  const rows: RowState[] = useMemo(() => {
    const devices = devicesQuery.data ?? [];
    const tests = testsQuery.data ?? [];
    // Latest test per device_id and per (loop+address) — match by either path.
    const byId = new Map<string, TestRecord>();
    const byKey = new Map<string, TestRecord>();
    for (const t of tests) {
      if (t.device_id && !byId.has(t.device_id)) byId.set(t.device_id, t);
      const key = `${t.loop ?? ""}|${t.address ?? ""}`;
      if (!byKey.has(key)) byKey.set(key, t);
    }
    return devices.map((d) => ({
      device: d,
      latest: byId.get(d.id) ?? byKey.get(`${d.loop ?? ""}|${d.address ?? ""}`) ?? null,
    }));
  }, [devicesQuery.data, testsQuery.data]);

  const loops = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => { if (r.device.loop) s.add(r.device.loop); });
    return [...s].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      const status = normalizeStatus(r.latest?.status);
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (loopFilter !== "all" && r.device.loop !== loopFilter) return false;
      if (term) {
        const hay = `${r.device.loop ?? ""} ${r.device.address ?? ""} ${r.device.device_type ?? ""} ${r.device.location ?? ""} ${r.device.zone ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, loopFilter, search]);

  const counts = useMemo(() => {
    let passed = 0, failed = 0, untested = 0;
    for (const r of rows) {
      const s = normalizeStatus(r.latest?.status);
      if (s === "passed") passed++;
      else if (s === "failed") failed++;
      else untested++;
    }
    return { passed, failed, untested, total: rows.length };
  }, [rows]);

  const coverage = counts.total > 0 ? Math.round(((counts.passed + counts.failed) / counts.total) * 100) : 0;

  const recordTest = async (device: Device, status: "passed" | "failed", failReason?: string) => {
    setBusy(device.id);
    try {
      const { data: userData } = await supabase.auth.getUser();
      // Match the table's CHECK constraint (passed | fault | untested | unknown).
      // UI uses "failed" internally but the DB stores "fault".
      const dbStatus = status === "failed" ? "fault" : "passed";
      const payload = {
        visit_id: visitId,
        device_id: device.id,
        loop: device.loop,
        address: device.address,
        device_type: device.device_type,
        location: device.location,
        status: dbStatus,
        fail_reason: failReason ?? null,
        engineer_id: userData.user?.id ?? null,
        tested_at: new Date().toISOString(),
        source: "manual_office",
        matched: true,
      };
      const { error } = await (supabase as any).from("parsed_device_tests").insert(payload);
      if (error) throw error;

      // Reflect the tick on the device row so the Inventory and any other
      // surface reading from `devices` stays in sync.
      void (supabase as any)
        .from("devices")
        .update({
          last_tested_at: new Date().toISOString(),
          ...(status === "failed" ? { status: "faulty" } : {}),
        })
        .eq("id", device.id)
        .then(() => {}, (e: unknown) => console.warn("devices update failed:", e));

      await (supabase as any).rpc("increment_visit_tested", { vid: visitId }).then(() => {}, () => {});
      qc.invalidateQueries({ queryKey: ["visit-accountability-tests", visitId] });
    } catch (err) {
      toast({
        title: "Couldn't record test",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let result: ParseResult;
      if (ext === "csv") result = parseCSV(await file.text());
      else if (ext === "txt" || ext === "log") result = parseTXT(await file.text());
      else if (ext === "pdf") result = await parsePDF(file);
      else throw new Error(`Unsupported file type: .${ext}. Use CSV, TXT, LOG or PDF.`);

      if (!result.success) throw new Error(result.errors[0] ?? "Failed to parse file");

      const { error } = await saveFileUpload({ visitId, siteId, file, parseResult: result });
      if (error) throw error;

      toast({
        title: "Panel log imported",
        description: `${result.summary.testedDevices} passed, ${result.summary.faultDevices} faults from ${result.summary.totalDevices} device rows.`,
      });
      qc.invalidateQueries({ queryKey: ["visit-accountability-tests", visitId] });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  if (devicesQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading device list…
      </div>
    );
  }

  if (devicesQuery.error) {
    return (
      <div className="text-sm text-destructive py-2">
        Couldn't load devices: {(devicesQuery.error as Error).message}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-3">
        This site has no devices recorded yet. Import the device list from the site page before logging tests here.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Coverage bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap text-sm">
          <span className="font-medium">{counts.passed + counts.failed} of {counts.total} tested</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{coverage}% coverage</span>
          {counts.failed > 0 && (
            <Badge variant="destructive" className="text-[10px]">{counts.failed} failed</Badge>
          )}
          {counts.untested > 0 && (
            <Badge variant="outline" className="text-[10px]">{counts.untested} untested</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt,.log,.pdf"
            className="hidden"
            onChange={handleUpload}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
            Upload panel log
          </Button>
        </div>
      </div>

      {/* Coverage bar visual */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden flex">
        {counts.passed > 0 && (
          <div className="bg-emerald-500" style={{ width: `${(counts.passed / counts.total) * 100}%` }} />
        )}
        {counts.failed > 0 && (
          <div className="bg-destructive" style={{ width: `${(counts.failed / counts.total) * 100}%` }} />
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="untested">Untested</SelectItem>
            <SelectItem value="passed">Passed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        {loops.length > 1 && (
          <Select value={loopFilter} onValueChange={setLoopFilter}>
            <SelectTrigger className="w-[110px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All loops</SelectItem>
              {loops.map((l) => (
                <SelectItem key={l} value={l}>Loop {l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="relative flex-1 min-w-[160px]">
          <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
          <Input
            placeholder="Search address, location, type…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {/* Device list */}
      {filtered.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-4">No devices match these filters.</div>
      ) : (
        <div className="border rounded-lg divide-y max-h-[360px] overflow-y-auto">
          {filtered.map(({ device, latest }) => {
            const status = normalizeStatus(latest?.status);
            return (
              <div key={device.id} className="flex items-center gap-2 px-2.5 py-2 text-xs">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {device.loop ? `L${device.loop}/` : ""}{device.address ?? "?"} · {device.device_type ?? "Device"}
                  </div>
                  <div className="text-muted-foreground truncate">
                    {device.location ?? device.zone ?? ""}
                    {latest?.fail_reason && status === "failed" && (
                      <span className="text-destructive"> · {latest.fail_reason}</span>
                    )}
                    {latest?.source && (
                      <span className="opacity-60"> · {latest.source.replace("_", " ")}</span>
                    )}
                  </div>
                </div>
                <StatusBadge status={status} />
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={status === "passed" ? "outline" : "ghost"}
                    className="h-7 px-2 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
                    disabled={busy === device.id || uploading}
                    onClick={() => recordTest(device, "passed")}
                    title="Mark tested / passed"
                  >
                    {busy === device.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={status === "failed" ? "outline" : "ghost"}
                    className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                    disabled={busy === device.id || uploading}
                    onClick={() => setFailModal(device)}
                    title="Mark failed"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <FailReasonDialog
        device={failModal}
        onCancel={() => setFailModal(null)}
        onConfirm={(reason) => {
          if (failModal) recordTest(failModal, "failed", reason);
          setFailModal(null);
        }}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: "passed" | "failed" | "untested" }) {
  if (status === "passed") {
    return (
      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
        <ClipboardCheck className="w-3 h-3 mr-1" /> Passed
      </Badge>
    );
  }
  if (status === "failed") {
    return <Badge variant="destructive" className="text-[10px]">Failed</Badge>;
  }
  return <Badge variant="outline" className="text-[10px] text-muted-foreground">Untested</Badge>;
}

function FailReasonDialog({
  device,
  onCancel,
  onConfirm,
}: {
  device: Device | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [otherNote, setOtherNote] = useState("");

  if (!device) return null;

  const reason = selected === "Other" ? otherNote.trim() : selected;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Record fail · {device.loop ? `L${device.loop}/` : ""}{device.address ?? "?"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {FAIL_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setSelected(r)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm border transition-colors ${
                selected === r
                  ? "border-destructive bg-destructive/5 text-destructive"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              {r}
            </button>
          ))}
          {selected === "Other" && (
            <Textarea
              autoFocus
              value={otherNote}
              onChange={(e) => setOtherNote(e.target.value)}
              placeholder="Describe the fault…"
              className="text-sm"
              rows={3}
            />
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!reason}
            onClick={() => reason && onConfirm(reason)}
          >
            Record fail
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
