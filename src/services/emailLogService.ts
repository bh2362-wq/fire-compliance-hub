import { supabase } from "@/integrations/supabase/client";

export interface EmailLog {
  id: string;
  customer_id: string | null;
  site_id: string | null;
  visit_id: string | null;
  report_id: string | null;
  recipients: string[];
  subject: string;
  email_type: string;
  resend_id: string | null;
  status: string;
  error_message: string | null;
  sent_at: string;
  delivered_at: string | null;
  opened_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailLogWithDetails extends EmailLog {
  customer_name?: string;
  site_name?: string;
}

export async function createEmailLog(data: {
  customer_id?: string | null;
  site_id?: string | null;
  visit_id?: string | null;
  report_id?: string | null;
  recipients: string[];
  subject: string;
  email_type?: string;
  resend_id?: string | null;
  status: string;
  error_message?: string | null;
  created_by?: string | null;
}): Promise<{ log: EmailLog | null; error: Error | null }> {
  try {
    const { data: log, error } = await supabase
      .from("email_logs")
      .insert({
        customer_id: data.customer_id || null,
        site_id: data.site_id || null,
        visit_id: data.visit_id || null,
        report_id: data.report_id || null,
        recipients: data.recipients,
        subject: data.subject,
        email_type: data.email_type || "report",
        resend_id: data.resend_id || null,
        status: data.status,
        error_message: data.error_message || null,
        created_by: data.created_by || null,
      })
      .select()
      .single();

    if (error) throw error;
    return { log, error: null };
  } catch (error) {
    console.error("Failed to create email log:", error);
    return { log: null, error: error as Error };
  }
}

export async function updateEmailLogStatus(
  id: string,
  status: string,
  resendId?: string,
  errorMessage?: string
): Promise<{ error: Error | null }> {
  try {
    const updateData: Partial<EmailLog> = { status };
    if (resendId) updateData.resend_id = resendId;
    if (errorMessage) updateData.error_message = errorMessage;
    if (status === "delivered") updateData.delivered_at = new Date().toISOString();

    const { error } = await supabase
      .from("email_logs")
      .update(updateData)
      .eq("id", id);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function getEmailLogsByCustomer(
  customerId: string
): Promise<{ logs: EmailLogWithDetails[]; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from("email_logs")
      .select(`
        *,
        sites(name)
      `)
      .eq("customer_id", customerId)
      .order("sent_at", { ascending: false });

    if (error) throw error;

    const logs = (data || []).map((log) => ({
      ...log,
      site_name: (log.sites as { name: string } | null)?.name,
    }));

    return { logs, error: null };
  } catch (error) {
    return { logs: [], error: error as Error };
  }
}

export async function getAllEmailLogs(
  limit = 100
): Promise<{ logs: EmailLogWithDetails[]; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from("email_logs")
      .select(`
        *,
        customers(name),
        sites(name)
      `)
      .order("sent_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    const logs = (data || []).map((log) => ({
      ...log,
      customer_name: (log.customers as { name: string } | null)?.name,
      site_name: (log.sites as { name: string } | null)?.name,
    }));

    return { logs, error: null };
  } catch (error) {
    return { logs: [], error: error as Error };
  }
}
