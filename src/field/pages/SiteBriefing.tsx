import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Phone, Info, History, MapPin, User, Check } from "lucide-react";

export function SiteBriefing() {
  const { visitId } = useParams<{ visitId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: visit, isLoading } = useQuery({
    queryKey: ["field-visit", visitId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("service_visits")
        .select(`*, sites:site_id ( * ), service_reports ( id, created_at, summary )`)
        .eq("id", visitId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!visitId,
  });

  const acknowledgeRams = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");

      let lat: number | undefined;
      let lng: number | undefined;
      try {
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000, enableHighAccuracy: false })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch {}

      const { error } = await (supabase as any)
        .from("service_visits")
        .update({
          status: "in_progress",
          arrived_at: new Date().toISOString(),
          arrival_lat: lat,
          arrival_lng: lng,
        })
        .eq("id", visitId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["field-visit", visitId] });
      navigate(`/field/job/${visitId}`);
    },
  });

  if (isLoading || !visit) {
    return (
      <div className="p-3 space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 bg-white rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  const site = visit.sites;
  const fullAddress = [site?.address, site?.city, site?.postcode].filter(Boolean).join(", ");
  const lastReport = visit.service_reports?.[0];

  return (
    <div className="p-3">
      <h2 className="text-lg font-semibold text-zinc-900 mb-0.5">{site?.name}</h2>
      <p className="text-xs text-zinc-500 mb-3">{visit.visit_type || "Service visit"} · Gent G3</p>

      <Card>
        <Label icon={<MapPin className="w-3 h-3" />}>Address</Label>
        <p className="text-sm text-zinc-900 mt-1">{fullAddress || "Address not set"}</p>
        {fullAddress && (
          <button onClick={() => window.open(`https://maps.apple.com/?q=${encodeURIComponent(fullAddress)}`, "_blank")} className="w-full mt-2 text-xs font-medium text-[#C22126] border border-[#C22126] rounded-lg py-2 flex items-center justify-center gap-2 active:bg-[#FCEBEB]">
            Open in Maps
          </button>
        )}
      </Card>

      <Card>
        <Label icon={<User className="w-3 h-3" />}>Site contact</Label>
        {site?.contact_name ? (
          <>
            <p className="text-sm text-zinc-900 mt-1">{site.contact_name}</p>
            {site.contact_phone && (
              <a href={`tel:${site.contact_phone}`} className="text-xs text-[#C22126] flex items-center gap-1 mt-1">
                <Phone className="w-3 h-3" /> {site.contact_phone}
              </a>
            )}
          </>
        ) : (
          <p className="text-sm text-zinc-400 mt-1">No contact stored</p>
        )}
      </Card>

      {(site?.access_notes || site?.parking_notes || site?.gate_code) && (
        <Card>
          <Label icon={<Info className="w-3 h-3" />}>Access notes</Label>
          {site?.gate_code && <p className="text-sm text-zinc-900 mt-1">Gate code: {site.gate_code}</p>}
          {site?.parking_notes && <p className="text-sm text-zinc-700 mt-1">{site.parking_notes}</p>}
          {site?.access_notes && <p className="text-sm text-zinc-700 mt-1">{site.access_notes}</p>}
        </Card>
      )}

      {lastReport && (
        <Card>
          <Label icon={<History className="w-3 h-3" />}>
            Last visit · {new Date(lastReport.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </Label>
          <p className="text-sm text-zinc-700 mt-1">{lastReport.summary || "No summary recorded."}</p>
        </Card>
      )}

      <button onClick={() => acknowledgeRams.mutate()} disabled={acknowledgeRams.isPending} className="w-full bg-[#C22126] text-white rounded-lg py-3 mt-3 text-sm font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-50">
        {acknowledgeRams.isPending ? "Signing in…" : (<><Check className="w-4 h-4" /> Acknowledge RAMS & sign in</>)}
      </button>
      <p className="text-[10px] text-zinc-400 text-center mt-2">GPS + timestamp logged to audit trail</p>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white rounded-xl p-3 mb-2">{children}</div>;
}

function Label({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium flex items-center gap-1">{icon}{children}</p>;
}
