import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { CalendarIcon, Loader2, Trash2 } from "lucide-react";
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
} from "@/services/appointmentService";
import { 
  sendAppointmentCreatedNotification, 
  sendAppointmentUpdatedNotification 
} from "@/services/notificationService";
import { useAuth } from "@/contexts/AuthContext";

interface AppointmentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment?: Appointment | null;
  defaultDate?: Date;
  onSuccess: () => void;
}

const VISIT_TYPES = [
  { value: 'quarterly_service', label: 'Quarterly Service' },
  { value: 'biannual_service', label: 'Biannual Service' },
  { value: 'annual_inspection', label: 'Annual Inspection' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'remedial', label: 'Remedial' },
  { value: 'supply_only', label: 'Supply Only' },
];

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

  // Data for selects
  const [sites, setSites] = useState<{ id: string; name: string; customer_id: string | null }[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [engineers, setEngineers] = useState<{ id: string; full_name: string | null; email: string | null }[]>([]);

  const isEditing = !!appointment;

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
        supabase.from('sites').select('id, name, customer_id').order('name'),
        supabase.from('customers').select('id, name').order('name'),
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
      if (site?.customer_id && !customerId) {
        setCustomerId(site.customer_id);
      }
    }
  }, [siteId, sites]);

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
        // Send update notification email
        sendAppointmentUpdatedNotification(appointment.id).catch(console.error);
      } else {
        const newAppointment = await createAppointment(input, user.id);
        toast({ title: "Appointment created" });
        // Send confirmation email
        sendAppointmentCreatedNotification(newAppointment.id).catch(console.error);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Appointment" : "New Appointment"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Quarterly Service Visit"
            />
          </div>

          {/* Site */}
          <div className="space-y-2">
            <Label>Site *</Label>
            <Select value={siteId} onValueChange={setSiteId}>
              <SelectTrigger>
                <SelectValue placeholder="Select site" />
              </SelectTrigger>
              <SelectContent>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Customer */}
          <div className="space-y-2">
            <Label>Customer</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
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

          {/* Visit Type */}
          <div className="space-y-2">
            <Label>Visit Type</Label>
            <Select value={visitType} onValueChange={setVisitType}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
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

          {/* Status */}
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

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Notes</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional notes..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          {isEditing && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting || loading}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Delete
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {isEditing ? "Update" : "Create"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
