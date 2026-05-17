import { useParams, useNavigate } from "react-router-dom";
import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Camera, X } from "lucide-react";

export function DefectCapture() {
  const { visitId } = useParams<{ visitId: string }>();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [severity, setSeverity] = useState<"low" | "medium" | "high">("medium");

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setPhoto(f); setPreview(URL.createObjectURL(f)); }
  };

  const submit = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      const { data: v } = await (supabase as any).from("visits").select("site_id").eq("id", visitId).single();
      if (!v) throw new Error("Visit not found");

      let photoUrl: string | null = null;
      if (photo) {
        const filename = `defects/${visitId}-${Date.now()}-${photo.name}`;
        const { error: upErr } = await supabase.storage.from("engineer-app").upload(filename, photo, { contentType: photo.type });
        if (!upErr) photoUrl = supabase.storage.from("engineer-app").getPublicUrl(filename).data.publicUrl;
      }

      const { error } = await (supabase as any).from("site_defects").insert({
        site_id: v.site_id, visit_id: visitId, description, location, severity, photo_url: photoUrl, reported_by: user.user?.id, status: "open",
      });
      if (error) throw error;
    },
    onSuccess: () => navigate(-1),
  });

  return (
    <div className="p-3">
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} className="hidden" />

      {preview ? (
        <div className="relative mb-3">
          <img src={preview} alt="defect preview" className="w-full rounded-xl" />
          <button onClick={() => { setPhoto(null); setPreview(null); }} className="absolute top-2 right-2 w-8 h-8 bg-black/60 rounded-full flex items-center justify-center text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button onClick={() => fileRef.current?.click()} className="w-full h-40 mb-3 bg-white border-2 border-dashed border-[#C22126]/40 rounded-xl flex flex-col items-center justify-center text-[#C22126]">
          <Camera className="w-8 h-8 mb-1" />
          <p className="text-sm font-medium">Take photo of defect</p>
          <p className="text-[10px] text-zinc-500">Camera opens directly</p>
        </button>
      )}

      <div className="bg-white rounded-xl p-3 mb-3">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1">Location</p>
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Plant room, Loop 1, address 3007" className="w-full text-sm focus:outline-none bg-transparent" />
      </div>

      <div className="bg-white rounded-xl p-3 mb-3">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1">Description</p>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's wrong with it?" rows={3} className="w-full text-sm focus:outline-none bg-transparent resize-none" />
      </div>

      <div className="bg-white rounded-xl p-3 mb-3">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-2">Severity</p>
        <div className="grid grid-cols-3 gap-1.5">
          {(["low", "medium", "high"] as const).map((s) => (
            <button key={s} onClick={() => setSeverity(s)} className={`py-2 text-xs rounded-lg border ${severity === s ? "bg-[#C22126] text-white border-[#C22126]" : "border-zinc-200 text-zinc-700"}`}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <button disabled={!description || submit.isPending} onClick={() => submit.mutate()} className="w-full bg-[#C22126] text-white rounded-lg py-3 text-sm font-medium disabled:opacity-40">
        {submit.isPending ? "Saving…" : "Raise defect"}
      </button>
    </div>
  );
}
