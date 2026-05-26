import { useCallback, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import {
  parseCauseEffectFile,
  CauseEffectParseError,
  type ParsedMatrix,
} from "@/services/causeEffectParser";
import { uploadMatrix } from "@/services/causeEffectMatrixService";
import { CauseEffectMatrixViewer } from "./CauseEffectMatrixViewer";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string;
  onUploaded: () => void;
}

export function CauseEffectUploadDialog({
  open,
  onOpenChange,
  siteId,
  onUploaded,
}: Props) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedMatrix | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = useCallback(() => {
    setFile(null);
    setParsed(null);
    setTitle("");
    setNotes("");
    setParsing(false);
    setSaving(false);
  }, []);

  const handleFile = async (f: File | null) => {
    if (!f) return;
    setFile(f);
    setParsing(true);
    try {
      const result = await parseCauseEffectFile(f);
      setParsed(result);
      setTitle(result.title ?? f.name.replace(/\.[^.]+$/, ""));
    } catch (e) {
      const msg =
        e instanceof CauseEffectParseError
          ? e.message
          : (e as Error).message;
      toast({
        title: "Could not parse file",
        description: msg,
        variant: "destructive",
      });
      setFile(null);
      setParsed(null);
    } finally {
      setParsing(false);
    }
  };

  const handleSave = async () => {
    if (!file || !parsed) return;
    if (!title.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await uploadMatrix({
        siteId,
        title: title.trim(),
        notes: notes.trim() || null,
        file,
        parsed,
      });
      toast({ title: "Matrix uploaded" });
      reset();
      onOpenChange(false);
      onUploaded();
    } catch (e) {
      toast({
        title: "Upload failed",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>Upload cause &amp; effect matrix</DialogTitle>
          <DialogDescription>
            Excel (.xlsx) export from the panel commissioning workbook. The
            sheet is parsed locally and stored against this site.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!parsed && (
            <div className="border-2 border-dashed rounded-md p-8 text-center">
              <FileSpreadsheet className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
              <Label
                htmlFor="ce-file"
                className="cursor-pointer inline-flex items-center gap-2 text-sm font-medium"
              >
                <Upload className="h-4 w-4" />
                Choose .xlsx file
              </Label>
              <Input
                id="ce-file"
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
              {parsing && (
                <p className="text-xs text-muted-foreground mt-2 flex items-center justify-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Parsing…
                </p>
              )}
            </div>
          )}

          {parsed && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Title</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Source file</Label>
                  <Input value={file?.name ?? ""} disabled />
                </div>
              </div>
              <div>
                <Label className="text-xs">Notes (optional)</Label>
                <Textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Revision number, commissioning engineer, etc."
                />
              </div>

              <div className="text-xs text-muted-foreground flex gap-4 border-y py-2">
                <span>
                  <strong>{parsed.outputs.length}</strong> outputs
                </span>
                <span>
                  <strong>{parsed.rules.length}</strong> rules
                </span>
                <span>
                  Action codes:{" "}
                  <strong>
                    {Array.from(
                      new Set(
                        parsed.rules.flatMap((r) => Object.values(r.actions)),
                      ),
                    )
                      .sort()
                      .join(", ")}
                  </strong>
                </span>
              </div>

              <CauseEffectMatrixViewer
                title={parsed.title}
                legend={parsed.legend}
                outputs={parsed.outputs}
                rules={parsed.rules}
              />
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!parsed || saving}>
            {saving ? "Saving…" : "Save matrix"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
