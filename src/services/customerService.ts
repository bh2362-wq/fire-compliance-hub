import { supabase } from "@/integrations/supabase/client";

export type CustomerCategory = "direct" | "main_contractor";

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
  // "direct" = BHO works directly for this customer.
  // "main_contractor" = BHO sub-contracts for them; end-site belongs to a
  // third party (school / hospital / etc.). Null until categorised.
  category: CustomerCategory | null;
  xero_contact_id: string | null;
  email_recipients: string | null;
  invoice_email_recipients: string | null;
  quote_email_recipients: string | null;
  report_email_recipients: string | null;
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

    return { customers: customersWithCounts as CustomerWithSiteCount[], error: null };
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

export interface CreateCustomerData {
  name: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  address?: string | null;
  city?: string | null;
  postcode?: string | null;
  notes?: string | null;
  status?: string;
  category?: CustomerCategory | null;
  xero_contact_id?: string | null;
  email_recipients?: string | null;
  invoice_email_recipients?: string | null;
  quote_email_recipients?: string | null;
  report_email_recipients?: string | null;
}

export async function createCustomer(customer: CreateCustomerData): Promise<{ customer: Customer | null; error: Error | null }> {
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

/**
 * Mark a customer (and all of its sites) as active or inactive.
 * Used by the "No longer active" / "Mark as active" toggle on CustomerDetail.
 * Inactive customers and sites are hidden from the default Customers and Sites lists.
 */
export async function setCustomerActiveStatus(
  customerId: string,
  active: boolean
): Promise<{ error: Error | null }> {
  try {
    const status = active ? "active" : "inactive";

    const { error: custErr } = await supabase
      .from("customers")
      .update({ status })
      .eq("id", customerId);
    if (custErr) throw custErr;

    const { error: sitesErr } = await supabase
      .from("sites")
      .update({ status })
      .eq("customer_id", customerId);
    if (sitesErr) throw sitesErr;

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function createXeroContact(contactData: {
  name: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  addressLine1?: string;
  city?: string;
  postalCode?: string;
}): Promise<{ contactId: string; error: Error | null }> {
  try {
    const { data, error } = await supabase.functions.invoke("xero-create-contact", {
      body: contactData,
    });

    if (error) throw new Error(error.message);
    if (data.error) throw new Error(data.error);

    return { contactId: data.contactId, error: null };
  } catch (error) {
    return { contactId: "", error: error as Error };
  }
}
