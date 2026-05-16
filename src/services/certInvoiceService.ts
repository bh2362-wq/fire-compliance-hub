/**
 * certInvoiceService.ts
 *
 * Auto-drafts a Xero invoice when a BS5839 cert (or any service cert) is completed.
 *
 * Logic:
 *  1. Get the site's customer — check for xero_contact_id
 *  2. Get the service contract for this site + visit type — get unit_price
 *  3. Create a DRAFT Xero invoice with contract line item
 *  4. Returns { invoiceNumber, total } or null if skipped (no Xero, no contract, etc.)
 *
 * Always creates DRAFT — engineer/admin reviews before approving in Xero.
 */

import { supabase } from "@/integrations/supabase/client";
import { createXeroInvoice, getXeroConnection } from "@/services/xeroService";
import { getServiceContracts } from "@/services/serviceContractService";
import { format, addDays } from "date-fns";

// Map cert/visit types to service contract service_type values
const CERT_TYPE_TO_SERVICE: Record<string, string> = {
  "bs5839_inspection_servicing": "fire",
  "quarterly_service":           "fire",
  "annual_inspection":           "fire",
  "biannual_service":            "fire",
  "fire":                        "fire",
  "el_periodic":                 "emergency_lighting",
  "el_commissioning":            "emergency_lighting",
  "emergency_lighting_service":  "emergency_lighting",
  "asd_annual_service":          "aspirator",
  "asd_commissioning":           "aspirator",
  "aspirator_service":           "aspirator",
  "dr_visual":                   "fire",
  "dr_pressure_test":            "fire",
};

export interface AutoInvoiceResult {
  invoiceNumber: string;
  total:         number;
  skipped?:      never;
}

export interface AutoInvoiceSkipped {
  skipped:  true;
  reason:   string;
}

export type AutoInvoiceOutcome = AutoInvoiceResult | AutoInvoiceSkipped;

// In-flight dedupe — prevents concurrent PDF generations from racing
const inFlight = new Map<string, Promise<AutoInvoiceOutcome>>();
const dedupeKey = (siteId: string, certRef: string, visitId: string | null) =>
  `${siteId}::${certRef}::${visitId ?? "no-visit"}`;

export async function autoCreateCertInvoice(opts: {
  visitId:     string | null;
  siteId:      string;
  certRef:     string;
  jobNumber:   string | null;
  certType:    string;            // e.g. "bs5839_inspection_servicing"
  visitDate:   string;            // ISO date
  userId:      string;
}): Promise<AutoInvoiceOutcome> {
  const { visitId, siteId, certRef, jobNumber, certType, visitDate, userId } = opts;

  // ── 0. In-flight guard ────────────────────────────────────────────────────
  const key = dedupeKey(siteId, certRef, visitId);
  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = (async (): Promise<AutoInvoiceOutcome> => {
  // ── 1. Check Xero connection ──────────────────────────────────────────────
  const connection = await getXeroConnection(userId);
  if (!connection) {
    return { skipped: true, reason: "No Xero connection" };
  }

  // ── 2. Get site → customer → xero_contact_id ─────────────────────────────
  const { data: site } = await supabase
    .from("sites")
    .select("name, customer_id, customers(id, name, xero_contact_id)")
    .eq("id", siteId)
    .single();

  const customer = (site as any)?.customers as {
    id: string; name: string; xero_contact_id: string | null;
  } | null;

  if (!customer?.xero_contact_id) {
    return { skipped: true, reason: "Customer has no Xero contact linked" };
  }

  // ── 3. Get service contract value ─────────────────────────────────────────
  const serviceType = CERT_TYPE_TO_SERVICE[certType] ?? "fire";
  const contracts   = await getServiceContracts(siteId);
  const contract    = contracts.find((c) => c.service_type === serviceType);

  if (!contract || !contract.unit_price) {
    return { skipped: true, reason: "No service contract with value found for this site" };
  }

  // ── 4. Already invoiced? Check by visit_id AND by cert reference ──────────
  if (visitId) {
    const { data: existingByVisit } = await supabase
      .from("xero_invoices")
      .select("id, xero_invoice_number")
      .eq("visit_id", visitId)
      .limit(1)
      .maybeSingle();

    if (existingByVisit) {
      return { skipped: true, reason: `Invoice ${existingByVisit.xero_invoice_number ?? ""} already exists for this visit` };
    }
  }

  // Note: xero_invoices has no reference column, so cert-ref dedupe relies on
  // the in-flight guard above + visit_id check. visit_id is required on insert,
  // so calls with null visitId can't actually create rows here anyway.


  // ── 5. Build line item ────────────────────────────────────────────────────
  const visitLabel    = format(new Date(visitDate), "dd MMMM yyyy");
  const description   = contract.description
    || `Fire Alarm ${serviceType === "fire" ? "Inspection & Servicing" : "Service"} — ${site?.name || "Site"} — ${visitLabel}`;

  const lineItems = [
    {
      description,
      quantity:    1,
      unitAmount:  contract.unit_price,
      accountCode: "200",
    },
  ];

  // Build reference: cert ref + job number + PO if present
  const refParts = [certRef, jobNumber, contract.po_number].filter(Boolean);
  const reference = refParts.join(" | ");

  // Due date = 30 days from visit
  const dueDate = format(addDays(new Date(visitDate), 30), "yyyy-MM-dd");

  // ── 6. Create the draft invoice ───────────────────────────────────────────
  const result = await createXeroInvoice(
    visitId || siteId,          // visitId is required by the function; fallback to siteId
    customer.xero_contact_id,
    customer.name,
    lineItems,
    reference,
    dueDate,
  );

  return {
    invoiceNumber: result.number,
    total:         result.total,
  };
  })();

  inFlight.set(key, promise);
  // Clear after 5s so retries after genuine failures aren't blocked
  promise.finally(() => setTimeout(() => inFlight.delete(key), 5000));
  return promise;
}
