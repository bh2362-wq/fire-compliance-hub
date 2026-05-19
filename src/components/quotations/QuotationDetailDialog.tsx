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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { format } from "date-fns";
import { generateQuotationPDF, QuotationData, PDFColumnOptions } from "@/lib/quotationPdfGenerator";
import { getCompanySettings } from "@/services/companySettingsService";
import { EmailQuotationDialog } from "./EmailQuotationDialog";
import { AIRewriteButton } from "@/components/reports/AIRewriteButton";
import { QuoteActions } from "@/features/quotes/QuoteActions";
import { ImproveTitleButton } from "./ImproveTitleButton";

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
  const [bulkMarkup, setBulkMarkup] = useState("");

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
  const totalCost = lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unit_price + (item.labour_cost || 0),
    0
  );
  const profitAmount = totalAmount - totalCost;
  const profitMargin = totalAmount > 0 ? (profitAmount / totalAmount) * 100 : 0;
  const vatAmount = totalAmount * (vatRate / 100);
  const grandTotal = totalAmount + vatAmount;
  const isLocked = !!quotation?.locked_at && quotation?.status !== "recalled";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[95vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <DialogTitle className="text-base font-semibold whitespace-nowrap">Quotation</DialogTitle>
                <Input
                  value={quotationNumber}
                  onChange={(e) => {
                    setQuotationNumber(e.target.value);
                    setHasChanges(true);
                  }}
                  className="w-[180px] font-mono text-sm h-8"
                  disabled={isLocked}
                />
                {quotation && (
                  <Badge variant={quotation.status === "accepted" ? "default" : "secondary"} className="capitalize">
                    {quotation.status}
                  </Badge>
                )}
                {isLocked && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setUnlockDialogOpen(true)}>
                    <LockOpen className="w-3.5 h-3.5" />
                    Unlock Quote
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : !quotation ? (
              <p className="text-center py-12 text-muted-foreground">Quotation not found</p>
            ) : (
              <Tabs defaultValue="items" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="items">Line Items</TabsTrigger>
                  <TabsTrigger value="customer">Customer</TabsTrigger>
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="terms">Terms & PDF</TabsTrigger>
                </TabsList>

                <TabsContent value="items" className="space-y-4 mt-4">
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <User className="w-4 h-4" />
                        {quotation.sites?.name || "Site"}
                      </CardTitle>
                      {quotation.sites?.address && (
                        <p className="text-xs text-muted-foreground">
                          {[quotation.sites.address, quotation.sites.city, quotation.sites.postcode]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      )}
                    </CardHeader>
                  </Card>

                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Line Items ({lineItems.length})</h3>
                    <div className="flex items-center gap-2">
                      {selectedItemIds.size >= 2 && !isLocked && (
                        <Button variant="outline" size="sm" onClick={handleMergeItems} className="gap-1">
                          <Merge className="w-3.5 h-3.5" />
                          Merge ({selectedItemIds.size})
                        </Button>
                      )}
                      {!isLocked && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleImproveWithAI}
                          disabled={improving || lineItems.length === 0}
                          className="gap-1"
                        >
                          {improving ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5" />
                          )}
                          AI Improve
                        </Button>
                      )}
                      {!isLocked && (
                        <div className="flex items-center gap-1 border rounded-md px-2 py-1 bg-muted/40">
                          <Label className="text-xs whitespace-nowrap">Bulk Markup %</Label>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            value={bulkMarkup}
                            onChange={(e) => setBulkMarkup(e.target.value)}
                            className="h-7 w-16"
                            placeholder="0"
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-7"
                            onClick={() => {
                              const pct = parseFloat(bulkMarkup) || 0;
                              const updated = lineItems.map((i) => ({
                                ...i,
                                markup_percent: pct,
                                total_price:
                                  i.quantity * i.unit_price * (1 + pct / 100) + (i.labour_cost || 0),
                              }));
                              setLineItems(updated);
                              setHasChanges(true);
                            }}
                          >
                            Apply
                          </Button>
                        </div>
                      )}
                      {!isLocked && (
                        <Button size="sm" onClick={() => handleAddItem()} className="gap-1">
                          <Plus className="w-3.5 h-3.5" />
                          Add Item
                        </Button>
                      )}
                    </div>
                  </div>

                  {lineItems.length === 0 ? (
                    <p className="text-center py-8 text-sm text-muted-foreground">No line items yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {lineItems.map((item, index) => (
                        <Card key={item.id} className={item.parent_id ? "ml-6 border-l-4 border-l-muted" : ""}>
                          <CardContent className="p-4 space-y-3">
                            <div className="flex items-start gap-3">
                              {!isLocked && (
                                <Checkbox
                                  checked={selectedItemIds.has(item.id)}
                                  onCheckedChange={(checked) => {
                                    const next = new Set(selectedItemIds);
                                    if (checked) next.add(item.id);
                                    else next.delete(item.id);
                                    setSelectedItemIds(next);
                                  }}
                                  className="mt-2"
                                />
                              )}
                              <div className="flex-1 space-y-2">
                                <Textarea
                                  rows={2}
                                  value={item.description}
                                  onChange={(e) => handleItemChange(index, "description", e.target.value)}
                                  placeholder="Description of work..."
                                  disabled={isLocked}
                                />
                                <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                                  <div>
                                    <Label className="text-xs">Item / Part</Label>
                                    <Input
                                      value={item.item_name || ""}
                                      onChange={(e) => handleItemChange(index, "item_name", e.target.value || null)}
                                      disabled={isLocked}
                                      className="h-8"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Qty</Label>
                                    <Input
                                      type="number"
                                      min={1}
                                      value={item.quantity}
                                      onChange={(e) => handleItemChange(index, "quantity", parseInt(e.target.value) || 1)}
                                      disabled={isLocked}
                                      className="h-8"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Unit Cost £</Label>
                                    <Input
                                      type="number"
                                      min={0}
                                      step={0.01}
                                      value={item.unit_price}
                                      onChange={(e) => handleItemChange(index, "unit_price", parseFloat(e.target.value) || 0)}
                                      disabled={isLocked}
                                      className="h-8"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Markup %</Label>
                                    <Input
                                      type="number"
                                      min={0}
                                      step={1}
                                      value={item.markup_percent || 0}
                                      onChange={(e) => handleItemChange(index, "markup_percent", parseFloat(e.target.value) || 0)}
                                      disabled={isLocked}
                                      className="h-8"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Sell Price £</Label>
                                    <Input
                                      type="number"
                                      readOnly
                                      value={(item.unit_price * (1 + (item.markup_percent || 0) / 100)).toFixed(2)}
                                      className="h-8 bg-muted"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Labour £</Label>
                                    <Input
                                      type="number"
                                      min={0}
                                      step={0.01}
                                      value={item.labour_cost || 0}
                                      onChange={(e) => handleItemChange(index, "labour_cost", parseFloat(e.target.value) || 0)}
                                      disabled={isLocked}
                                      className="h-8"
                                    />
                                  </div>
                                </div>
                                <div className="flex items-center justify-between pt-2 border-t">
                                  <span className="text-xs text-muted-foreground">Total</span>
                                  <span className="text-sm font-semibold flex items-center">
                                    <PoundSterling className="w-3 h-3" />
                                    {(item.total_price || 0).toFixed(2)}
                                  </span>
                                </div>
                              </div>
                              {!isLocked && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemoveItem(index)}
                                  className="text-destructive"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}

                  <Card>
                    <CardContent className="p-4">
                      <div className="ml-auto w-72 space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Cost (internal)</span>
                          <span className="text-muted-foreground">£{totalCost.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-emerald-600 dark:text-emerald-400">Profit (internal)</span>
                          <span className="font-medium text-emerald-600 dark:text-emerald-400">
                            £{profitAmount.toFixed(2)} ({profitMargin.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="flex justify-between text-sm pt-1.5 border-t">
                          <span className="text-muted-foreground">Subtotal</span>
                          <span>£{totalAmount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">VAT ({vatRate}%)</span>
                          <span>£{vatAmount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-base font-bold pt-2 border-t">
                          <span>Total</span>
                          <span>£{grandTotal.toFixed(2)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="customer" className="space-y-3 mt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Company Name</Label>
                      <Input value={customerName} onChange={(e) => { setCustomerName(e.target.value); setHasChanges(true); }} disabled={isLocked} />
                    </div>
                    <div>
                      <Label>Contact Name</Label>
                      <Input value={customerContactName} onChange={(e) => { setCustomerContactName(e.target.value); setHasChanges(true); }} disabled={isLocked} />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input type="email" value={customerContactEmail} onChange={(e) => { setCustomerContactEmail(e.target.value); setHasChanges(true); }} disabled={isLocked} />
                    </div>
                    <div>
                      <Label>Phone</Label>
                      <Input value={customerContactPhone} onChange={(e) => { setCustomerContactPhone(e.target.value); setHasChanges(true); }} disabled={isLocked} />
                    </div>
                    <div className="col-span-2">
                      <Label>Address</Label>
                      <Input value={customerAddress} onChange={(e) => { setCustomerAddress(e.target.value); setHasChanges(true); }} disabled={isLocked} />
                    </div>
                    <div>
                      <Label>City</Label>
                      <Input value={customerCity} onChange={(e) => { setCustomerCity(e.target.value); setHasChanges(true); }} disabled={isLocked} />
                    </div>
                    <div>
                      <Label>Postcode</Label>
                      <Input value={customerPostcode} onChange={(e) => { setCustomerPostcode(e.target.value); setHasChanges(true); }} disabled={isLocked} />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="details" className="space-y-3 mt-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <Label>Quote Title</Label>
                      {!isLocked && (
                        <ImproveTitleButton
                          text={title}
                          context={lineItems.map((i, idx) => `${idx + 1}. ${i.description}`).filter(Boolean).join("\n")}
                          onAccept={(t) => { setTitle(t); setHasChanges(true); }}
                        />
                      )}
                    </div>
                    <Input value={title} onChange={(e) => { setTitle(e.target.value); setHasChanges(true); }} disabled={isLocked} />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <Label>Summary</Label>
                      {!isLocked && (
                        <ImproveTitleButton
                          text={summary}
                          type="quotation_summary"
                          context={[
                            title && `Title: ${title}`,
                            "Line items:",
                            ...lineItems.map((i, idx) => `${idx + 1}. ${i.description}`).filter(Boolean),
                          ].filter(Boolean).join("\n")}
                          onAccept={(t) => { setSummary(t); setHasChanges(true); }}
                        />
                      )}
                    </div>
                    <Textarea rows={3} value={summary} onChange={(e) => { setSummary(e.target.value); setHasChanges(true); }} disabled={isLocked} />
                  </div>
                  <div>
                    <Label>Notes</Label>
                    <Textarea rows={4} value={notes} onChange={(e) => { setNotes(e.target.value); setHasChanges(true); }} disabled={isLocked} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Valid Until</Label>
                      <Input type="date" value={validUntil} onChange={(e) => { setValidUntil(e.target.value); setHasChanges(true); }} disabled={isLocked} />
                    </div>
                    <div>
                      <Label>VAT Rate (%)</Label>
                      <Input type="number" value={vatRate} onChange={(e) => { setVatRate(parseFloat(e.target.value) || 0); setHasChanges(true); }} disabled={isLocked} />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="terms" className="space-y-4 mt-4">
                  <div>
                    <Label>Terms & Conditions</Label>
                    <Textarea rows={8} value={terms} onChange={(e) => { setTerms(e.target.value); setHasChanges(true); }} className="font-mono text-xs" disabled={isLocked} />
                  </div>
                  <div>
                    <Label className="mb-2 block">PDF Columns</Label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {[
                        { key: "showItemNumber" as const, label: "Item Number" },
                        { key: "showDescription" as const, label: "Description" },
                        { key: "showRegulationRef" as const, label: "Regulation Ref" },
                        { key: "showPriority" as const, label: "Priority" },
                        { key: "showItem" as const, label: "Item/Part" },
                        { key: "showQuantity" as const, label: "Quantity" },
                        { key: "showUnitPrice" as const, label: "Unit Price" },
                        { key: "showLabour" as const, label: "Labour" },
                        { key: "showTotal" as const, label: "Total" },
                      ].map((opt) => (
                        <label key={opt.key} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={columnOptions[opt.key]}
                            onCheckedChange={(checked) => setColumnOptions({ ...columnOptions, [opt.key]: !!checked })}
                          />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </div>

          <DialogFooter className="px-6 py-3 border-t shrink-0 sm:justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <QuoteActions quotationId={quotationId} />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setEmailDialogOpen(true)}
                disabled={loading || lineItems.length === 0 || !customerContactEmail || isLocked}
                className="gap-1"
              >
                <Mail className="w-4 h-4" />
                Email
              </Button>
              <Button
                variant="outline"
                onClick={handleGeneratePDF}
                disabled={generating || loading || lineItems.length === 0}
                className="gap-1"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                Download PDF
              </Button>
              {!isLocked && (
                <Button onClick={handleSave} disabled={saving} className="gap-1">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save & Sync
                </Button>
              )}
            </div>
          </DialogFooter>
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
