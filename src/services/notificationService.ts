import { supabase } from "@/integrations/supabase/client";

export type NotificationType = 
  | "appointment_created" 
  | "appointment_reminder" 
  | "job_completed" 
  | "appointment_updated";

export interface NotificationPayload {
  type: NotificationType;
  appointmentId?: string;
  visitId?: string;
  customerId?: string;
  siteId?: string;
  // Direct data for immediate sends
  customerEmail?: string;
  customerName?: string;
  siteName?: string;
  siteAddress?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  visitType?: string;
  jobNumber?: string;
  engineerName?: string;
}

export interface NotificationResult {
  success: boolean;
  emailId?: string;
  error?: string;
  skipped?: boolean;
}

export async function sendNotification(payload: NotificationPayload): Promise<NotificationResult> {
  try {
    console.log("Sending notification:", payload);

    const { data, error } = await supabase.functions.invoke("send-notification", {
      body: payload,
    });

    if (error) {
      console.error("Notification error:", error);
      return { success: false, error: error.message };
    }

    if (data?.skipped) {
      console.log("Notification skipped:", data.error);
      return { success: true, skipped: true, error: data.error };
    }

    return { success: true, emailId: data?.emailId };
  } catch (err) {
    console.error("Failed to send notification:", err);
    return { 
      success: false, 
      error: err instanceof Error ? err.message : "Unknown error" 
    };
  }
}

export async function sendAppointmentCreatedNotification(appointmentId: string): Promise<NotificationResult> {
  return sendNotification({
    type: "appointment_created",
    appointmentId,
  });
}

export async function sendAppointmentUpdatedNotification(appointmentId: string): Promise<NotificationResult> {
  return sendNotification({
    type: "appointment_updated",
    appointmentId,
  });
}

export async function sendAppointmentReminderNotification(appointmentId: string): Promise<NotificationResult> {
  return sendNotification({
    type: "appointment_reminder",
    appointmentId,
  });
}

export async function sendJobCompletedNotification(visitId: string): Promise<NotificationResult> {
  return sendNotification({
    type: "job_completed",
    visitId,
  });
}
