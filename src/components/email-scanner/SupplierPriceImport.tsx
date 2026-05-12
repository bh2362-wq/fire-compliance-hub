import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, RefreshCw, Download, Search, Mail, FileSpreadsheet,
  CheckCircle2, AlertCircle, Paperclip, History, Package,
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  getSupplierPriceEmails, listAttachments, getAttachment,
  searchPurchaseHistory, base64ToArrayBuffer, isSpreadsheet, isCsv,
  type OutlookMessage, type OutlookAttachment,
} from "@/services/outlookEmailService";
import {
  getExcelSheets, parseExcelSheetFull, parsePriceListCsvWithOverrides,
  uploadPriceList, type ParsedPriceRow,
} from "@/services/priceListService";
import { supabase } from "@/integrations/supabase/client";

// ── Supplier Price Import ──────────────────────────────────────────────────────

function SupplierEmailRow({
  msg, onImport,
}: {
  msg: OutlookMessage & { supplierName?: string };
  onImport: (preview: ParsedPriceRow[], sourceName: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState<OutlookAttachment[] | null>(null);

  async function fetchAttachments() {
    if (attachments) return;
    setLoading(true);
    try {
      const { attachments: atts } = await listAttachments(msg.id);
      setAttachments(atts);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load attachments");
    } finally {
      setLoading(false);
    }
  }

  async function importAttachment(att: OutlookAttachment) {
    setLoading(true);
    const isPdf = att.contentType?.toLowerCase().includes("pdf") || att.name?.toLowerCase().endsWith(".pdf");

    try {
      const { contentBytes } = await getAttachment(msg.id, att.id);
      const sourceName = `${msg.supplierName || "Supplier"} — ${att.name}`;

      if (isPdf) {
        // PDF: extract prices via Claude AI
        toast.info(`Reading PDF with AI — extracting part numbers and prices…`);
        const { data: fnData, error: fnError } = await supabase.functions.invoke("extract-pdf-prices", {
          body: { pdfBase64: contentBytes, filename: att.name, supplierName: msg.supplierName || "" },
        });
        if (fnError) throw new Error(fnError.message);
        if (fnData?.error) throw new Error(fnData.error);

        const rows: ParsedPriceRow[] = (fnData?.rows || []).map((r: any, i: number) => ({
          ...r,
          unit_cost: Number(r.unit_cost) || 0,
          labour_cost: Number(r.labour_cost) || 0,
          _rowIndex: i + 1,
        }));

        if (rows.length === 0) {
          toast.warning(`No priced items found in ${att.name} — the PDF may not contain a price list`);
          return;
        }

        onImport(rows, sourceName);
        toast.success(`${rows.length} prices extracted from ${att.name} by AI`);
      } else {
        // Excel / CSV: parse client-side
        const buffer = base64ToArrayBuffer(contentBytes);
        let rows: ParsedPriceRow[] = [];

        if (isCsv(att)) {
          const text = new TextDecoder().decode(buffer);
          const result = parsePriceListCsvWithOverrides(text);
          rows = result.rows;
        } else {
          const sheets = getExcelSheets(buffer);
          if (sheets.length === 0) throw new Error("No sheets found in workbook");
          const best = sheets.reduce((a, b) => b.rowCount > a.rowCount ? b : a);
          const result = parseExcelSheetFull(buffer, best.name);
          rows = result.rows;
          if (result.allPricesZero && sheets.length > 1) {
            for (const sheet of sheets) {
              const r = parseExcelSheetFull(buffer, sheet.name);
              if (!r.allPricesZero && r.rows.length > 0) { rows = r.rows; break; }
            }
          }
        }

        if (rows.length === 0) {
          toast.error("No valid rows found in attachment — check column headers");
          return;
        }
        onImport(rows, sourceName);
        toast.success(`${rows.length} items parsed from ${att.name}`);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to import attachment");
    } finally {
      setLoading(false);
    }
  }

  const spreadsheetAtts = (attachments || []).filter(a => 
    isSpreadsheet(a) || isCsv(a) ||
    a.contentType?.toLowerCase().includes("pdf") ||
    a.name?.toLowerCase().endsWith(".pdf")
  );

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[9px] flex-shrink-0">
              {msg.supplierName || msg.from?.address}
            </Badge>
            <p className="text-xs font-medium truncate">{msg.subject}</p>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {format(parseISO(msg.receivedDateTime), "dd MMM yyyy HH:mm")}
            {msg.hasAttachments && (
              <span className="ml-1.5 flex items-center gap-0.5 inline-flex">
                <Paperclip className="w-2.5 h-2.5" />has attachment
              </span>
            )}
          </p>
          <p className="text-[10px] text-muted-foreground line-clamp-1">{msg.bodyPreview}</p>
        </div>
        <Button
          size="sm" variant="outline"
          className="h-7 px-2 text-xs gap-1 flex-shrink-0"
          onClick={fetchAttachments}
          disabled={loading}
        >
          {loading
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <Paperclip className="w-3 h-3" />}
          {attachments ? `${spreadsheetAtts.length} file${spreadsheetAtts.length !== 1 ? "s" : ""}` : "View files"}
        </Button>
      </div>

      {attachments !== null && (
        <div className="pl-2 space-y-1.5">
          {spreadsheetAtts.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No spreadsheet attachments found</p>
          ) : spreadsheetAtts.map(att => (
            <div key={att.id} className="flex items-center gap-2 p-2 rounded-md border bg-muted/30">
              <FileSpreadsheet className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
              <span className="text-xs flex-1 truncate">{att.name}</span>
              <span className="text-[10px] text-muted-foreground">
                {(att.size / 1024).toFixed(0)} KB
              </span>
              <Button size="sm" className="h-6 px-2 text-[10px] gap-1"
                onClick={() => importAttachment(att)} disabled={loading}>
                <Download className="w-2.5 h-2.5" />Import
              </Button>
            </div>
          ))}
          {(attachments || []).filter(a => !isSpreadsheet(a) && !isCsv(a)).length > 0 && (
            <p className="text-[10px] text-muted-foreground">
              {(attachments || []).filter(a => !isSpreadsheet(a) && !isCsv(a)).length} other attachment(s) (PDFs, images) — not importable as price list
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Purchase History Search ───────────────────────────────────────────────────

function PurchaseHistorySearch() {
  const [partNumber, setPartNumber] = useState("");
  const [query, setQuery] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["purchase-history", query],
    queryFn: () => searchPurchaseHistory(query),
    enabled: !!query,
    staleTime: 1000 * 60 * 5,
  });

  const messages = data?.messages || [];

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold mb-1">Search purchase history</p>
        <p className="text-[11px] text-muted-foreground mb-2">
          Searches emails from Black &amp; White Fire and Huvo for a part number to find what you previously paid
        </p>
      </div>
      <div className="flex gap-2">
        <Input
          value={partNumber}
          onChange={e => setPartNumber(e.target.value)}
          onKeyDown={e => e.key === "Enter" && setQuery(partNumber)}
          placeholder="e.g. S4-711, 55000-300, S4-34800…"
          className="h-8 text-sm font-mono"
        />
        <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => setQuery(partNumber)} disabled={!partNumber.trim() || isLoading}>
          {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          Search
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg border border-destructive/40 bg-destructive/5 text-xs text-destructive">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          Could not search — check Outlook connection
        </div>
      )}

      {query && !isLoading && (
        <div>
          {messages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm border rounded-lg bg-muted/20">
              <Package className="w-6 h-6 mx-auto mb-1.5 opacity-40" />
              No supplier emails found containing "{query}"
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs font-medium">{messages.length} email{messages.length !== 1 ? "s" : ""} found containing "{query}"</p>
              <div className="border rounded-lg divide-y divide-border/50 overflow-hidden">
                {messages.map(msg => (
                  <div key={msg.id} className="px-3 py-2.5 hover:bg-accent/20">
                    <div className="flex items-start gap-3 justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[9px]">
                            {(msg as any).supplierEmail?.includes("bawfs") ? "Black & White Fire" : "Huvo"}
                          </Badge>
                          <p className="text-xs font-medium truncate">{msg.subject}</p>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{msg.bodyPreview}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className="text-[10px] text-muted-foreground">
                          {format(parseISO(msg.receivedDateTime), "dd MMM yyyy")}
                        </span>
                        {msg.hasAttachments && (
                          <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                            <Paperclip className="w-2.5 h-2.5" />invoice
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Open the email in Outlook to see the exact pricing from the invoice or quote
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  onPreviewReady: (rows: ParsedPriceRow[], sourceName: string) => void;
}

export function SupplierPriceImport({ onPreviewReady }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["supplier-price-emails"],
    queryFn: getSupplierPriceEmails,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  const messages: (OutlookMessage & { supplierName?: string })[] = data?.messages || [];

  return (
    <div className="space-y-4">
      <Tabs defaultValue="import">
        <TabsList className="h-8">
          <TabsTrigger value="import" className="text-xs gap-1.5">
            <Mail className="w-3.5 h-3.5" />Import Price List
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs gap-1.5">
            <History className="w-3.5 h-3.5" />Purchase History
          </TabsTrigger>
        </TabsList>

        {/* ── Import Price List ── */}
        <TabsContent value="import" className="mt-3 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-xs font-semibold">Supplier price list emails</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Huvo and Black &amp; White Fire emails with spreadsheet attachments
              </p>
            </div>
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs"
              onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn("w-3 h-3", isFetching && "animate-spin")} />Refresh
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />Searching for supplier emails…
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-destructive/40 bg-destructive/5 text-xs text-destructive">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Could not connect to Outlook</p>
                <p className="mt-0.5 text-muted-foreground">Check MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET in Supabase Edge Function secrets</p>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm border rounded-lg bg-muted/20">
              <Mail className="w-6 h-6 mx-auto mb-1.5 opacity-40" />
              <p>No supplier emails with attachments found</p>
              <p className="text-xs mt-1">Emails from sales@huvo.co.uk and admin@bawfs.com with attachments will appear here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {messages.map(msg => (
                <SupplierEmailRow
                  key={msg.id}
                  msg={msg}
                  onImport={onPreviewReady}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Purchase History ── */}
        <TabsContent value="history" className="mt-3">
          <PurchaseHistorySearch />
        </TabsContent>
      </Tabs>
    </div>
  );
}
