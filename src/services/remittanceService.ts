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
  // Load-bearing for xero-apply-payment. Set whenever a match is
  // resolved (exact, fuzzy, or manual link from the office). The
  // matched_xero_invoice_id FK is informational only — apply uses this.
  xero_invoice_id: string | null;
  matched_contact_name: string | null;
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
  /** How many PDF attachments were sent to Claude for this remittance.
   *  0 = body-only parse; >0 = PDFs were included. Populated by
   *  parse-remittance-email. */
  pdf_count: number | null;
  /** Echo of the parser's per-attachment audit. Lives under
   *  ai_raw_extract.attachment_diagnostics in the DB; surfaced here so
   *  the UI can render a "PDF×2 (1 inline)" badge or a hover-tip with
   *  the skip reasons. */
  attachment_diagnostics: AttachmentDiag[] | null;
  has_attachments_flag: boolean | null;
  line_items: RemittanceLineItem[];
}

export interface AttachmentDiag {
  name: string;
  content_type: string;
  size: number | null;
  is_inline: boolean;
  status: "included" | "skipped_not_pdf" | "skipped_empty_bytes" | "fetch_error";
  reason?: string;
  fallback_used?: boolean;
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
  // attachment_diagnostics + has_attachments_flag live under
  // ai_raw_extract on the DB row. Lift them onto the typed object so
  // the UI can render the diagnostics without poking into JSON.
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const raw = (row.ai_raw_extract as Record<string, unknown> | null) ?? null;
    const diag = Array.isArray(raw?.attachment_diagnostics)
      ? (raw.attachment_diagnostics as AttachmentDiag[])
      : null;
    const flag = typeof raw?.has_attachments_flag === "boolean"
      ? (raw.has_attachments_flag as boolean)
      : null;
    return {
      ...(row as unknown as RemittanceAdvice),
      attachment_diagnostics: diag,
      has_attachments_flag: flag,
    };
  });
}

/** Lightweight count-by-status — for the tab badges so the user can
 *  see at a glance whether Pending is empty because nothing's there
 *  or because everything was already auto-dismissed / applied. One
 *  query that hits the small remittance_advices table with no joins.
 */
export async function countRemittancesByStatus(): Promise<Record<RemittanceStatus, number>> {
  const totals: Record<RemittanceStatus, number> = {
    parsed: 0,
    needs_review: 0,
    applied: 0,
    dismissed: 0,
    failed: 0,
  };
  const { data, error } = await (supabase as unknown as { from: (t: string) => any })
    .from("remittance_advices")
    .select("status");
  if (error) throw error;
  for (const row of (data as Array<{ status: string }>)) {
    const s = row.status as RemittanceStatus;
    if (s in totals) totals[s] += 1;
  }
  return totals;
}

export type DismissRuleKind = "from_address" | "from_domain" | "subject_contains";

export interface DismissRule {
  id: string;
  match_kind: DismissRuleKind;
  match_value: string;
  hit_count: number;
  last_hit_at: string | null;
  note: string | null;
  source_remittance_id: string | null;
  created_by: string | null;
  created_at: string;
}

/** Dismiss a remittance + optionally create a learning rule so future
 *  emails matching the same sender / subject are auto-dismissed
 *  without burning an AI call. The "remember" path is what gets the
 *  scanner toward autopilot — every false positive the user clears
 *  trains the next scan.
 */
export async function dismissRemittance(
  id: string,
  opts?: {
    rule?: {
      kind: DismissRuleKind;
      value: string;
      note?: string;
    };
  },
): Promise<void> {
  const { error } = await (supabase as unknown as { from: (t: string) => any })
    .from("remittance_advices")
    .update({ status: "dismissed" })
    .eq("id", id);
  if (error) throw error;

  if (opts?.rule) {
    const cleaned = opts.rule.value.trim().toLowerCase();
    if (!cleaned) return;
    // Best-effort: if a rule for this {kind, value} already exists the
    // UNIQUE constraint trips and we silently move on — the desired
    // outcome either way is "this thing is blocked".
    const { data: userData } = await supabase.auth.getUser();
    await (supabase as unknown as { from: (t: string) => any })
      .from("remittance_dismiss_rules")
      .insert({
        match_kind: opts.rule.kind,
        match_value: cleaned,
        note: opts.rule.note ?? null,
        source_remittance_id: id,
        created_by: userData?.user?.id ?? null,
      });
  }
}

export async function listDismissRules(): Promise<DismissRule[]> {
  const { data, error } = await (supabase as unknown as { from: (t: string) => any })
    .from("remittance_dismiss_rules")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DismissRule[];
}

export async function deleteDismissRule(id: string): Promise<void> {
  const { error } = await (supabase as unknown as { from: (t: string) => any })
    .from("remittance_dismiss_rules")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/** Trigger a fresh sweep of the accounts inboxes. */
export async function scanRemittanceEmails(opts?: { hours_back?: number }): Promise<{
  scanned: number;
  relevant: number;
  already_parsed: number;
  queued: number;
  /** Per-status roll-up from the new summary fields the Edge Function returns. */
  parsed_count?: number;
  needs_review_count?: number;
  dismissed_count?: number;
  duplicate_count?: number;
  failed_count?: number;
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
  // Prefer the direct xero_invoice_id (set by parse for matched lines AND
  // by the manual link picker). Fall back to the cache row's Xero ID for
  // older line items written before the v2 schema.
  const xeroInvoiceId = lineItem.xero_invoice_id ?? lineItem.matched_invoice?.xero_invoice_id;
  if (!xeroInvoiceId) {
    throw new Error("Line item isn't matched to a Xero invoice yet");
  }
  if (!lineItem.amount || lineItem.amount <= 0) {
    throw new Error("Line item amount is missing or zero");
  }
  try {
    const result = await applyPaymentToInvoiceWithBank({
      invoiceId: xeroInvoiceId,
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
 * Manually link an unmatched line item to a Xero invoice picked from
 * the live outstanding-invoices list. The line keeps its existing
 * `amount` and `invoice_number` (which were AI-extracted from the email)
 * — only the matching pointer is updated. Status returns to `pending`
 * so the office can then press Apply.
 */
export async function linkLineItemToXeroInvoice(
  lineItemId: string,
  xeroInvoiceId: string,
  contactName: string | null,
): Promise<void> {
  const { error } = await (supabase as unknown as { from: (t: string) => any })
    .from("remittance_line_items")
    .update({
      xero_invoice_id: xeroInvoiceId,
      matched_contact_name: contactName,
      match_confidence: "manual",
      status: "pending",
      error_message: null,
    })
    .eq("id", lineItemId);
  if (error) throw error;
}

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
  // The value column is jsonb. Codes are typically a 3-digit string
  // like "090" — but PostgREST will helpfully coerce a numeric-looking
  // input ("791") to a JSON number on the way in, so the column can
  // contain either shape. Accept both and stringify on the way out.
  const raw = data?.value as unknown;
  if (typeof raw === "string" && raw.length > 0) return raw;
  if (typeof raw === "number") return String(raw);
  return null;
}

export async function setBibbyAccountCode(code: string): Promise<void> {
  // `code` is a JS string from the dialog input. supabase-js
  // serialises it to a JSON string in the request body, which
  // PostgREST then stores as a JSONB value. Numeric-looking codes
  // (e.g. "791") may get coerced to JSON numbers — getBibbyAccountCode
  // handles both types so the round-trip works either way.
  const { error } = await (supabase as unknown as { from: (t: string) => any })
    .from("app_settings")
    .upsert(
      { key: BIBBY_ACCOUNT_KEY, value: code, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) throw error;
}
