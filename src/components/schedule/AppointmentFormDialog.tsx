import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { CalendarIcon, Loader2, Trash2, Plus, FolderOpen, Cloud, ChevronDown, ChevronRight, Building2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Appointment,
  AppointmentInput,
  createAppointment,
  updateAppointment,
  deleteAppointment,
  fetchEngineers,
  APPOINTMENT_STATUS_LABELS,
  syncAppointmentToOutlook,
} from "@/services/appointmentService";
import { 
  sendAppointmentCreatedNotification, 
  sendAppointmentUpdatedNotification 
} from "@/services/notificationService";
import { useAuth } from "@/contexts/AuthContext";
import { VISIT_TYPES } from "@/constants/visitTypes";
import { CustomerFormDialog } from "@/components/customers/CustomerFormDialog";
import SiteFormDialog from "@/components/sites/SiteFormDialog";
import { Badge } from "@/components/ui/badge";

interface AppointmentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment?: Appointment | null;
  defaultDate?: Date;
  onSuccess: () => void;
}

export function AppointmentFormDialog({
  open,
  onOpenChange,
  appointment,
  defaultDate,
  onSuccess,
}: AppointmentFormDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Inline creation dialogs
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [showNewSite, setShowNewSite] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [siteId, setSiteId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [engineerId, setEngineerId] = useState("");
  const [appointmentDate, setAppointmentDate] = useState<Date | undefined>(defaultDate);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [status, setStatus] = useState<string>("scheduled");
  const [visitType, setVisitType] = useState("");

  // Inline customer/site detail editing
  const [customerDetailsOpen, setCustomerDetailsOpen] = useState(false);
  const [siteDetailsOpen, setSiteDetailsOpen] = useState(false);
  const [customerDetails, setCustomerDetails] = useState({
    contact_name: "", contact_email: "", contact_phone: "", address: "", city: "", postcode: "",
  });
  const [siteDetails, setSiteDetails] = useState({
    address: "", city: "", postcode: "",
  });

  // Data for selects
  const [sites, setSites] = useState<{ id: string; name: string; customer_id: string | null; address: string | null; city: string | null; postcode: string | null }[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string; contact_name: string | null; contact_email: string | null; contact_phone: string | null; address: string | null; city: string | null; postcode: string | null }[]>([]);
  const [engineers, setEngineers] = useState<{ id: string; full_name: string | null; email: string | null }[]>([]);

  const isEditing = !!appointment;

  // Filter sites by selected customer
  const filteredSites = customerId
    ? sites.filter((s) => s.customer_id === customerId)
    : sites;

  useEffect(() => {
    if (open) {
      loadFormData();
      if (appointment) {
        populateForm(appointment);
      } else {
        resetForm();
      }
    }
  }, [open, appointment]);

  const loadFormData = async () => {
    try {
      const [sitesRes, customersRes, engineersRes] = await Promise.all([
        supabase.from('sites').select('id, name, customer_id, address, city, postcode').order('name'),
        supabase.from('customers').select('id, name, contact_name, contact_email, contact_phone, address, city, postcode').order('name'),
        fetchEngineers(),
      ]);

      if (sitesRes.data) setSites(sitesRes.data);
      if (customersRes.data) setCustomers(customersRes.data);
      setEngineers(engineersRes);
    } catch (err) {
      console.error('Error loading form data:', err);
    }
  };

  const populateForm = (apt: Appointment) => {
    setTitle(apt.title);
    setDescription(apt.description || "");
    setSiteId(apt.site_id);
    setCustomerId(apt.customer_id || "");
    setEngineerId(apt.engineer_id || "");
    setAppointmentDate(new Date(apt.appointment_date));
    setStartTime(apt.start_time.substring(0, 5));
    setEndTime(apt.end_time?.substring(0, 5) || "");
    setStatus(apt.status);
    setVisitType(apt.visit_type || "");
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setSiteId("");
    setCustomerId("");
    setEngineerId("");
    setAppointmentDate(defaultDate || new Date());
    setStartTime("09:00");
    setEndTime("10:00");
    setStatus("scheduled");
    setVisitType("");
  };

  // Auto-fill customer when site is selected
  useEffect(() => {
    if (siteId && sites.length > 0) {
      const site = sites.find((s) => s.id === siteId);
      if (site?.customer_id) {
        setCustomerId(site.customer_id);
      }
      // Populate site details
      setSiteDetails({
        address: site?.address || "",
        city: site?.city || "",
        postcode: site?.postcode || "",
      });
    }
  }, [siteId, sites]);

  // Populate customer details when customer changes
  useEffect(() => {
    if (customerId && customers.length > 0) {
      const cust = customers.find((c) => c.id === customerId);
      if (cust) {
        setCustomerDetails({
          contact_name: cust.contact_name || "",
          contact_email: cust.contact_email || "",
          contact_phone: cust.contact_phone || "",
          address: cust.address || "",
          city: cust.city || "",
          postcode: cust.postcode || "",
        });
      }
    }
  }, [customerId, customers]);

  // Auto-generate title from visit type and site
  useEffect(() => {
    if (!isEditing && visitType && siteId) {
      const site = sites.find((s) => s.id === siteId);
      const typeLabel = VISIT_TYPES.find((vt) => vt.value === visitType)?.label || visitType;
      if (site) {
        setTitle(`${typeLabel} - ${site.name}`);
      }
    }
  }, [visitType, siteId, sites, isEditing]);

  const createSharePointFolder = async (visitId: string, siteName: string, customerName: string) => {
    try {
      const dateStr = appointmentDate ? format(appointmentDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
      const shortId = visitId.substring(0, 8);
      const vType = visitType || 'general';
      const folderPath = `Customers/${customerName}/${siteName}/Reports/${vType}_${dateStr}_${shortId}`;

      await supabase.functions.invoke('sharepoint-create-folder', {
        body: { folderPath, entityType: 'folder_only', entityId: visitId },
      });

      // Create subfolders
      await Promise.all([
        supabase.functions.invoke('sharepoint-create-folder', { body: { folderPath: `${folderPath}/Photos`, entityType: 'folder_only', entityId: visitId } }),
        supabase.functions.invoke('sharepoint-create-folder', { body: { folderPath: `${folderPath}/Documents`, entityType: 'folder_only', entityId: visitId } }),
      ]);

      toast({ title: "SharePoint folder created", description: folderPath });
    } catch (err) {
      console.error('SharePoint folder creation failed:', err);
      // Non-blocking - don't fail the appointment creation
    }
  };

  const handleSubmit = async () => {
    if (!appointmentDate || !siteId || !title || !startTime) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    if (!user?.id) {
      toast({
        title: "Not authenticated",
        description: "Please log in to create appointments.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Save any inline customer/site detail changes
      if (customerId) {
        const cust = customers.find(c => c.id === customerId);
        const hasChanges = cust && (
          customerDetails.contact_name !== (cust.contact_name || "") ||
          customerDetails.contact_email !== (cust.contact_email || "") ||
          customerDetails.contact_phone !== (cust.contact_phone || "") ||
          customerDetails.address !== (cust.address || "") ||
          customerDetails.city !== (cust.city || "") ||
          customerDetails.postcode !== (cust.postcode || "")
        );
        if (hasChanges) {
          await supabase.from('customers').update({
            contact_name: customerDetails.contact_name || null,
            contact_email: customerDetails.contact_email || null,
            contact_phone: customerDetails.contact_phone || null,
            address: customerDetails.address || null,
            city: customerDetails.city || null,
            postcode: customerDetails.postcode || null,
          }).eq('id', customerId);
        }
      }
      if (siteId) {
        const site = sites.find(s => s.id === siteId);
        const hasChanges = site && (
          siteDetails.address !== (site.address || "") ||
          siteDetails.city !== (site.city || "") ||
          siteDetails.postcode !== (site.postcode || "")
        );
        if (hasChanges) {
          await supabase.from('sites').update({
            address: siteDetails.address || null,
            city: siteDetails.city || null,
            postcode: siteDetails.postcode || null,
          }).eq('id', siteId);
        }
      }

      const input: AppointmentInput = {
        title,
        description: description || null,
        site_id: siteId,
        customer_id: customerId || null,
        engineer_id: engineerId || null,
        appointment_date: format(appointmentDate, 'yyyy-MM-dd'),
        start_time: startTime + ':00',
        end_time: endTime ? endTime + ':00' : null,
        status: status as AppointmentInput['status'],
        visit_type: visitType || null,
      };

      if (isEditing && appointment) {
        await updateAppointment(appointment.id, input);
        toast({ title: "Appointment updated" });
        sendAppointmentUpdatedNotification(appointment.id).catch(console.error);
      } else {
        const newAppointment = await createAppointment(input, user.id);
        toast({ title: "Job created successfully" });
        sendAppointmentCreatedNotification(newAppointment.id).catch(console.error);

        // Auto-create SharePoint folder for the new visit
        if (newAppointment.visit_id) {
          const site = sites.find((s) => s.id === siteId);
          const customer = customers.find((c) => c.id === customerId);
          if (site && customer) {
            createSharePointFolder(newAppointment.visit_id, site.name, customer.name);
          }
        }
      }

      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Error saving appointment:', err);
      toast({
        title: "Error",
        description: err.message || "Failed to save appointment.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!appointment) return;

    setDeleting(true);
    try {
      await deleteAppointment(appointment.id);
      toast({ title: "Appointment deleted" });
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Error deleting appointment:', err);
      toast({
        title: "Error",
        description: err.message || "Failed to delete appointment.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleCustomerCreated = () => {
    setShowNewCustomer(false);
    loadFormData();
    toast({ title: "Customer created", description: "You can now select the new customer." });
  };

  const handleSiteCreated = () => {
    setShowNewSite(false);
    loadFormData();
    toast({ title: "Site created", description: "You can now select the new site." });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit Job" : "New Job"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Customer with New button */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Customer *</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-primary"
                  onClick={() => setShowNewCustomer(true)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  New Customer
                </Button>
              </div>
              <Select value={customerId} onValueChange={(val) => {
                setCustomerId(val);
                // Reset site when customer changes
                setSiteId("");
              }}>
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

              {/* Inline Customer Details */}
              {customerId && (
                <Collapsible open={customerDetailsOpen} onOpenChange={setCustomerDetailsOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-start h-8 text-xs text-muted-foreground hover:text-foreground px-2">
                      {customerDetailsOpen ? <ChevronDown className="h-3 w-3 mr-1" /> : <ChevronRight className="h-3 w-3 mr-1" />}
                      <Building2 className="h-3 w-3 mr-1" />
                      Customer Details
                      {(!customerDetails.contact_name && !customerDetails.contact_email) && (
                        <span className="ml-1 text-destructive">• needs info</span>
                      )}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 pt-2 pl-2 border-l-2 border-primary/20 ml-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Contact Name</Label>
                      <Input
                        value={customerDetails.contact_name}
                        onChange={(e) => setCustomerDetails(prev => ({ ...prev, contact_name: e.target.value }))}
                        placeholder="Contact name"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Contact Email</Label>
                      <Input
                        value={customerDetails.contact_email}
                        onChange={(e) => setCustomerDetails(prev => ({ ...prev, contact_email: e.target.value }))}
                        placeholder="email@example.com"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Contact Phone</Label>
                      <Input
                        value={customerDetails.contact_phone}
                        onChange={(e) => setCustomerDetails(prev => ({ ...prev, contact_phone: e.target.value }))}
                        placeholder="Phone number"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Address</Label>
                      <Input
                        value={customerDetails.address}
                        onChange={(e) => setCustomerDetails(prev => ({ ...prev, address: e.target.value }))}
                        placeholder="Address"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">City</Label>
                        <Input
                          value={customerDetails.city}
                          onChange={(e) => setCustomerDetails(prev => ({ ...prev, city: e.target.value }))}
                          placeholder="City"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Postcode</Label>
                        <Input
                          value={customerDetails.postcode}
                          onChange={(e) => setCustomerDetails(prev => ({ ...prev, postcode: e.target.value }))}
                          placeholder="Postcode"
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>

            {/* Site with New button */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Site *</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-primary"
                  onClick={() => setShowNewSite(true)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  New Site
                </Button>
              </div>
              <Select value={siteId} onValueChange={setSiteId}>
                <SelectTrigger>
                  <SelectValue placeholder={customerId ? "Select site" : "Select customer first"} />
                </SelectTrigger>
                <SelectContent>
                  {filteredSites.length === 0 ? (
                    <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                      {customerId ? "No sites for this customer" : "Select a customer first"}
                    </div>
                  ) : (
                    filteredSites.map((site) => (
                      <SelectItem key={site.id} value={site.id}>
                        <div className="flex flex-col">
                          <span>{site.name}</span>
                          {site.address && (
                            <span className="text-xs text-muted-foreground">{site.address}</span>
                          )}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              {/* Inline Site Details */}
              {siteId && (
                <Collapsible open={siteDetailsOpen} onOpenChange={setSiteDetailsOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-start h-8 text-xs text-muted-foreground hover:text-foreground px-2">
                      {siteDetailsOpen ? <ChevronDown className="h-3 w-3 mr-1" /> : <ChevronRight className="h-3 w-3 mr-1" />}
                      <MapPin className="h-3 w-3 mr-1" />
                      Site Details
                      {!siteDetails.address && (
                        <span className="ml-1 text-destructive">• needs address</span>
                      )}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 pt-2 pl-2 border-l-2 border-primary/20 ml-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Address</Label>
                      <Input
                        value={siteDetails.address}
                        onChange={(e) => setSiteDetails(prev => ({ ...prev, address: e.target.value }))}
                        placeholder="Site address"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">City</Label>
                        <Input
                          value={siteDetails.city}
                          onChange={(e) => setSiteDetails(prev => ({ ...prev, city: e.target.value }))}
                          placeholder="City"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Postcode</Label>
                        <Input
                          value={siteDetails.postcode}
                          onChange={(e) => setSiteDetails(prev => ({ ...prev, postcode: e.target.value }))}
                          placeholder="Postcode"
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>

            {/* Visit Type */}
            <div className="space-y-2">
              <Label>Job Type *</Label>
              <Select value={visitType} onValueChange={setVisitType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select job type" />
                </SelectTrigger>
                <SelectContent>
                  {VISIT_TYPES.map((vt) => (
                    <SelectItem key={vt.value} value={vt.value}>
                      {vt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Title (auto-generated but editable) */}
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Auto-generated from job type + site"
              />
            </div>

            {/* Engineer */}
            <div className="space-y-2">
              <Label>Assigned Engineer</Label>
              <Select value={engineerId} onValueChange={setEngineerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select engineer" />
                </SelectTrigger>
                <SelectContent>
                  {engineers.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.full_name || e.email || 'Unknown'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date */}
            <div className="space-y-2">
              <Label>Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !appointmentDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {appointmentDate ? format(appointmentDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={appointmentDate}
                    onSelect={setAppointmentDate}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Time */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_time">Start Time *</Label>
                <Input
                  id="start_time"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_time">End Time</Label>
                <Input
                  id="end_time"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>

            {/* Status */}
            {isEditing && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(APPOINTMENT_STATUS_LABELS).map(([val, label]) => (
                      <SelectItem key={val} value={val}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Notes</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Job notes, access instructions, special requirements..."
                rows={3}
              />
            </div>

            {/* SharePoint indicator */}
            {!isEditing && visitType && siteId && customerId && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border">
                <FolderOpen className="h-4 w-4 text-primary" />
                <span className="text-sm text-muted-foreground">
                  SharePoint folder will be created automatically
                </span>
              </div>
            )}
          </div>

          <DialogFooter className="flex justify-between">
            {isEditing && (
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleting || loading}
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                  Delete
                </Button>
                <Button
                  variant="outline"
                  disabled={!engineerId}
                  title={!engineerId ? "Assign an engineer first" : "Push to engineer's Outlook calendar"}
                  onClick={async () => {
                    if (!appointment?.id || !engineerId) {
                      toast({ title: "No engineer assigned", description: "Please assign an engineer before syncing to Outlook.", variant: "destructive" });
                      return;
                    }
                    const result = await syncAppointmentToOutlook(appointment.id);
                    if (result.success) {
                      toast({ title: "Synced to Outlook", description: "Appointment pushed to engineer's Outlook calendar." });
                    } else {
                      toast({ title: "Sync Failed", description: result.error || "Could not sync to Outlook.", variant: "destructive" });
                    }
                  }}
                >
                  <Cloud className="h-4 w-4 mr-1" />
                  Sync to Outlook
                </Button>
              </div>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {isEditing ? "Update Job" : "Create Job"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inline Customer Creation */}
      <CustomerFormDialog
        open={showNewCustomer}
        onOpenChange={setShowNewCustomer}
        onSuccess={handleCustomerCreated}
      />

      {/* Inline Site Creation */}
      <SiteFormDialog
        open={showNewSite}
        onOpenChange={setShowNewSite}
        onSuccess={handleSiteCreated}
        onSiteCreated={handleSiteCreated}
        defaultCustomerId={customerId || undefined}
      />
    </>
  );
}
