import { supabase } from "@/integrations/supabase/client";

export interface CompanySettings {
  id: string;
  company_name: string;
  company_logo_url: string | null;
  address: string | null;
  city: string | null;
  postcode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  registration_number: string | null;
  vat_number: string | null;
  report_logo_url: string | null;
  report_footer_text: string | null;
  default_engineer_signature: string | null;
  default_payment_terms: number | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_sort_code: string | null;
  bank_account_number: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface ServiceType {
  id: string;
  name: string;
  description: string | null;
  default_price: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export async function getCompanySettings(): Promise<CompanySettings | null> {
  const { data, error } = await supabase
    .from('company_settings')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function upsertCompanySettings(
  settings: Partial<CompanySettings>,
  userId: string
): Promise<CompanySettings> {
  // Check if settings exist
  const existing = await getCompanySettings();
  
  if (existing) {
    const { data, error } = await supabase
      .from('company_settings')
      .update(settings)
      .eq('id', existing.id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabase
      .from('company_settings')
      .insert({
        ...settings,
        company_name: settings.company_name || 'My Company',
        created_by: userId,
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
}

export async function getServiceTypes(): Promise<ServiceType[]> {
  const { data, error } = await supabase
    .from('default_service_types')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createServiceType(
  serviceType: Omit<ServiceType, 'id' | 'created_at' | 'updated_at'>
): Promise<ServiceType> {
  const { data, error } = await supabase
    .from('default_service_types')
    .insert(serviceType)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateServiceType(
  id: string,
  updates: Partial<ServiceType>
): Promise<ServiceType> {
  const { data, error } = await supabase
    .from('default_service_types')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteServiceType(id: string): Promise<void> {
  const { error } = await supabase
    .from('default_service_types')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function getTeamMembers() {
  // First get all profiles
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true });

  if (profilesError) throw profilesError;
  
  // Then get all roles
  const { data: roles, error: rolesError } = await supabase
    .from('user_roles')
    .select('user_id, role');
    
  if (rolesError) throw rolesError;
  
  // Map roles to profiles
  const rolesMap = new Map(roles?.map(r => [r.user_id, r.role]) || []);
  
  return (profiles || []).map(profile => ({
    ...profile,
    user_roles: rolesMap.has(profile.user_id) 
      ? [{ role: rolesMap.get(profile.user_id) }] 
      : null,
  }));
}

export async function updateUserRole(userId: string, role: 'owner' | 'admin' | 'engineer' | 'client' | 'auditor' | 'apprentice' | 'office') {
  const { data: existingRole } = await supabase
    .from('user_roles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existingRole) {
    const { error } = await supabase
      .from('user_roles')
      .update({ role })
      .eq('user_id', userId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('user_roles')
      .insert({ user_id: userId, role });
    if (error) throw error;
  }
}

export async function updateMicrosoftEmail(userId: string, microsoftEmail: string | null) {
  const { error } = await supabase
    .from('profiles')
    .update({ microsoft_email: microsoftEmail } as any)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function addEngineerProfile(data: {
  full_name: string;
  email: string;
  microsoft_email?: string;
  role: 'owner' | 'admin' | 'engineer' | 'client' | 'auditor';
}) {
  // Generate a deterministic UUID from the email to use as user_id
  // Since this is a manually-added profile (not a real auth user), we use a generated ID
  const tempUserId = crypto.randomUUID();

  const { error: profileError } = await supabase
    .from('profiles')
    .insert({
      user_id: tempUserId,
      full_name: data.full_name,
      email: data.email,
      microsoft_email: data.microsoft_email || null,
    });

  if (profileError) throw profileError;

  const { error: roleError } = await supabase
    .from('user_roles')
    .insert({ user_id: tempUserId, role: data.role });

  if (roleError) throw roleError;

  return tempUserId;
}
