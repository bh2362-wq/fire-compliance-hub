import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ArrowLeft, Save, Trash2, MapPin, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { createAppointment } from "@/services/appointmentService";
import { sendAppointmentCreatedNotification } from "@/services/notificationService";

interface BulkVisit {
  site_name?: string | null;
  site_address?: string | null;
  site_city?: string | null;
  site_postcode?: string | null;
  visit_date?: string | null;
  visit_type?: string | null;
  description?: string | null;
  notes?: string | null;
}

interface BulkEmailData {
  company_name?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  visits: BulkVisit[];
}

interface Props {
  data: BulkEmailData;
  onBack: () => void;
}

interface Site {
  id: string;
  name: string;
  customer_id: string | null;
  address: string | null;
  city: string | null;
  postcode: string | null;
}

interface Customer {
  id: string;
  name: string;
}

const VISIT_TYPES = [
  { value: "quarterly_service", label: "Quarterly Service" },
  { value: "biannual_service", label: "6-Monthly Service" },
  { value: "annual_inspection", label: "Annual Inspection" },
  { value: "emergency", label: "Emergency Callout" },
  { value: "remedial", label: "Remedial Work" },
  { value: "supply_only", label: "Supply Only" },
];

interface VisitRow extends BulkVisit {
  selected: boolean;
  matched_site_id: string;
  create_new_site: boolean;
}

export const EmailScannerBulkVisitFlow = ({ data, onBack }: Props) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [matchedCustomerId, setMatchedCustomerId] = useState("");
  const [createNewCustomer, setCreateNewCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState(data.company_name || "");
  const [newCustomerEmail, setNewCustomerEmail] = useState(data.contact_email || "");
  const [newCustomerPhone, setNewCustomerPhone] = useState(data.contact_phone || "");
  const [newCustomerContact, setNewCustomerContact] = useState(data.contact_name || "");

  const [visitRows, setVisitRows] = useState<VisitRow[]>(() =>
    data.visits.map((v) => ({
      ...v,
      visit_type: v.visit_type || "remedial",
      selected: true,
      matched_site_id: "",
      create_new_site: false,
    }))
  );

  useEffect(() => {
    const fetchData = async () => {
      const [{ data: cust }, { data: sit }] = await Promise.all([
        supabase.from("customers").select("id, name").eq("status", "active").order("name"),
        supabase.from("sites").select("id, name, customer_id, address, city, postcode").eq("status", "active").order("name"),
      ]);

      if (cust) {
        setCustomers(cust);
        if (data.company_name) {
          const match = cust.find(
            (c) =>
              c.name.toLowerCase() === data.company_name!.toLowerCase() ||
              c.name.toLowerCase().includes(data.company_name!.toLowerCase()) ||
              data.company_name!.toLowerCase().includes(c.name.toLowerCase())
          );
          if (match) {
            setMatchedCustomerId(match.id);
          } else {
            setCreateNewCustomer(true);
          }
        }
      }

      if (sit) {
        setSites(sit);
        // Try to match sites for each visit row
        setVisitRows((prev) =>
          prev.map((row) => {
            const siteMatch = sit.find((s) => {
              const nameMatch = row.site_name && s.name.toLowerCase().includes(row.site_name.toLowerCase());
              const postcodeMatch =
                row.site_postcode &&
                s.postcode?.toLowerCase().replace(/\s/g, "") === row.site_postcode.toLowerCase().replace(/\s/g, "");
              return nameMatch || postcodeMatch;
            });
            return {
              ...row,
              matched_site_id: siteMatch?.id || "",
              create_new_site: !siteMatch && !!(row.site_name || row.site_address),
            };
          })
        );
      }
    };
    fetchData();
  }, [data.company_name]);

  const updateRow = (index: number, updates: Partial<VisitRow>) => {
    setVisitRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...updates } : r)));
  };

  const removeRow = (index: number) => {
    setVisitRows((prev) => prev.filter((_, i) => i !== index));
  };

  const selectedCount = visitRows.filter((r) => r.selected).length;

  const filteredSites = matchedCustomerId ? sites.filter((s) => s.customer_id === matchedCustomerId) : sites;

  const handleBulkSave = async () => {
    const selected = visitRows.filter((r) => r.selected);
    if (selected.length === 0) {
      toast({ title: "No visits selected", variant: "destructive" });
      return;
    }

    const missingDates = selected.filter((r) => !r.visit_date);
    if (missingDates.length > 0) {
      toast({ title: "Missing dates", description: "All selected visits need a date.", variant: "destructive" });
      return;
    }

    const missingSites = selected.filter((r) => !r.matched_site_id && !r.create_new_site);
    if (missingSites.length > 0) {
      toast({ title: "Missing sites", description: "All selected visits need a site.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) throw new Error("Not authenticated");

      let customerId = matchedCustomerId;
      let customerName = customers.find((c) => c.id === matchedCustomerId)?.name || newCustomerName;

      // Create customer if needed
      if (createNewCustomer && newCustomerName) {
        const { data: newCust, error: custErr } = await supabase
          .from("customers")
          .insert({
            name: newCustomerName,
            contact_email: newCustomerEmail || null,
            contact_phone: newCustomerPhone || null,
            contact_name: newCustomerContact || null,
          })
          .select()
          .single();
        if (custErr) throw custErr;
        customerId = newCust.id;
        customerName = newCustomerName;
      }

      let createdCount = 0;
      const siteCache: Record<string, string> = {}; // site_name -> site_id for dedup

      for (const row of selected) {
        let siteId = row.matched_site_id;
        let siteName = sites.find((s) => s.id === siteId)?.name || row.site_name || "";

        // Create new site if needed
        if (row.create_new_site && row.site_name) {
          // Check cache first to avoid creating the same site twice
          const cacheKey = `${row.site_name}_${row.site_postcode || ""}`.toLowerCase();
          if (siteCache[cacheKey]) {
            siteId = siteCache[cacheKey];
          } else {
            const spSiteName = row.site_address ? `${row.site_name} (${row.site_address})` : row.site_name;
            const spFolderPath = customerName ? `Customers/${customerName}/${spSiteName}` : `Customers/${spSiteName}`;

            const { data: newSite, error: siteErr } = await supabase
              .from("sites")
              .insert({
                name: row.site_name,
                address: row.site_address || null,
                city: row.site_city || null,
                postcode: row.site_postcode || null,
                customer_id: customerId || null,
                sharepoint_folder: spFolderPath,
                status: "active",
              })
              .select()
              .single();
            if (siteErr) throw siteErr;
            siteId = newSite.id;
            siteName = row.site_name;
            siteCache[cacheKey] = newSite.id;

            // SharePoint folder
            try {
              const { data: spData } = await supabase.functions.invoke("sharepoint-create-folder", {
                body: { folderPath: spFolderPath, entityType: "site", entityId: newSite.id },
              });
              if (spData?.webUrl) {
                await supabase.from("sites").update({ sharepoint_url: spData.webUrl }).eq("id", newSite.id);
              }
            } catch (spErr) {
              console.warn("SharePoint folder creation skipped:", spErr);
            }
          }
        }

        if (!siteId) continue;

        const notesData: Record<string, unknown> = { asset_type: "general" };
        const fullDescription = [row.description, row.notes].filter(Boolean).join("\n\n").trim();
        if (fullDescription) notesData.user_notes = fullDescription;

        const { data: visit, error: visitErr } = await supabase
          .from("visits")
          .insert({
            site_id: siteId,
            visit_date: row.visit_date!,
            visit_type: row.visit_type || "remedial",
            notes: JSON.stringify(notesData),
            status: "in_progress",
          })
          .select()
          .single();
        if (visitErr) throw visitErr;

        // Create appointment
        try {
          const typeLabel = VISIT_TYPES.find((t) => t.value === row.visit_type)?.label || row.visit_type || "Visit";
          const newAppointment = await createAppointment(
            {
              visit_id: visit.id,
              site_id: siteId,
              customer_id: customerId || null,
              engineer_id: userData.user.id,
              title: `${typeLabel} - ${siteName}`,
              description: fullDescription || null,
              appointment_date: row.visit_date!,
              start_time: "09:00:00",
              end_time: "17:00:00",
              status: "scheduled",
              visit_type: row.visit_type || "remedial",
            },
            userData.user.id
          );
          sendAppointmentCreatedNotification(newAppointment.id).catch(console.error);
        } catch (aptErr) {
          console.warn("Appointment creation skipped:", aptErr);
        }

        createdCount++;
      }

      toast({ title: `${createdCount} visits created`, description: "All visits and appointments have been scheduled." });
      navigate("/dashboard/visits");
    } catch (err: any) {
      console.error("Bulk save error:", err);
      toast({ title: "Error", description: err.message || "Failed to create visits", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} className="gap-2">
        <ArrowLeft className="w-4 h-4" /> Back to Scanner
      </Button>

      {/* Customer section */}
      <Card>
        <CardHeader>
          <CardTitle>Customer</CardTitle>
          <CardDescription>All visits will be linked to this customer</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Customer</Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCreateNewCustomer(!createNewCustomer);
                setMatchedCustomerId("");
              }}
            >
              {createNewCustomer ? "Select Existing" : "+ New Customer"}
            </Button>
          </div>
          {createNewCustomer ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 border rounded-lg bg-muted/30">
              <Input placeholder="Company name" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} />
              <Input placeholder="Contact name" value={newCustomerContact} onChange={(e) => setNewCustomerContact(e.target.value)} />
              <Input placeholder="Email" value={newCustomerEmail} onChange={(e) => setNewCustomerEmail(e.target.value)} />
              <Input placeholder="Phone" value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} />
            </div>
          ) : (
            <Select value={matchedCustomerId} onValueChange={setMatchedCustomerId}>
              <SelectTrigger>
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {matchedCustomerId && !createNewCustomer && (
            <Badge variant="secondary" className="text-xs">
              ✓ Matched: {customers.find((c) => c.id === matchedCustomerId)?.name}
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Visits table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Visits ({selectedCount} selected)</span>
            <Badge variant="secondary">{visitRows.length} extracted</Badge>
          </CardTitle>
          <CardDescription>Review, edit or remove visits before creating them</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {visitRows.map((row, index) => (
              <div
                key={index}
                className={`border rounded-lg p-4 space-y-3 transition-opacity ${
                  !row.selected ? "opacity-50 bg-muted/20" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={row.selected}
                      onCheckedChange={(checked) => updateRow(index, { selected: !!checked })}
                    />
                    <span className="font-medium text-sm">Visit {index + 1}</span>
                    {row.matched_site_id && (
                      <Badge variant="secondary" className="text-xs">
                        ✓ Site matched
                      </Badge>
                    )}
                    {row.create_new_site && (
                      <Badge variant="outline" className="text-xs">
                        + New site
                      </Badge>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => removeRow(index)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  {/* Site */}
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> Site
                    </Label>
                    {row.create_new_site ? (
                      <Input
                        value={row.site_name || ""}
                        onChange={(e) => updateRow(index, { site_name: e.target.value })}
                        placeholder="Site name"
                        className="text-sm"
                      />
                    ) : (
                      <Select
                        value={row.matched_site_id}
                        onValueChange={(val) => updateRow(index, { matched_site_id: val, create_new_site: false })}
                      >
                        <SelectTrigger className="text-sm">
                          <SelectValue placeholder="Select site" />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredSites.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Button
                      variant="link"
                      size="sm"
                      className="p-0 h-auto text-xs"
                      onClick={() =>
                        updateRow(index, {
                          create_new_site: !row.create_new_site,
                          matched_site_id: "",
                        })
                      }
                    >
                      {row.create_new_site ? "Select existing" : "+ New site"}
                    </Button>
                  </div>

                  {/* Date */}
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> Date
                    </Label>
                    <Input
                      type="date"
                      value={row.visit_date || ""}
                      onChange={(e) => updateRow(index, { visit_date: e.target.value })}
                      className="text-sm"
                    />
                  </div>

                  {/* Type */}
                  <div className="space-y-1">
                    <Label className="text-xs">Type</Label>
                    <Select
                      value={row.visit_type || "remedial"}
                      onValueChange={(val) => updateRow(index, { visit_type: val })}
                    >
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VISIT_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Description */}
                  <div className="space-y-1">
                    <Label className="text-xs">Description</Label>
                    <Input
                      value={row.description || ""}
                      onChange={(e) => updateRow(index, { description: e.target.value })}
                      placeholder="Work description"
                      className="text-sm"
                    />
                  </div>
                </div>

                {/* New site address fields */}
                {row.create_new_site && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pl-8">
                    <Input
                      value={row.site_address || ""}
                      onChange={(e) => updateRow(index, { site_address: e.target.value })}
                      placeholder="Address"
                      className="text-sm"
                    />
                    <Input
                      value={row.site_city || ""}
                      onChange={(e) => updateRow(index, { site_city: e.target.value })}
                      placeholder="City"
                      className="text-sm"
                    />
                    <Input
                      value={row.site_postcode || ""}
                      onChange={(e) => updateRow(index, { site_postcode: e.target.value })}
                      placeholder="Postcode"
                      className="text-sm"
                    />
                  </div>
                )}
              </div>
            ))}

            {visitRows.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">No visits extracted from the email.</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onBack}>
          Cancel
        </Button>
        <Button variant="hero" onClick={handleBulkSave} disabled={saving || selectedCount === 0}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Create {selectedCount} Visit{selectedCount !== 1 ? "s" : ""}
        </Button>
      </div>
    </div>
  );
};
