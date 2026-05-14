import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Trash2,
  Plus,
  Save,
  PoundSterling,
  FileDown,
  Mail,
  User,
  Sparkles,
  Merge,
  LockOpen,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { generateQuotationPDF, QuotationData, PDFColumnOptions } from "@/lib/quotationPdfGenerator";
import { getCompanySettings } from "@/services/companySettingsService";
import { EmailQuotationDialog } from "./EmailQuotationDialog";
import { AIRewriteButton } from "@/components/reports/AIRewriteButton";

interface LineItem {
  id: string;
  description: string;
  regulation_reference: string | null;
  priority: string;
  item_name: string | null;
  parent_id: string | null;
  source_section: string | null;
  quantity: number;
  unit_price: number;
  markup_percent: number;
  labour_cost: number;
  labour_included: boolean;
  total_price: number;
  notes: string | null;
  sort_order: number;
}

interface QuotationFull {
  id: string;
  quotation_number: string;
  status: string;
  title: string | null;
  summary: string | null;
  total_amount: number;
  valid_until: string | null;
  notes: string | null;
  created_at: string;
  site_id: string;
  customer_id: string | null;
  locked_at: string | null;
  locked_by: string | null;
  sites: {
    name: string;
    address?: string | null;
    city?: string | null;
    postcode?: string | null;
    customer_id?: string | null;
  } | null;
  customers: {
    name: string;
    contact_name?: string | null;
    contact_email?: string | null;
    contact_phone?: string | null;
    address?: string | null;
    city?: string | null;
    postcode?: string | null;
  } | null;
}

interface QuotationDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quotationId: string;
  onUpdate?: () => void;
}

const DEFAULT_TERMS = `1. This quotation is valid for 30 days from the date of issue.
2. Payment terms: 30 days from invoice date.
3. All prices are exclusive of VAT unless otherwise stated.
4. Work will be carried out during normal working hours (08:00-17:00 Mon-Fri).
5. Access to all areas requiring work must be provided.
6. Any additional work identified during the visit will be quoted separately.`;

export function QuotationDetailDialog({ open, onOpenChange, quotationId, onUpdate }: QuotationDetailDialogProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [improving, setImproving] = useState(false);
  const [quotation, setQuotation] = useState<QuotationFull | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  // Editable fields
  const [quotationNumber, setQuotationNumber] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState(DEFAULT_TERMS);
  const [validUntil, setValidUntil] = useState("");
  const [vatRate, setVatRate] = useState(20);

  // Editable customer fields
  const [customerName, setCustomerName] = useState("");
  const [customerContactName, setCustomerContactName] = useState("");
  const [customerContactEmail, setCustomerContactEmail] = useState("");
  const [customerContactPhone, setCustomerContactPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerCity, setCustomerCity] = useState("");
  const [customerPostcode, setCustomerPostcode] = useState("");

  // PDF column options
  const [columnOptions, setColumnOptions] = useState<PDFColumnOptions>({
    showItemNumber: true,
    showDescription: true,
    showRegulationRef: false,
    showPriority: false,
    showItem: false,
    showQuantity: true,
    showUnitPrice: true,
    showLabour: false,
    showTotal: true,
  });

  useEffect(() => {
    if (open && quotationId) {
      fetchQuotation();
    }
  }, [open, quotationId]);

  const fetchQuotation = async () => {
    setLoading(true);
    try {
      const { data: quotationData, error: quotationError } = await supabase
        .from("quotations")
        .select(
          `
          *,
          sites:site_id(name, address, city, postcode, customer_id),
          customers:customer_id(name, contact_name, contact_email, contact_phone, address, city, postcode)
        `,
        )
        .eq("id", quotationId)
        .single();

      if (quotationError) throw quotationError;

      let customerData = quotationData.customers;
      if (!customerData && quotationData.sites?.customer_id) {
        const { data: siteCustomer } = await supabase
          .from("customers")
          .select("name, contact_name, contact_email, contact_phone, address, city, postcode")
          .eq("id", quotationData.sites.customer_id)
          .single();

        if (siteCustomer) {
          customerData = siteCustomer;
          await supabase
            .from("quotations")
            .update({ customer_id: quotationData.sites.customer_id })
            .eq("id", quotationId);
        }
      }

      setQuotation({ ...quotationData, customers: customerData });

      setQuotationNumber(quotationData.quotation_number || "");
      setTitle(quotationData.title || `Remedial Works - ${quotationData.sites?.name || "Site"}`);
      setSummary(quotationData.summary || "");
      setNotes(quotationData.notes || "");
      setTerms((quotationData as any).terms || DEFAULT_TERMS);
      setValidUntil(quotationData.valid_until || "");
      setVatRate((quotationData as any).vat_rate ?? 20);

      if (customerData) {
        setCustomerName(customerData.name || "");
        setCustomerContactName(customerData.contact_name || "");
        setCustomerContactEmail(customerData.contact_email || "");
        setCustomerContactPhone(customerData.contact_phone || "");
        setCustomerAddress(customerData.address || "");
        setCustomerCity(customerData.city || "");
        setCustomerPostcode(customerData.postcode || "");
      }

      const { data: itemsData, error: itemsError } = await supabase
        .from("quotation_line_items")
        .select("*")
        .eq("quotation_id", quotationId)
        .order("sort_order", { ascending: true });

      if (itemsError) throw itemsError;
      const mappedItems = (itemsData || []).map((item) => ({
        ...item,
        markup_percent: (item as any).markup_percent || 0,
        labour_included: !!(item as any).labour_included,
      }));
      setLineItems(mappedItems);

      const parents = mappedItems.filter((i) => !i.parent_id);
      const hasRegRef = parents.some((i) => i.regulation_reference && i.regulation_reference.trim() !== "");
      const hasItem = parents.some((i) => i.item_name && i.item_name.trim() !== "");
      const hasLabour = parents.some((i) => (i.labour_cost || 0) > 0 || i.labour_included);
      setColumnOptions((prev) => ({
        ...prev,
        showRegulationRef: hasRegRef,
        showItem: hasItem,
        showLabour: hasLabour,
      }));
    } catch (error) {
      console.error("Error fetching quotation:", error);
      toast.error("Failed to load quotation");
    } finally {
      setLoading(false);
    }
  };

  const handleItemChange = (index: number, field: keyof LineItem, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    if (field === "quantity" || field === "unit_price" || field === "labour_cost" || field === "markup_percent") {
      const i = updated[index];
      updated[index].total_price =
        i.quantity * i.unit_price * (1 + (i.markup_percent || 0) / 100) + (i.labour_cost || 0);
    }
    setLineItems(updated);
    setHasChanges(true);
  };

  const handleAddItem = (parentId?: string) => {
    const newItem: LineItem = {
      id: `temp-${Date.now()}`,
      description: "",
      regulation_reference: null,
      priority: "medium",
      item_name: null,
      parent_id: parentId || null,
      source_section: null,
      quantity: 1,
      unit_price: 0,
      markup_percent: 0,
      labour_cost: 0,
      labour_included: false,
      total_price: 0,
      notes: null,
      sort_order: lineItems.length,
    };
    if (parentId) {
      const parentIndex = lineItems.findIndex((i) => i.id === parentId);
      let insertAt = parentIndex + 1;
      while (insertAt < lineItems.length && lineItems[insertAt].parent_id === parentId) insertAt++;
      const updated = [...lineItems];
      updated.splice(insertAt, 0, newItem);
      setLineItems(updated);
    } else {
      setLineItems([...lineItems, newItem]);
    }
    setHasChanges(true);
  };

  const handleRemoveItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  const handleMergeItems = () => {
    if (selectedItemIds.size < 2) {
      toast.error("Select at least 2 items to merge");
      return;
    }
    const selectedIndices = lineItems
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => selectedItemIds.has(item.id));
    if (selectedIndices.length < 2) return;
    const first = selectedIndices[0];
    const mergedDescription = selectedIndices
      .map(({ item }) => item.description)
      .filter(Boolean)
      .join("\n");
    const mergedQty = selectedIndices.reduce((sum, { item }) => sum + item.quantity, 0);
    const mergedLabour = selectedIndices.reduce((sum, { item }) => sum + (item.labour_cost || 0), 0);
    const mergedItem: LineItem = {
      ...first.item,
      description: mergedDescription,
      quantity: mergedQty,
      labour_cost: mergedLabour,
      total_price: mergedQty * first.item.unit_price * (1 + (first.item.markup_percent || 0) / 100) + mergedLabour,
    };
    const idsToRemove = new Set(selectedIndices.slice(1).map(({ item }) => item.id));
    const updated = lineItems
      .map((item) => (item.id === first.item.id ? mergedItem : item))
      .filter((item) => !idsToRemove.has(item.id));
    setLineItems(updated);
    setSelectedItemIds(new Set());
    setHasChanges(true);
    toast.success(`Merged ${selectedIndices.length} items`);
  };

  const handleImproveWithAI = async () => {
    if (lineItems.length === 0) return;
    setImproving(true);
    try {
      const descriptions = lineItems.map((item, i) => `${i + 1}. ${item.description}`).join("\n");
      const { data, error } = await supabase.functions.invoke("rewrite-text", {
        body: { text: descriptions, type: "quotation_items", generateQuotationMeta: true },
      });
      if (error) throw error;
      if (data?.rewrittenText) {
        const improvedLines = data.rewrittenText.split("\n").filter((l: string) => l.trim());
        const updated = [...lineItems];
        improvedLines.forEach((line: string) => {
          const match = line.match(/^(\d+)\.\s*(.*)/);
          if (match) {
            const idx = parseInt(match[1]) - 1;
            if (idx >= 0 && idx < updated.length) updated[idx] = { ...updated[idx], description: match[2].trim() };
          }
        });
        setLineItems(updated);
        setHasChanges(true);
        if (data.suggestedTitle) setTitle(data.suggestedTitle);
        if (data.suggestedSummary) setSummary(data.suggestedSummary);
        toast.success("Descriptions, title and scope improved with AI");
      }
    } catch (error) {
      console.error("AI improve error:", error);
      toast.error("Failed to improve descriptions");
    } finally {
      setImproving(false);
    }
  };

  const handleSave = async () => {
    if (!quotation) return;
    setSaving(true);
    try {
      const totalAmount = lineItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error: quotationError } = await supabase
        .from("quotations")
        .update({
          quotation_number: quotationNumber.trim(),
          total_amount: totalAmount,
          title,
          summary,
          notes,
          terms,
          vat_rate: vatRate,
          valid_until: validUntil || null,
          status: "sent",
          locked_at: new Date().toISOString(),
          locked_by: user?.id || null,
        })
        .eq("id", quotationId);
      if (quotationError) throw quotationError;

      const { error: deleteError } = await supabase
        .from("quotation_line_items")
        .delete()
        .eq("quotation_id", quotationId);
      if (deleteError) throw deleteError;

      if (lineItems.length > 0) {
        const parentItems = lineItems.filter((i) => !i.parent_id);
        const childItems = lineItems.filter((i) => !!i.parent_id);
        const idMap = new Map<string, string>();
        if (parentItems.length > 0) {
          const parentsToInsert = parentItems.map((item) => ({
            quotation_id: quotationId,
            description: item.description,
            regulation_reference: item.regulation_reference,
            priority: item.priority,
            item_name: item.item_name,
            parent_id: null,
            source_section: item.source_section,
            quantity: item.quantity,
            unit_price: item.unit_price,
            markup_percent: item.markup_percent || 0,
            labour_cost: item.labour_cost || 0,
            labour_included: item.labour_included || false,
            total_price: item.total_price,
            notes: item.notes,
            sort_order: lineItems.indexOf(item),
          }));
          const { data: insertedParents, error: parentError } = await supabase
            .from("quotation_line_items")
            .insert(parentsToInsert)
            .select("id");
          if (parentError) throw parentError;
          parentItems.forEach((item, idx) => {
            if (insertedParents?.[idx]) idMap.set(item.id, insertedParents[idx].id);
          });
        }
        if (childItems.length > 0) {
          const childrenToInsert = childItems.map((item) => ({
            quotation_id: quotationId,
            description: item.description,
            regulation_reference: item.regulation_reference,
            priority: item.priority,
            item_name: item.item_name,
            parent_id: idMap.get(item.parent_id!) || item.parent_id,
            source_section: item.source_section,
            quantity: item.quantity,
            unit_price: item.unit_price,
            markup_percent: item.markup_percent || 0,
            labour_cost: item.labour_cost || 0,
            labour_included: item.labour_included || false,
            total_price: item.total_price,
            notes: item.notes,
            sort_order: lineItems.indexOf(item),
          }));
          const { error: childError } = await supabase.from("quotation_line_items").insert(childrenToInsert);
          if (childError) throw childError;
        }
      }

      toast.success("Quotation saved & ready to resend — SharePoint syncing...");
      setHasChanges(false);
      onUpdate?.();
      fetchQuotation();

      try {
        const companySettings = await getCompanySettings();
        const pdfData = buildPDFData();
        let baseFolderPath: string | null = null;
        const { data: reportLink } = await supabase
          .from("quotations")
          .select("report_id")
          .eq("id", quotationId)
          .single();
        if (reportLink?.report_id) {
          const { data: report } = await supabase
            .from("service_reports")
            .select("sharepoint_folder, report_number, visits(visit_date)")
            .eq("id", reportLink.report_id)
            .single();
          if (report?.sharepoint_folder) {
            const visitDate = (report as any).visits?.visit_date;
            const reportNum = report.report_number || "DRAFT";
            const dateStr = visitDate ? format(new Date(visitDate), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
            baseFolderPath = `${report.sharepoint_folder}/${reportNum}_${dateStr}/Quotations`;
          }
        }
        if (!baseFolderPath) {
          const { data: siteData } = await supabase
            .from("sites")
            .select("sharepoint_folder, name, address")
            .eq("id", quotation.site_id)
            .single();
          if (siteData?.sharepoint_folder) {
            baseFolderPath = `${siteData.sharepoint_folder}/Quotations`;
          } else if (siteData && quotation.customers?.name) {
            const siteLabel = [siteData.name, siteData.address].filter(Boolean).join(" ");
            const siteFolderPath = `Customers/${quotation.customers.name}/${siteLabel}`;
            const { data: spData, error: spError } = await supabase.functions.invoke("sharepoint-create-folder", {
              body: {
                folderPath: `${siteFolderPath}/Quotations`,
                entityType: "folder_only",
                entityId: quotation.site_id,
              },
            });
            if (!spError && spData?.success) {
              await supabase.from("sites").update({ sharepoint_folder: siteFolderPath }).eq("id", quotation.site_id);
              baseFolderPath = `${siteFolderPath}/Quotations`;
            }
          }
        }
        if (baseFolderPath) {
          const pdfBase64 = await generateQuotationPDF(pdfData, companySettings || undefined, true, columnOptions);
          if (pdfBase64) {
            const pdfFileName = `${quotation.quotation_number} - ${quotation.sites?.name || "Site"}.pdf`;
            await supabase.functions.invoke("upload-to-sharepoint", {
              body: {
                folderPath: baseFolderPath,
                fileName: pdfFileName,
                fileBase64: pdfBase64,
                contentType: "application/pdf",
              },
            });
          }
        }
      } catch (spErr) {
        console.log("SharePoint sync after save skipped:", spErr);
      }
    } catch (error) {
      console.error("Error saving quotation:", error);
      toast.error("Failed to save quotation");
    } finally {
      setSaving(false);
    }
  };

  const buildPDFData = (): QuotationData => ({
    quotation_number: quotation!.quotation_number,
    title,
    summary,
    total_amount: lineItems.reduce((sum, item) => sum + (item.total_price || 0), 0),
    valid_until: validUntil,
    notes,
    terms,
    created_at: quotation!.created_at,
    site: {
      name: quotation!.sites?.name || "Unknown Site",
      address: quotation!.sites?.address,
      city: quotation!.sites?.city,
      postcode: quotation!.sites?.postcode,
    },
    customer: customerName
      ? {
          name: customerName,
          contact_name: customerContactName || null,
          contact_email: customerContactEmail || null,
          contact_phone: customerContactPhone || null,
          address: customerAddress || null,
          city: customerCity || null,
          postcode: customerPostcode || null,
        }
      : null,
    line_items: lineItems.map((item) => ({
      description: item.description,
      regulation_reference: item.regulation_reference,
      priority: item.priority,
      item_name: item.item_name,
      parent_id: item.parent_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      markup_percent: item.markup_percent || 0,
      labour_cost: item.labour_cost || 0,
      labour_included: item.labour_included || false,
      total_price: item.total_price,
    })),
    vat_rate: vatRate,
  });

  const lockQuotation = async () => {
    if (!quotation || quotation.locked_at) return;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await supabase
        .from("quotations")
        .update({ locked_at: new Date().toISOString(), locked_by: user?.id })
        .eq("id", quotationId);
      setQuotation((prev) => (prev ? { ...prev, locked_at: new Date().toISOString() } : null));
    } catch (error) {
      console.error("Error locking quotation:", error);
    }
  };

  const handleUnlockQuotation = async () => {
    if (!quotation) return;
    setUnlocking(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await supabase
        .from("quotations")
        .update({ locked_at: null, locked_by: null, status: "recalled" })
        .eq("id", quotationId);
      if (user)
        await supabase
          .from("audit_logs")
          .insert({
            user_id: user.id,
            entity_type: "quotation",
            entity_id: quotationId,
            action: "unlock_quotation",
            details: { quotation_number: quotation.quotation_number },
          });
      setQuotation((prev) => (prev ? { ...prev, locked_at: null, locked_by: null, status: "recalled" } : null));
      toast.success("Quotation unlocked for editing");
      setUnlockDialogOpen(false);
    } catch (error) {
      console.error("Error unlocking quotation:", error);
      toast.error("Failed to unlock quotation");
    } finally {
      setUnlocking(false);
    }
  };

  const handleGeneratePDF = async () => {
    if (!quotation) return;
    setGenerating(true);
    try {
      const companySettings = await getCompanySettings();
      const pdfData = buildPDFData();
      await generateQuotationPDF(pdfData, companySettings || undefined, false, columnOptions);
      try {
        const { data: reportData } = await supabase
          .from("quotations")
          .select("report_id")
          .eq("id", quotation.id)
          .single();
        let baseFolderPath: string | null = null;
        if (reportData?.report_id) {
          const { data: report } = await supabase
            .from("service_reports")
            .select("sharepoint_folder, report_number, visits(visit_date)")
            .eq("id", reportData.report_id)
            .single();
          if (report?.sharepoint_folder) {
            const visitDate = (report as any).visits?.visit_date;
            const reportNum = report.report_number || "DRAFT";
            const dateStr = visitDate ? format(new Date(visitDate), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
            baseFolderPath = `${report.sharepoint_folder}/${reportNum}_${dateStr}/Quotations`;
          }
        }
        if (!baseFolderPath) {
          const { data: siteData } = await supabase
            .from("sites")
            .select("sharepoint_folder, name, address")
            .eq("id", quotation.site_id)
            .single();
          if (siteData?.sharepoint_folder) {
            baseFolderPath = `${siteData.sharepoint_folder}/Quotations`;
          } else if (siteData && quotation.customers?.name) {
            const siteLabel = [siteData.name, siteData.address].filter(Boolean).join(" ");
            const siteFolderPath = `Customers/${quotation.customers.name}/${siteLabel}`;
            const { data: spData, error: spError } = await supabase.functions.invoke("sharepoint-create-folder", {
              body: {
                folderPath: `${siteFolderPath}/Quotations`,
                entityType: "folder_only",
                entityId: quotation.site_id,
              },
            });
            if (!spError && spData?.success) {
              await supabase
                .from("sites")
                .update({ sharepoint_folder: siteFolderPath, sharepoint_url: null })
                .eq("id", quotation.site_id);
              baseFolderPath = `${siteFolderPath}/Quotations`;
            }
          }
        }
        if (baseFolderPath) {
          const pdfBase64 = await generateQuotationPDF(pdfData, companySettings || undefined, true, columnOptions);
          if (pdfBase64) {
            const pdfFileName = `${quotation.quotation_number} - ${quotation.sites?.name || "Site"}.pdf`;
            await supabase.functions.invoke("upload-to-sharepoint", {
              body: {
                folderPath: baseFolderPath,
                fileName: pdfFileName,
                fileBase64: pdfBase64,
                contentType: "application/pdf",
              },
            });
          }
        }
      } catch (spErr) {
        console.log("SharePoint quotation upload skipped:", spErr);
      }
      await lockQuotation();
      toast.success("PDF generated successfully");
      onUpdate?.();
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF");
    } finally {
      setGenerating(false);
    }
  };

  const totalAmount = lineItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
  const vatAmount = totalAmount * (vatRate / 100);
  const grandTotal = totalAmount + vatAmount;
  const isLocked = !!quotation?.locked_at && quotation?.status !== "recalled";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl h-[96vh] flex flex-col p-0 gap-0 bg-white">
          <div className="flex items-center justify-between px-5 py-2.5 border-b border-[#e0e0e0] bg-white shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <Input
                value={quotationNumber}
                onChange={(e) => {
                  setQuotationNumber(e.target.value);
                  setHasChanges(true);
                }}
                className="w-[140px] font-bold text-sm h-8 border-[#dadce0] font-mono"
                disabled={isLocked}
              />
              {quotation && (
                <span
                  className={`vstatus ${quotation.status === "sent" ? "vstatus-completed" : quotation.status === "accepted" ? "vstatus-completed" : quotation.status === "recalled" ? "vstatus-overdue" : "vstatus-scheduled"}`}
                >
                  {quotation.status}
                </span>
              )}
              {isLocked && (
                <button
                  onClick={() => setUnlockDialogOpen(true)}
                  className="text-[11px] text-muted-foreground hover:text-foreground underline"
                >
                  🔒 Locked — click to unlock
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={() => setEmailDialogOpen(true)}
                disabled={loading || lineItems.length === 0 || !customerContactEmail || isLocked}
              >
                <Mail className="w-3.5 h-3.5" />
                Email
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={handleGeneratePDF}
                disabled={generating || loading || lineItems.length === 0}
              >
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                PDF
              </Button>
              {!isLocked && (
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1"
                  style={{ background: "#e85c2c" }}
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Save &
                  Sync
                </Button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 bg-[#f8f9fa]">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : !quotation ? (
              <p className="text-center py-12 text-muted-foreground">Quotation not found</p>
            ) : (
              <div className="bg-white border border-[#e0e0e0]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.08)" }}>
                <div className="px-5 pt-5 pb-4 border-b border-[#e0e0e0]">
                  <div className="flex items-start justify-between">
                    <div>
                      <h1 className="text-[17px] font-bold text-[#1a1a1a]">Quotation</h1>
                      <p className="text-[11px] text-[#e85c2c] font-medium mt-0.5">BHO Fire & Security Ltd</p>
                    </div>
                    <div className="text-right text-[11px] text-[#5f6368]">
                      <p className="font-medium">{quotationNumber}</p>
                      <p>Date: {format(new Date(quotation.created_at), "dd MMM yyyy")}</p>
                      {validUntil && <p>Valid until: {format(new Date(validUntil), "dd MMM yyyy")}</p>}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 border-b border-[#e0e0e0]">
                  <div className="border-r border-[#e0e0e0]">
                    <div className="bg-[#3c3c3c] text-white text-[11px] font-bold uppercase tracking-wide px-3 py-1.5">
                      CLIENT
                    </div>
                    <div className="px-4 py-3 space-y-2">
                      {[
                        ["Company:", customerName, setCustomerName, "Company name"],
                        ["Contact:", customerContactName, setCustomerContactName, "Contact name"],
                        ["Email:", customerContactEmail, setCustomerContactEmail, "Email address"],
                        ["Phone:", customerContactPhone, setCustomerContactPhone, "Phone number"],
                        ["Address:", customerAddress, setCustomerAddress, "Address"],
                        ["City:", customerCity, setCustomerCity, "City"],
                        ["Postcode:", customerPostcode, setCustomerPostcode, "Postcode"],
                      ].map(([lbl, val, setter, ph]) => (
                        <div key={lbl as string} className="flex items-center gap-2 text-[12px]">
                          <span className="text-[#5f6368] min-w-[60px] shrink-0">{lbl}</span>
                          <Input
                            className="h-6 text-xs border-[#dadce0] flex-1"
                            value={val as string}
                            onChange={(e) => {
                              (setter as (v: string) => void)(e.target.value);
                              setHasChanges(true);
                            }}
                            placeholder={ph as string}
                            disabled={isLocked}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="bg-[#3c3c3c] text-white text-[11px] font-bold uppercase tracking-wide px-3 py-1.5">
                      SITE
                    </div>
                    <div className="px-4 py-3 space-y-2">
                      <div className="flex items-center gap-2 text-[12px]">
                        <span className="text-[#5f6368] min-w-[60px]">Site:</span>
                        <span className="text-sm font-medium">{quotation.sites?.name || "—"}</span>
                      </div>
                      {quotation.sites?.address && (
                        <div className="flex items-start gap-2 text-[12px]">
                          <span className="text-[#5f6368] min-w-[60px] mt-0.5">Address:</span>
                          <span className="text-[12px] text-[#5f6368]">
                            {[quotation.sites.address, quotation.sites.city, quotation.sites.postcode]
                              .filter(Boolean)
                              .join(", ")}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="bg-[#3c3c3c] text-white text-[11px] font-bold uppercase tracking-wide px-3 py-1.5 border-t border-[#2a2a2a]">
                      QUOTATION DETAILS
                    </div>
                    <div className="px-4 py-3 space-y-2">
                      <div className="flex items-center gap-2 text-[12px]">
                        <span className="text-[#5f6368] min-w-[72px]">Valid until:</span>
                        <Input
                          type="date"
                          className="h-6 text-xs border-[#dadce0] flex-1"
                          value={validUntil}
                          onChange={(e) => {
                            setValidUntil(e.target.value);
                            setHasChanges(true);
                          }}
                          disabled={isLocked}
                        />
                      </div>
                      <div className="flex items-center gap-2 text-[12px]">
                        <span className="text-[#5f6368] min-w-[72px]">VAT rate:</span>
                        <div className="flex items-center gap-1 flex-1">
                          <Input
                            type="number"
                            className="h-6 text-xs border-[#dadce0] flex-1"
                            value={vatRate}
                            onChange={(e) => {
                              setVatRate(parseFloat(e.target.value) || 0);
                              setHasChanges(true);
                            }}
                            disabled={isLocked}
                          />
                          <span className="text-[#5f6368] text-[12px]">%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-b border-[#e0e0e0]">
                  <div className="bg-[#3c3c3c] text-white text-[11px] font-bold uppercase tracking-wide px-3 py-1.5">
                    SCOPE OF WORKS
                  </div>
                  <div className="px-4 py-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-[#5f6368] min-w-[48px]">Title:</span>
                      <Input
                        className="h-7 text-sm border-[#dadce0] flex-1"
                        value={title}
                        onChange={(e) => {
                          setTitle(e.target.value);
                          setHasChanges(true);
                        }}
                        placeholder="e.g. Fire Alarm Remedial Works"
                        disabled={isLocked}
                      />
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-[11px] text-[#5f6368] min-w-[48px] mt-1.5">Summary:</span>
                      <Textarea
                        rows={3}
                        className="text-xs border-[#dadce0] resize-none flex-1"
                        value={summary}
                        onChange={(e) => {
                          setSummary(e.target.value);
                          setHasChanges(true);
                        }}
                        placeholder="Brief description of the works proposed…"
                        disabled={isLocked}
                      />
                    </div>
                  </div>
                </div>

                <div className="border-b border-[#e0e0e0]">
                  <div className="flex items-stretch">
                    <div className="flex-1 bg-[#3c3c3c] text-white text-[11px] font-bold uppercase tracking-wide px-3 py-1.5">
                      LINE ITEMS ({lineItems.length})
                    </div>
                    {!isLocked && (
                      <div className="flex items-center gap-1 px-2 bg-[#3c3c3c]">
                        <button
                          onClick={handleImproveWithAI}
                          disabled={improving || lineItems.length === 0}
                          className="text-[11px] text-amber-300 hover:text-amber-200 px-2 py-0.5 hover:bg-white/10 rounded flex items-center gap-1 disabled:opacity-50"
                          title="AI: rewrite all descriptions + fill title & summary"
                        >
                          {improving ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Improving…
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3 h-3" />
                              AI Improve
                            </>
                          )}
                        </button>
                        {selectedItemIds.size >= 2 && (
                          <button
                            onClick={handleMergeItems}
                            className="text-[11px] text-white/70 hover:text-white px-2 py-0.5 hover:bg-white/10 rounded"
                          >
                            Merge ({selectedItemIds.size})
                          </button>
                        )}
                        <button
                          onClick={handleAddItem}
                          className="text-[11px] text-white/70 hover:text-white px-2 py-0.5 hover:bg-white/10 rounded flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          Add
                        </button>
                      </div>
                    )}
                  </div>
                  <table className="w-full">
                    <thead>
                      <tr className="bg-[#5a5a5a] text-white text-[11px] font-semibold">
                        <th className="w-8 px-2 py-2"></th>
                        <th className="text-left px-3 py-2">Description</th>
                        <th className="text-center w-24 px-2 py-2">Item / Part</th>
                        <th className="text-center w-12 px-1 py-2">Qty</th>
                        <th className="text-center w-20 px-1 py-2">Unit £</th>
                        <th className="text-center w-16 px-1 py-2">Markup%</th>
                        <th className="text-center w-20 px-1 py-2">Labour £</th>
                        <th className="text-right w-20 px-3 py-2">Total £</th>
                        {!isLocked && <th className="w-8 px-1"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.length === 0 && (
                        <tr>
                          <td
                            colSpan={isLocked ? 8 : 9}
                            className="px-4 py-8 text-center text-[12px] text-[#9aa0a6] italic"
                          >
                            No line items yet.{!isLocked && " Click 'Add' to add one."}
                          </td>
                        </tr>
                      )}
                      {lineItems.map((item, index) => {
                        const isSubItem = !!item.parent_id;
                        return (
                          <tr
                            key={item.id}
                            className={`border-b border-[#f0f0f0] ${isSubItem ? "bg-[#fafaf5]" : index % 2 === 0 ? "bg-white" : "bg-[#fafafa]"} hover:bg-[#f9fbe7] transition-colors align-top`}
                          >
                            <td className="px-2 py-2 text-center">
                              {!isLocked && (
                                <input
                                  type="checkbox"
                                  checked={selectedItemIds.has(item.id)}
                                  onChange={(e) => {
                                    const next = new Set(selectedItemIds);
                                    if (e.target.checked) next.add(item.id);
                                    else next.delete(item.id);
                                    setSelectedItemIds(next);
                                  }}
                                  className="mt-1"
                                />
                              )}
                              {isSubItem && <span className="text-[9px] text-[#9aa0a6] block">sub</span>}
                            </td>
                            <td className="px-3 py-1.5 min-w-0">
                              {isLocked ? (
                                <div>
                                  <p className="text-[12px]">{item.description}</p>
                                  {item.regulation_reference && (
                                    <p className="text-[10px] text-[#e85c2c] mt-0.5">{item.regulation_reference}</p>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <Textarea
                                    rows={2}
                                    className="text-xs border-[#dadce0] resize-none w-full"
                                    value={item.description}
                                    onChange={(e) => handleItemChange(index, "description", e.target.value)}
                                    placeholder="Description of work…"
                                  />
                                  <Input
                                    className="h-5 text-[10px] border-[#e8e8e8] text-[#e85c2c] italic"
                                    value={item.regulation_reference || ""}
                                    onChange={(e) =>
                                      handleItemChange(index, "regulation_reference", e.target.value || null)
                                    }
                                    placeholder="Regulation ref (optional)"
                                  />
                                </div>
                              )}
                            </td>
                            <td className="px-1 py-1.5 text-center">
                              {isLocked ? (
                                <span className="text-[11px] text-[#5f6368]">{item.item_name || "—"}</span>
                              ) : (
                                <Input
                                  className="h-6 text-[11px] border-[#dadce0] text-center"
                                  value={item.item_name || ""}
                                  onChange={(e) => handleItemChange(index, "item_name", e.target.value || null)}
                                  placeholder="Part"
                                />
                              )}
                            </td>
                            <td className="px-1 py-1.5 text-center">
                              {isLocked ? (
                                <span className="text-[12px]">{item.quantity}</span>
                              ) : (
                                <Input
                                  type="number"
                                  min={1}
                                  className="h-6 text-[11px] border-[#dadce0] text-center"
                                  value={item.quantity}
                                  onChange={(e) => handleItemChange(index, "quantity", parseInt(e.target.value) || 1)}
                                />
                              )}
                            </td>
                            <td className="px-1 py-1.5 text-center">
                              {isLocked ? (
                                <span className="text-[12px]">£{item.unit_price.toFixed(2)}</span>
                              ) : (
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  className="h-6 text-[11px] border-[#dadce0] text-center"
                                  value={item.unit_price}
                                  onChange={(e) =>
                                    handleItemChange(index, "unit_price", parseFloat(e.target.value) || 0)
                                  }
                                />
                              )}
                            </td>
                            <td className="px-1 py-1.5 text-center">
                              {isLocked ? (
                                <span className="text-[12px] text-[#9aa0a6]">{item.markup_percent || 0}%</span>
                              ) : (
                                <Input
                                  type="number"
                                  min={0}
                                  step={1}
                                  className="h-6 text-[11px] border-[#dadce0] text-center"
                                  value={item.markup_percent || 0}
                                  onChange={(e) =>
                                    handleItemChange(index, "markup_percent", parseFloat(e.target.value) || 0)
                                  }
                                />
                              )}
                            </td>
                            <td className="px-1 py-1.5 text-center">
                              {isLocked ? (
                                <span className="text-[12px]">£{(item.labour_cost || 0).toFixed(2)}</span>
                              ) : (
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  className="h-6 text-[11px] border-[#dadce0] text-center"
                                  value={item.labour_cost || 0}
                                  onChange={(e) =>
                                    handleItemChange(index, "labour_cost", parseFloat(e.target.value) || 0)
                                  }
                                />
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <span className="text-[12px] font-medium">£{(item.total_price || 0).toFixed(2)}</span>
                            </td>
                            {!isLocked && (
                              <td className="px-1 py-1.5 text-center">
                                <button
                                  onClick={() => setLineItems(lineItems.filter((_, i) => i !== index))}
                                  className="text-[#c62828] hover:opacity-70"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="border-b border-[#e0e0e0]">
                  <div className="bg-[#3c3c3c] text-white text-[11px] font-bold uppercase tracking-wide px-3 py-1.5">
                    TOTALS
                  </div>
                  <div className="px-4 py-3">
                    <div className="ml-auto w-56 space-y-1.5">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="text-[#5f6368]">Subtotal</span>
                        <span className="font-medium">£{totalAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="text-[#5f6368]">VAT ({vatRate}%)</span>
                        <span>£{vatAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between text-[13px] font-bold pt-1 border-t border-[#e0e0e0]">
                        <span>Total (inc. VAT)</span>
                        <span>£{grandTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-b border-[#e0e0e0]">
                  <div className="bg-[#3c3c3c] text-white text-[11px] font-bold uppercase tracking-wide px-3 py-1.5">
                    TERMS & CONDITIONS
                  </div>
                  <div className="px-4 py-3">
                    <Textarea
                      rows={5}
                      className="text-xs border-[#dadce0] resize-none font-mono"
                      value={terms}
                      onChange={(e) => {
                        setTerms(e.target.value);
                        setHasChanges(true);
                      }}
                      disabled={isLocked}
                    />
                  </div>
                </div>

                <div>
                  <div className="bg-[#3c3c3c] text-white text-[11px] font-bold uppercase tracking-wide px-3 py-1.5">
                    PDF COLUMNS
                  </div>
                  <div className="px-4 py-3 flex flex-wrap gap-4">
                    {[
                      { id: "ref", label: "Regulation ref", key: "showRegulationRef" as const },
                      { id: "pri", label: "Priority", key: "showPriority" as const },
                      { id: "item", label: "Item/Part", key: "showItem" as const },
                      { id: "qty", label: "Quantity", key: "showQuantity" as const },
                      { id: "unit", label: "Unit price", key: "showUnitPrice" as const },
                      { id: "labour", label: "Labour", key: "showLabour" as const },
                      { id: "total", label: "Total", key: "showTotal" as const },
                    ].map((opt) => (
                      <label key={opt.id} className="flex items-center gap-2 text-[12px] cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={columnOptions[opt.key]}
                          onChange={(e) => setColumnOptions({ ...columnOptions, [opt.key]: e.target.checked })}
                          className="rounded"
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between px-5 py-2 border-t border-[#e0e0e0] bg-white shrink-0">
            <p className="text-[11px] text-[#9aa0a6]">BHO Fire & Security Ltd · Reg. 12235152</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              {!isLocked && (
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1"
                  style={{ background: "#e85c2c" }}
                  onClick={handleSave}
                  disabled={saving || !hasChanges}
                >
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}Save & Sync
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {quotation && (
        <EmailQuotationDialog
          open={emailDialogOpen}
          onOpenChange={setEmailDialogOpen}
          quotation={{
            id: quotation.id,
            quotation_number: quotation.quotation_number,
            title,
            site_id: quotation.site_id,
            customer_id: quotation.customer_id,
            sites: quotation.sites,
          }}
          customerEmail={customerContactEmail}
          customerName={customerContactName || customerName}
          pdfData={buildPDFData()}
          columnOptions={columnOptions}
          onSuccess={() => {
            onUpdate?.();
          }}
        />
      )}

      <AlertDialog open={unlockDialogOpen} onOpenChange={setUnlockDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlock Quotation</AlertDialogTitle>
            <AlertDialogDescription>
              This quotation is currently locked. Unlocking it will set the status to "recalled" and allow you to make
              changes. You can re-lock it by sending or downloading the PDF.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnlockQuotation} disabled={unlocking}>
              {unlocking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Unlocking...
                </>
              ) : (
                <>
                  <LockOpen className="mr-2 h-4 w-4" />
                  Unlock Quote
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
