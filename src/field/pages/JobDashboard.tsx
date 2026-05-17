import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { ClipboardList, Camera, Mic, Images, ChevronRight, Clock, WifiOff, Battery, CheckCircle2 } from "lucide-react";

export function JobDashboard() {
  const { visitId } = useParams<{ visitId: string }>();
  const navigate = useNavigate();
  const [elapsed, setElapsed] = useState("00:00");

  const { data: visit } = useQuery({
    queryKey: ["field-visit", visitId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("visits").select(`*, sites:site_id ( name )`).eq("id", visitId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!visitId,
  });

  useEffect(() => {
    if (visit && !visit.arrived_at) {
      navigate(`/field/job/${visitId}/briefing`, { replace: true });
    }
  }, [visit, visitId, navigate]);

  useEffect(() => {
    if (!visit?.arrived_at) return;
    const start = new Date(visit.arrived_at).getTime();
    const tick = () => {
      const ms = Date.now() - start;
      const mins = Math.floor(ms / 60000);
      const hours = Math.floor(mins / 60);
      setElapsed(`${String(hours).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`);
    };
    tick();
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, [visit?.arrived_at]);

  const { data: testCounts } = useQuery({
    queryKey: ["field-test-counts", visitId],
    queryFn: async () => {
      const { count: tested } = await (supabase as any).from("parsed_device_tests").select("*", { count: "exact", head: true }).eq("visit_id", visitId);
      const { count: defects } = await (supabase as any).from("site_defects").select("*", { count: "exact", head: true }).eq("visit_id", visitId);
      return { tested: tested ?? 0, defects: defects ?? 0 };
    },
    enabled: !!visitId,
    refetchInterval: 10000,
  });

  if (!visit) {
    return <div className="p-3"><div className="h-32 bg-white rounded-xl animate-pulse" /></div>;
  }

  const total = visit.total_devices ?? 0;
  const tested = testCounts?.tested ?? 0;
  const pct = total > 0 ? Math.round((tested / total) * 100) : 0;

  return (
    <div className="p-3">
      <div className="bg-white rounded-xl p-3 mb-2 flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-900 truncate">{visit.sites?.name}</p>
          <p className="text-xs text-zinc-500">{visit.visit_type || "Service visit"}</p>
        </div>
        <div className="flex items-center gap-1 text-xs font-mono text-zinc-700 bg-zinc-100 px-2 py-1 rounded-full">
          <Clock className="w-3 h-3" /> {elapsed}
        </div>
      </div>

      <div className="bg-white rounded-xl p-3 mb-2">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Devices tested this visit</p>
          <p className="text-xs font-medium text-zinc-900">{tested} / {total || "—"}</p>
        </div>
        <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
          <div className="h-full bg-[#C22126] transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <Tile icon={<ClipboardList className="w-5 h-5" />} label="Test devices" sub="Loop 1–4" onClick={() => navigate(`/field/job/${visitId}/test`)} />
        <Tile icon={<Camera className="w-5 h-5" />} label="Raise defect" sub={testCounts?.defects ? `${testCounts.defects} raised` : "Photo-first"} onClick={() => navigate(`/field/job/${visitId}/defect`)} />
      </div>

      <WideTile icon={<Mic className="w-5 h-5" />} label="Voice note" sub="Tap & hold to record" />
      <WideTile icon={<Images className="w-5 h-5" />} label="Photos" sub="Site, panel, plant room" />

      <button onClick={() => navigate(`/field/job/${visitId}/signoff`)} className="w-full bg-[#C22126] text-white rounded-lg py-3 mt-3 text-sm font-medium flex items-center justify-center gap-2 active:scale-[0.98]">
        <CheckCircle2 className="w-4 h-4" /> Finish & sign off
      </button>

      <div className="flex items-center justify-between text-[10px] text-zinc-400 mt-3">
        <span className="flex items-center gap-1">
          {navigator.onLine ? null : <WifiOff className="w-3 h-3" />}
          {navigator.onLine ? "Online · syncing" : "Offline · queued"}
        </span>
        <span className="flex items-center gap-1"><Battery className="w-3 h-3" /> Battery</span>
      </div>
    </div>
  );
}

function Tile({ icon, label, sub, onClick }: { icon: React.ReactNode; label: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="bg-white rounded-xl p-3 text-left active:scale-[0.98] transition">
      <div className="text-[#C22126] mb-1">{icon}</div>
      <p className="text-sm font-medium text-zinc-900">{label}</p>
      <p className="text-[10px] text-zinc-500">{sub}</p>
    </button>
  );
}

function WideTile({ icon, label, sub, onClick }: { icon: React.ReactNode; label: string; sub: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="w-full bg-white rounded-xl p-3 mb-2 flex items-center gap-3 active:scale-[0.99] transition">
      <div className="text-[#C22126]">{icon}</div>
      <div className="flex-1 text-left">
        <p className="text-sm font-medium text-zinc-900">{label}</p>
        <p className="text-[10px] text-zinc-500">{sub}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-zinc-300" />
    </button>
  );
}
