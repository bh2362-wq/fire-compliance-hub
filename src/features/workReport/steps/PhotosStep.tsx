import { AlertCircle } from "lucide-react";

interface Props {
  photoCount: number;
  fileCount: number;
}

export function PhotosStep({ photoCount, fileCount }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Photos &amp; report files</h3>
        <p className="text-xs text-muted-foreground">
          On-site photos, supporting docs, SharePoint browsing.
        </p>
      </div>

      <div className="rounded-lg border border-dashed bg-muted/40 p-6 text-sm">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">Photos + files ship in PR 5b.</p>
            <p className="text-xs text-muted-foreground">
              Photo upload (with HEIC conversion), captions, and SharePoint integration are
              non-trivial — they're getting their own PR. For now you can still capture them via
              the legacy dialog and they'll show up here once 5b lands.
            </p>
            {(photoCount > 0 || fileCount > 0) && (
              <p className="text-xs text-muted-foreground pt-2">
                This report already has{" "}
                <strong>
                  {photoCount} photo{photoCount === 1 ? "" : "s"}
                </strong>{" "}
                and{" "}
                <strong>
                  {fileCount} file{fileCount === 1 ? "" : "s"}
                </strong>{" "}
                saved (preserved by the wizard's auto-save).
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
