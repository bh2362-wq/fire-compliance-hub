import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Upload,
  Loader2,
  FileText,
  CheckCircle,
  AlertTriangle,
  X,
  FileSpreadsheet,
  Files,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { VISIT_TYPES } from "@/constants/visitTypes";
import * as XLSX from "xlsx";

interface BulkPOItem {
  id: string;
  fileName?: string;
  file?: File;
  status: "pending" | "scanning" | "scanned" | "creating" | "done" | "error";
  error?: string;
  customerName: string;
  siteName: string;
  siteAddress: string;
  poNumber: string;
  scopeOfWork: string;
  visitType: string;
  matchedCustomerId: string | null;
  matchedSiteId: string | null;
}

interface BulkImportPODialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

let itemIdCounter = 0;

export default function BulkImportPODialog({ open, onOpenChange, onSuccess }: BulkImportPODialogProps) {
  const { user } = useAuth();
  const [items, setItems] = useState<BulkPOItem[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [sites, setSites] = useState<{ id: string; name: string; customer_id: string | null }[]>([]);
  const [processing, setProcessing] = useState(false);
  const [tab, setTab] = useState("pdfs");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const spreadsheetInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setItems([]);
      setProcessing(false);
      setTab("pdfs");
      loadData();
    }
  }, [open]);

  const loadData = async () => {
    const [custResult, siteResult] = await Promise.all([
      supabase.from("customers").select("id, name").order("name"),
      supabase.from("sites").select("id, name, customer_id").order("name"),
    ]);
    setCustomers(custResult.data || []);
    setSites(siteResult.data || []);
  };

  const matchCustomer = (name: string) => {
    if (!name) return null;
    const match = customers.find(
      (c) => c.name.toLowerCase().includes(name.toLowerCase()) ||
             name.toLowerCase().includes(c.name.toLowerCase())
    );
    return match?.id || null;
  };

  const matchSite = (siteName: string, customerId: string | null) => {
    if (!siteName) return null;
    const filtered = customerId ? sites.filter((s) => s.customer_id === customerId) : sites;
    const match = filtered.find(
      (s) => s.name.toLowerCase().includes(siteName.toLowerCase()) ||
             siteName.toLowerCase().includes(s.name.toLowerCase())
    );
    return match?.id || null;
  };

  // ── Multi-PDF Upload ──
  const handlePDFFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newItems: BulkPOItem[] = files.map((f) => ({
      id: `bulk-${++itemIdCounter}`,
      fileName: f.name,
      file: f,
      status: "pending" as const,
      customerName: "",
      siteName: "",
      siteAddress: "",
      poNumber: "",
      scopeOfWork: "",
      visitType: "remedial",
      matchedCustomerId: null,
      matchedSiteId: null,
    }));

    setItems((prev) => [...prev, ...newItems]);
    toast.success(`${files.length} file(s) added — scanning...`);

    // Scan each file sequentially to avoid overwhelming the edge function
    for (const item of newItems) {
      await scanSingleFile(item);
    }
  };

  const scanSingleFile = async (item: BulkPOItem) => {
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: "scanning" } : i));

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const formData = new FormData();
      formData.append("file", item.file!);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/scan-client-po`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Scan failed (${response.status})`);
      }

      const result = await response.json();
      if (!result.success) throw new Error(result.error || "Extraction failed");

      const data = result.data;
      const custId = matchCustomer(data.customer_name || "");
      const siteId = matchSite(data.site_name || "", custId);

      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: "scanned",
                customerName: data.customer_name || "",
                siteName: data.site_name || "",
                siteAddress: data.site_address || "",
                poNumber: data.po_number || "",
                scopeOfWork: data.scope_of_work || "",
                visitType: data.visit_type || "remedial",
                matchedCustomerId: custId,
                matchedSiteId: siteId,
              }
            : i
        )
      );
    } catch (error: any) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, status: "error", error: error.message } : i
        )
      );
    }
  };

  // ── Spreadsheet Import ──
  const handleSpreadsheet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

      if (rows.length === 0) {
        toast.error("No data found in spreadsheet");
        return;
      }

      const newItems: BulkPOItem[] = rows.map((row) => {
        const customerName = String(row["Customer"] || row["customer"] || row["Customer Name"] || row["customer_name"] || "");
        const siteName = String(row["Site"] || row["site"] || row["Site Name"] || row["site_name"] || "");
        const custId = matchCustomer(customerName);
        const siteId = matchSite(siteName, custId);

        return {
          id: `bulk-${++itemIdCounter}`,
          fileName: file.name,
          status: "scanned" as const,
          customerName,
          siteName,
          siteAddress: String(row["Site Address"] || row["site_address"] || row["Address"] || row["address"] || ""),
          poNumber: String(row["PO Number"] || row["po_number"] || row["PO"] || row["po"] || ""),
          scopeOfWork: String(row["Scope"] || row["scope"] || row["Scope of Work"] || row["scope_of_work"] || row["Description"] || row["description"] || ""),
          visitType: String(row["Job Type"] || row["job_type"] || row["Visit Type"] || row["visit_type"] || "remedial"),
          matchedCustomerId: custId,
          matchedSiteId: siteId,
        };
      });

      setItems((prev) => [...prev, ...newItems]);
      toast.success(`${newItems.length} PO(s) imported from spreadsheet`);
    } catch (error: any) {
      toast.error("Failed to parse spreadsheet: " + error.message);
    }
  };

  // ── Create All Jobs ──
  const handleCreateAll = async () => {
    if (!user?.id) return;

    const readyItems = items.filter((i) => i.status === "scanned" && i.matchedCustomerId);
    if (readyItems.length === 0) {
      toast.error("No items ready to create — ensure each has a matched customer");
      return;
    }

    setProcessing(true);
    let created = 0;
    let failed = 0;

    for (const item of readyItems) {
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: "creating" } : i));

      try {
        let siteId = item.matchedSiteId;

        // Create site if not matched
        if (!siteId && item.siteName) {
          const { data: newSite, error: siteError } = await supabase
            .from("sites")
            .insert({
              name: item.siteName,
              address: item.siteAddress || null,
              customer_id: item.matchedCustomerId,
            })
            .select("id")
            .single();

          if (siteError) throw siteError;
          siteId = newSite.id;
        }

        if (!siteId) throw new Error("No site specified");

        // Create visit
        const { error: visitError } = await supabase
          .from("service_visits")
          .insert({
            site_id: siteId,
            visit_type: item.visitType || "remedial",
            visit_date: new Date().toISOString().split("T")[0],
            status: "awaiting_scheduling",
            notes: item.scopeOfWork || null,
            client_po_number: item.poNumber || null,
          });

        if (visitError) throw visitError;

        setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: "done" } : i));
        created++;
      } catch (error: any) {
        setItems((prev) =>
          prev.map((i) => i.id === item.id ? { ...i, status: "error", error: error.message } : i)
        );
        failed++;
      }
    }

    setProcessing(false);
    toast.success(`${created} job(s) created${failed > 0 ? `, ${failed} failed` : ""}`);
    if (created > 0) onSuccess();
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const updateItem = (id: string, field: keyof BulkPOItem, value: any) => {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, [field]: value } : i));
  };

  const readyCount = items.filter((i) => i.status === "scanned" && i.matchedCustomerId).length;
  const scanningCount = items.filter((i) => i.status === "scanning").length;
  const doneCount = items.filter((i) => i.status === "done").length;
  const errorCount = items.filter((i) => i.status === "error").length;

  const statusIcon = (status: BulkPOItem["status"]) => {
    switch (status) {
      case "pending": return <Badge variant="secondary" className="text-xs">Pending</Badge>;
      case "scanning": return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
      case "scanned": return <Badge variant="outline" className="text-xs">Ready</Badge>;
      case "creating": return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
      case "done": return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "error": return <AlertTriangle className="w-4 h-4 text-destructive" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Files className="w-5 h-5" />
            Bulk Import Purchase Orders
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="pdfs">
              <FileText className="w-4 h-4 mr-1" />
              Upload PDFs
            </TabsTrigger>
            <TabsTrigger value="spreadsheet">
              <FileSpreadsheet className="w-4 h-4 mr-1" />
              Import Spreadsheet
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pdfs">
            <div
              className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-foreground font-medium">Drop or select multiple PO PDFs</p>
              <p className="text-sm text-muted-foreground">Each PDF will be scanned by AI to extract job details</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                multiple
                className="hidden"
                onChange={handlePDFFiles}
              />
            </div>
          </TabsContent>

          <TabsContent value="spreadsheet">
            <div
              className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => spreadsheetInputRef.current?.click()}
            >
              <FileSpreadsheet className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-foreground font-medium">Upload Excel or CSV</p>
              <p className="text-sm text-muted-foreground">
                Expected columns: Customer, Site, PO Number, Scope, Job Type, Site Address
              </p>
              <input
                ref={spreadsheetInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleSpreadsheet}
              />
            </div>
          </TabsContent>
        </Tabs>

        {/* Summary bar */}
        {items.length > 0 && (
          <div className="flex items-center gap-3 text-sm">
            <Badge variant="secondary">{items.length} total</Badge>
            {scanningCount > 0 && <Badge variant="outline">{scanningCount} scanning</Badge>}
            {readyCount > 0 && <Badge className="bg-primary/10 text-primary">{readyCount} ready</Badge>}
            {doneCount > 0 && <Badge className="bg-green-500/10 text-green-600">{doneCount} created</Badge>}
            {errorCount > 0 && <Badge variant="destructive">{errorCount} failed</Badge>}
          </div>
        )}

        {/* Items table */}
        {items.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">Status</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead className="w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{statusIcon(item.status)}</TableCell>
                    <TableCell>
                      {item.status === "scanned" ? (
                        <Select
                          value={item.matchedCustomerId || ""}
                          onValueChange={(v) => {
                            updateItem(item.id, "matchedCustomerId", v || null);
                            // Re-match site
                            const siteId = matchSite(item.siteName, v || null);
                            updateItem(item.id, "matchedSiteId", siteId);
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder={item.customerName || "Select..."} />
                          </SelectTrigger>
                          <SelectContent>
                            {customers.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs">{item.customerName || "-"}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.status === "scanned" ? (
                        item.matchedSiteId ? (
                          <Select
                            value={item.matchedSiteId}
                            onValueChange={(v) => updateItem(item.id, "matchedSiteId", v)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(item.matchedCustomerId
                                ? sites.filter((s) => s.customer_id === item.matchedCustomerId)
                                : sites
                              ).map((s) => (
                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            className="h-8 text-xs"
                            value={item.siteName}
                            onChange={(e) => updateItem(item.id, "siteName", e.target.value)}
                            placeholder="New site name"
                          />
                        )
                      ) : (
                        <span className="text-xs">{item.siteName || "-"}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.status === "scanned" ? (
                        <Input
                          className="h-8 text-xs w-24"
                          value={item.poNumber}
                          onChange={(e) => updateItem(item.id, "poNumber", e.target.value)}
                        />
                      ) : (
                        <span className="text-xs">{item.poNumber || "-"}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.status === "scanned" ? (
                        <Select
                          value={item.visitType}
                          onValueChange={(v) => updateItem(item.id, "visitType", v)}
                        >
                          <SelectTrigger className="h-8 text-xs w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {VISIT_TYPES.map((t) => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs">{item.visitType}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground line-clamp-1" title={item.scopeOfWork}>
                        {item.scopeOfWork || "-"}
                      </span>
                      {item.error && (
                        <span className="text-xs text-destructive block">{item.error}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.status !== "done" && item.status !== "creating" && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(item.id)}>
                          <X className="w-3 h-3" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Actions */}
        {items.length > 0 && (
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={processing}>
              Cancel
            </Button>
            <Button
              variant="hero"
              onClick={handleCreateAll}
              disabled={processing || readyCount === 0}
            >
              {processing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Create {readyCount} Job{readyCount !== 1 ? "s" : ""}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
