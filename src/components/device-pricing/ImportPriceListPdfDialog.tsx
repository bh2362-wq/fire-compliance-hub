/**
 * ImportPriceListPdfDialog.tsx
 *
 * Imports a supplier price list PDF using Claude (extract-pdf-prices).
 * Completely separate from ImportDeviceReportDialog which handles Gent device reports.
 *
 * Workflow:
 *   1. User uploads PDF + optionally names the supplier
 *   2. Claude reads the PDF and extracts part numbers + prices
 *   3. User reviews the extracted table, can delete rows
 *   4. Confirm saves to materials_catalog (via upsert on part_number)
 */

import { useState, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, FileText, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ExtractedRow {
  part_number:  string;
  description:  string;
  manufacturer: string;
  category:     string;
  unit_cost:    number;
  labour_cost:  number;
  selected:     boolean;
}

interface Props {
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?:  () => void;
}

const CATEGORIES = [
  "Detector", "Sounder", "VAD", "MCP", "Panel",
  "Cable", "Interface", "Battery", "Other",
];

export function ImportPriceListPdfDialog({ open, onOpenChange, onSuccess }: Props) {
  const [step,          setStep]         = useState<"upload" | "review" | "done">("upload");
  const [supplierName,  setSupplierName] = useState("");
  const [fileName,      setFileName]     = useState("");
  const [loading,       setLoading]      = useState(false);
  const [rows,          setRows]         = useState<ExtractedRow[]>([]);
  const [saving,        setSaving]       = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStep("upload");
    setSupplierName("");
    setFileName("");
    setRows([]);
    setLoading(false);
    setSaving(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  // ── Convert file to base64 ─────────────────────────────────────────────────
  async function toBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ── Handle file select ─────────────────────────────────────────────────────
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Please upload a PDF file");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("PDF is too large — maximum 10 MB");
      return;
    }

    setFileName(file.name);
    setLoading(true);

    try {
      const pdfBase64 = await toBase64(file);

      const { data, error } = await supabase.functions.invoke("extract-pdf-prices", {
        body: {
          pdfBase64,
          filename:     file.name,
          supplierName: supplierName.trim() || undefined,
        },
      });

      if (error) throw new Error(error.message);
      if (!data?.rows?.length) {
        toast.warning("No priced items found in this PDF. Make sure it contains part numbers and prices.");
        setLoading(false);
        return;
      }

      const extracted: ExtractedRow[] = (data.rows as any[]).map((r) => ({
        part_number:  r.part_number  || "",
        description:  r.description  || "",
        manufacturer: r.manufacturer || supplierName || "",
        category:     r.category     || "Other",
        unit_cost:    Number(r.unit_cost)   || 0,
        labour_cost:  Number(r.labour_cost) || 0,
        selected:     true,
      }));

      setRows(extracted);
      setStep("review");
      toast.success(`${extracted.length} item${extracted.length !== 1 ? "s" : ""} extracted — review and confirm`);
    } catch (e: any) {
      console.error("PDF extract error:", e);
      toast.error(`Failed to extract prices: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  // ── Toggle row selection ───────────────────────────────────────────────────
  function toggleRow(i: number) {
    setRows(prev => prev.map((r, idx) =>
      idx === i ? { ...r, selected: !r.selected } : r
    ));
  }

  function toggleAll() {
    const allSelected = rows.every(r => r.selected);
    setRows(prev => prev.map(r => ({ ...r, selected: !allSelected })));
  }

  function deleteRow(i: number) {
    setRows(prev => prev.filter((_, idx) => idx !== i));
  }

  function editRow(i: number, field: keyof ExtractedRow, value: string | number) {
    setRows(prev => prev.map((r, idx) =>
      idx === i ? { ...r, [field]: value } : r
    ));
  }

  // ── Save to materials_catalog ──────────────────────────────────────────────
  async function handleSave() {
    const selected = rows.filter(r => r.selected);
    if (selected.length === 0) {
      toast.error("Select at least one item to import");
      return;
    }

    setSaving(true);
    try {
      const upsertRows = selected.map(r => ({
        part_number:   r.part_number,
        description:   r.description,
        manufacturer:  r.manufacturer || supplierName || null,
        category:      r.category || "Other",
        retail_price:  r.unit_cost,
        trade_price:   r.unit_cost,
        supplier_name: supplierName || r.manufacturer || null,
        updated_at:    new Date().toISOString(),
      }));

      // Upsert — update on conflict with part_number
      const { error } = await supabase
        .from("materials_catalog")
        .upsert(upsertRows, { onConflict: "part_number", ignoreDuplicates: false });

      if (error) throw error;

      toast.success(`${selected.length} items saved to price list`);
      setStep("done");
      onSuccess?.();
    } catch (e: any) {
      toast.error(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = rows.filter(r => r.selected).length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Supplier Price List</DialogTitle>
          <DialogDescription>
            Upload a supplier PDF price list. Claude will extract part numbers and prices automatically.
          </DialogDescription>
        </DialogHeader>

        {/* ── Step 1: Upload ─────────────────────────────────────────────── */}
        {step === "upload" && (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Supplier name (optional)</Label>
              <Input
                placeholder="e.g. ADI Global, Black & White Fire, Huvo…"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className="max-w-sm"
              />
            </div>

            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-[#dadce0] rounded-sm p-10 text-center cursor-pointer hover:border-[#e85c2c] hover:bg-[#fafafa] transition-colors"
            >
              {loading ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-[#e85c2c]" />
                  <p className="text-sm font-medium text-[#1a1a1a]">Reading price list…</p>
                  <p className="text-xs text-[#5f6368]">
                    Large PDFs are split into sections and processed in order.
                    This may take a minute — please keep this window open.
                  </p>
                  {fileName && <p className="text-xs text-[#9aa0a6]">{fileName}</p>}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <FileText className="h-10 w-10 text-[#9aa0a6]" />
                  <div>
                    <p className="text-sm font-medium text-[#1a1a1a]">Drop PDF here or click to browse</p>
                    <p className="text-xs text-[#9aa0a6] mt-1">Supplier invoices, quotations, price lists · Max 10 MB</p>
                  </div>
                  <Button variant="outline" size="sm" type="button">
                    <Upload className="mr-2 h-4 w-4" /> Choose PDF
                  </Button>
                </div>
              )}
            </div>

            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handleFile}
            />
          </div>
        )}

        {/* ── Step 2: Review ─────────────────────────────────────────────── */}
        {step === "review" && (
          <div className="flex flex-col flex-1 min-h-0 gap-3">
            <div className="flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{rows.length} extracted</Badge>
                <Badge className="bg-green-50 text-green-700 border-green-200">
                  {selectedCount} selected
                </Badge>
                {supplierName && (
                  <Badge variant="secondary">{supplierName}</Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { reset(); }}>
                  Start Over
                </Button>
                <Button
                  size="sm"
                  className="bg-[#e85c2c] hover:bg-[#d44f20] text-white"
                  onClick={handleSave}
                  disabled={saving || selectedCount === 0}
                >
                  {saving
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</>
                    : <><CheckCircle2 className="mr-2 h-4 w-4" /> Save {selectedCount} items</>}
                </Button>
              </div>
            </div>

            <p className="text-xs text-[#5f6368] flex-shrink-0">
              Review extracted items. Edit any values, deselect rows to skip, then save to update the price list.
            </p>

            {/* Scrollable table */}
            <div className="flex-1 overflow-auto border border-[#e0e0e0] rounded-sm min-h-0">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-[#3c3c3c] text-white">
                  <tr>
                    <th className="px-3 py-2 text-left w-8">
                      <input
                        type="checkbox"
                        checked={rows.length > 0 && rows.every(r => r.selected)}
                        onChange={toggleAll}
                        className="rounded"
                      />
                    </th>
                    <th className="px-3 py-2 text-left w-28">Part No.</th>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-left w-24">Manufacturer</th>
                    <th className="px-3 py-2 text-left w-24">Category</th>
                    <th className="px-3 py-2 text-right w-20">Unit Cost</th>
                    <th className="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={i}
                      className={`border-b border-[#f0f0f0] ${
                        row.selected ? "" : "opacity-40"
                      } ${i % 2 === 0 ? "bg-white" : "bg-[#fafafa]"} hover:bg-[#f9fbe7]`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={() => toggleRow(i)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={row.part_number}
                          onChange={(e) => editRow(i, "part_number", e.target.value)}
                          className="h-7 text-xs font-mono p-1"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={row.description}
                          onChange={(e) => editRow(i, "description", e.target.value)}
                          className="h-7 text-xs p-1"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={row.manufacturer}
                          onChange={(e) => editRow(i, "manufacturer", e.target.value)}
                          className="h-7 text-xs p-1"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={row.category}
                          onChange={(e) => editRow(i, "category", e.target.value)}
                          className="h-7 text-xs border border-[#dadce0] rounded px-1 w-full bg-white"
                        >
                          {CATEGORIES.map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number" min={0} step={0.01}
                          value={row.unit_cost}
                          onChange={(e) => editRow(i, "unit_cost", parseFloat(e.target.value) || 0)}
                          className="h-7 text-xs p-1 text-right"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => deleteRow(i)}
                          className="text-[#9aa0a6] hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Step 3: Done ───────────────────────────────────────────────── */}
        {step === "done" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <CheckCircle2 className="h-12 w-12 text-green-600" />
            <div className="text-center">
              <p className="font-semibold text-[#1a1a1a]">Price list imported</p>
              <p className="text-sm text-[#5f6368] mt-1">
                Items have been added to your materials catalog. They will appear in device price lookups.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={reset}>Import Another</Button>
              <Button onClick={() => { reset(); onOpenChange(false); }}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
