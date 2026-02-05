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
import { Loader2, Trash2, Plus, Save, PoundSterling, FileDown, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { generateQuotationPDF, QuotationData } from "@/lib/quotationPdfGenerator";
import { getCompanySettings } from "@/services/companySettingsService";

interface LineItem {
  id: string;
  description: string;
  regulation_reference: string | null;
  priority: string;
  source_section: string | null;
  quantity: number;
  unit_price: number;
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
  sites: { 
    name: string; 
    address?: string | null;
    city?: string | null;
    postcode?: string | null;
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
  const [quotation, setQuotation] = useState<QuotationFull | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Editable fields
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState(DEFAULT_TERMS);
  const [validUntil, setValidUntil] = useState("");
  const [vatRate, setVatRate] = useState(20);

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
          sites:site_id(name, address, city, postcode),
          customers:customer_id(name, contact_name, contact_email, contact_phone, address, city, postcode)
        `)
        .eq("id", quotationId)
        .single();

      if (quotationError) throw quotationError;
      setQuotation(quotationData);
      
      // Set editable fields
      setTitle(quotationData.title || `Remedial Works - ${quotationData.sites?.name || "Site"}`);
      setSummary(quotationData.summary || "");
      setNotes(quotationData.notes || "");
      setTerms((quotationData as any).terms || DEFAULT_TERMS);
      setValidUntil(quotationData.valid_until || "");
      setVatRate((quotationData as any).vat_rate ?? 20);

      // Fetch line items
      const { data: itemsData, error: itemsError } = await supabase
        .from("quotation_line_items")
        .select("*")
        .eq("quotation_id", quotationId)
        .order("sort_order", { ascending: true });

      if (itemsError) throw itemsError;
      setLineItems(itemsData || []);
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

    if (field === "quantity" || field === "unit_price") {
      updated[index].total_price = updated[index].quantity * updated[index].unit_price;
    }

    setLineItems(updated);
    setHasChanges(true);
  };

  const handleAddItem = () => {
    const newItem: LineItem = {
      id: `temp-${Date.now()}`,
      description: "",
      regulation_reference: null,
      priority: "medium",
      source_section: null,
      quantity: 1,
      unit_price: 0,
      total_price: 0,
      notes: null,
      sort_order: lineItems.length,
    };
    setLineItems([...lineItems, newItem]);
    setHasChanges(true);
  };

  const handleRemoveItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!quotation) return;

    setSaving(true);
    try {
      const totalAmount = lineItems.reduce((sum, item) => sum + (item.total_price || 0), 0);

      // Update quotation with all fields
      const { error: quotationError } = await supabase
        .from("quotations")
        .update({ 
          total_amount: totalAmount,
          title,
          summary,
          notes,
          terms,
          vat_rate: vatRate,
          valid_until: validUntil || null,
        })
        .eq("id", quotationId);

      if (quotationError) throw quotationError;

      // Delete existing line items
      const { error: deleteError } = await supabase
        .from("quotation_line_items")
        .delete()
        .eq("quotation_id", quotationId);

      if (deleteError) throw deleteError;

      // Insert updated line items
      if (lineItems.length > 0) {
        const itemsToInsert = lineItems.map((item, index) => ({
          quotation_id: quotationId,
          description: item.description,
          regulation_reference: item.regulation_reference,
          priority: item.priority,
          source_section: item.source_section,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
          notes: item.notes,
          sort_order: index,
        }));

        const { error: insertError } = await supabase
          .from("quotation_line_items")
          .insert(itemsToInsert);

        if (insertError) throw insertError;
      }

      toast.success("Quotation saved");
      setHasChanges(false);
      onUpdate?.();
      fetchQuotation();
    } catch (error) {
      console.error("Error saving quotation:", error);
      toast.error("Failed to save quotation");
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePDF = async () => {
    if (!quotation) return;

    setGenerating(true);
    try {
      const companySettings = await getCompanySettings();
      
      const pdfData: QuotationData = {
        quotation_number: quotation.quotation_number,
        title,
        summary,
        total_amount: lineItems.reduce((sum, item) => sum + (item.total_price || 0), 0),
        valid_until: validUntil,
        notes,
        terms,
        created_at: quotation.created_at,
        site: {
          name: quotation.sites?.name || "Unknown Site",
          address: quotation.sites?.address,
          city: quotation.sites?.city,
          postcode: quotation.sites?.postcode,
        },
        customer: quotation.customers ? {
          name: quotation.customers.name,
          contact_name: quotation.customers.contact_name,
          contact_email: quotation.customers.contact_email,
          contact_phone: quotation.customers.contact_phone,
          address: quotation.customers.address,
          city: quotation.customers.city,
          postcode: quotation.customers.postcode,
        } : null,
        line_items: lineItems.map(item => ({
          description: item.description,
          regulation_reference: item.regulation_reference,
          priority: item.priority,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
        })),
        vat_rate: vatRate,
      };

      await generateQuotationPDF(pdfData, companySettings || undefined);
      toast.success("PDF generated successfully");
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
      default:
        return "secondary";
    }
  };

  const totalAmount = lineItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
  const vatAmount = totalAmount * (vatRate / 100);
  const grandTotal = totalAmount + vatAmount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {quotation?.quotation_number || "Loading..."}
            {quotation && (
              <Badge variant="outline" className="ml-2">
                {quotation.status}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : quotation ? (
          <Tabs defaultValue="items" className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="items">Line Items</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="terms">Terms & Notes</TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1 pr-4">
              <TabsContent value="items" className="mt-4 space-y-4">
                {/* Customer/Site Info */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                  <div>
                    <p className="text-sm text-muted-foreground">Site</p>
                    <p className="font-medium">{quotation.sites?.name}</p>
                    {quotation.sites?.address && (
                      <p className="text-sm text-muted-foreground">{quotation.sites.address}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Customer</p>
                    <p className="font-medium">{quotation.customers?.name || "—"}</p>
                    {quotation.customers?.contact_name && (
                      <p className="text-sm text-muted-foreground">{quotation.customers.contact_name}</p>
                    )}
                  </div>
                </div>

                {/* Line Items */}
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Quotation Items ({lineItems.length})</h3>
                  <Button variant="outline" size="sm" onClick={handleAddItem}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Item
                  </Button>
                </div>

                {lineItems.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">
                    No line items. Click "Add Item" to add one.
                  </p>
                ) : (
                  lineItems.map((item, index) => (
                    <div key={item.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center gap-2">
                            <Badge variant={getPriorityColor(item.priority)}>
                              {item.priority}
                            </Badge>
                            {item.regulation_reference && (
                              <Badge variant="outline" className="text-xs">
                                {item.regulation_reference}
                              </Badge>
                            )}
                          </div>

                          <Textarea
                            value={item.description}
                            onChange={(e) =>
                              handleItemChange(index, "description", e.target.value)
                            }
                            placeholder="Description of work required..."
                            className="min-h-[60px]"
                          />

                          <div className="grid grid-cols-5 gap-3">
                            <div>
                              <Label className="text-xs">Priority</Label>
                              <Select
                                value={item.priority}
                                onValueChange={(value) =>
                                  handleItemChange(index, "priority", value)
                                }
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="critical">Critical</SelectItem>
                                  <SelectItem value="high">High</SelectItem>
                                  <SelectItem value="medium">Medium</SelectItem>
                                  <SelectItem value="low">Low</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-xs">Regulation Ref</Label>
                              <Input
                                value={item.regulation_reference || ""}
                                onChange={(e) =>
                                  handleItemChange(index, "regulation_reference", e.target.value || null)
                                }
                                placeholder="BS 5839-1"
                                className="h-9"
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

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveItem(index)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}

                {/* Totals */}
                <div className="border-t pt-4 space-y-2">
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
              </TabsContent>

              <TabsContent value="details" className="mt-4 space-y-4">
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

                  <div>
                    <Label>Customer Contact</Label>
                    <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-1">
                      {quotation.customers ? (
                        <>
                          <p><span className="text-muted-foreground">Company:</span> {quotation.customers.name}</p>
                          {quotation.customers.contact_name && (
                            <p><span className="text-muted-foreground">Contact:</span> {quotation.customers.contact_name}</p>
                          )}
                          {quotation.customers.contact_email && (
                            <p><span className="text-muted-foreground">Email:</span> {quotation.customers.contact_email}</p>
                          )}
                          {quotation.customers.contact_phone && (
                            <p><span className="text-muted-foreground">Phone:</span> {quotation.customers.contact_phone}</p>
                          )}
                        </>
                      ) : (
                        <p className="text-muted-foreground">No customer linked</p>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="terms" className="mt-4 space-y-4">
                <div>
                  <Label>Terms & Conditions</Label>
                  <Textarea
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    placeholder="Enter terms and conditions..."
                    className="min-h-[200px] font-mono text-sm"
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
                    className="min-h-[100px]"
                  />
                </div>
              </TabsContent>
            </ScrollArea>
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
          {hasChanges && (
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
  );
}
