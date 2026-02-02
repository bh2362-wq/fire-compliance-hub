import { supabase } from "@/integrations/supabase/client";

export interface Appointment {
  id: string;
  visit_id: string | null;
  site_id: string;
  customer_id: string | null;
  engineer_id: string | null;
  title: string;
  description: string | null;
  appointment_date: string;
  start_time: string;
  end_time: string | null;
  status: 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  visit_type: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined data
  site?: {
    id: string;
    name: string;
    address: string | null;
  };
  customer?: {
    id: string;
    name: string;
  } | null;
  engineer?: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
}

export interface AppointmentInput {
  visit_id?: string | null;
  site_id: string;
  customer_id?: string | null;
  engineer_id?: string | null;
  title: string;
  description?: string | null;
  appointment_date: string;
  start_time: string;
  end_time?: string | null;
  status?: 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  visit_type?: string | null;
}

export async function fetchAppointments(startDate: string, endDate: string): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      *,
      site:sites(id, name, address),
      customer:customers(id, name),
      engineer:profiles(id, full_name, email)
    `)
    .gte('appointment_date', startDate)
    .lte('appointment_date', endDate)
    .order('appointment_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) throw error;
  return (data || []) as unknown as Appointment[];
}

export async function fetchAppointmentById(id: string): Promise<Appointment | null> {
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      *,
      site:sites(id, name, address),
      customer:customers(id, name),
      engineer:profiles(id, full_name, email)
    `)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as unknown as Appointment;
}

export async function createAppointment(input: AppointmentInput, userId: string): Promise<Appointment> {
  // First, create a visit record if visit_type is provided and no visit_id exists
  let visitId = input.visit_id;
  
  if (!visitId && input.visit_type) {
    const { data: visitData, error: visitError } = await supabase
      .from('visits')
      .insert({
        site_id: input.site_id,
        visit_date: input.appointment_date,
        visit_type: input.visit_type,
        status: 'scheduled',
        engineer_id: input.engineer_id || null,
        notes: input.description || null,
      })
      .select('id')
      .single();

    if (visitError) throw visitError;
    visitId = visitData.id;
  }

  // Now create the appointment with the linked visit
  const { data, error } = await supabase
    .from('appointments')
    .insert({
      ...input,
      visit_id: visitId,
      created_by: userId,
    })
    .select(`
      *,
      site:sites(id, name, address),
      customer:customers(id, name),
      engineer:profiles(id, full_name, email)
    `)
    .single();

  if (error) throw error;
  return data as unknown as Appointment;
}

export async function updateAppointment(id: string, input: Partial<AppointmentInput>): Promise<Appointment> {
  const { data, error } = await supabase
    .from('appointments')
    .update(input)
    .eq('id', id)
    .select(`
      *,
      site:sites(id, name, address),
      customer:customers(id, name),
      engineer:profiles(id, full_name, email)
    `)
    .single();

  if (error) throw error;
  return data as unknown as Appointment;
}

export async function deleteAppointment(id: string): Promise<void> {
  // First get the appointment to check for linked visit
  const { data: appointment } = await supabase
    .from('appointments')
    .select('visit_id')
    .eq('id', id)
    .single();

  // Delete the appointment
  const { error } = await supabase
    .from('appointments')
    .delete()
    .eq('id', id);

  if (error) throw error;

  // If there was a linked visit, delete it too
  if (appointment?.visit_id) {
    await supabase
      .from('visits')
      .delete()
      .eq('id', appointment.visit_id);
  }
}

export async function fetchEngineers(): Promise<{ id: string; full_name: string | null; email: string | null }[]> {
  // Get all profiles with elevated roles (engineers)
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, user_id');

  if (error) throw error;
  
  // Map to use user_id as the engineer_id
  return (data || []).map(p => ({
    id: p.user_id,
    full_name: p.full_name,
    email: p.email,
  }));
}

export const APPOINTMENT_STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-500',
  confirmed: 'bg-emerald-500',
  in_progress: 'bg-amber-500',
  completed: 'bg-green-600',
  cancelled: 'bg-red-500',
};

export const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
