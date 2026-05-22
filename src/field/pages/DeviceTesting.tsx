import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { SwipeRow } from "../components/SwipeRow";
import { useOfflineQueue } from "../hooks/useOfflineQueue";
import { ChevronDown, X, Camera } from "lucide-react";

interface Device {
  id: string;
  loop: string | null;
  zone: string | null;
  address: string | null;
  device_type: string | null;
  location: string | null;
}

export function DeviceTesting() {
  const { visitId } = useParams<{ visitId: string }>();
  const qc = useQueryClient();
  const { enqueue } = useOfflineQueue();
  const [loopFilter, setLoopFilter] = useState<string | null>(null);
  const [zoneFilter, setZoneFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [failModal, setFailModal] = useState<Device | null>(null);

  const { data: visit } = useQuery({
    queryKey: ["field-visit-min", visitId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("service_visits").select("id, site_id").eq("id", visitId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!visitId,
  });

  const { data: devices } = useQuery({
    queryKey: ["field-devices", visit?.site_id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("devices").select("id, loop, zone, address, device_type, location").eq("site_id", visit!.site_id).order("loop").order("zone").order("address");
      if (error) throw error;
      return data as Device[];
    },
    enabled: !!visit?.site_id,
  });

  const { data: tested } = useQuery({
    queryKey: ["field-tests", visitId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("parsed_device_tests").select("device_id, status").eq("visit_id", visitId);
      if (error) throw error;
      return new Map<string, string>(data?.map((t: any) => [t.device_id, t.status]) ?? []);
    },
    enabled: !!visitId,
  });

  const recordTest = useMutation({
    mutationFn: async (params: { device: Device; status: "pass" | "fail"; failReason?: string }) => {
      const { data: user } = await supabase.auth.getUser();
      const payload = {
        visit_id: visitId!,
        device_id: params.device.id,
        loop: params.device.loop,
        address: params.device.address,
        device_type: params.device.device_type,
        location: params.device.location,
        status: params.status,
        fail_reason: params.failReason ?? null,
        engineer_id: user.user?.id,
        tested_at: new Date().toISOString(),
        source: "engineer_app",
        matched: true,
      };
      if (!navigator.onLine) {
        enqueue({ table: "parsed_device_tests", payload });
        return;
      }
      const { error } = await (supabase as any).from("parsed_device_tests").insert(payload);
      if (error) enqueue({ table: "parsed_device_tests", payload });
      await (supabase as any).rpc("increment_visit_tested", { vid: visitId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["field-tests", visitId] });
      qc.invalidateQueries({ queryKey: ["field-test-counts", visitId] });
    },
  });

  const { loops, zones, types } = useMemo(() => {
    const ls = new Set<string>(), zs = new Set<string>(), ts = new Set<string>();
    devices?.forEach((d) => { if (d.loop) ls.add(d.loop); if (d.zone) zs.add(d.zone); if (d.device_type) ts.add(d.device_type); });
    return { loops: [...ls].sort(), zones: [...zs].sort(), types: [...ts].sort() };
  }, [devices]);

  const filtered = useMemo(() => {
    if (!devices) return [];
    return devices
      .filter((d) => !loopFilter || d.loop === loopFilter)
      .filter((d) => !zoneFilter || d.zone === zoneFilter)
      .filter((d) => !typeFilter || d.device_type === typeFilter)
      .sort((a, b) => (tested?.has(a.id) ? 1 : 0) - (tested?.has(b.id) ? 1 : 0));
  }, [devices, loopFilter, zoneFilter, typeFilter, tested]);

  const untested = filtered.filter((d) => !tested?.has(d.id));

  return (
    <div className="p-3">
      <div className="flex flex-wrap gap-1.5 mb-2">
        <FilterChip label={loopFilter ? `Loop ${loopFilter}` : "Loop"} options={loops.map((l) => ({ value: l, label: `Loop ${l}` }))} value={loopFilter} onChange={setLoopFilter} />
        <FilterChip label={zoneFilter ? `Zone ${zoneFilter}` : "Zone"} options={zones.map((z) => ({ value: z, label: `Zone ${z}` }))} value={zoneFilter} onChange={setZoneFilter} />
        <FilterChip label={typeFilter || "Type"} options={types.map((t) => ({ value: t, label: t }))} value={typeFilter} onChange={setTypeFilter} />
      </div>

      <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-2">
        {untested.length} of {filtered.length} remaining · swipe → pass · ← fail
      </p>

      {untested.length === 0 && filtered.length > 0 && (
        <div className="bg-white rounded-xl p-4 text-center text-sm text-zinc-500 mb-2">
          All devices in this filter tested.
        </div>
      )}

      {filtered.map((d) => (
        <SwipeRow
          key={d.id}
          primary={`${d.loop ? `L${d.loop}/` : ""}${d.address ?? "?"} · ${d.device_type ?? "Device"}`}
          secondary={d.location ?? d.zone ?? ""}
          hasHistory={tested?.has(d.id)}
          lastResult={(tested?.get(d.id) as "pass" | "fail") ?? null}
          onPass={() => recordTest.mutate({ device: d, status: "pass" })}
          onFail={() => setFailModal(d)}
        />
      ))}

      {filtered.length === 0 && <p className="text-sm text-zinc-400 text-center py-8">No devices match these filters.</p>}

      {failModal && (
        <FailModal
          device={failModal}
          onCancel={() => setFailModal(null)}
          onConfirm={(r) => { recordTest.mutate({ device: failModal, status: "fail", failReason: r }); setFailModal(null); }}
        />
      )}
    </div>
  );
}

function FilterChip({ label, options, value, onChange }: { label: string; options: { value: string; label: string }[]; value: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] border ${value ? "bg-[#C22126] text-white border-[#C22126]" : "bg-white text-zinc-700 border-zinc-200"}`}>
        {label} <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-zinc-200 rounded-lg shadow-lg z-20 min-w-[120px] max-h-64 overflow-y-auto">
          <button onClick={() => { onChange(null); setOpen(false); }} className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-50">Clear</button>
          {options.map((o) => (
            <button key={o.value} onClick={() => { onChange(o.value); setOpen(false); }} className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-50">{o.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

const FAIL_REASONS = ["No response to test", "Damaged", "Contaminated", "Missing", "End of life", "Wiring fault", "Other"];

function FailModal({ device, onCancel, onConfirm }: { device: Device; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={onCancel}>
      <div className="bg-white w-full max-w-screen-sm mx-auto rounded-t-2xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-zinc-900">Fail reason · {device.address}</p>
          <button onClick={onCancel}><X className="w-5 h-5 text-zinc-400" /></button>
        </div>
        <div className="space-y-1.5 mb-3">
          {FAIL_REASONS.map((r) => (
            <button key={r} onClick={() => setSelected(r)} className={`w-full text-left px-3 py-2.5 rounded-lg text-sm border ${selected === r ? "border-[#C22126] bg-[#FCEBEB] text-[#791F1F]" : "border-zinc-200 text-zinc-700"}`}>{r}</button>
          ))}
        </div>
        <button onClick={() => alert("Camera capture in v1.1")} className="w-full text-xs font-medium text-[#C22126] border border-[#C22126] rounded-lg py-2 flex items-center justify-center gap-2 mb-2">
          <Camera className="w-4 h-4" /> Add photo (recommended)
        </button>
        <button disabled={!selected} onClick={() => onConfirm(selected!)} className="w-full bg-[#C22126] text-white rounded-lg py-3 text-sm font-medium disabled:opacity-50">Record fail</button>
      </div>
    </div>
  );
}
