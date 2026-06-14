import type { ExtractedEmailData } from "@/pages/EmailScanner";

export const EMAIL_SCANNER_QUOTE_DRAFT_KEY = "emailScanner.quoteDraft.v1";
export const EMAIL_SCANNER_QUOTE_DRAFT_EVENT = "email-scanner-quote-draft-updated";

export interface EmailScannerQuoteDraftLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  labour_cost: number;
  total_price: number;
}

export interface EmailScannerQuoteDraftState {
  matchedCustomerId: string;
  selectedSiteId: string;
  createNewCustomer: boolean;
  createNewSite: boolean;
  title: string;
  summary: string;
  terms: string;
  notes: string;
  vatRate: number;
  newCustomerName: string;
  newCustomerEmail: string;
  newCustomerPhone: string;
  newCustomerContact: string;
  newCustomerAddress: string;
  newCustomerCity: string;
  newCustomerPostcode: string;
  newSiteName: string;
  newSiteAddress: string;
  newSiteCity: string;
  newSitePostcode: string;
  lineItems: EmailScannerQuoteDraftLineItem[];
}

export interface EmailScannerQuoteDraft {
  savedAt: string;
  data: ExtractedEmailData;
  state: EmailScannerQuoteDraftState;
}

function emitDraftUpdate() {
  window.dispatchEvent(new CustomEvent(EMAIL_SCANNER_QUOTE_DRAFT_EVENT));
}

export function readEmailScannerQuoteDraft(): EmailScannerQuoteDraft | null {
  try {
    const raw = localStorage.getItem(EMAIL_SCANNER_QUOTE_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EmailScannerQuoteDraft;
    if (!parsed?.savedAt || !parsed?.state) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveEmailScannerQuoteDraft(draft: EmailScannerQuoteDraft) {
  try {
    localStorage.setItem(EMAIL_SCANNER_QUOTE_DRAFT_KEY, JSON.stringify(draft));
    emitDraftUpdate();
  } catch {
    // Ignore quota/private-mode failures; the form still works normally.
  }
}

export function clearEmailScannerQuoteDraft() {
  try {
    localStorage.removeItem(EMAIL_SCANNER_QUOTE_DRAFT_KEY);
    emitDraftUpdate();
  } catch {
    // Ignore storage failures.
  }
}