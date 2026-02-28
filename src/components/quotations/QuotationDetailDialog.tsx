import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, Plus, Save, PoundSterling, FileDown, Mail, User, Sparkles, Merge, LockOpen } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { generateQuotationPDF, QuotationData, PDFColumnOptions } from "@/lib/quotationPdfGenerator";
import { getCompanySettings } from "@/services/companySettingsService";
import { EmailQuotationDialog } from "./EmailQuotationDialog";

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

export function QuotationDetailDialog({
  open,
  onOpenChange,
  quotationId,
  onUpdate,
}: QuotationDetailDialogProps) {
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
      // Fetch quotation with full site and customer details
      const { data: quotationData, error: quotationError } = await supabase
        .from("quotations")
        .select(`
          *,
          sites:site_id(name, address, city, postcode, customer_id),
          customers:customer_id(name, contact_name, contact_email, contact_phone, address, city, postcode)
        `)
        .eq("id", quotationId)
        .single();

      if (quotationError) throw quotationError;
      
      // If no customer linked but site has a customer, fetch it
      let customerData = quotationData.customers;
      if (!customerData && quotationData.sites?.customer_id) {
        const { data: siteCustomer } = await supabase
          .from("customers")
          .select("name, contact_name, contact_email, contact_phone, address, city, postcode")
          .eq("id", quotationData.sites.customer_id)
          .single();
        
        if (siteCustomer) {
          customerData = siteCustomer;
          // Update quotation with customer_id
          await supabase
            .from("quotations")
            .update({ customer_id: quotationData.sites.customer_id })
            .eq("id", quotationId);
        }
      }
      
      setQuotation({ ...quotationData, customers: customerData });
      
      // Set editable fields
      setQuotationNumber(quotationData.quotation_number || "");
      setTitle(quotationData.title || `Remedial Works - ${quotationData.sites?.name || "Site"}`);
      setSummary(quotationData.summary || "");
      setNotes(quotationData.notes || "");
      setTerms((quotationData as any).terms || DEFAULT_TERMS);
      setValidUntil(quotationData.valid_until || "");
      setVatRate((quotationData as any).vat_rate ?? 20);

      // Set customer fields
      if (customerData) {
        setCustomerName(customerData.name || "");
        setCustomerContactName(customerData.contact_name || "");
        setCustomerContactEmail(customerData.contact_email || "");
        setCustomerContactPhone(customerData.contact_phone || "");
        setCustomerAddress(customerData.address || "");
        setCustomerCity(customerData.city || "");
        setCustomerPostcode(customerData.postcode || "");
      }

      // Fetch line items
      const { data: itemsData, error: itemsError } = await supabase
        .from("quotation_line_items")
        .select("*")
        .eq("quotation_id", quotationId)
        .order("sort_order", { ascending: true });

      if (itemsError) throw itemsError;
      const mappedItems = (itemsData || []).map(item => ({ ...item, markup_percent: (item as any).markup_percent || 0 }));
      setLineItems(mappedItems);

      // Auto-detect which columns have data
      const parents = mappedItems.filter(i => !i.parent_id);
      const hasRegRef = parents.some(i => i.regulation_reference && i.regulation_reference.trim() !== "");
      const hasPriority = parents.some(i => i.priority && i.priority !== "standard");
      const hasItem = parents.some(i => i.item_name && i.item_name.trim() !== "");
      const hasLabour = parents.some(i => (i.labour_cost || 0) > 0);
      setColumnOptions(prev => ({
        ...prev,
        showRegulationRef: hasRegRef,
        showPriority: hasPriority,
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
      updated[index].total_price = (i.quantity * i.unit_price * (1 + (i.markup_percent || 0) / 100)) + (i.labour_cost || 0);
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
      total_price: 0,
      notes: null,
      sort_order: lineItems.length,
    };
    if (parentId) {
      // Insert after the last child of this parent (or after parent itself)
      const parentIndex = lineItems.findIndex(i => i.id === parentId);
      let insertAt = parentIndex + 1;
      while (insertAt < lineItems.length && lineItems[insertAt].parent_id === parentId) {
        insertAt++;
      }
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
    const mergedDescription = selectedIndices.map(({ item }) => item.description).filter(Boolean).join("\n");
    const mergedQty = selectedIndices.reduce((sum, { item }) => sum + item.quantity, 0);
    const mergedLabour = selectedIndices.reduce((sum, { item }) => sum + (item.labour_cost || 0), 0);
    
    // Keep first item's pricing, sum quantities and labour
    const mergedItem: LineItem = {
      ...first.item,
      description: mergedDescription,
      quantity: mergedQty,
      labour_cost: mergedLabour,
      total_price: (mergedQty * first.item.unit_price * (1 + (first.item.markup_percent || 0) / 100)) + mergedLabour,
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
        body: {
          text: descriptions,
          type: "quotation_items",
          generateQuotationMeta: true,
        },
      });
      if (error) throw error;
      if (data?.rewrittenText) {
        const improvedLines = data.rewrittenText.split("\n").filter((l: string) => l.trim());
        const updated = [...lineItems];
        improvedLines.forEach((line: string) => {
          const match = line.match(/^(\d+)\.\s*(.*)/);
          if (match) {
            const idx = parseInt(match[1]) - 1;
            if (idx >= 0 && idx < updated.length) {
              updated[idx] = { ...updated[idx], description: match[2].trim() };
            }
          }
        });
        setLineItems(updated);
        setHasChanges(true);

        // Auto-fill title and summary if empty or update them
        if (data.suggestedTitle) {
          setTitle(data.suggestedTitle);
        }
        if (data.suggestedSummary) {
          setSummary(data.suggestedSummary);
        }

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

      // Update quotation with all fields and re-lock it
      const { data: { user } } = await supabase.auth.getUser();
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

      // Delete existing line items
      const { error: deleteError } = await supabase
        .from("quotation_line_items")
        .delete()
        .eq("quotation_id", quotationId);

      if (deleteError) throw deleteError;

      // Insert updated line items - first parents, then children
      if (lineItems.length > 0) {
        const parentItems = lineItems.filter(i => !i.parent_id);
        const childItems = lineItems.filter(i => !!i.parent_id);

        // Insert parents first
        const idMap = new Map<string, string>(); // old temp id -> new db id
        if (parentItems.length > 0) {
          const parentsToInsert = parentItems.map((item, idx) => ({
            quotation_id: quotationId,
            description: item.description,
            regulation_reference: item.regulation_reference,
            priority: item.priority,
            item_name: item.item_name,
            parent_id: null,
            source_section: item.source_section,
            quantity: item.quantity,
            unit_price: item.unit_price,
            labour_cost: item.labour_cost || 0,
            total_price: item.total_price,
            notes: item.notes,
            sort_order: lineItems.indexOf(item),
          }));

          const { data: insertedParents, error: parentError } = await supabase
            .from("quotation_line_items")
            .insert(parentsToInsert)
            .select("id");

          if (parentError) throw parentError;

          // Map old IDs to new IDs
          parentItems.forEach((item, idx) => {
            if (insertedParents?.[idx]) {
              idMap.set(item.id, insertedParents[idx].id);
            }
          });
        }

        // Insert children with resolved parent_id
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
            labour_cost: item.labour_cost || 0,
            total_price: item.total_price,
            notes: item.notes,
            sort_order: lineItems.indexOf(item),
          }));

          const { error: childError } = await supabase
            .from("quotation_line_items")
            .insert(childrenToInsert);

          if (childError) throw childError;
        }

      }

      toast.success("Quotation saved");
      setHasChanges(false);
      onUpdate?.();
      fetchQuotation();

      // Sync PDF to SharePoint in background
      try {
        const companySettings = await getCompanySettings();
        const pdfData = buildPDFData();
        
        let baseFolderPath: string | null = null;

        // Try report-linked folder first
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

        // Fallback to site-level folder
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
              body: { folderPath: `${siteFolderPath}/Quotations`, entityType: "folder_only", entityId: quotation.site_id },
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
            const pdfFileName = `${quotation.quotation_number} - ${quotation.sites?.name || 'Site'}.pdf`;
            await supabase.functions.invoke("upload-to-sharepoint", {
              body: { folderPath: baseFolderPath, fileName: pdfFileName, fileBase64: pdfBase64, contentType: "application/pdf" },
            });
            console.log("Quotation PDF synced to SharePoint after save:", baseFolderPath);
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

  const buildPDFData = (): QuotationData => {
    return {
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
      customer: customerName ? {
        name: customerName,
        contact_name: customerContactName || null,
        contact_email: customerContactEmail || null,
        contact_phone: customerContactPhone || null,
        address: customerAddress || null,
        city: customerCity || null,
        postcode: customerPostcode || null,
      } : null,
      line_items: lineItems.map(item => ({
        description: item.description,
        regulation_reference: item.regulation_reference,
        priority: item.priority,
        item_name: item.item_name,
        parent_id: item.parent_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        markup_percent: item.markup_percent || 0,
        labour_cost: item.labour_cost || 0,
        total_price: item.total_price,
      })),
      vat_rate: vatRate,
    };
  };

  const lockQuotation = async () => {
    if (!quotation || quotation.locked_at) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase
        .from("quotations")
        .update({ 
          locked_at: new Date().toISOString(),
          locked_by: user?.id 
        })
        .eq("id", quotationId);
      
      // Update local state
      setQuotation(prev => prev ? { ...prev, locked_at: new Date().toISOString() } : null);
    } catch (error) {
      console.error("Error locking quotation:", error);
    }
  };

  const handleUnlockQuotation = async () => {
    if (!quotation) return;
    setUnlocking(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      await supabase
        .from("quotations")
        .update({ 
          locked_at: null,
          locked_by: null,
          status: "recalled",
        })
        .eq("id", quotationId);

      // Log the unlock action
      if (user) {
        await supabase.from("audit_logs").insert({
          user_id: user.id,
          entity_type: "quotation",
          entity_id: quotationId,
          action: "unlock_quotation",
          details: { quotation_number: quotation.quotation_number },
        });
      }

      setQuotation(prev => prev ? { ...prev, locked_at: null, locked_by: null, status: "recalled" } : null);
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
      
      // Also upload PDF to SharePoint in the report's visit folder
      try {
        // Get the linked report's SharePoint folder
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
            // Use the report's folder which is site-level Reports path
            const visitDate = (report as any).visits?.visit_date;
            const reportNum = report.report_number || "DRAFT";
            const dateStr = visitDate ? format(new Date(visitDate), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
            baseFolderPath = `${report.sharepoint_folder}/${reportNum}_${dateStr}/Quotations`;
          }
        }

        // Fallback to site-level folder — auto-create if missing
        if (!baseFolderPath) {
          const { data: siteData } = await supabase
            .from("sites")
            .select("sharepoint_folder, name, address")
            .eq("id", quotation.site_id)
            .single();
          if (siteData?.sharepoint_folder) {
            baseFolderPath = `${siteData.sharepoint_folder}/Quotations`;
          } else if (siteData && quotation.customers?.name) {
            // Auto-create SharePoint folder: Customers/{Customer}/{Site}/Quotations
            const siteLabel = [siteData.name, siteData.address].filter(Boolean).join(" ");
            const siteFolderPath = `Customers/${quotation.customers.name}/${siteLabel}`;
            try {
              const { data: spData, error: spError } = await supabase.functions.invoke("sharepoint-create-folder", {
                body: {
                  folderPath: `${siteFolderPath}/Quotations`,
                  entityType: "folder_only",
                  entityId: quotation.site_id,
                },
              });
              if (!spError && spData?.success) {
                // Save site-level path (without /Quotations) to site record
                await supabase.from("sites").update({
                  sharepoint_folder: siteFolderPath,
                  sharepoint_url: null,
                }).eq("id", quotation.site_id);
                baseFolderPath = `${siteFolderPath}/Quotations`;
                console.log("Auto-created SharePoint folder for quotation:", baseFolderPath);
              }
            } catch (e) {
              console.log("SharePoint auto-create skipped:", e);
            }
          }
        }

        if (baseFolderPath) {
          const pdfBase64 = await generateQuotationPDF(pdfData, companySettings || undefined, true, columnOptions);
          if (pdfBase64) {
            const pdfFileName = `${quotation.quotation_number} - ${quotation.sites?.name || 'Site'}.pdf`;
            await supabase.functions.invoke("upload-to-sharepoint", {
              body: {
                folderPath: baseFolderPath,
                fileName: pdfFileName,
                fileBase64: pdfBase64,
                contentType: "application/pdf",
              },
            });
            console.log("Quotation PDF uploaded to SharePoint:", baseFolderPath);
          }
        }
      } catch (spErr) {
        console.log("SharePoint quotation upload skipped:", spErr);
      }
      
      // Lock the quotation after download
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

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical":
        return "destructive";
      case "high":
        return "default";
      case "medium":
        return "secondary";
      case "low":
        return "outline";
      case "labour":
        return "secondary";
      default:
        return "secondary";
    }
  };

  const totalAmount = lineItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
  const totalCost = lineItems.reduce((sum, item) => sum + (item.quantity * item.unit_price) + (item.labour_cost || 0), 0);
  const profitMargin = totalAmount - totalCost;
  const vatAmount = totalAmount * (vatRate / 100);
  const grandTotal = totalAmount + vatAmount;
  const isLocked = !!quotation?.locked_at && quotation?.status !== "recalled";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Input
                value={quotationNumber}
                onChange={(e) => {
                  setQuotationNumber(e.target.value);
                  setHasChanges(true);
                }}
                className="w-[160px] font-bold text-lg h-9"
                placeholder="QUO-00000"
                disabled={isLocked}
              />
              {quotation && (
                <>
                  <Badge variant="outline">
                    {quotation.status}
                  </Badge>
                  {isLocked && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => setUnlockDialogOpen(true)}
                    >
                      <LockOpen className="h-3 w-3" />
                      🔒 Unlock Quote
                    </Button>
                  )}
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : quotation ? (
            <Tabs defaultValue="items" className="flex-1 min-h-0 flex flex-col">
              <TabsList className="grid w-full grid-cols-4 flex-shrink-0">
                <TabsTrigger value="items">Line Items</TabsTrigger>
                <TabsTrigger value="customer">Customer</TabsTrigger>
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="terms">Terms & PDF</TabsTrigger>
              </TabsList>

              <div className="flex-1 min-h-0 overflow-auto mt-4 pr-2">
                <TabsContent value="items" className="space-y-4 mt-0">
                  {/* Site Info */}
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground">Site</p>
                    <p className="font-medium">{quotation.sites?.name}</p>
                    {quotation.sites?.address && (
                      <p className="text-sm text-muted-foreground">
                        {[quotation.sites.address, quotation.sites.city, quotation.sites.postcode].filter(Boolean).join(", ")}
                      </p>
                    )}
                  </div>

                  {/* Line Items */}
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Quotation Items ({lineItems.length})</h3>
                    {!isLocked && (
                      <div className="flex items-center gap-2">
                        {selectedItemIds.size >= 2 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleMergeItems}
                          >
                            <Merge className="mr-2 h-4 w-4" />
                            Merge ({selectedItemIds.size})
                          </Button>
                        )}
                        <Button 
                          type="button"
                          variant="outline" 
                          size="sm" 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleAddItem();
                          }}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Add Item
                        </Button>
                      </div>
                    )}
                  </div>

                  {lineItems.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">
                      No line items. Click "Add Item" to add one.
                    </p>
                  ) : (
                    lineItems.map((item, index) => {
                      const isSubItem = !!item.parent_id;
                      return (
                      <div key={item.id} className={`border rounded-lg p-4 space-y-3 ${isSubItem ? 'ml-8 border-dashed border-muted-foreground/30' : ''}`}>
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
                              className="mt-1"
                            />
                          )}
                          <div className="flex-1 space-y-3">
                            <div className="flex items-center gap-2">
                              {isSubItem && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">Sub</Badge>
                              )}
                              {columnOptions.showPriority && (
                              <Select
                                value={item.priority}
                                onValueChange={(value) => handleItemChange(index, "priority", value)}
                                disabled={isLocked}
                              >
                                <SelectTrigger className="w-[130px] h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-popover z-[200]">
                                  <SelectItem value="low">Low</SelectItem>
                                  <SelectItem value="medium">Medium</SelectItem>
                                  <SelectItem value="high">High</SelectItem>
                                  <SelectItem value="labour">Labour Only</SelectItem>
                                </SelectContent>
                              </Select>
                              )}
                            </div>

                            <Textarea
                              value={item.description}
                              onChange={(e) =>
                                handleItemChange(index, "description", e.target.value)
                              }
                              placeholder="Description of work required..."
                              className="min-h-[60px]"
                              disabled={isLocked}
                            />

                            <div className="grid grid-cols-8 gap-3">
                              <div>
                                <Label className="text-xs">Item/Part</Label>
                                <Input
                                  value={item.item_name || ""}
                                  onChange={(e) =>
                                    handleItemChange(index, "item_name", e.target.value || null)
                                  }
                                  placeholder="e.g. Smoke detector"
                                  className="h-9"
                                  disabled={isLocked}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Qty</Label>
                                <Input
                                  type="number"
                                  min={1}
                                  value={item.quantity}
                                  onChange={(e) =>
                                    handleItemChange(
                                      index,
                                      "quantity",
                                      parseInt(e.target.value) || 1
                                    )
                                  }
                                  className="h-9"
                                  disabled={isLocked}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Unit Price (£)</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={item.unit_price}
                                  onChange={(e) =>
                                    handleItemChange(
                                      index,
                                      "unit_price",
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  className="h-9"
                                  disabled={isLocked}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Markup (%)</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={item.markup_percent || 0}
                                  onChange={(e) =>
                                    handleItemChange(
                                      index,
                                      "markup_percent",
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  className="h-9"
                                  disabled={isLocked}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Sell Price (£)</Label>
                                <Input
                                  type="number"
                                  value={(item.unit_price * (1 + (item.markup_percent || 0) / 100)).toFixed(2)}
                                  readOnly
                                  className="h-9 bg-muted"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Labour (£)</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={item.labour_cost || 0}
                                  onChange={(e) =>
                                    handleItemChange(
                                      index,
                                      "labour_cost",
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  className="h-9"
                                  disabled={isLocked}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Total (£)</Label>
                                <Input
                                  type="number"
                                  value={item.total_price.toFixed(2)}
                                  readOnly
                                  className="h-9 bg-muted"
                                />
                              </div>
                            </div>
                          </div>

                          {!isLocked && (
                            <div className="flex flex-col gap-1">
                              {!isSubItem && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleAddItem(item.id)}
                                  className="text-muted-foreground hover:text-primary"
                                  title="Add sub item"
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveItem(index)}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                    })
                  )}

                  {/* Totals */}
                   <div className="border-t pt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Cost:</span>
                      <span>£{totalCost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-emerald-600 dark:text-emerald-400">Profit Margin:</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">£{profitMargin.toFixed(2)}{totalCost > 0 ? ` (${((profitMargin / totalCost) * 100).toFixed(1)}%)` : ''}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal:</span>
                      <span>£{totalAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">VAT:</span>
                        <Select
                          value={vatRate.toString()}
                          onValueChange={(v) => setVatRate(parseInt(v))}
                        >
                          <SelectTrigger className="h-7 w-20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">0%</SelectItem>
                            <SelectItem value="5">5%</SelectItem>
                            <SelectItem value="20">20%</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <span>£{vatAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-lg font-semibold pt-2 border-t">
                      <span>Total:</span>
                      <span className="flex items-center gap-1">
                        <PoundSterling className="w-4 h-4" />
                        {grandTotal.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* AI Improve Button */}
                  {!isLocked && lineItems.length > 0 && (
                    <div className="flex justify-end pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleImproveWithAI}
                        disabled={improving}
                      >
                        {improving ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Improving...
                          </>
                        ) : (
                          <>
                            <Sparkles className="mr-2 h-4 w-4" />
                            Improve with AI
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="customer" className="space-y-4 mt-0">
                  <div className="flex items-center gap-2 mb-4">
                    <User className="h-5 w-5 text-muted-foreground" />
                    <h3 className="font-medium">Customer Details</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Edit the customer details for this quotation. Changes here only affect this quotation, not the master customer record.
                  </p>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Label>Company Name</Label>
                      <Input
                        value={customerName}
                        onChange={(e) => {
                          setCustomerName(e.target.value);
                          setHasChanges(true);
                        }}
                        placeholder="Customer company name"
                      />
                    </div>
                    <div>
                      <Label>Contact Name</Label>
                      <Input
                        value={customerContactName}
                        onChange={(e) => {
                          setCustomerContactName(e.target.value);
                          setHasChanges(true);
                        }}
                        placeholder="Contact person"
                      />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={customerContactEmail}
                        onChange={(e) => {
                          setCustomerContactEmail(e.target.value);
                          setHasChanges(true);
                        }}
                        placeholder="email@company.com"
                      />
                    </div>
                    <div>
                      <Label>Phone</Label>
                      <Input
                        value={customerContactPhone}
                        onChange={(e) => {
                          setCustomerContactPhone(e.target.value);
                          setHasChanges(true);
                        }}
                        placeholder="Phone number"
                      />
                    </div>
                    <div>
                      <Label>Address</Label>
                      <Input
                        value={customerAddress}
                        onChange={(e) => {
                          setCustomerAddress(e.target.value);
                          setHasChanges(true);
                        }}
                        placeholder="Street address"
                      />
                    </div>
                    <div>
                      <Label>City</Label>
                      <Input
                        value={customerCity}
                        onChange={(e) => {
                          setCustomerCity(e.target.value);
                          setHasChanges(true);
                        }}
                        placeholder="City"
                      />
                    </div>
                    <div>
                      <Label>Postcode</Label>
                      <Input
                        value={customerPostcode}
                        onChange={(e) => {
                          setCustomerPostcode(e.target.value);
                          setHasChanges(true);
                        }}
                        placeholder="Postcode"
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="details" className="space-y-4 mt-0">
                  <div className="space-y-4">
                    <div>
                      <Label>Quotation Title</Label>
                      <Input
                        value={title}
                        onChange={(e) => {
                          setTitle(e.target.value);
                          setHasChanges(true);
                        }}
                        placeholder="e.g., Fire Alarm Remedial Works"
                      />
                    </div>

                    <div>
                      <Label>Summary / Introduction</Label>
                      <Textarea
                        value={summary}
                        onChange={(e) => {
                          setSummary(e.target.value);
                          setHasChanges(true);
                        }}
                        placeholder="Brief description of the quotation scope..."
                        className="min-h-[80px]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Valid Until</Label>
                        <Input
                          type="date"
                          value={validUntil}
                          onChange={(e) => {
                            setValidUntil(e.target.value);
                            setHasChanges(true);
                          }}
                        />
                      </div>
                      <div>
                        <Label>Created</Label>
                        <Input
                          value={format(new Date(quotation.created_at), "dd MMMM yyyy")}
                          readOnly
                          className="bg-muted"
                        />
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="terms" className="space-y-6 mt-0">
                  <div>
                    <Label>Terms & Conditions</Label>
                    <Textarea
                      value={terms}
                      onChange={(e) => {
                        setTerms(e.target.value);
                        setHasChanges(true);
                      }}
                      placeholder="Enter terms and conditions..."
                      className="min-h-[150px] font-mono text-sm"
                    />
                  </div>

                  <div>
                    <Label>Additional Notes</Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => {
                        setNotes(e.target.value);
                        setHasChanges(true);
                      }}
                      placeholder="Any additional notes for this quotation..."
                      className="min-h-[80px]"
                    />
                  </div>

                  {/* PDF Column Options */}
                  <div className="border rounded-lg p-4 space-y-3">
                    <h4 className="font-medium">PDF Column Options</h4>
                    <p className="text-sm text-muted-foreground">
                      Select which columns to include in the downloaded PDF.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="col-num"
                          checked={columnOptions.showItemNumber}
                          onCheckedChange={(checked) =>
                            setColumnOptions({ ...columnOptions, showItemNumber: !!checked })
                          }
                        />
                        <label htmlFor="col-num" className="text-sm">#</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="col-desc"
                          checked={columnOptions.showDescription}
                          onCheckedChange={(checked) =>
                            setColumnOptions({ ...columnOptions, showDescription: !!checked })
                          }
                        />
                        <label htmlFor="col-desc" className="text-sm">Description</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="col-item"
                          checked={columnOptions.showItem}
                          onCheckedChange={(checked) =>
                            setColumnOptions({ ...columnOptions, showItem: !!checked })
                          }
                        />
                        <label htmlFor="col-item" className="text-sm">Item</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="col-priority"
                          checked={columnOptions.showPriority}
                          onCheckedChange={(checked) =>
                            setColumnOptions({ ...columnOptions, showPriority: !!checked })
                          }
                        />
                        <label htmlFor="col-priority" className="text-sm">Priority</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="col-qty"
                          checked={columnOptions.showQuantity}
                          onCheckedChange={(checked) =>
                            setColumnOptions({ ...columnOptions, showQuantity: !!checked })
                          }
                        />
                        <label htmlFor="col-qty" className="text-sm">Quantity</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="col-unit"
                          checked={columnOptions.showUnitPrice}
                          onCheckedChange={(checked) =>
                            setColumnOptions({ ...columnOptions, showUnitPrice: !!checked })
                          }
                        />
                        <label htmlFor="col-unit" className="text-sm">Unit Price</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="col-labour"
                          checked={columnOptions.showLabour}
                          onCheckedChange={(checked) =>
                            setColumnOptions({ ...columnOptions, showLabour: !!checked })
                          }
                        />
                        <label htmlFor="col-labour" className="text-sm">Labour</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="col-total"
                          checked={columnOptions.showTotal}
                          onCheckedChange={(checked) =>
                            setColumnOptions({ ...columnOptions, showTotal: !!checked })
                          }
                        />
                        <label htmlFor="col-total" className="text-sm">Total</label>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          ) : (
            <p className="text-center py-8 text-muted-foreground">
              Quotation not found
            </p>
          )}

          <DialogFooter className="flex-shrink-0 gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              variant="outline"
              onClick={() => setEmailDialogOpen(true)}
              disabled={loading || lineItems.length === 0 || !customerContactEmail || isLocked}
            >
              <Mail className="mr-2 h-4 w-4" />
              {isLocked ? "Sent" : "Email"}
            </Button>
            <Button
              variant="outline"
              onClick={handleGeneratePDF}
              disabled={generating || loading || lineItems.length === 0}
            >
              {generating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileDown className="mr-2 h-4 w-4" />
                  Download PDF
                </>
              )}
            </Button>
            {hasChanges && !isLocked && (
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </>
                )}
              </Button>
            )}
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
              This quotation is currently locked. Unlocking it will set the status to "recalled" and allow you to make changes. You can re-lock it by sending or downloading the PDF.
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
