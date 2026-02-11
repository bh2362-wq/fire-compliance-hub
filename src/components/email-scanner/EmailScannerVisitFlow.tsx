import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { createAppointment } from "@/services/appointmentService";
import { sendAppointmentCreatedNotification } from "@/services/notificationService";
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

interface Props {
  data: ExtractedEmailData;
  onBack: () => void;
}

const VISIT_TYPES = [
  { value: "quarterly_service", label: "Quarterly Service" },
  { value: "biannual_service", label: "6-Monthly Service" },
  { value: "annual_inspection", label: "Annual Inspection" },
  { value: "emergency", label: "Emergency Callout" },
  { value: "remedial", label: "Remedial Work" },
  { value: "supply_only", label: "Supply Only" },
];

export const EmailScannerVisitFlow = ({ data, onBack }: Props) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [matchedCustomerId, setMatchedCustomerId] = useState<string>("");
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [createNewCustomer, setCreateNewCustomer] = useState(false);
  const [createNewSite, setCreateNewSite] = useState(false);

  const [visitType, setVisitType] = useState(data.visit_type || "remedial");
  const [visitDate, setVisitDate] = useState(data.preferred_date || format(new Date(), "yyyy-MM-dd"));
  const [description, setDescription] = useState(data.description || data.scope_summary || "");
  const [notes, setNotes] = useState(data.notes || "");

  // New customer/site fields
  const [newCustomerName, setNewCustomerName] = useState(data.company_name || "");
  const [newCustomerEmail, setNewCustomerEmail] = useState(data.contact_email || data.sender_email || "");
  const [newCustomerPhone, setNewCustomerPhone] = useState(data.contact_phone || "");
  const [newCustomerContact, setNewCustomerContact] = useState(data.contact_name || data.sender_name || "");
  const [newSiteName, setNewSiteName] = useState(data.site_name || "");
  const [newSiteAddress, setNewSiteAddress] = useState(data.site_address || "");
  const [newSiteCity, setNewSiteCity] = useState(data.site_city || "");
  const [newSitePostcode, setNewSitePostcode] = useState(data.site_postcode || "");

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
            // No match found but we have site info from email — offer to create new
            setCreateNewSite(true);
          }
        } else if (data.site_name || data.site_address) {
          // No customer match, but we have site info — check all sites
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

  const handleSave = async () => {
    if (!selectedSiteId && !createNewSite) {
      toast({ title: "Site required", description: "Please select or create a site.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) throw new Error("Not authenticated");

      let customerId = matchedCustomerId;
      let siteId = selectedSiteId;
      let customerName = customers.find(c => c.id === matchedCustomerId)?.name || newCustomerName;

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
        customerName = newCustomerName;
      }

      // Create new site if needed
      let siteName = "";
      let siteAddress = "";
      if (createNewSite && newSiteName) {
        // Build SharePoint folder path: Customers/CustomerName/SiteName (Address)
        const spSiteName = newSiteAddress 
          ? `${newSiteName} (${newSiteAddress})` 
          : newSiteName;
        const spFolderPath = customerName 
          ? `Customers/${customerName}/${spSiteName}` 
          : `Customers/${spSiteName}`;

        const { data: newSite, error: siteErr } = await supabase.from("sites").insert({
          name: newSiteName,
          address: newSiteAddress || null,
          city: newSiteCity || null,
          postcode: newSitePostcode || null,
          customer_id: customerId || null,
          sharepoint_folder: spFolderPath,
          status: "active",
        }).select().single();
        if (siteErr) throw siteErr;
        siteId = newSite.id;
        siteName = newSiteName;
        siteAddress = newSiteAddress;

        // Create the SharePoint folder
        try {
          const { data: spData } = await supabase.functions.invoke("sharepoint-create-folder", {
            body: {
              folderPath: spFolderPath,
              entityType: "site",
              entityId: newSite.id,
            },
          });
          if (spData?.webUrl) {
            await supabase.from("sites").update({ sharepoint_url: spData.webUrl }).eq("id", newSite.id);
          }
        } catch (spErr) {
          console.warn("SharePoint folder creation skipped:", spErr);
        }
      } else {
        const existingSite = sites.find(s => s.id === siteId);
        siteName = existingSite?.name || "";
        siteAddress = existingSite?.address || "";
      }

      // Build notes JSON with asset type info (matching VisitFormDialog pattern)
      const notesData: Record<string, unknown> = {
        asset_type: "general",
      };
      const fullDescription = `${description}\n\n${notes}`.trim();
      if (fullDescription) {
        notesData.user_notes = fullDescription;
      }

      // Create visit (no asset_type column — stored in notes JSON)
      const { data: visit, error: visitErr } = await supabase.from("visits").insert({
        site_id: siteId,
        visit_date: visitDate,
        visit_type: visitType,
        notes: JSON.stringify(notesData),
        status: "scheduled",
      }).select().single();
      if (visitErr) throw visitErr;

      // Create corresponding appointment
      try {
        const typeLabel = VISIT_TYPES.find(t => t.value === visitType)?.label || visitType;
        const newAppointment = await createAppointment({
          visit_id: visit.id,
          site_id: siteId,
          customer_id: customerId || null,
          engineer_id: userData.user.id,
          title: `${typeLabel} - ${siteName || "Site Visit"}`,
          description: fullDescription || null,
          appointment_date: visitDate,
          start_time: "09:00:00",
          end_time: "17:00:00",
          status: "scheduled",
          visit_type: visitType,
        }, userData.user.id);
        sendAppointmentCreatedNotification(newAppointment.id).catch(console.error);
      } catch (aptErr) {
        console.warn("Appointment creation skipped:", aptErr);
      }

      toast({ title: "Visit created", description: `Visit scheduled for ${visitDate}` });
      navigate(`/dashboard/visits?visitId=${visit.id}`);
    } catch (err: any) {
      console.error("Save error:", err);
      toast({ title: "Error", description: err.message || "Failed to create visit", variant: "destructive" });
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
            {/* Customer */}
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

            {/* Site */}
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
                  <Input placeholder="Address" value={newSiteAddress} onChange={(e) => setNewSiteAddress(e.target.value)} />
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

        {/* Visit Details */}
        <Card>
          <CardHeader>
            <CardTitle>Visit Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Visit Type</Label>
              <Select value={visitType} onValueChange={setVisitType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VISIT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Visit Date</Label>
              <Input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[100px]" />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[60px]" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Save */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onBack}>Cancel</Button>
        <Button variant="hero" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Create Visit
        </Button>
      </div>
    </div>
  );
};
