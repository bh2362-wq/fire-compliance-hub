import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Calendar, Building2, ExternalLink, Trash2, GripVertical, FileText, Plus, Loader2, Download,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  type Tender,
  TENDER_STATUS_LABELS,
  type TenderStatus,
  updateTender,
  deleteTender,
  listPackItems,
  addPackItem,
  removePackItem,
  reorderPackItems,
  listCompanyDocuments,
  type TenderPackItem,
  type CompanyDocument,
  COMPANY_DOC_CATEGORY_LABELS,
} from "@/services/tenderService";

interface Props {
  tender: Tender | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

export function TenderDetailDialog({ tender, open, onOpenChange, onChanged }: Props) {
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<TenderStatus>("watching");
  const [saving, setSaving] = useState(false);
  const [packItems, setPackItems] = useState<TenderPackItem[]>([]);
  const [library, setLibrary] = useState<CompanyDocument[]>([]);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!tender) return;
    setNotes(tender.notes ?? "");
    setStatus(tender.status);
    void (async () => {
      try {
        const [items, lib] = await Promise.all([
          listPackItems(tender.id),
          listCompanyDocuments(),
        ]);
        setPackItems(items);
        setLibrary(lib);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [tender]);

  if (!tender) return null;

  const save = async () => {
    setSaving(true);
    try {
      await updateTender(tender.id, { notes: notes || null, status });
      toast.success("Tender updated");
      onChanged?.();
    } catch (e) {
      toast.error("Couldn't save", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this tender? Its pack items will also be removed.")) return;
    try {
      await deleteTender(tender.id);
      toast.success("Tender deleted");
      onOpenChange(false);
      onChanged?.();
    } catch (e) {
      toast.error("Couldn't delete", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const addLibraryDoc = async (doc: CompanyDocument) => {
    try {
      const item = await addPackItem({
        tender_id: tender.id,
        company_document_id: doc.id,
        sort_order: packItems.length,
      });
      setPackItems((prev) => [...prev, { ...item, company_document: doc }]);
      setAddPickerOpen(false);
    } catch (e) {
      toast.error("Couldn't add to pack", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const removeItem = async (id: string) => {
    try {
      await removePackItem(id);
      setPackItems((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      toast.error("Couldn't remove", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const moveItem = async (idx: number, direction: -1 | 1) => {
    const target = idx + direction;
    if (target < 0 || target >= packItems.length) return;
    const next = [...packItems];
    [next[idx], next[target]] = [next[target], next[idx]];
    setPackItems(next);
    try {
      await reorderPackItems(next.map((it, i) => ({ id: it.id, sort_order: i })));
    } catch (e) {
      console.error("Couldn't reorder", e);
    }
  };

  const generatePack = async () => {
    if (packItems.length === 0) {
      toast.error("Add at least one document to the pack first.");
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-tender-pack", {
        body: { tender_id: tender.id },
      });
      if (error) throw error;
      const url = (data as { signed_url?: string } | null)?.signed_url;
      if (url) {
        const a = document.createElement("a");
        a.href = url;
        a.download = `tender-pack-${tender.title.replace(/\s+/g, "-").slice(0, 40)}.pdf`;
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast.success("Tender pack generated");
      } else {
        toast.error("No signed URL returned");
      }
    } catch (e) {
      toast.error("Couldn't generate pack", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <DialogTitle className="text-base flex items-center gap-2 flex-wrap">
            {tender.title}
            <Badge variant="outline" className="text-[10px]">
              {TENDER_STATUS_LABELS[tender.status]}
            </Badge>
          </DialogTitle>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground pt-1">
            {tender.buyer_org && (
              <span className="flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                {tender.buyer_org}
              </span>
            )}
            {tender.deadline_at && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {format(new Date(tender.deadline_at), "dd MMM yyyy")}
              </span>
            )}
            {tender.url && (
              <a href={tender.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                Original <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          <div className="space-y-5">
            {/* Status + notes */}
            <section className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as TenderStatus)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TENDER_STATUS_LABELS).map(([k, label]) => (
                        <SelectItem key={k} value={k}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-notes" className="text-xs">Internal notes</Label>
                <Textarea
                  id="t-notes"
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Bid strategy, key contacts, who's working on it..."
                />
              </div>
              {tender.description && (
                <div className="text-xs text-muted-foreground border rounded-md p-3 bg-muted/30">
                  <p className="font-semibold mb-1">Description</p>
                  <p className="whitespace-pre-wrap">{tender.description}</p>
                </div>
              )}
            </section>

            {/* Pack builder */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Tender pack ({packItems.length})</Label>
                <Button variant="outline" size="sm" onClick={() => setAddPickerOpen((v) => !v)}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add document
                </Button>
              </div>

              {addPickerOpen && (
                <div className="rounded-md border bg-muted/30 p-2 space-y-1 max-h-60 overflow-y-auto">
                  {library.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic p-2">
                      Library is empty. Add company documents on the Library page.
                    </p>
                  ) : (
                    library.map((doc) => (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => addLibraryDoc(doc)}
                        className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-background flex items-center justify-between gap-2"
                      >
                        <span className="truncate">
                          {doc.title}
                          <span className="text-muted-foreground ml-2">
                            · {COMPANY_DOC_CATEGORY_LABELS[doc.category]}
                          </span>
                        </span>
                        <Plus className="w-3 h-3 flex-shrink-0" />
                      </button>
                    ))
                  )}
                </div>
              )}

              {packItems.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No documents in the pack yet. Add accreditations, insurance certs, and sample reports from the library.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {packItems.map((item, idx) => {
                    const title = item.company_document?.title ?? item.custom_title ?? "Untitled";
                    const category = item.company_document?.category;
                    return (
                      <div key={item.id} className="rounded-md border bg-card p-2.5 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => moveItem(idx, -1)}
                          disabled={idx === 0}
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                          aria-label="Move up"
                        >
                          <GripVertical className="w-4 h-4" />
                        </button>
                        <FileText className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                        <span className="text-sm truncate flex-1">{title}</span>
                        {category && (
                          <Badge variant="outline" className="text-[10px] flex-shrink-0">
                            {COMPANY_DOC_CATEGORY_LABELS[category]}
                          </Badge>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(item.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              <Button
                size="sm"
                className="w-full mt-2"
                onClick={generatePack}
                disabled={generating || packItems.length === 0}
              >
                {generating ? (
                  <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Building pack…</>
                ) : (
                  <><Download className="w-4 h-4 mr-1.5" /> Generate tender pack PDF</>
                )}
              </Button>
            </section>
          </div>
        </ScrollArea>

        <div className="border-t px-6 py-3 flex items-center justify-between gap-2 bg-background">
          <Button variant="ghost" size="sm" onClick={handleDelete} className="text-destructive">
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete tender
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
              Save changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
