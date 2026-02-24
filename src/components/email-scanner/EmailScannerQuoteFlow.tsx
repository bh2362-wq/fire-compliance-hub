import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, Plus, Trash2, Save, Merge } from "lucide-react";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { ExtractedEmailData } from "@/pages/EmailScanner";

interface Customer {
  id: string;
  name: string;
  contact_email: string | null;
}

interface Site {
  id: string;
  name: string;
  customer_id: string | null;
  address: string | null;
  city: string | null;
  postcode: string | null;
}

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  labour_cost: number;
  total_price: number;
}

interface Props {
  data: ExtractedEmailData;
  onBack: () => void;
}

export const EmailScannerQuoteFlow = ({ data, onBack }: Props) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [matchedCustomerId, setMatchedCustomerId] = useState<string>("");
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [createNewCustomer, setCreateNewCustomer] = useState(false);
  const [createNewSite, setCreateNewSite] = useState(false);
  const [title, setTitle] = useState(data.scope_summary || data.description || "");
  const [summary, setSummary] = useState(data.scope_summary || "");
  const [terms, setTerms] = useState("This quotation is valid for 30 days from the date of issue.");
  const [notes, setNotes] = useState(data.notes || data.special_requirements || "");
  const [vatRate, setVatRate] = useState(20);

  // New customer/site fields
  const [newCustomerName, setNewCustomerName] = useState(data.company_name || "");
  const [newCustomerEmail, setNewCustomerEmail] = useState(data.contact_email || data.sender_email || "");
  const [newCustomerPhone, setNewCustomerPhone] = useState(data.contact_phone || "");
  const [newCustomerContact, setNewCustomerContact] = useState(data.contact_name || data.sender_name || "");
  const [newSiteName, setNewSiteName] = useState(data.site_name || "");
  const [newSiteAddress, setNewSiteAddress] = useState(data.site_address || "");
  const [newSiteCity, setNewSiteCity] = useState(data.site_city || "");
  const [newSitePostcode, setNewSitePostcode] = useState(data.site_postcode || "");

  const [lineItems, setLineItems] = useState<LineItem[]>(
    data.job_requirements && data.job_requirements.length > 0
      ? data.job_requirements.map((r) => ({
          description: r.description,
          quantity: r.estimated_quantity || 1,
          unit_price: 0,
          labour_cost: 0,
          total_price: 0,
        }))
      : [{ description: "", quantity: 1, unit_price: 0, labour_cost: 0, total_price: 0 }]
  );

  useEffect(() => {
    const fetchData = async () => {
      const [{ data: cust }, { data: sit }] = await Promise.all([
        supabase.from("customers").select("id, name, contact_email").eq("status", "active").order("name"),
        supabase.from("sites").select("id, name, customer_id, address, city, postcode").eq("status", "active").order("name"),
      ]);
      let matchedCustId = "";
      if (cust) {
        setCustomers(cust);
        if (data.company_name) {
          const match = cust.find(
            (c) => c.name.toLowerCase() === data.company_name!.toLowerCase() ||
              c.name.toLowerCase().includes(data.company_name!.toLowerCase()) ||
              data.company_name!.toLowerCase().includes(c.name.toLowerCase())
          );
          if (match) {
            matchedCustId = match.id;
            setMatchedCustomerId(match.id);
          } else {
            setCreateNewCustomer(true);
          }
        }
      }
      if (sit) {
        setSites(sit);
        // Try to match an existing site for this customer
        if (matchedCustId) {
          const customerSites = sit.filter((s) => s.customer_id === matchedCustId);
          const siteMatch = customerSites.find((s) => {
            const nameMatch = data.site_name && s.name.toLowerCase().includes(data.site_name.toLowerCase());
            const addrMatch = data.site_address && s.address?.toLowerCase().includes(data.site_address.toLowerCase());
            const postcodeMatch = data.site_postcode && s.postcode?.toLowerCase().replace(/\s/g, '') === data.site_postcode.toLowerCase().replace(/\s/g, '');
            return nameMatch || addrMatch || postcodeMatch;
          });
          if (siteMatch) {
            setSelectedSiteId(siteMatch.id);
          } else if (data.site_name || data.site_address) {
            setCreateNewSite(true);
          }
        } else if (data.site_name || data.site_address) {
          const siteMatch = sit.find((s) => {
            const nameMatch = data.site_name && s.name.toLowerCase().includes(data.site_name.toLowerCase());
            const postcodeMatch = data.site_postcode && s.postcode?.toLowerCase().replace(/\s/g, '') === data.site_postcode.toLowerCase().replace(/\s/g, '');
            return nameMatch || postcodeMatch;
          });
          if (siteMatch) {
            setSelectedSiteId(siteMatch.id);
          } else {
            setCreateNewSite(true);
          }
        }
      }
    };
    fetchData();
  }, [data.company_name, data.site_name, data.site_address, data.site_postcode]);

  const filteredSites = matchedCustomerId
    ? sites.filter((s) => s.customer_id === matchedCustomerId)
    : sites;

  const handleItemChange = (index: number, field: keyof LineItem, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    if (field === "quantity" || field === "unit_price" || field === "labour_cost") {
      updated[index].total_price = updated[index].quantity * updated[index].unit_price + (updated[index].labour_cost || 0);
    }
    setLineItems(updated);
  };

  const addItem = () => setLineItems([...lineItems, { description: "", quantity: 1, unit_price: 0, labour_cost: 0, total_price: 0 }]);
  const removeItem = (i: number) => lineItems.length > 1 && setLineItems(lineItems.filter((_, idx) => idx !== i));

  const mergeItems = (i: number) => {
    if (i >= lineItems.length - 1) return;
    const updated = [...lineItems];
    const a = updated[i];
    const b = updated[i + 1];
    const merged: LineItem = {
      description: `${a.description}; ${b.description}`.replace(/^; |; $/g, ''),
      quantity: a.quantity + b.quantity,
      unit_price: a.unit_price || b.unit_price,
      labour_cost: a.labour_cost + b.labour_cost,
      total_price: 0,
    };
    merged.total_price = merged.quantity * merged.unit_price + merged.labour_cost;
    updated.splice(i, 2, merged);
    setLineItems(updated);
  };

  const subtotal = lineItems.reduce((s, item) => s + item.total_price, 0);
  const vatAmount = subtotal * (vatRate / 100);
  const total = subtotal + vatAmount;

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error("Not authenticated");
      const user = session.user;

      let customerId = matchedCustomerId;
      let siteId = selectedSiteId;

      // Create new customer if needed
      if (createNewCustomer && newCustomerName) {
        const { data: newCust, error: custErr } = await supabase.from("customers").insert({
          name: newCustomerName,
          contact_email: newCustomerEmail || null,
          contact_phone: newCustomerPhone || null,
          contact_name: newCustomerContact || null,
        }).select().single();
        if (custErr) throw custErr;
        customerId = newCust.id;
      }

      // Create new site if needed
      if (createNewSite && newSiteName && customerId) {
        const { data: newSite, error: siteErr } = await supabase.from("sites").insert({
          name: newSiteName,
          address: newSiteAddress || null,
          city: newSiteCity || null,
          postcode: newSitePostcode || null,
          customer_id: customerId,
          status: "active",
        }).select().single();
        if (siteErr) throw siteErr;
        siteId = newSite.id;
      }

      // Get quotation number
      const { data: quoteNum } = await supabase.rpc("get_next_quotation_number");

      if (!siteId) {
        throw new Error("A site is required to create a quotation. Please select or create a site.");
      }

      // Create quotation
      const { data: quote, error: quoteErr } = await supabase.from("quotations").insert({
        quotation_number: quoteNum,
        customer_id: customerId || null,
        site_id: siteId,
        title: title || "Quotation",
        summary: summary || null,
        terms: terms || null,
        notes: notes || null,
        vat_rate: vatRate,
        total_amount: total || 0,
        status: "draft",
        created_by: user.id,
      }).select().single();
      if (quoteErr) throw quoteErr;

      // Create line items
      if (lineItems.length > 0) {
        const items = lineItems.map((item, idx) => ({
          quotation_id: quote.id,
          description: item.description || "Item",
          quantity: item.quantity,
          unit_price: item.unit_price,
          labour_cost: item.labour_cost,
          total_price: item.total_price,
          sort_order: idx,
        }));
        const { error: itemsErr } = await supabase.from("quotation_line_items").insert(items);
        if (itemsErr) throw itemsErr;
      }

      toast({ title: "Quotation created", description: `${quoteNum} has been created as a draft.` });
      navigate("/dashboard/quotations");
    } catch (err: any) {
      console.error("Save error:", err);
      toast({ title: "Error", description: err.message || "Failed to create quotation", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} className="gap-2">
        <ArrowLeft className="w-4 h-4" /> Back to Scanner
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Customer & Site */}
        <Card>
          <CardHeader>
            <CardTitle>Customer & Site</CardTitle>
            <CardDescription>Select existing or create new</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Customer selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Customer</Label>
                <Button variant="ghost" size="sm" onClick={() => { setCreateNewCustomer(!createNewCustomer); setMatchedCustomerId(""); }}>
                  {createNewCustomer ? "Select Existing" : "+ New Customer"}
                </Button>
              </div>
              {createNewCustomer ? (
                <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
                  <Input placeholder="Company name" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} />
                  <Input placeholder="Contact name" value={newCustomerContact} onChange={(e) => setNewCustomerContact(e.target.value)} />
                  <Input placeholder="Email" value={newCustomerEmail} onChange={(e) => setNewCustomerEmail(e.target.value)} />
                  <Input placeholder="Phone" value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} />
                </div>
              ) : (
                <Select value={matchedCustomerId} onValueChange={setMatchedCustomerId}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {matchedCustomerId && !createNewCustomer && (
                <Badge variant="secondary" className="text-xs">
                  ✓ Matched: {customers.find(c => c.id === matchedCustomerId)?.name}
                </Badge>
              )}
            </div>

            {/* Site selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Site</Label>
                <Button variant="ghost" size="sm" onClick={() => { setCreateNewSite(!createNewSite); setSelectedSiteId(""); }}>
                  {createNewSite ? "Select Existing" : "+ New Site"}
                </Button>
              </div>
              {createNewSite ? (
                <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
                  <Input placeholder="Site name" value={newSiteName} onChange={(e) => setNewSiteName(e.target.value)} />
                  <AddressAutocomplete
                    value={newSiteAddress}
                    onChange={setNewSiteAddress}
                    onAddressSelect={(details) => {
                      setNewSiteAddress(details.address);
                      setNewSiteCity(details.city);
                      setNewSitePostcode(details.postcode);
                      if (details.businessName && !newSiteName) {
                        setNewSiteName(details.businessName);
                      }
                    }}
                    placeholder="Search address..."
                  />
                  <Input placeholder="City" value={newSiteCity} onChange={(e) => setNewSiteCity(e.target.value)} />
                  <Input placeholder="Postcode" value={newSitePostcode} onChange={(e) => setNewSitePostcode(e.target.value)} />
                </div>
              ) : (
                <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                  <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                  <SelectContent>
                    {filteredSites.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quote Details */}
        <Card>
          <CardHeader>
            <CardTitle>Quote Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Summary / Scope of Works</Label>
              <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} className="min-h-[100px]" />
            </div>
            <div className="space-y-2">
              <Label>Terms</Label>
              <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} className="min-h-[60px]" />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[60px]" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Line Items</CardTitle>
            <Button variant="outline" size="sm" onClick={addItem}>
              <Plus className="w-4 h-4 mr-1" /> Add Item
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Header */}
            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
              <div className="col-span-5">Description</div>
              <div className="col-span-1">Qty</div>
              <div className="col-span-2">Unit Price</div>
              <div className="col-span-2">Labour</div>
              <div className="col-span-1">Total</div>
              <div className="col-span-1"></div>
            </div>
            {lineItems.map((item, i) => (
              <div key={i}>
                <div className="grid grid-cols-12 gap-2 items-center">
                  <Input className="col-span-5" placeholder="Description" value={item.description} onChange={(e) => handleItemChange(i, "description", e.target.value)} />
                  <Input className="col-span-1" type="number" min={1} value={item.quantity} onChange={(e) => handleItemChange(i, "quantity", Number(e.target.value))} />
                  <Input className="col-span-2" type="number" min={0} step={0.01} value={item.unit_price} onChange={(e) => handleItemChange(i, "unit_price", Number(e.target.value))} />
                  <Input className="col-span-2" type="number" min={0} step={0.01} value={item.labour_cost} onChange={(e) => handleItemChange(i, "labour_cost", Number(e.target.value))} />
                  <div className="col-span-1 text-sm font-medium">£{item.total_price.toFixed(2)}</div>
                  <Button variant="ghost" size="icon" className="col-span-1" onClick={() => removeItem(i)} disabled={lineItems.length <= 1}>
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </div>
                {i < lineItems.length - 1 && (
                  <div className="flex justify-center -my-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-muted-foreground hover:text-accent"
                      onClick={() => mergeItems(i)}
                      title="Combine with line below"
                    >
                      <Merge className="w-3 h-3 mr-1 rotate-180" />
                      Combine
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="mt-6 border-t pt-4 space-y-2 max-w-xs ml-auto">
            <div className="flex justify-between text-sm"><span>Subtotal</span><span>£{subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between text-sm items-center gap-2">
              <span>VAT ({vatRate}%)</span>
              <span>£{vatAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-lg border-t pt-2"><span>Total</span><span>£{total.toFixed(2)}</span></div>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onBack}>Cancel</Button>
        <Button variant="hero" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Create Draft Quotation
        </Button>
      </div>
    </div>
  );
};
