/**
 * Updated EmailScanner page — integrates:
 * 1. Existing scan-email edge function (unchanged) for basic extraction
 * 2. SmartQuoteGenerator for device identification + price matching
 * 3. PriceListManager tab for uploading/managing price list
 *
 * This replaces src/pages/EmailScanner.tsx
 * Wrap the ENTIRE file content below.
 */

import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, Mail, FileSpreadsheet, ClipboardList, Sparkles,
  AlertCircle, CheckCircle2, Building2, User, MapPin, Phone,
  AtSign, ListPlus, Globe, BookOpen, ArrowRight, Settings, Inbox, Tag, MessageCircle, Wand2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EmailScannerQuoteFlow } from "@/components/email-scanner/EmailScannerQuoteFlow";
import { EmailScannerVisitFlow } from "@/components/email-scanner/EmailScannerVisitFlow";
import { EmailScannerBulkVisitFlow } from "@/components/email-scanner/EmailScannerBulkVisitFlow";
import { PriceListManager } from "@/components/email-scanner/PriceListManager";
import { SmartQuoteGenerator } from "@/components/email-scanner/SmartQuoteGenerator";
import { getPriceList, type PriceListItem, uploadPriceList, type ParsedPriceRow } from "@/services/priceListService";
import { InboxBrowser } from "@/components/email-scanner/InboxBrowser";
import { SupplierPriceImport } from "@/components/email-scanner/SupplierPriceImport";
import { WhatsAppScanner } from "@/components/email-scanner/WhatsAppScanner";
import { AutoQuoteReview } from "@/components/email-scanner/AutoQuoteReview";
import { IntentReviewQueue } from "@/components/email-scanner/IntentReviewQueue";
import { saveScannedIntents, type ScannedIntent } from "@/services/emailActionItemsService";
import type { SmartQuoteLine } from "@/components/email-scanner/SmartQuoteGenerator";

export interface ExtractedEmailData {
  sender_name?: string | null;
  sender_email?: string | null;
  company_name?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  site_name?: string | null;
  site_address?: string | null;
  site_city?: string | null;
  site_postcode?: string | null;
  visit_type?: string | null;
  urgency?: string | null;
  preferred_date?: string | null;
  description?: string | null;
  notes?: string | null;
  client_po_number?: string | null;
  scope_summary?: string | null;
  job_requirements?: Array<{ description: string; estimated_quantity?: number; unit?: string }>;
  special_requirements?: string | null;
  rams_considerations?: string | null;
  // Injected by smart quote flow
  smart_lines?: SmartQuoteLine[];
}

const EmailScanner = () => {
  const [emailContent, setEmailContent] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanMode, setScanMode] = useState<"quote" | "visit" | "bulk_visits" | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedEmailData | null>(null);
  const [bulkData, setBulkData] = useState<any>(null);
  const [activeFlow, setActiveFlow] = useState<"quote" | "visit" | "bulk_visits" | null>(null);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [smartLines, setSmartLines] = useState<SmartQuoteLine[]>([]);
  const [showSmartQuote, setShowSmartQuote] = useState(false);
  const [activeTab, setActiveTab] = useState("scanner");
  const [pendingPdfs, setPendingPdfs] = useState<{ name: string; contentBytes: string }[]>([]);
  const [supplierPreview, setSupplierPreview] = useState<{ rows: ParsedPriceRow[]; sourceName: string } | null>(null);
  const [lastSourceEmail, setLastSourceEmail] = useState<{ subject?: string; from?: string }>({});
  const qc = useQueryClient();

  // Load price list
  const { data: priceList = [] } = useQuery({
    queryKey: ["price-list"],
    queryFn: () => getPriceList(true),
  });

  const handleScan = async (mode: "quote" | "visit" | "bulk_visits") => {
    if (!emailContent.trim()) {
      toast.error("Paste an email first");
      return;
    }
    setScanning(true);
    setScanMode(mode);
    setExtractedData(null);
    setBulkData(null);
    setActiveFlow(null);
    setShowSmartQuote(false);
    setSmartLines([]);

    // Edge function rejects content > 200k chars. Keep the tail (most recent messages).
    const MAX_CHARS = 190000;
    let payload = emailContent.trim();
    if (payload.length > MAX_CHARS) {
      payload = payload.slice(-MAX_CHARS);
      toast.info(`Conversation truncated to last ${(MAX_CHARS / 1000).toFixed(0)}k characters for AI scan`);
    }

    try {
      const { data, error } = await supabase.functions.invoke("scan-email", {
        body: {
          emailContent: payload,
          mode,
          pdfAttachments: pendingPdfs,
        },
      });
      if (error) throw error;
      if (data?.success && data?.data) {
        if (mode === "bulk_visits") {
          setBulkData(data.data);
          setActiveFlow("bulk_visits");
          toast.success(`Found ${data.data.visits?.length || 0} visits`);
        } else {
          setExtractedData(data.data);
          if (mode === "quote") setShowSmartQuote(true);
          toast.success("Email scanned — review extracted details");
        }
      } else {
        throw new Error(data?.error || "Failed to extract data");
      }
    } catch (err: any) {
      toast.error(err.message || "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const handleImportPrices = async () => {
    if (!emailContent.trim() && pendingPdfs.length === 0) {
      toast.error("Paste an email or attach a PDF first");
      return;
    }
    setScanning(true);
    setScanMode(null);
    try {
      const allRows: ParsedPriceRow[] = [];
      const sourceParts: string[] = [];

      // Extract from each PDF attachment
      for (const pdf of pendingPdfs) {
        const { data, error } = await supabase.functions.invoke("extract-pdf-prices", {
          body: { pdfBase64: pdf.contentBytes, filename: pdf.name },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        const rows = (data?.rows || []) as any[];
        rows.forEach((r, i) => allRows.push({ ...r, _rowIndex: allRows.length + i + 1 } as ParsedPriceRow));
        if (rows.length > 0) sourceParts.push(pdf.name);
      }

      // Extract from email body text
      if (emailContent.trim()) {
        const { data, error } = await supabase.functions.invoke("extract-pdf-prices", {
          body: { emailText: emailContent.trim(), filename: "email-body" },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        const rows = (data?.rows || []) as any[];
        rows.forEach((r, i) => allRows.push({ ...r, _rowIndex: allRows.length + i + 1 } as ParsedPriceRow));
        if (rows.length > 0) sourceParts.push("email body");
      }

      if (allRows.length === 0) {
        toast.warning("No priced items found — make sure the email/PDF contains part numbers and prices");
        return;
      }

      const sourceName = `Email scan — ${sourceParts.join(", ")}`;
      setSupplierPreview({ rows: allRows, sourceName });
      setActiveTab("pricelist");
      toast.success(`${allRows.length} priced items extracted — review and import in Price List tab`);
    } catch (err: any) {
      toast.error(err.message || "Price extraction failed");
    } finally {
      setScanning(false);
    }
  };

  function handleInboxScan(
    emailBody: string,
    subject: string,
    from: string,
    pdfAttachments?: { name: string; contentBytes: string }[]
  ) {
    setEmailContent(emailBody);
    setPendingPdfs(pdfAttachments || []);
    setActiveTab("scanner");
  }

  async function handleSupplierPreview(rows: ParsedPriceRow[], sourceName: string) {
    setSupplierPreview({ rows, sourceName });
    setActiveTab("pricelist");
    toast.success(`${rows.length} items from ${sourceName} — review and import in Price List tab`);
  }

  const handleReset = () => {
    setExtractedData(null);
    setBulkData(null);
    setActiveFlow(null);
    setScanMode(null);
    setShowSmartQuote(false);
    setSmartLines([]);
    setPendingPdfs([]);
  };

  const handleProceedToQuote = () => {
    if (!extractedData) return;
    setActiveFlow("quote");
    // Pass smart lines into the quote flow via extractedData
    setExtractedData(prev => prev ? { ...prev, smart_lines: smartLines } : prev);
  };

  // ── Extraction result cards ──────────────────────────────────────────────────
  const renderExtracted = (data: ExtractedEmailData) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {/* Contact */}
      {(data.company_name || data.contact_name || data.contact_email) && (
        <Card className="border-border/60">
          <CardContent className="p-3 space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Building2 className="w-3 h-3" />Contact
            </p>
            {data.company_name && <p className="text-sm font-semibold">{data.company_name}</p>}
            {data.contact_name && <p className="text-xs text-muted-foreground">{data.contact_name}</p>}
            {data.contact_email && <p className="text-xs text-muted-foreground">{data.contact_email}</p>}
            {data.contact_phone && <p className="text-xs text-muted-foreground">{data.contact_phone}</p>}
          </CardContent>
        </Card>
      )}
      {/* Site */}
      {(data.site_name || data.site_address) && (
        <Card className="border-border/60">
          <CardContent className="p-3 space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <MapPin className="w-3 h-3" />Site
            </p>
            {data.site_name && <p className="text-sm font-semibold">{data.site_name}</p>}
            {data.site_address && <p className="text-xs text-muted-foreground">{data.site_address}</p>}
            {data.site_postcode && <p className="text-xs font-mono text-muted-foreground">{data.site_postcode}</p>}
          </CardContent>
        </Card>
      )}
      {/* Scope */}
      {data.scope_summary && (
        <Card className="md:col-span-2 border-border/60">
          <CardContent className="p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Scope</p>
            <p className="text-xs leading-relaxed">{data.scope_summary}</p>
          </CardContent>
        </Card>
      )}
      {/* Requirements */}
      {data.job_requirements && data.job_requirements.length > 0 && (
        <Card className="md:col-span-2 border-border/60">
          <CardContent className="p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
              Identified Requirements ({data.job_requirements.length})
            </p>
            <div className="space-y-1">
              {data.job_requirements.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-muted-foreground w-4 flex-shrink-0">{i + 1}.</span>
                  <span className="flex-1">{r.description}</span>
                  {r.estimated_quantity && (
                    <Badge variant="outline" className="text-[9px] flex-shrink-0">×{r.estimated_quantity}{r.unit ? ` ${r.unit}` : ""}</Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-5 p-4 md:p-6">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" />
              Email Scanner
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              Paste an email → AI identifies devices and quantities → matches your price list → ready-to-send quote
            </p>
          </div>
        </div>

        {/* Active flows take over full page */}
        {activeFlow === "quote" && extractedData && (
          <EmailScannerQuoteFlow data={extractedData} onBack={handleReset} />
        )}
        {activeFlow === "visit" && extractedData && (
          <EmailScannerVisitFlow data={extractedData} onBack={handleReset} />
        )}
        {activeFlow === "bulk_visits" && bulkData && (
          <EmailScannerBulkVisitFlow data={bulkData} onBack={handleReset} />
        )}

        {!activeFlow && (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="scanner" className="gap-1.5">
                <Mail className="w-3.5 h-3.5" />Scanner
              </TabsTrigger>
              <TabsTrigger value="inbox" className="gap-1.5">
                <Inbox className="w-3.5 h-3.5" />Inbox
              </TabsTrigger>
              <TabsTrigger value="supplier" className="gap-1.5">
                <Building2 className="w-3.5 h-3.5" />Suppliers
              </TabsTrigger>
              <TabsTrigger value="whatsapp" className="gap-1.5 text-green-700">
                <MessageCircle className="w-3.5 h-3.5" />WhatsApp
              </TabsTrigger>
              <TabsTrigger value="pricelist" className="gap-1.5">
                <BookOpen className="w-3.5 h-3.5" />Price List
                {priceList.length > 0 && <Badge variant="secondary" className="ml-1 text-[9px]">{priceList.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="autoquote" className="gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />Auto-Quote
              </TabsTrigger>
            </TabsList>

            <TabsContent value="autoquote" className="mt-4">
              <AutoQuoteReview />
            </TabsContent>

            {/* ── Scanner tab ── */}
            <TabsContent value="scanner" className="mt-4 space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: email input */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Email</CardTitle>
                    <CardDescription>Paste the full email including any quoted text</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Textarea
                      value={emailContent}
                      onChange={e => setEmailContent(e.target.value)}
                      placeholder="Paste email here…&#10;&#10;e.g. Hi, we need 12 optical smoke detectors and 4 VADs installed at our office on the 2nd floor. We have a Gent system. Please can you quote for supply and fit including cabling?"
                      className="min-h-[280px] font-mono text-xs resize-none"
                    />
                    {/* Web search toggle */}
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs font-medium">Web search for prices</p>
                          <p className="text-[10px] text-muted-foreground">Claude searches online for items not in your price list</p>
                        </div>
                      </div>
                      <Switch checked={useWebSearch} onCheckedChange={setUseWebSearch} />
                    </div>
                    {/* Price list status */}
                    {priceList.length > 0 ? (
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200/60 text-xs text-green-800">
                        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                        <span><strong>{priceList.length} items</strong> in your price list — will be matched first</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200/60 text-xs text-amber-800">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>No price list — <button className="underline" onClick={() => setActiveTab("pricelist")}>upload one</button> for more accurate pricing</span>
                      </div>
                    )}
                    {/* Scan buttons */}
                    <div className="grid grid-cols-1 gap-2">
                      <Button
                        onClick={() => handleScan("quote")}
                        disabled={scanning || !emailContent.trim()}
                        className="w-full gap-2"
                      >
                        {scanning && scanMode === "quote" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        Smart Quote
                      </Button>
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" onClick={() => handleScan("visit")} disabled={scanning || !emailContent.trim()} className="gap-1.5 text-sm">
                          {scanning && scanMode === "visit" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ClipboardList className="w-3.5 h-3.5" />}
                          Book Visit
                        </Button>
                        <Button variant="outline" onClick={() => handleScan("bulk_visits")} disabled={scanning || !emailContent.trim()} className="gap-1.5 text-sm">
                          {scanning && scanMode === "bulk_visits" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ListPlus className="w-3.5 h-3.5" />}
                          Bulk Visits
                        </Button>
                      </div>
                      <Button
                        variant="outline"
                        onClick={handleImportPrices}
                        disabled={scanning || (!emailContent.trim() && pendingPdfs.length === 0)}
                        className="w-full gap-1.5 text-sm"
                      >
                        {scanning && scanMode === null ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Tag className="w-3.5 h-3.5" />}
                        Import Prices to Price List
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Right: extraction results + smart quote */}
                <div className="space-y-4">
                  {extractedData && (
                    <>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <span className="text-sm font-medium">Extracted from email</span>
                      </div>
                      {renderExtracted(extractedData)}
                    </>
                  )}

                  {/* Smart Quote Generator */}
                  {showSmartQuote && extractedData && (
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-primary" />
                            Device & Price Matching
                          </CardTitle>
                        </div>
                        <CardDescription className="text-xs">
                          Claude identifies specific devices, quantities and finds prices
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <SmartQuoteGenerator
                          emailContent={emailContent}
                          extractedScope={extractedData.scope_summary || ""}
                          extractedRequirements={extractedData.job_requirements || []}
                          priceList={priceList}
                          useWebSearch={useWebSearch}
                          onLinesGenerated={lines => setSmartLines(lines)}
                        />
                        {smartLines.length > 0 && (
                          <div className="mt-4 pt-4 border-t">
                            <Button className="w-full gap-2" onClick={handleProceedToQuote}>
                              <ArrowRight className="w-4 h-4" />
                              Proceed to Quote Builder
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Visit-mode extracted data action */}
                  {extractedData && scanMode === "visit" && (
                    <Button className="w-full gap-2" onClick={() => setActiveFlow("visit")}>
                      <ArrowRight className="w-4 h-4" />Create Visit
                    </Button>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* ── Inbox tab ── */}
            <TabsContent value="inbox" className="mt-4">
              <Card>
                <CardContent className="pt-4">
                  <InboxBrowser onScanEmail={handleInboxScan} />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Supplier tab ── */}
            <TabsContent value="supplier" className="mt-4">
              <Card>
                <CardContent className="pt-4">
                  <SupplierPriceImport onPreviewReady={handleSupplierPreview} />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── WhatsApp tab ── */}
            <TabsContent value="whatsapp" className="mt-4">
              <Card>
                <CardContent className="pt-4">
                  <WhatsAppScanner
                    onScanMessage={(content, from) => {
                      setEmailContent(content);
                      setActiveTab("scanner");
                      toast.success(`WhatsApp from ${from} loaded`);
                    }}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="pricelist" className="mt-4">
              <Card>
                <CardContent className="pt-5">
                  <PriceListManager
                    initialPreview={supplierPreview}
                    onPreviewConsumed={() => setSupplierPreview(null)}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
};

export default EmailScanner;
