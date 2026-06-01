import { useState } from "react";
import { isHeic, heicTo } from "heic-to";
import { Image as ImageIcon, Paperclip, Plus, Upload, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { PhotoEntry, ReportFileEntry, WorkReportDraft } from "../useWorkReportDraft";

interface Props {
  draft: WorkReportDraft;
  onPatch: (updates: Partial<WorkReportDraft>) => void;
}

async function fileToBase64(file: File): Promise<string> {
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function mirrorToSharePoint(
  folder: string,
  subPath: "uploads" | "Documents",
  file: File,
): Promise<void> {
  try {
    const base64 = await fileToBase64(file);
    await supabase.functions.invoke("upload-to-sharepoint", {
      body: {
        folderPath: `${folder}/${subPath}`,
        fileName: file.name,
        fileBase64: base64,
        contentType: file.type || (subPath === "uploads" ? "image/jpeg" : "application/octet-stream"),
      },
    });
  } catch (err) {
    console.log("SharePoint mirror skipped:", err);
  }
}

export function PhotosStep({ draft, onPatch }: Props) {
  const locked = draft.is_locked;
  const reportId = draft.id;
  const sharePointFolder = draft.sharepoint_folder;
  const photos = draft.photos;
  const reportFiles = draft.report_files;

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  const onPhotoFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingPhoto(true);
    try {
      const newPhotos: PhotoEntry[] = [];
      for (const raw of Array.from(files)) {
        let file: File = raw;
        const isHeicFile =
          /\.(heic|heif)$/i.test(raw.name) ||
          raw.type === "image/heic" ||
          raw.type === "image/heif" ||
          (await isHeic(raw));
        if (isHeicFile) {
          try {
            const jpegBlob = await heicTo({ blob: raw, type: "image/jpeg", quality: 0.85 });
            const newName = raw.name.replace(/\.(heic|heif)$/i, ".jpg");
            file = new File([jpegBlob], newName, { type: "image/jpeg" });
          } catch (convErr) {
            console.error("HEIC conversion failed:", convErr);
            toast.error(`Failed to convert ${raw.name} — unsupported HEIC format`);
            continue;
          }
        }

        const ext = file.name.split(".").pop();
        const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
        const storagePath = `${reportId}/${uniqueName}`;

        const { error: upErr } = await supabase.storage
          .from("work-report-photos")
          .upload(storagePath, file);
        if (upErr) throw upErr;

        const {
          data: { publicUrl },
        } = supabase.storage.from("work-report-photos").getPublicUrl(storagePath);

        newPhotos.push({ url: publicUrl, caption: "" });

        if (sharePointFolder) {
          await mirrorToSharePoint(sharePointFolder, "uploads", file);
        }
      }
      onPatch({ photos: [...photos, ...newPhotos] });
      toast.success(`${newPhotos.length} photo${newPhotos.length === 1 ? "" : "s"} uploaded`);
    } catch (err) {
      console.error("Failed to upload photo:", err);
      toast.error("Failed to upload photo");
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  };

  const onDocFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingFile(true);
    try {
      const newFiles: ReportFileEntry[] = [];
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop();
        const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
        const storagePath = `${reportId}/files/${uniqueName}`;

        const { error: upErr } = await supabase.storage
          .from("work-report-photos")
          .upload(storagePath, file);
        if (upErr) throw upErr;

        const {
          data: { publicUrl },
        } = supabase.storage.from("work-report-photos").getPublicUrl(storagePath);

        newFiles.push({ url: publicUrl, name: file.name, size: file.size });

        if (sharePointFolder) {
          await mirrorToSharePoint(sharePointFolder, "Documents", file);
        }
      }
      onPatch({ report_files: [...reportFiles, ...newFiles] });
      toast.success(`${newFiles.length} file${newFiles.length === 1 ? "" : "s"} uploaded`);
    } catch (err) {
      console.error("Failed to upload file:", err);
      toast.error("Failed to upload file");
    } finally {
      setUploadingFile(false);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">Photos &amp; files</h3>
        <p className="text-xs text-muted-foreground">
          Site photos and supporting documents. HEIC photos from iOS devices are converted to
          JPEG on upload.
        </p>
      </div>

      {sharePointFolder && (
        <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Upload className="w-3.5 h-3.5 shrink-0" />
          <span>
            SharePoint: <span className="font-medium text-foreground">{sharePointFolder}</span>
          </span>
        </div>
      )}

      {/* Photos */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Site Photos</Label>
          <div className="relative">
            <input
              type="file"
              accept="image/*,.heic,.heif"
              multiple
              onChange={onPhotoFiles}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={locked || uploadingPhoto}
            />
            <Button variant="outline" size="sm" disabled={locked || uploadingPhoto}>
              {uploadingPhoto ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Upload photo
                </>
              )}
            </Button>
          </div>
        </div>

        {photos.length === 0 ? (
          <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground">
            <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No photos added yet</p>
            <p className="text-xs mt-1">Click "Upload photo" to add images from the site.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {photos.map((photo, index) => (
              <div key={`${photo.url}-${index}`} className="relative group">
                <div className="aspect-square rounded-lg overflow-hidden border border-border bg-muted">
                  <img
                    src={photo.url}
                    alt={photo.caption || `Photo ${index + 1}`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/placeholder.svg";
                    }}
                  />
                </div>
                {!locked && (
                  <button
                    type="button"
                    onClick={() => onPatch({ photos: photos.filter((_, i) => i !== index) })}
                    className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <Input
                  value={photo.caption}
                  onChange={(e) => {
                    const next = photos.map((p, i) =>
                      i === index ? { ...p, caption: e.target.value } : p,
                    );
                    onPatch({ photos: next });
                  }}
                  placeholder="Add caption…"
                  className="mt-2 text-xs"
                  disabled={locked}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border" />

      {/* Files */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Files &amp; Documents</Label>
          <div className="relative">
            <input
              type="file"
              multiple
              onChange={onDocFiles}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={locked || uploadingFile}
            />
            <Button variant="outline" size="sm" disabled={locked || uploadingFile}>
              {uploadingFile ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <Paperclip className="w-4 h-4 mr-2" />
                  Add files
                </>
              )}
            </Button>
          </div>
        </div>

        {reportFiles.length === 0 ? (
          <div className="border-2 border-dashed rounded-lg p-6 text-center text-muted-foreground">
            <Paperclip className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No files uploaded yet</p>
            <p className="text-xs mt-1">Upload paperwork, configuration files, or other documents.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {reportFiles.map((file, index) => (
              <div
                key={`${file.url}-${index}`}
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30"
              >
                <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-primary hover:underline truncate block"
                  >
                    {file.name}
                  </a>
                  <span className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </span>
                </div>
                {!locked && (
                  <button
                    type="button"
                    onClick={() =>
                      onPatch({ report_files: reportFiles.filter((_, i) => i !== index) })
                    }
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
