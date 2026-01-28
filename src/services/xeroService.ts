import { supabase } from "@/integrations/supabase/client";

export interface XeroConnection {
  id: string;
  user_id: string;
  tenant_id: string;
  tenant_name: string | null;
  expires_at: string;
  created_at: string;
}

export interface XeroContact {
  ContactID: string;
  Name: string;
  EmailAddress?: string;
  FirstName?: string;
  LastName?: string;
}

export interface XeroInvoice {
  id: string;
  visit_id: string;
  xero_invoice_id: string;
  xero_invoice_number: string | null;
  contact_id: string;
  contact_name: string | null;
  total_amount: number | null;
  status: string | null;
  created_at: string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitAmount: number;
  accountCode?: string;
}

export async function initiateXeroAuth(): Promise<{ authUrl: string; state: string }> {
  const { data, error } = await supabase.functions.invoke("xero-auth");
  
  if (error) throw new Error(error.message);
  return data;
}

export async function saveXeroConnection(
  userId: string,
  tenantId: string,
  tenantName: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: string
): Promise<void> {
  const { error } = await supabase
    .from("xero_connections")
    .upsert({
      user_id: userId,
      tenant_id: tenantId,
      tenant_name: tenantName,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
    }, {
      onConflict: "user_id,tenant_id",
    });

  if (error) throw error;
}

export async function getXeroConnection(userId: string): Promise<XeroConnection | null> {
  const { data, error } = await supabase
    .from("xero_connections")
    .select("id, user_id, tenant_id, tenant_name, expires_at, created_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function deleteXeroConnection(connectionId: string): Promise<void> {
  const { error } = await supabase
    .from("xero_connections")
    .delete()
    .eq("id", connectionId);

  if (error) throw error;
}

export async function fetchXeroContacts(search?: string): Promise<XeroContact[]> {
  const url = search ? `xero-contacts?search=${encodeURIComponent(search)}` : "xero-contacts";
  const { data, error } = await supabase.functions.invoke("xero-contacts", {
    body: search ? undefined : undefined,
  });

  if (error) throw new Error(error.message);
  return data.contacts || [];
}

export async function createXeroInvoice(
  visitId: string,
  contactId: string,
  contactName: string,
  lineItems: InvoiceLineItem[],
  reference?: string,
  dueDate?: string
): Promise<{ id: string; number: string; status: string; total: number }> {
  const { data, error } = await supabase.functions.invoke("xero-create-invoice", {
    body: {
      visitId,
      contactId,
      contactName,
      lineItems,
      reference,
      dueDate,
    },
  });

  if (error) throw new Error(error.message);
  if (data.error) throw new Error(data.error);
  
  return data.invoice;
}

export async function getVisitInvoices(visitId: string): Promise<XeroInvoice[]> {
  const { data, error } = await supabase
    .from("xero_invoices")
    .select("*")
    .eq("visit_id", visitId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export interface XeroOutstandingInvoice {
  invoiceId: string;
  invoiceNumber: string;
  reference: string;
  contactId: string;
  contactName: string;
  date: string;
  dueDate: string;
  status: string;
  total: number;
  amountDue: number;
  amountPaid: number;
  currencyCode: string;
  isOverdue: boolean;
}

export interface XeroContactBalance {
  contactId: string;
  name: string;
  email: string;
  outstanding: number;
  overdue: number;
}

export interface XeroInvoiceSummary {
  totalOutstanding: number;
  totalOverdue: number;
  invoiceCount: number;
  overdueCount: number;
}

export async function fetchOutstandingInvoices(contactId?: string): Promise<{
  invoices: XeroOutstandingInvoice[];
  contactBalances: XeroContactBalance[];
  summary: XeroInvoiceSummary;
}> {
  const { data, error } = await supabase.functions.invoke("xero-invoices", {
    body: contactId ? { contactId } : {},
  });

  if (error) throw new Error(error.message);
  if (data.error) throw new Error(data.error);
  
  return {
    invoices: data.invoices || [],
    contactBalances: data.contactBalances || [],
    summary: data.summary || { totalOutstanding: 0, totalOverdue: 0, invoiceCount: 0, overdueCount: 0 },
  };
}
