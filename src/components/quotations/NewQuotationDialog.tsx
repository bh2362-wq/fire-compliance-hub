import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { generateQuotationPDF, QuotationData, PDFColumnOptions } from "@/lib/quotationPdfGenerator";
import { getCompanySettings } from "@/services/companySettingsService";
import {
  ResponsiveDialog,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogBody,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Loader2, Database, UserPlus, Building2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { AIExpandButton } from "./AIExpandButton";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { searchSupplierProducts, SupplierProduct } from "@/services/supplierProductService";
import { ScopeFields } from "@/components/cost-intelligence/ClassifyJobDialog";
import { ComparableJobsPanel } from "@/components/cost-intelligence/ComparableJobsPanel";
import {
  type SystemType, type BuildingType, type JobCategory,
  type Region, type Bs5839Category, type QuoteScope,
} from "@/types/cost-intelligence";

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  markup_percent: number;
  labour_cost: number;
  total_price: number;
}

interface NewQuotationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  prefillLineItem?: { description: string; quantity: number; unit_price: number; labour_cost: number } | null;
}

export function NewQuotationDialog({ open, onOpenChange, onSuccess, prefillLineItem }: NewQuotationDialogProps) {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [sites, setSites] = useState<{ id: string; name: string; customer_id: string | null }[]>([]);
  const [filteredSites, setFilteredSites] = useState<typeof sites>([]);

  const [customerId, setCustomerId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [validDays, setValidDays] = useState(30);
  const [vatRate, setVatRate] = useState(20);
  const [terms, setTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", quantity: 1, unit_price: 0, markup_percent: 0, labour_cost: 0, total_price: 0 },
  ]);
  const [saving, setSaving] = useState(false);
  const [bulkMarkup, setBulkMarkup] = useState("");

  // Quick-add customer/site
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showAddSite, setShowAddSite] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", contact_name: "", contact_email: "", contact_phone: "", address: "", city: "", postcode: "" });
  const [newSite, setNewSite] = useState({ name: "", address: "", city: "", postcode: "", contact_name: "", contact_phone: "" });
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [savingSite, setSavingSite] = useState(false);

  const handleCreateCustomer = async () => {
    if (!newCustomer.name.trim()) { toast.error("Customer name required"); return; }
    setSavingCustomer(true);
    try {
      const { data, error } = await supabase.from("customers").insert({ ...newCustomer, status: "active" }).select("id, name").single();
      if (error) throw error;
      setCustomers((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setCustomerId(data.id);
      setSiteId("");
      setShowAddCustomer(false);
      setNewCustomer({ name: "", contact_name: "", contact_email: "", contact_phone: "", address: "", city: "", postcode: "" });
      toast.success(`Customer "${data.name}" added`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create customer");
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleCreateSite = async () => {
    if (!newSite.name.trim()) { toast.error("Site name required"); return; }
    if (!customerId) { toast.error("Select or create a customer first"); return; }
    setSavingSite(true);
    try {
      const { data, error } = await supabase.from("sites").insert({ ...newSite, customer_id: customerId, status: "active" }).select("id, name, customer_id").single();
      if (error) throw error;
      setSites((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setSiteId(data.id);
      setShowAddSite(false);
      setNewSite({ name: "", address: "", city: "", postcode: "", contact_name: "", contact_phone: "" });
      toast.success(`Site "${data.name}" added`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create site");
    } finally {
      setSavingSite(false);
    }
  };

  // Scope / classification fields (cost intelligence)
  const [systemType, setSystemType] = useState<SystemType | "">("");
  const [buildingType, setBuildingType] = useState<BuildingType | "">("");
  const [jobCategory, setJobCategory] = useState<JobCategory | "">("");
  const [region, setRegion] = useState<Region | "">("");
  const [bs5839, setBs5839] = useState<Bs5839Category | "">("");
  const [deviceCount, setDeviceCount] = useState<string>("");
  const [loopCount, setLoopCount] = useState<string>("");
  const [giaSqm, setGiaSqm] = useState<string>("");


  // Autocomplete state per line item
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<SupplierProduct[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const fetchData = async () => {
      const [custRes, siteRes] = await Promise.all([
        supabase.from("customers").select("id, name").order("name"),
        supabase.from("sites").select("id, name, customer_id").order("name"),
      ]);
      setCustomers(custRes.data || []);
      setSites(siteRes.data || []);
    };
    fetchData();

    if (prefillLineItem) {
      const item = {
        description: prefillLineItem.description,
        quantity: prefillLineItem.quantity,
        unit_price: prefillLineItem.unit_price,
        markup_percent: 0,
        labour_cost: prefillLineItem.labour_cost,
        total_price: (prefillLineItem.quantity * prefillLineItem.unit_price) + prefillLineItem.labour_cost,
      };
      setLineItems([item]);
    }
  }, [open, prefillLineItem]);

  useEffect(() => {
    if (customerId) {
      setFilteredSites(sites.filter((s) => s.customer_id === customerId));
    } else {
      setFilteredSites(sites);
    }
  }, [customerId, sites]);

  // Close suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setActiveSuggestionIndex(null);
        setSuggestions([]);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchSuggestions = useCallback(async (term: string, index: number) => {
    if (term.trim().length < 2) {
      setSuggestions([]);
      setActiveSuggestionIndex(null);
      return;
    }
    setSuggestionsLoading(true);
    setActiveSuggestionIndex(index);
    try {
      const { data } = await searchSupplierProducts(term, 10);
      setSuggestions(data);
      if (data.length === 0) setActiveSuggestionIndex(null);
    } catch {
      setSuggestions([]);
      setActiveSuggestionIndex(null);
    } finally {
      setSuggestionsLoading(false);
    }
  }, []);

  const handleDescriptionChange = (index: number, value: string) => {
    handleItemChange(index, "description", value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value, index), 250);
  };

  const selectProduct = (index: number, product: SupplierProduct) => {
    const updated = [...lineItems];
    const item = updated[index];
    const desc = `${product.product_code} - ${product.description}`;
    updated[index] = {
      ...item,
      description: desc,
      unit_price: product.trade_price,
      total_price: item.quantity * product.trade_price * (1 + (item.markup_percent || 0) / 100) + (item.labour_cost || 0),
    };
    setLineItems(updated);
    setActiveSuggestionIndex(null);
    setSuggestions([]);
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
  };

  const addItem = () => {
    setLineItems([...lineItems, { description: "", quantity: 1, unit_price: 0, markup_percent: 0, labour_cost: 0, total_price: 0 }]);
  };

  const removeItem = (i: number) => {
    setLineItems(lineItems.filter((_, idx) => idx !== i));
  };

  const subtotal = lineItems.reduce((s, item) => s + (item.total_price || 0), 0);
  const totalCost = lineItems.reduce((s, item) => s + (item.quantity * item.unit_price) + (item.labour_cost || 0), 0);
  const profitMargin = subtotal - totalCost;
  const vatAmount = subtotal * (vatRate / 100);
  const grandTotal = subtotal + vatAmount;

  const handleSave = async () => {
    if (!siteId) { toast.error("Please select a site"); return; }
    if (lineItems.length === 0 || !lineItems.some((i) => i.description.trim())) {
      toast.error("Add at least one line item with a description");
      return;
    }

    setSaving(true);
    try {
      if (!user) throw new Error("Not authenticated");

      const { data: quotationNumber } = await supabase.rpc("get_next_quotation_number");

      const { data: quotation, error } = await supabase
        .from("quotations")
        .insert({
          quotation_number: quotationNumber,
          site_id: siteId,
          customer_id: customerId || null,
          status: "draft",
          title: title || "New Quotation",
          summary,
          total_amount: subtotal,
          system_type: systemType || null,
          building_type: buildingType || null,
          job_category: jobCategory || null,
          region: region || null,
          bs5839_category: bs5839 || null,
          device_count: deviceCount ? parseInt(deviceCount) : null,
          loop_count: loopCount ? parseInt(loopCount) : null,
          gia_sqm: giaSqm ? parseFloat(giaSqm) : null,
          vat_rate: vatRate,
          valid_until: new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          terms: terms || null,
          notes: notes || null,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      const itemsToInsert = lineItems
        .filter((i) => i.description.trim())
        .map((item, index) => ({
          quotation_id: quotation.id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          markup_percent: item.markup_percent || 0,
          labour_cost: item.labour_cost || 0,
          total_price: item.total_price,
          sort_order: index,
          priority: "medium",
        }));

      if (itemsToInsert.length > 0) {
        const { error: itemsErr } = await supabase.from("quotation_line_items").insert(itemsToInsert);
        if (itemsErr) throw itemsErr;
      }

      // Sync to SharePoint in background
      try {
        const selectedCustomer = customers.find(c => c.id === customerId);
        const selectedSite = sites.find(s => s.id === siteId);
        if (selectedCustomer && selectedSite) {
          const { data: siteData } = await supabase
            .from("sites")
            .select("sharepoint_folder, name, address")
            .eq("id", siteId)
            .single();

          let folderPath: string | null = null;
          if (siteData?.sharepoint_folder) {
            folderPath = `${siteData.sharepoint_folder}/Quotations`;
          } else if (siteData) {
            const { data: spData, error: spError } = await supabase.functions.invoke("sharepoint-create-folder", {
              body: { siteId: siteId, subPath: "Quotations", entityType: "folder_only", entityId: siteId },
            });
            if (!spError && spData?.success) {
              folderPath = spData.folderPath;
            }
          }

          if (folderPath) {
            const companySettings = await getCompanySettings();
            const pdfData: QuotationData = {
              quotation_number: quotationNumber,
              title: title || "New Quotation",
              summary,
              total_amount: subtotal,
              valid_until: new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
              notes,
              terms: terms || null,
              created_at: new Date().toISOString(),
              site: { name: selectedSite.name },
              customer: { name: selectedCustomer.name, contact_name: null, contact_email: null, contact_phone: null, address: null, city: null, postcode: null },
              line_items: lineItems.filter(i => i.description.trim()).map(item => ({
                description: item.description, priority: "medium", quantity: item.quantity,
                unit_price: item.unit_price, markup_percent: item.markup_percent || 0, labour_cost: item.labour_cost, total_price: item.total_price,
              })),
              vat_rate: vatRate,
            };
            // Auto-detect unused columns
            const parentItems = pdfData.line_items;
            const hasLabour = parentItems.some(i => (i.labour_cost || 0) > 0);
            const autoColumnOptions: PDFColumnOptions = {
              showItemNumber: true, showDescription: true, showRegulationRef: false,
              showPriority: false, showItem: false, showQuantity: true,
              showUnitPrice: true, showLabour: hasLabour, showTotal: true,
            };
            const pdfBase64 = await generateQuotationPDF(pdfData, companySettings || undefined, true, autoColumnOptions);
            if (pdfBase64) {
              const pdfFileName = `${quotationNumber} - ${selectedSite.name}.pdf`;
              await supabase.functions.invoke("upload-to-sharepoint", {
                body: { folderPath, fileName: pdfFileName, fileBase64: pdfBase64, contentType: "application/pdf" },
              });
              // Save SharePoint folder to quotation
              await supabase.from("quotations").update({ sharepoint_folder: folderPath }).eq("id", quotation.id);
              console.log("New quotation synced to SharePoint:", folderPath);
            }
          }
        }
      } catch (spErr) {
        console.log("SharePoint sync for new quotation skipped:", spErr);
      }

      toast.success(`Quotation ${quotationNumber} created`);
      onSuccess?.();
      onOpenChange(false);
      resetForm();
    } catch (err: any) {
      console.error("Save error:", err);
      toast.error(err.message || "Failed to create quotation");
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setCustomerId("");
    setSiteId("");
    setTitle("");
    setSummary("");
    setTerms("");
    setNotes("");
    setLineItems([{ description: "", quantity: 1, unit_price: 0, markup_percent: 0, labour_cost: 0, total_price: 0 }]);
    setSystemType(""); setBuildingType(""); setJobCategory("");
    setRegion(""); setBs5839(""); setDeviceCount(""); setLoopCount(""); setGiaSqm("");
  };

  const scope: QuoteScope | null = useMemo(() => {
    if (!systemType || !buildingType) return null;
    return {
      systemType, buildingType,
      jobCategory: jobCategory || undefined,
      region: region || undefined,
      bs5839Category: bs5839 || undefined,
      deviceCount: deviceCount ? parseInt(deviceCount) : undefined,
      loopCount: loopCount ? parseInt(loopCount) : undefined,
      giaSqm: giaSqm ? parseFloat(giaSqm) : undefined,
    };
  }, [systemType, buildingType, jobCategory, region, bs5839, deviceCount, loopCount, giaSqm]);

  const openHistoricalJob = useCallback((jobId: string) => {
    window.open(`/dashboard/visits?highlight=${jobId}`, "_blank", "noopener,noreferrer");
  }, []);


  return (
    <>
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle>New Quotation</ResponsiveDialogTitle>
        <ResponsiveDialogDescription>Create a standalone quotation with customer, site and line items.</ResponsiveDialogDescription>
      </ResponsiveDialogHeader>

      <ResponsiveDialogBody>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-4">
          <div className="lg:col-span-8 space-y-6 min-w-0">
            {/* Scope & Classification */}
            <div className="border rounded-lg p-4 bg-muted/30">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-semibold">Scope & classification</Label>
                <span className="text-xs text-muted-foreground">Powers cost intelligence →</span>
              </div>
              <ScopeFields
                systemType={systemType} setSystemType={setSystemType}
                buildingType={buildingType} setBuildingType={setBuildingType}
                jobCategory={jobCategory} setJobCategory={setJobCategory}
                region={region} setRegion={setRegion}
                bs5839={bs5839} setBs5839={setBs5839}
                deviceCount={deviceCount} setDeviceCount={setDeviceCount}
                loopCount={loopCount} setLoopCount={setLoopCount}
                giaSqm={giaSqm} setGiaSqm={setGiaSqm}
              />
            </div>

          {/* Customer & Site */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Customer</Label>
                <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setShowAddCustomer(true)}>
                  <UserPlus className="mr-1 h-3 w-3" /> New
                </Button>
              </div>
              <Select value={customerId} onValueChange={(v) => { setCustomerId(v); setSiteId(""); }}>
                <SelectTrigger><SelectValue placeholder="Select customer..." /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Site *</Label>
                <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setShowAddSite(true)} disabled={!customerId}>
                  <Building2 className="mr-1 h-3 w-3" /> New
                </Button>
              </div>
              <Select value={siteId} onValueChange={setSiteId}>
                <SelectTrigger><SelectValue placeholder={customerId ? "Select site..." : "Pick customer first"} /></SelectTrigger>
                <SelectContent>
                  {filteredSites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Quote Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Quote Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fire Alarm Upgrade" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valid (days)</Label>
                <Input type="number" value={validDays} onChange={(e) => setValidDays(parseInt(e.target.value) || 30)} />
              </div>
              <div className="space-y-2">
                <Label>VAT %</Label>
                <Input type="number" value={vatRate} onChange={(e) => setVatRate(parseFloat(e.target.value) || 0)} />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Summary</Label>
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Brief description of the works..." className="min-h-[60px]" />
          </div>

          {/* Line Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Label className="text-base font-semibold">Line Items</Label>
              <div className="flex items-center gap-2 flex-wrap">
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
                        total_price: i.quantity * i.unit_price * (1 + pct / 100) + (i.labour_cost || 0),
                      }));
                      setLineItems(updated);
                    }}
                  >
                    Apply
                  </Button>
                </div>
                <AIExpandButton
                  lineItems={lineItems}
                  onAccept={(expandedItems, generatedSummary) => {
                    const updated = [...lineItems];
                    expandedItems.forEach(({ index, description }) => {
                      if (updated[index]) updated[index] = { ...updated[index], description };
                    });
                    setLineItems(updated);
                    if (generatedSummary) setSummary(generatedSummary);
                  }}
                />
                <Button variant="outline" size="sm" onClick={addItem}>
                  <Plus className="mr-1 h-4 w-4" /> Add Item
                </Button>
              </div>
            </div>

            {lineItems.map((item, index) => (
              <div key={index} className="border rounded-lg p-3 sm:p-4 space-y-3">
                <div className="flex items-start gap-2 sm:gap-3">
                  <div className="flex-1 space-y-3">
                    {/* Description with catalog autocomplete */}
                    <div className="relative" ref={activeSuggestionIndex === index ? suggestionsRef : undefined}>
                      <Input
                        value={item.description}
                        onChange={(e) => handleDescriptionChange(index, e.target.value)}
                        onFocus={() => {
                          if (item.description.trim().length >= 2) {
                            fetchSuggestions(item.description, index);
                          }
                        }}
                        placeholder="Type product code or description to search catalog…"
                        className="w-full"
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            setActiveSuggestionIndex(null);
                            setSuggestions([]);
                          }
                        }}
                      />
                      {activeSuggestionIndex === index && suggestions.length > 0 && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-[240px] overflow-y-auto">
                          {suggestionsLoading && (
                            <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" /> Searching…
                            </div>
                          )}
                          {suggestions.map((product) => (
                            <button
                              key={product.id}
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-accent transition-colors flex items-center justify-between gap-2 border-b border-border/50 last:border-0"
                              onClick={() => selectProduct(index, product)}
                            >
                              <div className="min-w-0 flex-1">
                                <span className="font-mono text-xs font-semibold text-primary">{product.product_code}</span>
                                <span className="text-xs text-muted-foreground ml-2">{product.description}</span>
                                {product.category && (
                                  <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">{product.category}</Badge>
                                )}
                              </div>
                              <span className="text-xs font-bold shrink-0">£{Number(product.trade_price).toFixed(2)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
                      <div>
                        <Label className="text-xs">Qty</Label>
                        <Input
                          type="number" min={1} value={item.quantity}
                          onChange={(e) => handleItemChange(index, "quantity", parseInt(e.target.value) || 1)}
                          className="h-9"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Unit Price (£)</Label>
                        <Input
                          type="number" min={0} step={0.01} value={item.unit_price}
                          onChange={(e) => handleItemChange(index, "unit_price", parseFloat(e.target.value) || 0)}
                          className="h-9"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Markup (%)</Label>
                        <Input
                          type="number" min={0} step={1} value={item.markup_percent}
                          onChange={(e) => handleItemChange(index, "markup_percent", parseFloat(e.target.value) || 0)}
                          className="h-9"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Sell Price (£)</Label>
                        <Input type="number" value={(item.unit_price * (1 + (item.markup_percent || 0) / 100)).toFixed(2)} readOnly className="h-9 bg-muted" />
                      </div>
                      <div>
                        <Label className="text-xs">Labour (£)</Label>
                        <Input
                          type="number" min={0} step={0.01} value={item.labour_cost}
                          onChange={(e) => handleItemChange(index, "labour_cost", parseFloat(e.target.value) || 0)}
                          className="h-9"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Total (£)</Label>
                        <Input type="number" value={item.total_price.toFixed(2)} readOnly className="h-9 bg-muted" />
                      </div>
                    </div>
                  </div>
                  {lineItems.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removeItem(index)} className="text-muted-foreground hover:text-destructive mt-1 shrink-0">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {/* Totals */}
            <div className="border-t pt-3 space-y-1 text-right text-sm">
              <div><span className="text-muted-foreground">Cost:</span> <span className="font-medium">£{totalCost.toFixed(2)}</span></div>
              <div><span className="text-emerald-600 dark:text-emerald-400">Profit Margin:</span> <span className="font-medium text-emerald-600 dark:text-emerald-400">£{profitMargin.toFixed(2)}{totalCost > 0 ? ` (${((profitMargin / totalCost) * 100).toFixed(1)}%)` : ''}</span></div>
              <div><span className="text-muted-foreground">Subtotal:</span> <span className="font-medium">£{subtotal.toFixed(2)}</span></div>
              <div><span className="text-muted-foreground">VAT ({vatRate}%):</span> <span className="font-medium">£{vatAmount.toFixed(2)}</span></div>
              <div className="text-base"><span className="text-muted-foreground">Grand Total:</span> <span className="font-semibold">£{grandTotal.toFixed(2)}</span></div>
            </div>
          </div>

          {/* Terms & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Terms & Conditions</Label>
              <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Payment terms, warranty info..." className="min-h-[60px]" />
            </div>
            <div className="space-y-2">
              <Label>Internal Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (not shown on PDF)..." className="min-h-[60px]" />
            </div>
          </div>
          </div>
          <aside className="lg:col-span-4 order-first lg:order-last">
            <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
              <ComparableJobsPanel
                scope={scope}
                currentQuoteTotal={subtotal}
                onSelectJob={openHistoricalJob}
              />
            </div>
          </aside>
        </div>
      </ResponsiveDialogBody>


      <ResponsiveDialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Create Quotation"}
        </Button>
      </ResponsiveDialogFooter>
    </ResponsiveDialog>

    {/* Quick-add customer */}
    <Dialog open={showAddCustomer} onOpenChange={setShowAddCustomer}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add new customer</DialogTitle>
          <DialogDescription>Create a customer on the fly. You can fill in more details later from the Customers page.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Customer name *</Label>
            <Input value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} placeholder="Company / customer name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Contact name</Label>
              <Input value={newCustomer.contact_name} onChange={(e) => setNewCustomer({ ...newCustomer, contact_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Contact phone</Label>
              <Input value={newCustomer.contact_phone} onChange={(e) => setNewCustomer({ ...newCustomer, contact_phone: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Contact email</Label>
            <Input type="email" value={newCustomer.contact_email} onChange={(e) => setNewCustomer({ ...newCustomer, contact_email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Address (AI lookup)</Label>
            <AddressAutocomplete
              value={newCustomer.address}
              onChange={(v) => setNewCustomer((prev) => ({ ...prev, address: v }))}
              onAddressSelect={(d) => setNewCustomer((prev) => ({
                ...prev,
                address: d.address,
                city: d.city || prev.city,
                postcode: d.postcode || prev.postcode,
                name: prev.name || d.businessName || prev.name,
              }))}
              placeholder="Start typing address or business name…"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input value={newCustomer.city} onChange={(e) => setNewCustomer({ ...newCustomer, city: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Postcode</Label>
              <Input value={newCustomer.postcode} onChange={(e) => setNewCustomer({ ...newCustomer, postcode: e.target.value })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowAddCustomer(false)}>Cancel</Button>
          <Button onClick={handleCreateCustomer} disabled={savingCustomer}>
            {savingCustomer ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : "Add customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Quick-add site */}
    <Dialog open={showAddSite} onOpenChange={setShowAddSite}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add new site</DialogTitle>
          <DialogDescription>Create a site under the selected customer. More details can be added later.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Site name *</Label>
            <Input value={newSite.name} onChange={(e) => setNewSite({ ...newSite, name: e.target.value })} placeholder="e.g. Head Office, Warehouse 2" />
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input value={newSite.address} onChange={(e) => setNewSite({ ...newSite, address: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input value={newSite.city} onChange={(e) => setNewSite({ ...newSite, city: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Postcode</Label>
              <Input value={newSite.postcode} onChange={(e) => setNewSite({ ...newSite, postcode: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Site contact</Label>
              <Input value={newSite.contact_name} onChange={(e) => setNewSite({ ...newSite, contact_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Contact phone</Label>
              <Input value={newSite.contact_phone} onChange={(e) => setNewSite({ ...newSite, contact_phone: e.target.value })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowAddSite(false)}>Cancel</Button>
          <Button onClick={handleCreateSite} disabled={savingSite}>
            {savingSite ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : "Add site"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
