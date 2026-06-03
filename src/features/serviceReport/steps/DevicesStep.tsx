import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, Check, X, Search, ArrowLeftRight, RotateCcw, Eraser } from "lucide-react";
import { parseCSV, parseTXT, type ParseResult } from "@/lib/parsers/csvParser";
import { parsePDF } from "@/lib/parsers/pdfParser";
import { saveFileUpload, ensureManualTicksUploadId } from "@/services/uploadService";

interface Props {
  visitId: string;
  siteId: string;
}

interface Device {
  id: string;
  loop: string | null;
  address: string | null;
  zone: string | null;
  device_type: string | null;
  location: string | null;
  raw_import_data: Record<string, unknown> | null;
}

interface TestRecord {
  device_id: string | null;
  loop: string | null;
  address: string | null;
  status: string;
  created_at: string;
  fail_reason: string | null;
}

type Result = "passed" | "failed" | "untested";

// Group raw `device_type` strings (which come from various panel exports
// — Gent, Notifier, Honeywell, free-text Excel pastes) into four
// high-level categories the engineer thinks in: outputs (anything that
// activates on alarm), detectors (anything that originates an alarm
// from environmental sensing), call points (manual activation), and
// other (modules, interfaces classified separately, isolators).
type DeviceCategory = "outputs" | "detectors" | "call_points" | "other";

function categorize(deviceType: string | null | undefined): DeviceCategory {
  const t = (deviceType ?? "").toLowerCase();
  if (!t) return "other";
  // Order matters: check call points first because "MCP" can substring
  // into other terms, and check "sounder/VAD" before "detector".
  if (/\b(mcp|call\s*point|break\s*glass|manual\s*call)\b/.test(t)) return "call_points";
  if (/\b(sounder|vad|beacon|strobe|bell|horn|interface|relay|module|door\s*holder|magnet)\b/.test(t)) return "outputs";
  if (/\b(detector|smoke|heat|optical|ionisation|multi[\s-]?sensor|beam|aspir|co\b)\b/.test(t)) return "detectors";
  return "other";
}

const CATEGORY_LABELS: Record<DeviceCategory, string> = {
  outputs: "Outputs",
  detectors: "Detectors",
  call_points: "Call points",
  other: "Other",
};

const FAIL_REASONS = [
  "No response to test",
  "Damaged",
  "Contaminated",
  "Missing",
  "End of life",
  "Wiring fault",
  "Other",
];

const SWIPE_THRESHOLD = 80;

function normalize(raw: string | null | undefined): Result {
  if (!raw) return "untested";
  const v = raw.toLowerCase();
  if (v.startsWith("pass")) return "passed";
  if (v.startsWith("fail") || v.startsWith("fault")) return "failed";
  return "untested";
}

// Brentside (and probably others) imported devices with the location text
// living in a free-form CSV column like "Description" rather than mapped
// into the normalised `location` field. Look at raw_import_data when the
// normalised location is empty, trying common header names first, then
// falling back to whichever non-core column has a long enough value to
// be a description.
const LOCATION_LIKE_KEYS = [
  "location",
  "description",
  "desc",
  "address description",
  "address text",
  "label",
  "text",
  "detail",
  "details",
  "fitting",
  "fitting description",
];
const CORE_KEYS = new Set(["loop", "address", "type", "device type", "zone", "status", "id"]);

// Real location descriptions contain prose (e.g. "GROUND FLOOR STAIR 1").
// Bare numbers or single tokens like "1", "MCP", "L1" are addresses, type
// codes, or loop labels that shouldn't headline the row.
function isLikelyDescription(v: string): boolean {
  const t = v.trim();
  if (t.length < 3) return false;
  if (!/[a-zA-Z]{2,}/.test(t)) return false; // require ≥2 consecutive letters
  if (/^[A-Z0-9]{1,6}$/.test(t)) return false; // short all-caps codes like MCP, S4MV
  return true;
}

function deviceLabel(device: Device): string | null {
  if (device.location && isLikelyDescription(device.location)) {
    return device.location.trim();
  }
  const raw = device.raw_import_data;
  if (!raw || typeof raw !== "object") return null;
  // Lowercase keys to match LOCATION_LIKE_KEYS / CORE_KEYS case-insensitively.
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string" && v.trim()) lower[k.toLowerCase().trim()] = v.trim();
  }
  // Try known description keys first, but only accept prose-shaped values.
  for (const key of LOCATION_LIKE_KEYS) {
    const v = lower[key];
    if (v && isLikelyDescription(v)) return v;
  }
  // Fall back to the longest non-core string value, prose-shaped only.
  let best: string | null = null;
  for (const [k, v] of Object.entries(lower)) {
    if (CORE_KEYS.has(k)) continue;
    if (!isLikelyDescription(v)) continue;
    if (!best || v.length > best.length) best = v;
  }
  return best;
}

export function DevicesStep({ visitId, siteId }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [loopFilter, setLoopFilter] = useState<string | null>(null);
  const [zoneFilter, setZoneFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<DeviceCategory | null>(null);
  const [hideTested, setHideTested] = useState(true);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [failModal, setFailModal] = useState<Device | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const devicesQuery = useQuery({
    queryKey: ["sr-devices", siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devices")
        .select("id, loop, address, zone, device_type, location, raw_import_data")
        .eq("site_id", siteId)
        .order("loop")
        .order("address");
      if (error) throw error;
      return (data ?? []) as Device[];
    },
    enabled: !!siteId,
  });

  const testsQuery = useQuery({
    queryKey: ["sr-tests", visitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parsed_device_tests")
        .select("device_id, loop, address, status, created_at, fail_reason")
        .eq("visit_id", visitId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TestRecord[];
    },
    enabled: !!visitId,
  });

  const testByDevice = useMemo(() => {
    const byId = new Map<string, TestRecord>();
    const byKey = new Map<string, TestRecord>();
    for (const t of testsQuery.data ?? []) {
      if (t.device_id && !byId.has(t.device_id)) byId.set(t.device_id, t);
      const key = `${t.loop ?? ""}|${t.address ?? ""}`;
      if (!byKey.has(key)) byKey.set(key, t);
    }
    return { byId, byKey };
  }, [testsQuery.data]);

  const lookupTest = (d: Device): TestRecord | null =>
    testByDevice.byId.get(d.id) ?? testByDevice.byKey.get(`${d.loop ?? ""}|${d.address ?? ""}`) ?? null;

  const loops = useMemo(() => {
    const s = new Set<string>();
    (devicesQuery.data ?? []).forEach((d) => { if (d.loop) s.add(d.loop); });
    return [...s].sort();
  }, [devicesQuery.data]);

  const zones = useMemo(() => {
    const s = new Set<string>();
    (devicesQuery.data ?? []).forEach((d) => { if (d.zone) s.add(d.zone); });
    return [...s].sort();
  }, [devicesQuery.data]);

  // Category counts drive whether each filter chip renders — we hide
  // the chip when the site has zero devices of that type so the row
  // doesn't get cluttered with empty buckets.
  const categoryCounts = useMemo(() => {
    const c: Record<DeviceCategory, number> = { outputs: 0, detectors: 0, call_points: 0, other: 0 };
    for (const d of devicesQuery.data ?? []) {
      c[categorize(d.device_type)]++;
    }
    return c;
  }, [devicesQuery.data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (devicesQuery.data ?? []).filter((d) => {
      if (loopFilter && d.loop !== loopFilter) return false;
      if (zoneFilter && d.zone !== zoneFilter) return false;
      if (categoryFilter && categorize(d.device_type) !== categoryFilter) return false;
      if (hideTested && lookupTest(d)) return false;
      if (term) {
        const rawValues = d.raw_import_data && typeof d.raw_import_data === "object"
          ? Object.values(d.raw_import_data).filter((v): v is string => typeof v === "string").join(" ")
          : "";
        const hay = `${d.loop ?? ""} ${d.address ?? ""} ${d.device_type ?? ""} ${d.location ?? ""} ${d.zone ?? ""} ${rawValues}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [devicesQuery.data, loopFilter, zoneFilter, categoryFilter, search, hideTested, testByDevice]);

  const counts = useMemo(() => {
    let passed = 0, failed = 0, untested = 0;
    for (const d of devicesQuery.data ?? []) {
      const r = normalize(lookupTest(d)?.status);
      if (r === "passed") passed++;
      else if (r === "failed") failed++;
      else untested++;
    }
    const total = (devicesQuery.data ?? []).length;
    return { passed, failed, untested, total, tested: passed + failed };
  }, [devicesQuery.data, testByDevice]);

  const coverage = counts.total > 0 ? Math.round((counts.tested / counts.total) * 100) : 0;

  const recordTest = async (device: Device, status: "passed" | "failed", failReason?: string) => {
    setBusy(device.id);
    try {
      const { data: userData } = await supabase.auth.getUser();
      // engineer_id references profiles(id), not auth.users(id) — look up profile.
      let engineerProfileId: string | null = null;
      if (userData.user?.id) {
        const { data: prof } = await (supabase as any)
          .from("profiles")
          .select("id")
          .eq("user_id", userData.user.id)
          .maybeSingle();
        engineerProfileId = prof?.id ?? null;
      }
      // Match the table's CHECK constraint exactly: passed | fault | untested | unknown.
      // Internally the UI uses "failed" for clarity, but the DB stores "fault".
      const dbStatus = status === "failed" ? "fault" : "passed";
      // Ensure a synthetic file_uploads row exists so the upload_id
      // NOT NULL constraint is satisfied on envs where the relaxing
      // migration hasn't applied. One row per visit, reused across ticks.
      const uploadId = await ensureManualTicksUploadId(visitId, siteId);
      const { error } = await (supabase as any).from("parsed_device_tests").insert({
        visit_id: visitId,
        device_id: device.id,
        loop: device.loop,
        address: device.address,
        device_type: device.device_type,
        location: device.location,
        status: dbStatus,
        fail_reason: failReason ?? null,
        engineer_id: engineerProfileId,
        tested_at: new Date().toISOString(),
        source: "service_report_capture",
        matched: true,
        upload_id: uploadId,
      });
      if (error) throw error;

      // Bump the device's last_tested_at and (for failed devices) flag
      // the row as faulty so the Inventory column and every other surface
      // that reads from `devices` reflects what just happened. Fire-and-
      // forget — the test record is already saved and the wizard's own
      // progress bar updates from parsed_device_tests, so a write here
      // shouldn't block the engineer's next tap.
      void (supabase as any)
        .from("devices")
        .update({
          last_tested_at: new Date().toISOString(),
          ...(status === "failed" ? { status: "faulty" } : {}),
        })
        .eq("id", device.id)
        .then(
          () => {
            qc.invalidateQueries({ queryKey: ["sr-devices", siteId] });
          },
          (e: unknown) => console.warn("devices.last_tested_at update failed:", e),
        );

      void (supabase as any).rpc("increment_visit_tested", { vid: visitId }).then(() => {}, () => {});
      qc.invalidateQueries({ queryKey: ["sr-tests", visitId] });
    } catch (err) {
      // Supabase PostgrestError isn't an Error subclass, so `.message`
      // needs digging out by hand — otherwise `String(err)` ends up as
      // "[object Object]" in the toast.
      const message =
        err instanceof Error
          ? err.message
          : err && typeof err === "object" && "message" in err && typeof (err as { message?: unknown }).message === "string"
            ? (err as { message: string }).message
            : JSON.stringify(err);
      toast({
        title: "Couldn't record test",
        description: message,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  // Bulk-mark every visible (currently filtered) untested device as
  // passed. Confined to filtered+untested so the engineer can scope the
  // action via category/loop/zone chips first ("show me only sounders" →
  // "bulk pass all") rather than accidentally passing the whole site.
  const bulkPassFiltered = async () => {
    const targets = filtered.filter((d) => normalize(lookupTest(d)?.status) === "untested");
    if (targets.length === 0) {
      toast({ title: "Nothing to mark", description: "All visible devices are already tested." });
      return;
    }
    const label = categoryFilter ? CATEGORY_LABELS[categoryFilter].toLowerCase() : "device";
    if (!window.confirm(
      `Mark ${targets.length} visible ${label}${targets.length === 1 ? "" : "s"} as PASSED?`,
    )) return;
    setBulkBusy(true);
    try {
      // recordTest already runs sequentially per call; doing them in
      // parallel would race the toast + the file_uploads ensure call.
      // Keep it sequential — typical bulk is <50 devices, takes a few
      // seconds with a progress feel.
      let okCount = 0;
      for (const d of targets) {
        try {
          await recordTest(d, "passed");
          okCount++;
        } catch (e) {
          console.error("bulk pass failed for device", d.id, e);
        }
      }
      toast({
        title: `Marked ${okCount} as passed`,
        description: okCount < targets.length ? `${targets.length - okCount} failed — see console.` : undefined,
      });
    } finally {
      setBulkBusy(false);
    }
  };

  // Inverse of bulkPassFiltered — clear the PASS status on every visible
  // device that's currently marked passed, so the engineer can re-test
  // a scope they ticked in error (e.g. wrong loop bulk-passed, then
  // re-filtered to that loop). Deletes only "passed" parsed_device_tests
  // rows on this visit for the targets — never touches FAULT rows or
  // tests against the device on other visits.
  const bulkClearPassFiltered = async () => {
    const targets = filtered.filter((d) => normalize(lookupTest(d)?.status) === "passed");
    if (targets.length === 0) {
      toast({ title: "Nothing to clear", description: "No visible devices are currently passed." });
      return;
    }
    const label = categoryFilter ? CATEGORY_LABELS[categoryFilter].toLowerCase() : "device";
    if (!window.confirm(
      `Clear PASS on ${targets.length} visible ${label}${targets.length === 1 ? "" : "s"}? They'll show as not tested again.`,
    )) return;
    setBulkBusy(true);
    try {
      const ids = targets.map((d) => d.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("parsed_device_tests")
        .delete()
        .eq("visit_id", visitId)
        .eq("status", "passed")
        .in("device_id", ids);
      if (error) throw error;
      toast({ title: `Cleared pass on ${targets.length}` });
      qc.invalidateQueries({ queryKey: ["sr-tests", visitId] });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : err && typeof err === "object" && "message" in err && typeof (err as { message?: unknown }).message === "string"
            ? (err as { message: string }).message
            : JSON.stringify(err);
      toast({ title: "Couldn't clear", description: message, variant: "destructive" });
    } finally {
      setBulkBusy(false);
    }
  };

  // Nuclear version of bulkClearPassFiltered — wipes every test row
  // (pass and fault) on this visit for the currently filtered devices.
  // Useful for "imported wrong panel log, start the visit again" without
  // having to unpick passes and faults separately.
  const bulkClearAllFiltered = async () => {
    const targets = filtered.filter((d) => {
      const s = normalize(lookupTest(d)?.status);
      return s === "passed" || s === "fault";
    });
    if (targets.length === 0) {
      toast({ title: "Nothing to clear", description: "No visible devices have test results." });
      return;
    }
    const label = categoryFilter ? CATEGORY_LABELS[categoryFilter].toLowerCase() : "device";
    if (!window.confirm(
      `Clear ALL test results on ${targets.length} visible ${label}${targets.length === 1 ? "" : "s"}? Both PASS and FAULT records will be removed for this visit.`,
    )) return;
    setBulkBusy(true);
    try {
      const ids = targets.map((d) => d.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("parsed_device_tests")
        .delete()
        .eq("visit_id", visitId)
        .in("device_id", ids);
      if (error) throw error;
      toast({ title: `Cleared results on ${targets.length}` });
      qc.invalidateQueries({ queryKey: ["sr-tests", visitId] });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : err && typeof err === "object" && "message" in err && typeof (err as { message?: unknown }).message === "string"
            ? (err as { message: string }).message
            : JSON.stringify(err);
      toast({ title: "Couldn't clear", description: message, variant: "destructive" });
    } finally {
      setBulkBusy(false);
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
      qc.invalidateQueries({ queryKey: ["sr-tests", visitId] });
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

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold">Devices tested</h3>
        <p className="text-xs text-muted-foreground">
          Swipe right to pass, left to fail. Or upload a panel log to import bulk results.
        </p>
      </div>

      {/* Coverage bar */}
      <div className="rounded-lg border bg-card p-3 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-sm">
            <span className="font-semibold">{counts.tested}</span>
            <span className="text-muted-foreground"> of </span>
            <span className="font-semibold">{counts.total}</span>
            <span className="text-muted-foreground"> tested · {coverage}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            {counts.passed > 0 && (
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">
                {counts.passed} passed
              </Badge>
            )}
            {counts.failed > 0 && (
              <Badge variant="destructive" className="text-[10px]">{counts.failed} failed</Badge>
            )}
            {counts.untested > 0 && (
              <Badge variant="outline" className="text-[10px]">{counts.untested} left</Badge>
            )}
          </div>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden flex">
          {counts.passed > 0 && (
            <div className="bg-emerald-500" style={{ width: `${(counts.passed / counts.total) * 100}%` }} />
          )}
          {counts.failed > 0 && (
            <div className="bg-destructive" style={{ width: `${(counts.failed / counts.total) * 100}%` }} />
          )}
        </div>
      </div>

      {/* Filter chips + search */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Category chips — quick way to scope to outputs (sounders +
            VADs + interfaces), detectors (smoke/heat/multi), or call
            points. Useful for C&E testing where you want to "bulk pass
            all sounders" or similar. Each chip hides when the site has
            zero devices of that category. */}
        <div className="flex flex-wrap gap-1">
          <Chip active={!categoryFilter} onClick={() => setCategoryFilter(null)}>All types</Chip>
          {(["outputs", "detectors", "call_points"] as const).map((cat) =>
            categoryCounts[cat] > 0 ? (
              <Chip
                key={cat}
                active={categoryFilter === cat}
                onClick={() => setCategoryFilter((c) => (c === cat ? null : cat))}
              >
                {CATEGORY_LABELS[cat]} · {categoryCounts[cat]}
              </Chip>
            ) : null,
          )}
        </div>
        {loops.length > 1 && (
          <div className="flex flex-wrap gap-1">
            <Chip active={!loopFilter} onClick={() => setLoopFilter(null)}>All loops</Chip>
            {loops.map((l) => (
              <Chip key={l} active={loopFilter === l} onClick={() => setLoopFilter(l)}>L{l}</Chip>
            ))}
          </div>
        )}
        {zones.length > 0 && zones.length <= 12 && (
          <div className="flex flex-wrap gap-1">
            {zones.length > 1 && <Chip active={!zoneFilter} onClick={() => setZoneFilter(null)}>All zones</Chip>}
            {zones.map((z) => (
              <Chip key={z} active={zoneFilter === z} onClick={() => setZoneFilter(z)}>Z{z}</Chip>
            ))}
          </div>
        )}
        <Chip active={hideTested} onClick={() => setHideTested((v) => !v)}>
          {hideTested ? "Hiding tested" : "Showing all"}
        </Chip>
      </div>

      {/* Bulk action — pass everything currently visible. Shown only
          when there's at least one untested visible device so the
          button doesn't sit dead at the end of a fully-tested list. */}
      {filtered.some((d) => normalize(lookupTest(d)?.status) === "untested") && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          disabled={bulkBusy}
          onClick={bulkPassFiltered}
        >
          {bulkBusy ? (
            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Marking…</>
          ) : (
            <><Check className="w-3.5 h-3.5 mr-1.5" /> Mark {filtered.filter((d) => normalize(lookupTest(d)?.status) === "untested").length} visible as PASS</>
          )}
        </Button>
      )}

      {filtered.some((d) => normalize(lookupTest(d)?.status) === "passed") && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          disabled={bulkBusy}
          onClick={bulkClearPassFiltered}
        >
          {bulkBusy ? (
            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Clearing…</>
          ) : (
            <><RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Clear pass on {filtered.filter((d) => normalize(lookupTest(d)?.status) === "passed").length} visible</>
          )}
        </Button>
      )}

      {filtered.some((d) => {
        const s = normalize(lookupTest(d)?.status);
        return s === "passed" || s === "fault";
      }) && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          disabled={bulkBusy}
          onClick={bulkClearAllFiltered}
        >
          {bulkBusy ? (
            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Clearing…</>
          ) : (
            <><Eraser className="w-3.5 h-3.5 mr-1.5" /> Clear test results on {filtered.filter((d) => { const s = normalize(lookupTest(d)?.status); return s === "passed" || s === "fault"; }).length} visible</>
          )}
        </Button>
      )}

      <div className="relative">
        <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
        <Input
          placeholder="Search address, location, type…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 pl-8 text-sm"
        />
      </div>

      {/* Bulk import */}
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
        className="w-full"
        disabled={uploading}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
        Upload panel log (CSV / TXT / PDF)
      </Button>

      {/* Device list */}
      {devicesQuery.isLoading ? (
        <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading devices…
        </div>
      ) : counts.total === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          This site has no devices imported yet.
          <div className="text-xs mt-1">Add the device list on the site page first.</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border bg-card p-6 text-center">
          <p className="text-sm font-medium">
            {counts.untested === 0 ? "All devices tested" : "No devices match these filters"}
          </p>
          {counts.untested === 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {counts.failed > 0 ? `${counts.failed} failures captured — review on the next step.` : "Nothing left to test."}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((d) => {
            const test = lookupTest(d);
            const result = normalize(test?.status);
            return (
              <DeviceCard
                key={d.id}
                device={d}
                result={result}
                busy={busy === d.id}
                onPass={() => recordTest(d, "passed")}
                onFail={() => setFailModal(d)}
              />
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

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-muted-foreground border-border hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function DeviceCard({
  device,
  result,
  busy,
  onPass,
  onFail,
}: {
  device: Device;
  result: Result;
  busy: boolean;
  onPass: () => void;
  onFail: () => void;
}) {
  const [dx, setDx] = useState(0);
  const [animating, setAnimating] = useState(false);
  const startX = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    setAnimating(false);
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    const x = e.touches[0].clientX - startX.current;
    setDx(Math.max(-180, Math.min(180, x)));
  };
  const handleTouchEnd = () => {
    setAnimating(true);
    if (dx > SWIPE_THRESHOLD) {
      setDx(0);
      onPass();
    } else if (dx < -SWIPE_THRESHOLD) {
      setDx(0);
      onFail();
    } else {
      setDx(0);
    }
  };

  const passOpacity = dx > 0 ? Math.min(dx / SWIPE_THRESHOLD, 1) : 0;
  const failOpacity = dx < 0 ? Math.min(-dx / SWIPE_THRESHOLD, 1) : 0;

  const bgClass =
    result === "passed"
      ? "bg-emerald-50 border-emerald-200"
      : result === "failed"
        ? "bg-destructive/5 border-destructive/30"
        : "bg-card border-border";

  return (
    <div className="relative h-16 overflow-hidden rounded-xl border">
      <div
        className="absolute inset-y-0 inset-x-0 bg-emerald-600 flex items-center justify-start pl-5 gap-2 text-white text-sm font-semibold"
        style={{ opacity: passOpacity }}
      >
        <Check className="w-4 h-4" /> PASS
      </div>
      <div
        className="absolute inset-y-0 inset-x-0 bg-destructive flex items-center justify-end pr-5 gap-2 text-white text-sm font-semibold"
        style={{ opacity: failOpacity }}
      >
        FAIL <X className="w-4 h-4" />
      </div>
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`absolute inset-0 flex items-center justify-between px-3 select-none ${bgClass}`}
        style={{
          transform: `translateX(${dx}px)`,
          transition: animating ? "transform 0.18s ease-out" : "none",
          touchAction: "pan-y",
        }}
      >
        <div className="min-w-0 flex-1 pr-2">
          {/* Primary line: the device's location / description from the
              imported inventory (falling back to raw_import_data when the
              normalised location column is empty), plus the device type. */}
          {(() => {
            const label = deviceLabel(device);
            return (
              <p className="text-sm font-medium truncate">
                {label ?? `${device.loop ? `L${device.loop}/` : ""}${device.address ?? "?"}`}
                <span className="text-muted-foreground font-normal"> · {device.device_type ?? "Device"}</span>
              </p>
            );
          })()}
          {/* Secondary line: always show loop/address + Zone X so the
              engineer can pinpoint the device on the panel regardless of
              whether the headline came from location data. */}
          <p className="text-[11px] text-muted-foreground truncate">
            {[
              `${device.loop ? `L${device.loop}/` : ""}${device.address ?? "?"}`,
              device.zone ? `Zone ${device.zone}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {result !== "untested" && (
            <Badge
              variant={result === "passed" ? "outline" : "destructive"}
              className={
                result === "passed"
                  ? "bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]"
                  : "text-[10px]"
              }
            >
              {result === "passed" ? "Passed" : "Failed"}
            </Badge>
          )}
          {/* Desktop / non-touch fallback buttons */}
          <button
            type="button"
            aria-label="Pass"
            onClick={onPass}
            disabled={busy}
            className="hidden sm:flex h-8 w-8 items-center justify-center rounded-md border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-4 h-4" />}
          </button>
          <button
            type="button"
            aria-label="Fail"
            onClick={onFail}
            disabled={busy}
            className="hidden sm:flex h-8 w-8 items-center justify-center rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
          <ArrowLeftRight className="w-3 h-3 text-muted-foreground/50 sm:hidden" />
        </div>
      </div>
    </div>
  );
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
    <Dialog open onOpenChange={(open) => { if (!open) { setSelected(null); setOtherNote(""); onCancel(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Record fail · {device.loop ? `L${device.loop}/` : ""}{device.address ?? "?"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-[55vh] overflow-y-auto">
          {FAIL_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setSelected(r)}
              className={`w-full text-left px-3 py-2.5 rounded-md text-sm border transition-colors ${
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
          <Button type="button" variant="ghost" onClick={() => { setSelected(null); setOtherNote(""); onCancel(); }}>
            Cancel
          </Button>
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
