import { supabase } from "@/integrations/supabase/client";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface OutlookMessage {
  id: string;
  subject: string;
  from: { name: string; address: string };
  toRecipients: { emailAddress: { name: string; address: string } }[];
  receivedDateTime: string;
  isRead: boolean;
  hasAttachments: boolean;
  bodyPreview: string;
  importance: string;
  supplierName?: string;
}

export interface OutlookAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
}

export interface MessageDetail {
  id: string;
  subject: string;
  from: { name: string; address: string };
  receivedDateTime: string;
  body: string; // plain text
  hasAttachments: boolean;
}

// ── Config ─────────────────────────────────────────────────────────────────────
// The BHO Fire mailbox. Could be moved to company_settings in future.
const DEFAULT_MAILBOX = "admin@bhofire.com";

async function call(action: string, params: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("outlook-email-proxy", {
    body: { action, mailbox: DEFAULT_MAILBOX, ...params },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

// ── API ────────────────────────────────────────────────────────────────────────

/** List inbox messages, optionally filtered by sender */
export async function listInbox(options: {
  limit?: number;
  offset?: number;
  sender?: string;
} = {}): Promise<{ messages: OutlookMessage[]; nextLink?: string }> {
  return call("list_inbox", options);
}

/** Full-text search across inbox */
export async function searchEmails(
  query: string,
  limit = 20
): Promise<{ messages: OutlookMessage[] }> {
  return call("search", { query, limit });
}

/** Get full message body (plain text) */
export async function getMessage(messageId: string): Promise<MessageDetail> {
  return call("get_message", { messageId });
}

/** List attachments on a message */
export async function listAttachments(
  messageId: string
): Promise<{ attachments: OutlookAttachment[] }> {
  return call("list_attachments", { messageId });
}

/** Get attachment content as base64 */
export async function getAttachment(
  messageId: string,
  attachmentId: string
): Promise<{ name: string; contentType: string; contentBytes: string }> {
  return call("get_attachment", { messageId, attachmentId });
}

/** Find most recent price list emails from Huvo and BAWFS */
export async function getSupplierPriceEmails(): Promise<{ messages: OutlookMessage[] }> {
  return call("supplier_price_emails");
}

/** Search supplier emails for a part number (purchase history) */
export async function searchPurchaseHistory(
  partNumber: string
): Promise<{ messages: OutlookMessage[] }> {
  return call("purchase_history", { query: partNumber });
}

/** Convert base64 string to ArrayBuffer (for Excel parsing) */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  // Strip data URI prefix if present
  const b64 = base64.includes(",") ? base64.split(",")[1] : base64;
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** Detect if an attachment is a spreadsheet */
export function isSpreadsheet(attachment: OutlookAttachment): boolean {
  const ct = attachment.contentType.toLowerCase();
  const name = attachment.name.toLowerCase();
  return (
    ct.includes("spreadsheet") ||
    ct.includes("excel") ||
    ct.includes("xlsx") ||
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    name.endsWith(".xlsm") ||
    name.endsWith(".csv")
  );
}

/** Detect if an attachment is a CSV */
export function isCsv(attachment: OutlookAttachment): boolean {
  return (
    attachment.contentType.toLowerCase().includes("csv") ||
    attachment.name.toLowerCase().endsWith(".csv")
  );
}
