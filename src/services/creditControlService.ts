 import { supabase } from "@/integrations/supabase/client";
 
 export interface CreditControlSchedule {
   id: string;
   name: string;
   description: string | null;
   is_active: boolean | null;
   is_default: boolean | null;
   created_by: string;
   created_at: string;
   updated_at: string;
 }
 
 export interface CreditControlStep {
   id: string;
   schedule_id: string;
   days_overdue: number;
   channel: string;
   template_type: string;
   subject_template: string | null;
   message_template: string;
   sort_order: number;
   is_active: boolean | null;
   created_at: string;
   updated_at: string;
 }
 
 export interface CreditControlReminder {
   id: string;
   xero_invoice_id: string;
   xero_invoice_number: string | null;
   customer_id: string | null;
   step_id: string | null;
   channel: string;
   status: string;
   scheduled_at: string;
   sent_at: string | null;
   contact_name: string | null;
   contact_email: string | null;
   contact_phone: string | null;
   amount_due: number | null;
   days_overdue: number | null;
   external_id: string | null;
   error_message: string | null;
   response_notes: string | null;
   response_received_at: string | null;
   created_at: string;
   updated_at: string;
 }
 
 export interface CreditControlExclusion {
   id: string;
   customer_id: string | null;
   xero_invoice_id: string | null;
   reason: string | null;
   excluded_by: string;
   excluded_until: string | null;
   is_permanent: boolean | null;
   created_at: string;
   updated_at: string;
 }
 
 // Schedules
 export async function getSchedules(): Promise<CreditControlSchedule[]> {
   const { data, error } = await supabase
     .from("credit_control_schedules")
     .select("*")
     .order("is_default", { ascending: false });
 
   if (error) throw error;
   return data || [];
 }
 
export async function createSchedule(schedule: Partial<CreditControlSchedule> & { name: string }): Promise<CreditControlSchedule> {
   const { data: { user } } = await supabase.auth.getUser();
   if (!user) throw new Error("Not authenticated");
 
   const { data, error } = await supabase
     .from("credit_control_schedules")
    .insert([{ 
      name: schedule.name,
      description: schedule.description ?? null,
      is_active: schedule.is_active ?? true,
      is_default: schedule.is_default ?? false,
      created_by: user.id 
    }])
     .select()
     .single();
 
   if (error) throw error;
   return data;
 }
 
 export async function updateSchedule(id: string, updates: Partial<CreditControlSchedule>): Promise<CreditControlSchedule> {
   const { data, error } = await supabase
     .from("credit_control_schedules")
     .update(updates)
     .eq("id", id)
     .select()
     .single();
 
   if (error) throw error;
   return data;
 }
 
 // Steps
 export async function getSteps(scheduleId: string): Promise<CreditControlStep[]> {
   const { data, error } = await supabase
     .from("credit_control_steps")
     .select("*")
     .eq("schedule_id", scheduleId)
     .order("sort_order", { ascending: true });
 
   if (error) throw error;
   return data || [];
 }
 
 export async function createStep(step: Partial<CreditControlStep>): Promise<CreditControlStep> {
   const { data, error } = await supabase
     .from("credit_control_steps")
    .insert([step as any])
     .select()
     .single();
 
   if (error) throw error;
   return data;
 }
 
 export async function updateStep(id: string, updates: Partial<CreditControlStep>): Promise<CreditControlStep> {
   const { data, error } = await supabase
     .from("credit_control_steps")
     .update(updates)
     .eq("id", id)
     .select()
     .single();
 
   if (error) throw error;
   return data;
 }
 
 export async function deleteStep(id: string): Promise<void> {
   const { error } = await supabase
     .from("credit_control_steps")
     .delete()
     .eq("id", id);
 
   if (error) throw error;
 }
 
 // Reminders
 export async function getReminders(filters?: {
   status?: string;
   channel?: string;
   limit?: number;
 }): Promise<CreditControlReminder[]> {
   let query = supabase
     .from("credit_control_reminders")
     .select("*")
     .order("scheduled_at", { ascending: false });
 
   if (filters?.status) {
     query = query.eq("status", filters.status);
   }
   if (filters?.channel) {
     query = query.eq("channel", filters.channel);
   }
   if (filters?.limit) {
     query = query.limit(filters.limit);
   }
 
   const { data, error } = await query;
   if (error) throw error;
   return data || [];
 }
 
 export async function createReminder(reminder: Partial<CreditControlReminder>): Promise<CreditControlReminder> {
   const { data, error } = await supabase
     .from("credit_control_reminders")
    .insert([reminder as any])
     .select()
     .single();
 
   if (error) throw error;
   return data;
 }
 
 export async function updateReminder(id: string, updates: Partial<CreditControlReminder>): Promise<void> {
   const { error } = await supabase
     .from("credit_control_reminders")
     .update(updates)
     .eq("id", id);
 
   if (error) throw error;
 }
 
 // Exclusions
 export async function getExclusions(): Promise<CreditControlExclusion[]> {
   const { data, error } = await supabase
     .from("credit_control_exclusions")
     .select("*")
     .order("created_at", { ascending: false });
 
   if (error) throw error;
   return data || [];
 }
 
 export async function createExclusion(exclusion: Partial<CreditControlExclusion>): Promise<CreditControlExclusion> {
   const { data: { user } } = await supabase.auth.getUser();
   if (!user) throw new Error("Not authenticated");
 
   const { data, error } = await supabase
     .from("credit_control_exclusions")
    .insert([{ ...exclusion, excluded_by: user.id }])
     .select()
     .single();
 
   if (error) throw error;
   return data;
 }
 
 export async function deleteExclusion(id: string): Promise<void> {
   const { error } = await supabase
     .from("credit_control_exclusions")
     .delete()
     .eq("id", id);
 
   if (error) throw error;
 }
 
 // Send functions
 export async function sendSmsReminder(params: {
   reminder_id?: string;
   to: string;
   message: string;
   invoice_number?: string;
   amount_due?: number;
 }): Promise<{ success: boolean; message_sid?: string; error?: string }> {
   const { data, error } = await supabase.functions.invoke("send-sms-reminder", {
     body: params,
   });
 
   if (error) throw error;
   return data;
 }
 
 export async function sendVoiceReminder(params: {
   reminder_id?: string;
   to: string;
   message: string;
   invoice_number?: string;
   amount_due?: number;
   company_name?: string;
 }): Promise<{ success: boolean; call_sid?: string; error?: string }> {
   const { data, error } = await supabase.functions.invoke("send-voice-reminder", {
     body: params,
   });
 
   if (error) throw error;
   return data;
 }
 
 export async function sendChaseEmail(params: {
   reminder_id?: string;
   to: string;
   subject: string;
   message: string;
   invoice_number?: string;
   amount_due?: number;
   days_overdue?: number;
 }): Promise<{ success: boolean; email_id?: string; error?: string }> {
   const { data, error } = await supabase.functions.invoke("send-chase-email", {
     body: params,
   });
 
   if (error) throw error;
   return data;
 }
 
 // Channel labels
 export const CHANNEL_LABELS: Record<string, string> = {
   email: "Email",
   sms: "SMS",
   call: "Phone Call",
 };
 
 export const STATUS_LABELS: Record<string, string> = {
   pending: "Pending",
   sent: "Sent",
   delivered: "Delivered",
   failed: "Failed",
   no_answer: "No Answer",
   responded: "Responded",
 };