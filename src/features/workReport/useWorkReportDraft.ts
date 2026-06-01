import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import {
  getServiceReport,
  createServiceReport,
  updateServiceReport,
  assignReportNumber,
} from "@/services/serviceReportService";

export interface WorkDayEntry {
  date: string;
  startTime: string;
  finishTime: string;
  duration: string;
}

export interface MaterialEntry {
  name: string;
  qty: string;
  cost: string;
}

export interface PhotoEntry {
  url: string;
  caption: string;
}

export interface ReportFileEntry {
  url: string;
  name: string;
  size: number;
}

/**
 * Flat view of the Work Report shape used by the wizard steps. Mirrors
 * the columns + notes-JSON layout that `WorkReportDialog` writes so the
 * two surfaces stay interoperable while the wizard is being built out
 * across PRs 5a / 5b / 5c.
 *
 * The notes-JSON shape itself is `buildNotesData()` in the legacy
 * dialog (WorkReportDialog.tsx ~line 582) — kept in lockstep.
 */
export interface WorkReportDraft {
  id: string;

  // service_reports columns
  report_number: string;
  report_date: string; // ISO date (yyyy-MM-dd)
  engineer_name: string;
  client_name: string;
  works_report: string;
  further_action: string;
  status: "draft" | "completed" | "locked";
  is_locked: boolean;
  sharepoint_folder: string | null;

  // notes-JSON: Job tab
  job_number: string;
  job_type: string;
  work_completed: boolean;
  return_required: boolean;
  survey_required: boolean;
  quotation_required: boolean;
  rams_completed: boolean;
  log_book_entry: boolean;
  system_status_arrival: string;
  system_status_departure: string;
  appointment_date: string | null;
  panel_info: string;
  location_info: string;
  type_info: string;
  zones_info: string;
  contact_phone: string;
  contact_person: string;
  contact_email: string;

  // notes-JSON: Works tab
  num_engineers: number | "";
  travel_time: string;
  work_days: WorkDayEntry[];

  // notes-JSON: Materials tab (PR 5b)
  materials: MaterialEntry[];

  // notes-JSON: Photos tab (PR 5b)
  photos: PhotoEntry[];
  report_files: ReportFileEntry[];

  // notes-JSON: Sign tab
  engineer_signature: string;
  customer_signature: string;
  customer_not_present: boolean;
  engineer_sign_date: string | null;
  engineer_sign_time: string;
  customer_sign_date: string | null;
  customer_sign_time: string;
}

const JOB_TYPE_FROM_VISIT: Record<string, string> = {
  quarterly_service: "service",
  biannual_service: "service",
  annual_service: "service",
  emergency: "callout",
  remedial: "remedial",
  installation: "installation",
  commissioning: "commissioning",
  room_integrity: "room_integrity",
  gas_suppression: "gas_suppression",
};

export interface WorkReportVisit {
  id: string;
  site_id: string;
  visit_date: string;
  visit_type: string;
  job_number?: string | null;
  notes?: string | null;
}

interface SiteRow {
  contact_name: string | null;
  contact_email: string | null;
  customers?: { contact_email?: string | null } | null;
}

function emptyDraft(id: string, visit: WorkReportVisit, site?: SiteRow | null): WorkReportDraft {
  const mappedJobType = JOB_TYPE_FROM_VISIT[visit.visit_type] || visit.visit_type;
  const customerContactEmail = (site?.customers as { contact_email?: string | null } | null)?.contact_email ?? null;
  return {
    id,
    report_number: "",
    report_date: format(new Date(visit.visit_date), "yyyy-MM-dd"),
    engineer_name: "",
    client_name: "",
    works_report: "",
    further_action: "",
    status: "draft",
    is_locked: false,
    sharepoint_folder: null,
    job_number: visit.job_number ?? "",
    job_type: mappedJobType,
    work_completed: false,
    return_required: false,
    survey_required: false,
    quotation_required: false,
    rams_completed: false,
    log_book_entry: false,
    system_status_arrival: "",
    system_status_departure: "",
    appointment_date: null,
    panel_info: "",
    location_info: "",
    type_info: "",
    zones_info: "",
    contact_phone: "",
    contact_person: site?.contact_name ?? "",
    contact_email: site?.contact_email ?? customerContactEmail ?? "",
    num_engineers: 1,
    travel_time: "",
    work_days: [
      { date: format(new Date(visit.visit_date), "yyyy-MM-dd"), startTime: "", finishTime: "", duration: "" },
    ],
    materials: [{ name: "", qty: "", cost: "" }],
    photos: [],
    report_files: [],
    engineer_signature: "",
    customer_signature: "",
    customer_not_present: false,
    engineer_sign_date: null,
    engineer_sign_time: "",
    customer_sign_date: null,
    customer_sign_time: "",
  };
}

function hydrate(
  row: Record<string, unknown>,
  visit: WorkReportVisit,
  site?: SiteRow | null,
): WorkReportDraft {
  const base = emptyDraft(row.id as string, visit, site);

  base.report_number = (row.report_number as string | null) ?? "";
  base.report_date = (row.report_date as string | null) ?? base.report_date;
  base.engineer_name = (row.engineer_name as string | null) ?? "";
  base.client_name = (row.client_name as string | null) ?? "";
  base.works_report = (row.work_carried_out as string | null) ?? "";
  base.further_action = (row.recommendations as string | null) ?? "";
  base.status = ((row.status as string) ?? "draft") as WorkReportDraft["status"];
  base.is_locked = row.status === "completed" || row.status === "locked";
  base.sharepoint_folder = (row.sharepoint_folder as string | null) ?? null;

  // Pre-populate works report from visit notes if column was empty
  if (!base.works_report) {
    try {
      const visitNotes =
        typeof visit.notes === "string" ? JSON.parse(visit.notes || "{}") : visit.notes ?? {};
      base.works_report = (visitNotes?.user_notes as string) || "";
    } catch {
      /* ignore */
    }
  }

  try {
    const n = JSON.parse((row.notes as string) || "{}");
    base.job_number = n.jobNumber || base.job_number;
    base.job_type = n.jobType || base.job_type;
    base.work_completed = Boolean(n.workCompleted) || base.status === "completed";
    base.return_required = Boolean(n.returnRequired);
    base.survey_required = Boolean(n.surveyRequired);
    base.quotation_required = Boolean(n.quotationRequired);
    base.rams_completed = Boolean(n.ramsCompleted);
    base.log_book_entry = Boolean(n.logBookEntry);
    base.system_status_arrival = n.systemStatusArrival || "";
    base.system_status_departure = n.systemStatusDeparture || "";
    base.appointment_date = (n.appointmentDate as string | null) ?? null;
    base.panel_info = n.panelInfo || "";
    base.location_info = n.locationInfo || "";
    base.type_info = n.typeInfo || "";
    base.zones_info = n.zonesInfo || "";
    base.contact_phone = n.contactPhone || "";
    base.contact_person = n.contactPerson || base.contact_person;
    base.contact_email = n.contactEmail || base.contact_email;
    base.num_engineers = typeof n.numEngineers === "number" ? n.numEngineers : (n.numEngineers || 1);
    base.travel_time = n.travelTime || "";
    if (Array.isArray(n.workDays) && n.workDays.length > 0) {
      base.work_days = n.workDays as WorkDayEntry[];
    } else if (n.startTime || n.finishTime) {
      base.work_days = [
        {
          date: format(new Date(visit.visit_date), "yyyy-MM-dd"),
          startTime: n.startTime || "",
          finishTime: n.finishTime || "",
          duration: n.duration || "",
        },
      ];
    }
    if (Array.isArray(n.materials) && n.materials.length > 0) {
      base.materials = n.materials as MaterialEntry[];
    }
    if (Array.isArray(n.photos)) base.photos = n.photos as PhotoEntry[];
    if (Array.isArray(n.reportFiles)) base.report_files = n.reportFiles as ReportFileEntry[];
    base.engineer_signature = n.engineerSignature || "";
    base.customer_signature = n.customerSignature || "";
    base.customer_not_present = Boolean(n.customerNotPresent);
    base.engineer_sign_date = (n.engineerSignDate as string | null) ?? null;
    base.engineer_sign_time = n.engineerSignTime || "";
    base.customer_sign_date = (n.customerSignDate as string | null) ?? null;
    base.customer_sign_time = n.customerSignTime || "";
    if (n.reportDate) base.report_date = format(new Date(n.reportDate), "yyyy-MM-dd");
  } catch {
    /* notes not JSON — leave defaults */
  }

  return base;
}

function buildNotesJson(d: WorkReportDraft): string {
  const totalHours = d.work_days
    .reduce((sum, day) => sum + (parseFloat(day.duration) || 0), 0)
    .toFixed(2);
  return JSON.stringify({
    jobNumber: d.job_number,
    jobType: d.job_type,
    workCompleted: d.work_completed,
    returnRequired: d.return_required,
    surveyRequired: d.survey_required,
    quotationRequired: d.quotation_required,
    ramsCompleted: d.rams_completed,
    logBookEntry: d.log_book_entry,
    reportDate: d.report_date ? new Date(d.report_date).toISOString() : null,
    systemStatusArrival: d.system_status_arrival,
    systemStatusDeparture: d.system_status_departure,
    appointmentDate: d.appointment_date,
    panelInfo: d.panel_info,
    locationInfo: d.location_info,
    typeInfo: d.type_info,
    zonesInfo: d.zones_info,
    contactPhone: d.contact_phone,
    contactPerson: d.contact_person,
    contactEmail: d.contact_email,
    numEngineers: d.num_engineers,
    workDays: d.work_days.filter((w) => w.date || w.startTime || w.finishTime),
    totalHours,
    startTime: d.work_days[0]?.startTime ?? "",
    finishTime: d.work_days[0]?.finishTime ?? "",
    travelTime: d.travel_time,
    duration: d.work_days[0]?.duration ?? "",
    materials: d.materials.filter((m) => m.name.trim()),
    photos: d.photos,
    reportFiles: d.report_files,
    engineerSignature: d.engineer_signature,
    customerSignature: d.customer_signature,
    customerNotPresent: d.customer_not_present,
    engineerSignDate: d.engineer_sign_date,
    engineerSignTime: d.engineer_sign_time,
    customerSignDate: d.customer_sign_date,
    customerSignTime: d.customer_sign_time,
  });
}

/**
 * Fetch-or-create the Work Report row for this visit. Mirrors the
 * `useDisabledRefugeDraft` / `useASDDraft` shape — fetch row, hydrate
 * a flat draft, expose `patch()` that writes both columns and notes
 * JSON. After Phase 5 ships these three hooks fold into a generic
 * factory (Phase 6).
 */
export function useWorkReportDraft(visit: WorkReportVisit, userId: string) {
  const [draft, setDraft] = useState<WorkReportDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchOrCreate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: site } = await supabase
        .from("sites")
        .select("contact_name, contact_email, customers(contact_email)")
        .eq("id", visit.site_id)
        .maybeSingle();

      let row = (await getServiceReport(visit.id)) as Record<string, unknown> | null;
      if (!row) {
        const created = await createServiceReport(
          visit.id,
          visit.site_id,
          userId,
          { engineer_name: "" },
          "JOB",
          false,
        );
        row = created as unknown as Record<string, unknown>;
      }

      setDraft(hydrate(row, visit, site as SiteRow | null));
    } catch (e) {
      console.error("useWorkReportDraft fetch-or-create failed:", e);
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [visit, userId]);

  useEffect(() => {
    void fetchOrCreate();
  }, [fetchOrCreate]);

  const patch = useCallback(async (updates: Partial<WorkReportDraft>) => {
    let nextRef: WorkReportDraft | null = null;
    setDraft((prev) => {
      if (!prev) return prev;
      nextRef = { ...prev, ...updates };
      return nextRef;
    });
    if (!nextRef) return;
    setSaving(true);
    try {
      const n = nextRef as WorkReportDraft;
      await updateServiceReport(n.id, {
        engineer_name: n.engineer_name,
        client_name: n.client_name,
        report_number: n.report_number,
        report_date: n.report_date,
        work_carried_out: n.works_report,
        recommendations: n.further_action,
        notes: buildNotesJson(n),
      });
    } catch (e) {
      setError(e as Error);
    } finally {
      setSaving(false);
    }
  }, []);

  /**
   * Mark the report complete + lock it. Side effects:
   *   - assign a JOB-* report number if not yet assigned
   *   - update report row (status, notes, columns)
   *   - mark the parent visit as completed
   *
   * Heavier post-complete work (SharePoint folder + PDF upload,
   * notification email, calendar appointment, invoice prompt) lives in
   * the wizard so the hook stays UI-agnostic. Returns the final draft
   * with its assigned report_number so the wizard can chain those.
   */
  const complete = useCallback(async (visitId: string): Promise<WorkReportDraft | null> => {
    if (!draft) return null;
    setSaving(true);
    try {
      let finalNumber = draft.report_number;
      if (!finalNumber) {
        const newNumber = await assignReportNumber(draft.id, "JOB");
        if (newNumber) finalNumber = newNumber;
      }

      const completed: WorkReportDraft = {
        ...draft,
        work_completed: true,
        report_number: finalNumber,
        status: "completed",
        is_locked: true,
      };

      await updateServiceReport(completed.id, {
        engineer_name: completed.engineer_name,
        client_name: completed.client_name,
        report_number: completed.report_number || null,
        report_date: completed.report_date,
        work_carried_out: completed.works_report,
        recommendations: completed.further_action,
        notes: buildNotesJson(completed),
        status: "completed",
      });

      await supabase
        .from("service_visits")
        .update({ status: "completed" })
        .eq("id", visitId);

      setDraft(completed);
      return completed;
    } catch (e) {
      setError(e as Error);
      throw e;
    } finally {
      setSaving(false);
    }
  }, [draft]);

  return { draft, loading, saving, error, patch, complete, refetch: fetchOrCreate };
}
