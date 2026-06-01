import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import {
  generateWorkReportPDF,
  type WorkReportData,
} from "@/lib/pdfGenerator";
import { sendJobCompletedNotification } from "@/services/notificationService";
import { createAppointment } from "@/services/appointmentService";
import type { WorkReportDraft } from "./useWorkReportDraft";
import { JOB_TYPES } from "./steps/JobStep";

export interface CompleteSiteInfo {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  postcode: string | null;
  contact_name: string | null;
  contact_phone: string | null;
}

export interface CompleteCustomerInfo {
  id: string;
  name: string;
  xero_contact_id: string | null;
}

interface CompleteVisitInfo {
  id: string;
  site_id: string;
  visit_date: string;
  visit_type: string;
}

export interface CompleteSideEffectsResult {
  /** True if the customer is hooked up to Xero, so the wizard should
      offer the invoice prompt next. */
  shouldOfferInvoice: boolean;
  /** Folder path SharePoint actually used, if creation succeeded. */
  sharepointFolder: string | null;
}

function deriveFinishTime(start: string, durationHours: string): string {
  const [sh, sm] = start.split(":").map(Number);
  const dur = Number(durationHours);
  if (Number.isNaN(sh) || Number.isNaN(sm) || !Number.isFinite(dur) || dur <= 0) return "";
  const total = sh * 60 + sm + Math.round(dur * 60);
  const h = Math.floor((total % (24 * 60)) / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function draftToPdfData(d: WorkReportDraft): WorkReportData {
  const workDays = d.work_days.filter((w) => w.date || w.startTime || w.finishTime);
  const totalHours = workDays
    .reduce((sum, day) => sum + (parseFloat(day.duration) || 0), 0)
    .toFixed(2);
  const first = workDays[0];
  return {
    certificateNo: d.report_number,
    jobNumber: d.job_number,
    jobType: d.job_type,
    appointmentDate: d.appointment_date ?? undefined,
    systemStatusArrival: d.system_status_arrival,
    systemStatusDeparture: d.system_status_departure,
    workCompleted: d.work_completed,
    reportStatus: d.status,
    returnRequired: d.return_required,
    surveyRequired: d.survey_required,
    quotationRequired: d.quotation_required,
    ramsCompleted: d.rams_completed,
    logBookEntry: d.log_book_entry,
    worksReport: d.works_report,
    furtherAction: d.further_action,
    numEngineers: d.num_engineers,
    workDays,
    totalHours,
    startTime: first?.startTime ?? "",
    finishTime:
      first?.finishTime ||
      (first?.startTime && first?.duration ? deriveFinishTime(first.startTime, first.duration) : ""),
    travelTime: d.travel_time,
    duration: first?.duration ?? "",
    materials: d.materials.filter((m) => m.name.trim()),
    photos: d.photos,
    reportFiles: d.report_files,
    engineerName: d.engineer_name,
    engineerSignature: d.engineer_signature,
    engineerSignDate: d.engineer_sign_date ?? undefined,
    engineerSignTime: d.engineer_sign_time,
    customerNotPresent: d.customer_not_present,
    customerName: d.client_name,
    customerSignature: d.customer_signature,
    customerSignDate: d.customer_sign_date ?? undefined,
    customerSignTime: d.customer_sign_time,
    reportDate: d.report_date,
    panelInfo: d.panel_info,
    locationInfo: d.location_info,
    typeInfo: d.type_info,
    zonesInfo: d.zones_info,
    contactPhone: d.contact_phone,
    contactPerson: d.contact_person,
    contactEmail: d.contact_email,
  };
}

async function syncToSharePoint(
  draft: WorkReportDraft,
  site: CompleteSiteInfo,
  visit: CompleteVisitInfo,
): Promise<string | null> {
  try {
    let folderPath: string | null = draft.sharepoint_folder;
    if (!folderPath) {
      const visitDateStr = format(new Date(visit.visit_date), "yyyy-MM-dd");
      const reportNum = draft.report_number || `JOB-${draft.id.substring(0, 6)}`;
      const reportFolder = `${reportNum}_${visitDateStr}`;

      const { data: spData, error: spError } = await supabase.functions.invoke(
        "sharepoint-create-folder",
        {
          body: {
            siteId: site.id,
            subPath: `Reports/${reportFolder}`,
            entityType: "report",
            entityId: draft.id,
          },
        },
      );
      if (!spError && spData?.success) {
        folderPath = spData.folderPath as string;
        await supabase
          .from("service_reports")
          .update({
            sharepoint_folder: folderPath,
            sharepoint_url: (spData.webUrl as string | null) || null,
          })
          .eq("id", draft.id);
      }
    }

    if (!folderPath) return null;

    const pdfBase64 = (await generateWorkReportPDF(
      draftToPdfData(draft),
      {
        name: site.name,
        address: site.address,
        city: site.city,
        postcode: site.postcode,
        contact_name: site.contact_name,
        contact_phone: site.contact_phone,
      },
      draft.report_date,
      undefined,
      true,
    )) as string | undefined;

    if (pdfBase64) {
      const visitDateStr = format(new Date(visit.visit_date), "yyyy-MM-dd");
      const pdfFileName = `${draft.report_number || draft.job_number || "Report"}_${visitDateStr}.pdf`;
      await supabase.functions.invoke("upload-to-sharepoint", {
        body: {
          folderPath,
          fileName: pdfFileName,
          fileBase64: pdfBase64,
          contentType: "application/pdf",
        },
      });
    }
    return folderPath;
  } catch (err) {
    console.log("SharePoint sync skipped:", err);
    return null;
  }
}

async function upsertAppointment(
  draft: WorkReportDraft,
  site: CompleteSiteInfo,
  customer: CompleteCustomerInfo | null,
  visit: CompleteVisitInfo,
  userId: string,
): Promise<void> {
  if (!draft.appointment_date) return;
  try {
    const appointmentDateStr = format(new Date(draft.appointment_date), "yyyy-MM-dd");
    const appointmentTime = draft.work_days[0]?.startTime || "09:00";
    const jobLabel = JOB_TYPES.find((j) => j.value === draft.job_type)?.label || "Job";
    const title = `${jobLabel} - ${site.name}`;

    const { data: existing } = await supabase
      .from("appointments")
      .select("id")
      .eq("visit_id", visit.id)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("appointments")
        .update({
          appointment_date: appointmentDateStr,
          start_time: appointmentTime,
          title,
          status: "completed",
        })
        .eq("id", existing.id);
    } else {
      await createAppointment(
        {
          site_id: visit.site_id,
          visit_id: visit.id,
          customer_id: customer?.id ?? null,
          title,
          description: draft.works_report || draft.further_action || null,
          appointment_date: appointmentDateStr,
          start_time: appointmentTime,
          visit_type: draft.job_type || visit.visit_type,
          status: "scheduled",
        },
        userId,
      );
    }
  } catch (err) {
    console.log("Appointment upsert skipped:", err);
  }
}

/**
 * Run all the post-complete side effects the legacy WorkReportDialog
 * used to fire on its "Complete + Lock" button. Best-effort: every
 * step is wrapped so a single failure (e.g. SharePoint timeout) won't
 * block the others. Errors are logged, never rethrown.
 */
export async function runCompleteSideEffects(
  draft: WorkReportDraft,
  site: CompleteSiteInfo,
  customer: CompleteCustomerInfo | null,
  visit: CompleteVisitInfo,
  userId: string,
): Promise<CompleteSideEffectsResult> {
  await upsertAppointment(draft, site, customer, visit, userId);
  const sharepointFolder = await syncToSharePoint(draft, site, visit);
  sendJobCompletedNotification(visit.id).catch((e) =>
    console.error("sendJobCompletedNotification:", e),
  );
  return {
    shouldOfferInvoice: !!customer?.xero_contact_id,
    sharepointFolder,
  };
}
