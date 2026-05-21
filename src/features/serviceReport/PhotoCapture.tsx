import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { listPhotos, queuePhoto } from "@/lib/offlineQueue";
import { runSync } from "@/lib/syncWorker";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

interface Props {
  defectId: string;
  reportId: string;
  visitId: string;
  siteId: string;
}

// Captures one photo per click via the device camera (or file picker on
// desktop), stores the blob in IndexedDB, and kicks the sync worker if we
// happen to be online. Photos sync regardless — even on slow connections —
// because the queue is durable across refreshes.
export function PhotoCapture({ defectId, reportId, visitId, siteId }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const online = useOnlineStatus();

  const refreshCount = async () => {
    try {
      const all = await listPhotos();
      setPendingCount(all.filter((p) => p.defectId === defectId).length);
    } catch {
      setPendingCount(0);
    }
  };

  useEffect(() => {
    void refreshCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defectId]);

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      await queuePhoto({
        id: crypto.randomUUID(),
        blob: file,
        contentType: file.type || "image/jpeg",
        fileName: file.name || `photo-${Date.now()}.jpg`,
        defectId,
        visitId,
        siteId,
        reportId,
      });
      await refreshCount();
      if (online) void runSync();
      toast({ title: "Photo queued", description: online ? "Uploading…" : "Will upload when online" });
    } catch (err) {
      toast({
        title: "Could not queue photo",
        description: (err as Error).message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 pt-2">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <ImageIcon className="h-3 w-3" />
        {pendingCount === 0 ? "No queued photos" : `${pendingCount} queued`}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleSelect}
        className="hidden"
      />
      <Button
        size="sm"
        variant="outline"
        onClick={() => fileRef.current?.click()}
        className="h-8"
      >
        <Camera className="mr-1 h-3 w-3" />
        Add photo
      </Button>
    </div>
  );
}
