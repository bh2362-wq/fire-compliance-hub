import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkReportDraft } from "../useWorkReportDraft";

export const JOB_TYPES = [
  { value: "service", label: "Service" },
  { value: "repair", label: "Repair" },
  { value: "installation", label: "Installation" },
  { value: "inspection", label: "Inspection" },
  { value: "commissioning", label: "Commissioning" },
  { value: "remedial", label: "Remedial" },
  { value: "callout", label: "Callout" },
  { value: "room_integrity", label: "Room Integrity" },
  { value: "gas_suppression", label: "Gas Suppression" },
];

export const SYSTEM_STATUS_OPTIONS = [
  { value: "operational", label: "Fully Operational" },
  { value: "fault", label: "Fault Present" },
  { value: "disabled", label: "Disabled" },
  { value: "silenced", label: "Silenced" },
  { value: "partial", label: "Partial Operation" },
];

interface Props {
  draft: WorkReportDraft;
  onPatch: (updates: Partial<WorkReportDraft>) => void;
  siteName: string;
  siteContactName: string | null;
  siteFullAddress: string;
}

export function JobStep({ draft, onPatch, siteName, siteContactName, siteFullAddress }: Props) {
  const locked = draft.is_locked;

  const reportDate = draft.report_date ? new Date(draft.report_date) : new Date();
  const appointmentDate = draft.appointment_date ? new Date(draft.appointment_date) : undefined;

  return (
    <div className="space-y-5">
      {/* Site info header */}
      <div className="bg-muted/50 rounded-lg p-4 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">Site Name</Label>
            <p className="font-medium">{siteName || "-"}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Site Contact</Label>
            <p className="font-medium">{siteContactName || "-"}</p>
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Site Address</Label>
          <p className="font-medium">{siteFullAddress || "-"}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Job Number</Label>
          <Input
            value={draft.report_number}
            readOnly
            className="bg-muted/50 font-mono"
            placeholder="Auto-generated on complete"
          />
        </div>
        <div className="space-y-2">
          <Label>PO / Reference</Label>
          <Input
            value={draft.job_number}
            onChange={(e) => onPatch({ job_number: e.target.value })}
            placeholder="Optional reference"
            disabled={locked}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Job Type</Label>
          <Select
            value={draft.job_type}
            onValueChange={(v) => onPatch({ job_type: v })}
            disabled={locked}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select job type" />
            </SelectTrigger>
            <SelectContent>
              {JOB_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Report Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal" disabled={locked}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(reportDate, "PPP")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={reportDate}
                onSelect={(d) => d && onPatch({ report_date: format(d, "yyyy-MM-dd") })}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label>Appointment Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn("w-full justify-start text-left font-normal", !appointmentDate && "text-muted-foreground")}
                disabled={locked}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {appointmentDate ? format(appointmentDate, "PPP") : "Select date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={appointmentDate}
                onSelect={(d) => onPatch({ appointment_date: d ? d.toISOString() : null })}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* System info */}
      <div className="border rounded-lg p-4 space-y-4">
        <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          System Information (Optional)
        </Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">Panel</Label>
            <Input
              value={draft.panel_info}
              onChange={(e) => onPatch({ panel_info: e.target.value })}
              placeholder="e.g. Morley IAS"
              disabled={locked}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Location</Label>
            <Input
              value={draft.location_info}
              onChange={(e) => onPatch({ location_info: e.target.value })}
              placeholder="e.g. Ground Floor Reception"
              disabled={locked}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Type</Label>
            <Input
              value={draft.type_info}
              onChange={(e) => onPatch({ type_info: e.target.value })}
              placeholder="e.g. Addressable"
              disabled={locked}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Zones</Label>
            <Input
              value={draft.zones_info}
              onChange={(e) => onPatch({ zones_info: e.target.value })}
              placeholder="e.g. 8"
              disabled={locked}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Contact Person</Label>
            <Input
              value={draft.contact_person}
              onChange={(e) => onPatch({ contact_person: e.target.value })}
              placeholder="e.g. John Smith"
              disabled={locked}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Contact Phone</Label>
            <Input
              type="tel"
              value={draft.contact_phone}
              onChange={(e) => onPatch({ contact_phone: e.target.value })}
              placeholder="e.g. 0123 456 7890"
              disabled={locked}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label className="text-xs">Contact Email</Label>
            <Input
              type="email"
              value={draft.contact_email}
              onChange={(e) => onPatch({ contact_email: e.target.value })}
              placeholder="e.g. contact@example.com"
              disabled={locked}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>System Status on Arrival</Label>
          <Select
            value={draft.system_status_arrival}
            onValueChange={(v) => onPatch({ system_status_arrival: v })}
            disabled={locked}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              {SYSTEM_STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>System Status on Departure</Label>
          <Select
            value={draft.system_status_departure}
            onValueChange={(v) => onPatch({ system_status_departure: v })}
            disabled={locked}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              {SYSTEM_STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Flag checkboxes */}
      <div className="border rounded-lg p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            { id: "workCompleted",     label: "Work Completed",     key: "work_completed" as const },
            { id: "returnRequired",    label: "Return Required",    key: "return_required" as const },
            { id: "surveyRequired",    label: "Survey Required",    key: "survey_required" as const },
            { id: "quotationRequired", label: "Quotation Required", key: "quotation_required" as const },
            { id: "ramsCompleted",     label: "RAMS Completed",     key: "rams_completed" as const },
            { id: "logBookEntry",      label: "Log Book Entry",     key: "log_book_entry" as const },
          ].map((c) => (
            <div key={c.id} className="flex items-center space-x-2">
              <Checkbox
                id={c.id}
                checked={draft[c.key]}
                onCheckedChange={(v) => onPatch({ [c.key]: v === true } as Partial<WorkReportDraft>)}
                disabled={locked}
              />
              <Label htmlFor={c.id} className="text-sm cursor-pointer">{c.label}</Label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
