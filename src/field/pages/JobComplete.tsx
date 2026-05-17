import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Navigation, Home } from "lucide-react";

export function JobComplete() {
  const { visitId } = useParams<{ visitId: string }>();
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["field-complete", visitId],
    queryFn: async () => {
      const { data: visit, error } = await (supabase as any).from("visits").select(`*, sites:site_id ( name )`).eq("id", visitId).single();
      if (error) throw error;
      const { count: tested } = await (supabase as any).from("parsed_device_tests").select("*", { count: "exact", head: true }).eq("visit_id", visitId);
      const { count: defects } = await (supabase as any).from("site_defects").select("*", { count: "exact", head: true }).eq("visit_id", visitId);
      const { data: user } = await supabase.auth.getUser();
      const today = new Date().toISOString().slice(0, 10);
      const { data: nextJobs } = await (supabase as any).from("visits").select(`id, visit_type, sites:site_id ( name, postcode )`).eq("engineer_id", user.user?.id).eq("visit_date", today).neq("status", "completed").neq("id", visitId).limit(1);
      const mins = visit.arrived_at && visit.departed_at ? Math.round((new Date(visit.departed_at).getTime() - new Date(visit.arrived_at).getTime()) / 60000) : 0;
      return { visit, tested: tested ?? 0, defects: defects ?? 0, nextJob: nextJobs?.[0], mins };
    },
    enabled: !!visitId,
  });

  if (!data) return <p className="p-4 text-sm text-zinc-500">Loading…</p>;

  const labourHours = data.mins / 60;
  const labour = Math.round(labourHours * 85);

  return (
    <div className="p-3 text-center">
      <CheckCircle2 className="w-14 h-14 text-[#137334] mx-auto mt-4 mb-2" />
      <h2 className="text-lg font-semibold text-zinc-900">{data.visit.sites?.name} · signed off</h2>
      <p className="text-xs text-zinc-500 mb-4">Certificate emailed · synced to FireLogbook</p>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-white rounded-xl p-3">
          <p className="text-base font-semibold text-zinc-900">£{labour}</p>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Labour billed</p>
        </div>
        <div className="bg-white rounded-xl p-3">
          <p className="text-base font-semibold text-zinc-900">{data.defects}</p>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Defects raised</p>
        </div>
      </div>

      {data.nextJob ? (
        <div className="bg-white rounded-xl p-3 mb-3 text-left">
          <p className="text-[10px] uppercase tracking-wider text-[#C22126] font-bold">Up next</p>
          <p className="text-sm font-medium text-zinc-900">{data.nextJob.sites?.name}</p>
          <p className="text-xs text-zinc-500">{data.nextJob.sites?.postcode} · {data.nextJob.visit_type}</p>
        </div>
      ) : (
        <p className="text-sm text-zinc-500 mb-3">No more jobs today.</p>
      )}

      <button onClick={() => data.nextJob ? navigate(`/field/job/${data.nextJob.id}`) : navigate("/field")} className="w-full bg-[#C22126] text-white rounded-lg py-3 text-sm font-medium flex items-center justify-center gap-2">
        {data.nextJob ? <><Navigation className="w-4 h-4" /> Start next job</> : <><Home className="w-4 h-4" /> Return to today</>}
      </button>
    </div>
  );
}
