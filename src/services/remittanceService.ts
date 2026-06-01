import { supabase } from "@/integrations/supabase/client";
import { applyPaymentToInvoice } from "./bankReconciliationService";

// The remittance_advices + remittance_line_items tables aren't in the
// auto-generated types.ts yet (would happen on next codegen). We cast
// through `any` for now, matching the same pattern used in
// duplicateQuotationService and other services that touch newly-added
// tables. Worth a follow-up codegen pass after this PR lands.

export type RemittanceStatus = "parsed" | "needs_review" | "applied" | "dismissed" | "failed";
export type LineItemStatus = "pending" | "applied" | "skipped" | "failed";
export type MatchConfidence = "exact" | "fuzzy" | "manual" | null;

export interface RemittanceLineItem {
  id: string;
  remittance_id: string;
  invoice_number: string | null;
  amount: number | null;
  raw_text: string | null;
  matched_xero_invoice_id: string | null;
  match_confidence: MatchConfidence;
  status: LineItemStatus;
  xero_payment_id: string | null;
  error_message: string | null;
  applied_at: string | null;
  applied_by: string | null;
  matched_invoice?: {
    id: string;
    xero_invoice_id: string;
    xero_invoice_number: string | null;
    total_amount: number | null;
    status: string | null;
    contact_name: string | null;
  } | null;
}

export interface RemittanceAdvice {
  id: string;
  scanned_email_id: string | null;
  message_id: string;
  mailbox: string;
  from_address: string | null;
  from_name: string | null;
  subject: string | null;
  received_at: string | null;
  payment_date: string | null;
  total_amount: number | null;
  currency: string;
  payer_name: string | null;
  status: RemittanceStatus;
  error_message: string | null;
  applied_at: string | null;
  applied_by: string | null;
  created_at: string;
  line_items: RemittanceLineItem[];
}

export const REMITTANCE_STATUS_LABELS: Record<RemittanceStatus, string> = {
  parsed: "Ready to apply",
  needs_review: "Needs review",
  applied: "Applied to Xero",
  dismissed: "Dismissed",
  failed: "Parsing failed",
};

export async function listRemittances(opts?: {
  statuses?: RemittanceStatus[];
  limit?: number;
}): Promise<RemittanceAdvice[]> {
  let query = (supabase as unknown as { from: (t: string) => any }).from("remittance_advices")
    .select(
      `
      *,
      line_items:remittance_line_items (
        *,
        matched_invoice:matched_xero_invoice_id (
          id, xero_invoice_id, xero_invoice_number, total_amount, status, contact_name
        )
      )
    `,
    )
    .order("received_at", { ascending: false })
    .limit(opts?.limit ?? 100);
  if (opts?.statuses && opts.statuses.length > 0) {
    query = query.in("status", opts.statuses);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as RemittanceAdvice[];
}

export async function dismissRemittance(id: string): Promise<void> {
  const { error } = await (supabase as unknown as { from: (t: string) => any })
    .from("remittance_advices")
    .update({ status: "dismissed" })
    .eq("id", id);
  if (error) throw error;
}

/** Trigger a fresh sweep of the accounts inboxes. */
export async function scanRemittanceEmails(opts?: { hours_back?: number }): Promise<{
  scanned: number;
  relevant: number;
  already_parsed: number;
  queued: number;
  results: Array<{ scanned_email_id: string; status: string; error?: string }>;
}> {
  const { data, error } = await supabase.functions.invoke("scan-remittance-emails", {
    body: opts ?? {},
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

/**
 * Apply a single line item: calls xero-apply-payment with the matched
 * invoice's Xero ID + amount + Bibby Factoring bank account code, then
 * marks the line item applied. Returns the updated line item state.
 */
export async function applyLineItem(
  lineItem: RemittanceLineItem,
  bankAccountCode: string,
): Promise<{ status: LineItemStatus; xero_payment_id?: string; error?: string }> {
  if (!lineItem.matched_xero_invoice_id || !lineItem.matched_invoice?.xero_invoice_id) {
    throw new Error("Line item isn't matched to a Xero invoice yet");
  }
  if (!lineItem.amount || lineItem.amount <= 0) {
    throw new Error("Line item amount is missing or zero");
  }
  try {
    const result = await applyPaymentToInvoiceWithBank({
      invoiceId: lineItem.matched_invoice.xero_invoice_id,
      amount: lineItem.amount,
      bankAccountCode,
    });
    const xeroPaymentId = result?.payment?.PaymentID ?? result?.PaymentID ?? null;
    await (supabase as unknown as { from: (t: string) => any })
      .from("remittance_line_items")
      .update({
        status: "applied",
        applied_at: new Date().toISOString(),
        xero_payment_id: xeroPaymentId,
        error_message: null,
      })
      .eq("id", lineItem.id);
    return { status: "applied", xero_payment_id: xeroPaymentId ?? undefined };
  } catch (e) {
    const message = (e as Error).message;
    await (supabase as unknown as { from: (t: string) => any })
      .from("remittance_line_items")
      .update({ status: "failed", error_message: message })
      .eq("id", lineItem.id);
    return { status: "failed", error: message };
  }
}

interface ApplyPaymentOptions {
  invoiceId: string;
  amount: number;
  date?: string;
  bankAccountCode: string;
}

// Direct invoke so we can pass bankAccountCode — the existing
// applyPaymentToInvoice service helper omits that param.
async function applyPaymentToInvoiceWithBank(opts: ApplyPaymentOptions): Promise<any> {
  const { data, error } = await supabase.functions.invoke("xero-apply-payment", {
    body: opts,
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}
// Surface the imported helper so consumers can keep using it for other flows.
export { applyPaymentToInvoice };

/**
 * After all line items on a remittance have been applied (or skipped),
 * flip the header to "applied". Caller invokes this after a batch.
 */
export async function refreshRemittanceStatus(remittanceId: string): Promise<RemittanceStatus> {
  const { data: items } = await (supabase as unknown as { from: (t: string) => any })
    .from("remittance_line_items")
    .select("status")
    .eq("remittance_id", remittanceId);
  const rows = (items ?? []) as Array<{ status: LineItemStatus }>;
  if (rows.length === 0) return "needs_review";
  const allDone = rows.every((r) => r.status === "applied" || r.status === "skipped");
  const anyApplied = rows.some((r) => r.status === "applied");
  const nextStatus: RemittanceStatus = allDone && anyApplied ? "applied" : "needs_review";
  await (supabase as unknown as { from: (t: string) => any })
    .from("remittance_advices")
    .update({
      status: nextStatus,
      applied_at: nextStatus === "applied" ? new Date().toISOString() : null,
    })
    .eq("id", remittanceId);
  return nextStatus;
}

// ── Settings helpers ───────────────────────────────────────────────────────

const BIBBY_ACCOUNT_KEY = "bibby_factoring_account_code";

export async function getBibbyAccountCode(): Promise<string | null> {
  const { data } = await (supabase as unknown as { from: (t: string) => any })
    .from("app_settings")
    .select("value")
    .eq("key", BIBBY_ACCOUNT_KEY)
    .maybeSingle();
  const value = data?.value as string | null | undefined;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function setBibbyAccountCode(code: string): Promise<void> {
  const { error } = await (supabase as unknown as { from: (t: string) => any })
    .from("app_settings")
    .upsert(
      { key: BIBBY_ACCOUNT_KEY, value: code, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) throw error;
}
