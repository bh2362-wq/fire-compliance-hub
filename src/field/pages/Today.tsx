import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, ChevronRight, Home } from "lucide-react";
import { format } from "date-fns";

interface VisitWithSite {
  id: string;
  visit_date: string;
  visit_type: string | null;
  status: string | null;
  devices_tested: number | null;
  total_devices: number | null;
  sites: { id: string; name: string; address: string | null; city: string | null; postcode: string | null } | null;
}

export function Today() {
  const navigate = useNavigate();
  const { data: currentUser } = useQuery({
    queryKey: ["field-current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });
  const { data: visits, isLoading } = useQuery({
    queryKey: ["field-today"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");
      const today = format(new Date(), "yyyy-MM-dd");
      const { data, error } = await (supabase as any)
        .from("visits")
        .select(`id, visit_date, visit_type, status, devices_tested, total_devices, sites:site_id ( id, name, address, city, postcode )`)
        .eq("engineer_id", user.user.id)
        .eq("visit_date", today)
        .order("visit_date", { ascending: true });
      if (error) throw error;
      return data as unknown as VisitWithSite[];
    },
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="p-3 space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-white rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  const nextJob = visits?.find((v) => v.status !== "completed");
  const remainingJobs = visits?.filter((v) => v.id !== nextJob?.id) ?? [];

  return (
    <div className="p-3">
      <div className="mb-3">
        <p className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
          {visits?.length ?? 0} {visits?.length === 1 ? "job" : "jobs"}
        </p>
        <p className="text-sm text-zinc-700">{visits?.length === 0 ? "Nothing scheduled" : "Tap to start"}</p>
      </div>

      {nextJob && (
        <button onClick={() => navigate(`/field/job/${nextJob.id}`)} className="w-full bg-white rounded-xl p-3 mb-2 text-left border-l-4 border-[#C22126] active:scale-[0.99] transition-transform">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider text-[#C22126] font-bold">Next · {nextJob.visit_type || "Service visit"}</p>
              <p className="text-sm font-medium text-zinc-900 truncate">{nextJob.sites?.name || "Unknown site"}</p>
              <p className="text-xs text-zinc-500 truncate flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {nextJob.sites?.city || nextJob.sites?.postcode || "—"}
              </p>
            </div>
            <span className="text-xs font-medium text-[#C22126] flex items-center gap-1">
              Start <ChevronRight className="w-4 h-4" />
            </span>
          </div>
        </button>
      )}

      {remainingJobs.map((v) => (
        <button key={v.id} onClick={() => navigate(`/field/job/${v.id}`)} className="w-full bg-white rounded-xl p-3 mb-2 text-left active:scale-[0.99] transition-transform">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">{v.visit_type || "Service visit"}</p>
              <p className="text-sm font-medium text-zinc-900 truncate">{v.sites?.name || "Unknown site"}</p>
              <p className="text-xs text-zinc-500 truncate">{v.sites?.city || v.sites?.postcode || "—"}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-300" />
          </div>
        </button>
      ))}

      {visits?.length === 0 && (
        <div className="bg-white rounded-xl p-8 text-center">
          <Home className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">No visits scheduled today.</p>
        </div>
      )}

      {visits && visits.length > 0 && (
        <p className="text-[10px] text-zinc-400 text-center mt-4">Depot return after final job</p>
      )}
    </div>
  );
}
