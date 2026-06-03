import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Upload, Trash2, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import {
  listCalloutPhotos,
  uploadCalloutPhoto,
  deleteCalloutPhoto,
  updateCalloutPhotoCaption,
  signCalloutPhotoUrl,
  type CalloutPhoto,
} from "@/services/calloutPhotoService";

// Tile-grid uploader for the §2 evidence photos. Each tile resolves
// the photo's storage path to a short-lived signed URL for display
// and lets the engineer edit the caption inline.

interface Props {
  visitId: string;
}

interface PhotoTile {
  photo: CalloutPhoto;
  signedUrl: string | null;
  // Captions are debounced so we don't write to the DB on every
  // keystroke. The tile keeps a draft string and a timer ref; the
  // pending edit flushes on blur or 800ms idle.
  draftCaption: string;
}

export function CalloutPhotoUploader({ visitId }: Props) {
  const [tiles, setTiles] = useState<PhotoTile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const list = await listCalloutPhotos(visitId);
    const withUrls = await Promise.all(
      list.map(async (p) => ({
        photo: p,
        signedUrl: await signCalloutPhotoUrl(p.storage_path),
        draftCaption: p.caption ?? "",
      })),
    );
    setTiles(withUrls);
  }, [visitId]);

  useEffect(() => {
    setLoading(true);
    refresh()
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  }, [refresh]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      // Upload sequentially so the ordinal computed by the service
      // layer (next = current count + 1) doesn't race when the
      // engineer picks multiple files at once.
      for (const file of Array.from(files)) {
        await uploadCalloutPhoto(visitId, file);
      }
      await refresh();
      toast.success(
        files.length === 1
          ? "Photo uploaded"
          : `${files.length} photos uploaded`,
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (tile: PhotoTile) => {
    if (!confirm("Delete this photo? This can't be undone.")) return;
    try {
      await deleteCalloutPhoto(tile.photo);
      setTiles((prev) => prev.filter((t) => t.photo.id !== tile.photo.id));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const flushCaption = async (tile: PhotoTile) => {
    const next = tile.draftCaption.trim();
    if ((tile.photo.caption ?? "") === next) return;
    try {
      await updateCalloutPhotoCaption(tile.photo.id, next.length === 0 ? null : next);
      setTiles((prev) =>
        prev.map((t) =>
          t.photo.id === tile.photo.id
            ? {
                ...t,
                photo: { ...t.photo, caption: next.length === 0 ? null : next },
              }
            : t,
        ),
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        Loading photos…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Evidence photos for §2 — panel display, fault location, isolated
          devices, etc. Captions appear under each frame on the report.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Upload className="w-4 h-4 mr-1" />
          )}
          {uploading ? "Uploading…" : "Add photo"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {tiles.length === 0 ? (
        <div className="border border-dashed rounded-md p-6 text-center text-sm text-muted-foreground">
          <ImageIcon className="w-6 h-6 mx-auto mb-2 opacity-50" />
          No photos yet — tap "Add photo" to upload from camera roll.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {tiles.map((tile) => (
            <div
              key={tile.photo.id}
              className="border rounded-md overflow-hidden bg-card"
            >
              {tile.signedUrl ? (
                <img
                  src={tile.signedUrl}
                  alt={tile.photo.caption ?? "Callout photo"}
                  className="w-full h-32 object-cover"
                />
              ) : (
                <div className="w-full h-32 flex items-center justify-center bg-muted text-muted-foreground">
                  <ImageIcon className="w-6 h-6" />
                </div>
              )}
              <div className="p-2 space-y-1">
                <Input
                  className="h-7 text-xs"
                  placeholder="Caption…"
                  value={tile.draftCaption}
                  onChange={(e) =>
                    setTiles((prev) =>
                      prev.map((t) =>
                        t.photo.id === tile.photo.id
                          ? { ...t, draftCaption: e.target.value }
                          : t,
                      ),
                    )
                  }
                  onBlur={() => flushCaption(tile)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-full text-xs text-destructive hover:text-destructive"
                  onClick={() => handleDelete(tile)}
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
