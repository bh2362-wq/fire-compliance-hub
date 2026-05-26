import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Download,
  FileSpreadsheet,
  Plus,
  Trash2,
  Eye,
  Loader2,
} from "lucide-react";
import {
  archiveMatrix,
  getMatrix,
  getOriginalDownloadUrl,
  listMatrices,
  type CauseEffectMatrixRow,
  type FullCauseEffectMatrix,
} from "@/services/causeEffectMatrixService";
import { CauseEffectMatrixViewer } from "./CauseEffectMatrixViewer";
import { CauseEffectUploadDialog } from "./CauseEffectUploadDialog";

interface Props {
  siteId: string;
}

export function CauseEffectMatricesPanel({ siteId }: Props) {
  const { toast } = useToast();
  const [matrices, setMatrices] = useState<CauseEffectMatrixRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewing, setViewing] = useState<FullCauseEffectMatrix | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listMatrices(siteId);
      setMatrices(rows);
    } catch (e) {
      toast({
        title: "Could not load matrices",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [siteId, toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleView = async (m: CauseEffectMatrixRow) => {
    setViewLoading(true);
    try {
      const full = await getMatrix(m.id);
      setViewing(full);
    } catch (e) {
      toast({
        title: "Could not load matrix",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setViewLoading(false);
    }
  };

  const handleDownload = async (m: CauseEffectMatrixRow) => {
    try {
      const url = await getOriginalDownloadUrl(m);
      if (!url) {
        toast({ title: "No source file on this matrix", variant: "destructive" });
        return;
      }
      window.open(url, "_blank");
    } catch (e) {
      toast({
        title: "Could not generate download link",
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  };

  const handleArchive = async (m: CauseEffectMatrixRow) => {
    if (!confirm(`Archive "${m.title}"? Other matrices on this site are unaffected.`))
      return;
    try {
      await archiveMatrix(m.id);
      toast({ title: "Matrix archived" });
      refresh();
    } catch (e) {
      toast({
        title: "Could not archive",
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Cause &amp; effect matrices</h3>
          <p className="text-xs text-muted-foreground">
            Panel commissioning C&amp;E exports from Excel.
          </p>
        </div>
        <Button size="sm" onClick={() => setUploadOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Upload matrix
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </p>
      ) : matrices.length === 0 ? (
        <p className="text-xs text-muted-foreground border border-dashed rounded p-4 text-center">
          No matrices uploaded yet for this site.
        </p>
      ) : (
        <ul className="divide-y border rounded">
          {matrices.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-3 px-3 py-2 text-sm"
            >
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{m.title}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {new Date(m.uploaded_at).toLocaleString()}
                  {m.source_file_name && ` · ${m.source_file_name}`}
                  {m.notes && ` · ${m.notes}`}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleView(m)}
                disabled={viewLoading}
              >
                <Eye className="h-4 w-4 mr-1" /> View
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDownload(m)}
              >
                <Download className="h-4 w-4 mr-1" /> Excel
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleArchive(m)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <CauseEffectUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        siteId={siteId}
        onUploaded={refresh}
      />

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{viewing?.title}</DialogTitle>
            <DialogDescription>
              {viewing && new Date(viewing.uploaded_at).toLocaleString()}
              {viewing?.source_file_name && ` · ${viewing.source_file_name}`}
            </DialogDescription>
          </DialogHeader>
          {viewing && (
            <CauseEffectMatrixViewer
              title={null}
              legend={viewing.legend}
              outputs={viewing.outputs}
              rules={viewing.rules}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
