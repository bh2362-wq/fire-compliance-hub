/**
 * nextServiceScheduler.ts
 *
 * Called when a BS5839 (or any) cert is completed and has a next_service_date.
 * Creates a scheduled visit + appointment in the CRM.
 * The next cert for that visit is auto-prefilled from the completed cert.
 */

import { supabase } from "@/integrations/supabase/client";
import { createAppointment } from "@/services/appointmentService";
import { format } from "date-fns";

interface ScheduleNextServiceInput {
  siteId:          string;
  customerId?:     string | null;
  certRef:         string;
  visitType:       string;       // e.g. "quarterly", "fire", "emergency_lighting"
  nextServiceDate: string;       // ISO date "YYYY-MM-DD"
  siteName:        string;
  engineerId?:     string | null;
  userId:          string;
}

export interface ScheduleResult {
  visitId:       string;
  appointmentId: string;
  alreadyExisted: boolean;
}

/**
 * In-flight idempotency guard.
 * Prevents duplicate appointments when handleGeneratePdf is invoked rapidly
 * (e.g. user double-clicks "Complete & PDF") before the DB row has been
 * committed and the duplicate-check below can see it.
 */
const inFlight = new Map<string, Promise<ScheduleResult | null>>();

function dedupeKey(siteId: string, visitType: string, date: string) {
  return `${siteId}::${visitType}::${date}`;
}

/**
 * Schedules the next service visit and appointment.
 * Skips creation if a visit of the same type already exists on that date,
 * or if an equivalent schedule call is already in flight in this tab.
 */
export async function scheduleNextServiceFromCert(
  input: ScheduleNextServiceInput
): Promise<ScheduleResult | null> {
  const {
    siteId, customerId, certRef, visitType, nextServiceDate,
    siteName, engineerId, userId,
  } = input;

  const key = dedupeKey(siteId, visitType, nextServiceDate);
  const pending = inFlight.get(key);
  if (pending) {
    const r = await pending;
    return r ? { ...r, alreadyExisted: true } : null;
  }

  const run = (async (): Promise<ScheduleResult | null> => {
    // ── Check for duplicate in DB ──────────────────────────────────────────
    const { data: existing } = await supabase
      .from("visits")
      .select("id")
      .eq("site_id",    siteId)
      .eq("visit_date", nextServiceDate)
      .eq("visit_type", visitType)
      .neq("status",    "cancelled")
      .maybeSingle();

    if (existing) {
      return { visitId: existing.id, appointmentId: "", alreadyExisted: true };
    }


  // ── Create appointment (which also creates the visit) ─────────────────────
  const label = format(new Date(nextServiceDate), "dd MMM yyyy");
  const title = `Fire Alarm Service — ${siteName}`;

  const appointment = await createAppointment(
    {
      site_id:          siteId,
      customer_id:      customerId ?? null,
      visit_id:         null,              // createAppointment creates this
      engineer_id:      engineerId ?? null,
      title,
      description:      `Next service scheduled from cert ${certRef}.\nDue: ${label}`,
      appointment_date: nextServiceDate,
      start_time:       "09:00",
      end_time:         "17:00",
      visit_type:       visitType,
      status:           "scheduled",
    },
    userId
  );

  return {
    visitId:       (appointment as any).visit_id ?? "",
    appointmentId: (appointment as any).id ?? "",
    alreadyExisted: false,
  };
}

/**
 * Loads all open defects for a site from the defects register.
 * Returns them in DefectEntry format so they can be pre-loaded onto a new cert.
 */
export async function loadOpenDefectsForSite(siteId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from("site_defects")
    .select("id, description, location, category, status, notes, raised_at")
    .eq("site_id", siteId)
    .in("status", ["open", "quoted", "pending"])
    .order("raised_at", { ascending: true });

  if (error || !data) return [];

  return data.map((d: any) => ({
    id:                Math.random().toString(36).slice(2, 10),
    _register_id:      d.id,
    location:          d.location || "",
    description:       d.description || "",
    severity:          categoryToSeverity(d.category),
    recommended_action: d.notes || "",
    bs_reference:      "",
    status:            "Open",
  }));
}

function categoryToSeverity(cat: number | null): string {
  if (cat === 1) return "Critical";
  if (cat === 2) return "Major";
  return "Minor";
}

/**
 * Loads checklist answers from the most recent completed BS5839 cert for a site.
 * Returns the checklist array with answers carried over, or null if none found.
 */
export async function loadPreviousChecklistAnswers(
  siteId: string
): Promise<any[] | null> {
  const { data } = await supabase
    .from("smart_form_submissions")
    .select("payload")
    .eq("site_id",   siteId)
    .eq("form_type", "bs5839_inspection_servicing")
    .eq("status",    "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prev = (data as any)?.payload;
  if (!prev?.checklist?.length) return null;

  // Return the previous checklist — answers carry over as a starting point.
  // The engineer reviews and changes anything that differs this visit.
  return prev.checklist as any[];
}
