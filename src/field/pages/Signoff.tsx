import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRef, useState, MouseEvent, TouchEvent, useEffect } from "react";
import { FileCheck, RotateCcw } from "lucide-react";

export function Signoff() {
  const { visitId } = useParams<{ visitId: string }>();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");

  const { data: visit } = useQuery({
    queryKey: ["field-visit", visitId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("service_visits").select(`*, sites:site_id ( name, contact_name, contact_email )`).eq("id", visitId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!visitId,
  });

  const { data: stats } = useQuery({
    queryKey: ["field-signoff-stats", visitId],
    queryFn: async () => {
      const { count: tested } = await (supabase as any).from("parsed_device_tests").select("*", { count: "exact", head: true }).eq("visit_id", visitId);
      const { count: defects } = await (supabase as any).from("site_defects").select("*", { count: "exact", head: true }).eq("visit_id", visitId);
      return { tested: tested ?? 0, defects: defects ?? 0 };
    },
    enabled: !!visitId,
  });

  useEffect(() => {
    if (visit?.sites && !clientName) {
      setClientName(visit.sites.contact_name ?? "");
      setClientEmail(visit.sites.contact_email ?? "");
    }
  }, [visit, clientName]);

  const minutesOnSite = visit?.arrived_at ? Math.round((Date.now() - new Date(visit.arrived_at).getTime()) / 60000) : 0;
  const hrs = Math.floor(minutesOnSite / 60);
  const mins = minutesOnSite % 60;

  const getPos = (e: MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return { x: ((clientX - rect.left) / rect.width) * canvas.width, y: ((clientY - rect.top) / rect.height) * canvas.height };
  };

  const startDraw = (e: MouseEvent | TouchEvent) => {
    drawingRef.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = getPos(e);
    ctx.beginPath(); ctx.moveTo(x, y);
  };

  const draw = (e: MouseEvent | TouchEvent) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y); ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#1a1a1a"; ctx.stroke();
    setHasSignature(true);
  };

  const endDraw = () => { drawingRef.current = false; };

  const clearSignature = () => {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const finalise = useMutation({
    mutationFn: async () => {
      const canvas = canvasRef.current!;
      const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/png"));
      const filename = `signatures/${visitId}-${Date.now()}.png`;
      const { error: uploadErr } = await supabase.storage.from("engineer-app").upload(filename, blob, { contentType: "image/png" });
      if (uploadErr) throw uploadErr;
      const { data: pub } = supabase.storage.from("engineer-app").getPublicUrl(filename);
      const { error } = await (supabase as any).from("service_visits").update({
        status: "completed", departed_at: new Date().toISOString(), client_signature_url: pub.publicUrl, client_signed_name: clientName,
      }).eq("id", visitId);
      if (error) throw error;
    },
    onSuccess: () => navigate(`/field/job/${visitId}/complete`),
  });

  return (
    <div className="p-3">
      <div className="grid grid-cols-3 gap-2 mb-3">
        <Stat value={`${hrs}h ${mins}m`} label="On site" />
        <Stat value={String(stats?.tested ?? 0)} label="Tested" />
        <Stat value={String(stats?.defects ?? 0)} label="Defects" accent={!!stats?.defects && stats.defects > 0} />
      </div>

      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Client signature</p>
        {hasSignature && (
          <button onClick={clearSignature} className="text-[10px] text-[#C22126] flex items-center gap-1">
            <RotateCcw className="w-3 h-3" /> Clear
          </button>
        )}
      </div>
      <div className="bg-white rounded-xl border border-zinc-200 mb-3">
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          className="w-full h-40 rounded-xl touch-none"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      </div>

      <div className="bg-white rounded-xl p-3 mb-2">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1">Print name</p>
        <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client name" className="w-full text-sm focus:outline-none bg-transparent" />
      </div>

      <div className="bg-white rounded-xl p-3 mb-3">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1">Email certificate to</p>
        <input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="client@example.com" type="email" className="w-full text-sm focus:outline-none bg-transparent" />
      </div>

      <button disabled={!hasSignature || finalise.isPending} onClick={() => finalise.mutate()} className="w-full bg-[#C22126] text-white rounded-lg py-3 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-40">
        <FileCheck className="w-4 h-4" />
        {finalise.isPending ? "Finalising…" : "Generate BS 5839-1 certificate"}
      </button>
      {!hasSignature && <p className="text-[10px] text-zinc-400 text-center mt-2">Signature required to finalise</p>}
    </div>
  );
}

function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-3 text-center ${accent ? "bg-[#FCEBEB] text-[#791F1F]" : "bg-white text-zinc-900"}`}>
      <p className="text-base font-semibold">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">{label}</p>
    </div>
  );
}
