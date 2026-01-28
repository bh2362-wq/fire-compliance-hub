import { supabase } from "@/integrations/supabase/client";

export interface Customer {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  city: string | null;
  postcode: string | null;
  notes: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerWithSiteCount extends Customer {
  site_count: number;
}

export async function getCustomers(): Promise<{ customers: CustomerWithSiteCount[]; error: Error | null }> {
  try {
    const { data: customers, error } = await supabase
      .from("customers")
      .select("*")
      .order("name");

    if (error) throw error;

    // Get site counts for each customer
    const { data: siteCounts, error: countError } = await supabase
      .from("sites")
      .select("customer_id")
      .not("customer_id", "is", null);

    if (countError) throw countError;

    const countMap = (siteCounts || []).reduce((acc: Record<string, number>, site) => {
      if (site.customer_id) {
        acc[site.customer_id] = (acc[site.customer_id] || 0) + 1;
      }
      return acc;
    }, {});

    const customersWithCounts = (customers || []).map((c) => ({
      ...c,
      site_count: countMap[c.id] || 0,
    }));

    return { customers: customersWithCounts, error: null };
  } catch (error) {
    return { customers: [], error: error as Error };
  }
}

export async function getCustomer(id: string): Promise<{ customer: Customer | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    return { customer: data, error: null };
  } catch (error) {
    return { customer: null, error: error as Error };
  }
}

export async function createCustomer(customer: Omit<Customer, "id" | "created_at" | "updated_at">): Promise<{ customer: Customer | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from("customers")
      .insert(customer)
      .select()
      .single();

    if (error) throw error;
    return { customer: data, error: null };
  } catch (error) {
    return { customer: null, error: error as Error };
  }
}

export async function updateCustomer(id: string, customer: Partial<Customer>): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from("customers")
      .update(customer)
      .eq("id", id);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function deleteCustomer(id: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function getCustomerSites(customerId: string) {
  const { data, error } = await supabase
    .from("sites")
    .select("*")
    .eq("customer_id", customerId)
    .order("name");

  return { sites: data || [], error };
}
