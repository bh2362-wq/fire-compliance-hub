import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface QuotationFull {
  id: string;
  site_id: string | null;
  customer_id: string | null;
  quotation_number: string;
  title: string | null;
  summary: string | null;
  introduction: string | null;
  scope: string[] | null;
  assumptions: string[] | null;
  exclusions: string[] | null;
  valid_until: string | null;
  vat_rate: number | null;
  created_at: string;
  latest_docx_path: string | null;
  latest_pdf_path: string | null;
  bs5839_category: string | null;
  building_type: string | null;
  occupancy_type: string | null;
  storeys: number | null;
  works_type: string | null;
  system_manufacturer: string | null;
  system_panel: string | null;
  loop_count: number | null;
  device_count: number | null;
  device_counts_detail: Record<string, number> | null;
  system_features: Record<string, boolean> | null;
  site_visit_date: string | null;
  existing_system_description: string | null;
  customers: { name: string; contact_name: string | null; contact_email: string | null; contact_phone: string | null; address: string | null; city: string | null; postcode: string | null } | null;
  sites: { name: string; address: string | null; city: string | null; postcode: string | null } | null;
  quotation_line_items: { description: string; quantity: number | null; unit_price: number | null; total_price: number | null; sort_order: number | null; is_section: boolean | null; markup_percent: number | null; labour_cost: number | null }[];
}

const QUOTATION_FULL_SELECT = `
  *,
  customers ( name, contact_name, contact_email, contact_phone, address, city, postcode ),
  sites ( name, address, city, postcode ),
  quotation_line_items ( description, quantity, unit_price, total_price, sort_order, is_section, markup_percent, labour_cost )
`;

export async function fetchQuotationFull(quotationId: string): Promise<QuotationFull> {
  const { data, error } = await (supabase as any)
    .from("quotations")
    .select(QUOTATION_FULL_SELECT)
    .eq("id", quotationId)
    .single();
  if (error) throw error;
  return data as unknown as QuotationFull;
}

export function useQuotationFull(quotationId: string | undefined) {
  return useQuery({
    queryKey: ["quotation-full", quotationId],
    enabled: !!quotationId,
    queryFn: () => fetchQuotationFull(quotationId as string),
  });
}

function formatUKDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function quotationToQuoteInput(q: QuotationFull) {
  const cust = q.customers ?? null;
  const billingAddress = [cust?.address, cust?.city, cust?.postcode].filter(Boolean).join(", ");
  const siteAddr = [q.sites?.name, q.sites?.address, q.sites?.city, q.sites?.postcode].filter(Boolean).join(", ");
  return {
    ref: q.quotation_number,
    issued_date: formatUKDate(q.created_at),
    valid_until: formatUKDate(q.valid_until),
    project_title: q.title ?? "",
    client: {
      company: cust?.name ?? "",
      contact: cust?.contact_name ?? "",
      // Billing slot prefers the customer's address; falls back to the site
      // address so the Client block never renders empty when only one is set.
      address: billingAddress || siteAddr,
      email: cust?.contact_email ?? "",
      phone: cust?.contact_phone ?? "",
    },
    site: {
      name: q.sites?.name ?? "",
      address: siteAddr,
    },
    introduction: q.introduction ?? q.summary ?? "",
    scope: q.scope ?? [],
    items: (q.quotation_line_items ?? [])
      .filter((li) => !li.is_section)
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((li) => {
        const qty = li.quantity ?? 1;
        // CUSTOMER-FACING unit MUST be cost + markup + labour, never the
        // raw cost. The DB stores unit_price as the internal cost, with
        // markup_percent and labour_cost held alongside. Compute sell
        // here so the renderer never has to see the cost number.
        //   sell_unit = cost × (1 + markup/100)
        //   line_total = qty × sell_unit + labour_cost
        //   per-unit displayed = line_total / qty
        // Bundling labour into per-unit keeps the line total correct for
        // the rare case where labour_cost is also set on a material row.
        const cost = Number(li.unit_price ?? 0);
        const markupPct = Number(li.markup_percent ?? 0);
        const labour = Number(li.labour_cost ?? 0);
        const sellUnit = cost * (1 + markupPct / 100);
        const lineTotal = qty * sellUnit + labour;
        // Fallbacks for historical rows that stored only total_price.
        // total_price is trusted ONLY when no unit/markup data exists
        // — modern saves write the sell-side total but legacy rows
        // saved by the cost-side inventory flow may have qty×cost stored.
        let unit = qty > 0 ? lineTotal / qty : 0;
        if (unit <= 0 && Number(li.total_price ?? 0) > 0 && qty > 0) {
          unit = Number(li.total_price) / qty;
        }
        return { desc: li.description, qty, unit };
      }),
    assumptions: q.assumptions ?? [],
    exclusions: q.exclusions ?? [],
    // VAT is stored as whole-number percent (e.g. 20) per DB convention.
    // Pass through as-is — the docx/pdf renderers normalise to a fraction
    // and guard against out-of-range values.
    vat_rate: q.vat_rate ?? 20,
    quotation_id: q.id,
  };
}

export function useGenerateQuoteDocx() {
  return useMutation({
    mutationFn: async (q: QuotationFull) => {
      const { data, error } = await supabase.functions.invoke("generate-quote-docx", { body: quotationToQuoteInput(q) });
      if (error) throw error;
      return data as { storage_path: string; signed_url: string; expires_at: string; file_size_bytes: number };
    },
  });
}

export function useGenerateScope() {
  return useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      const { data, error } = await supabase.functions.invoke("generate-bs5839-scope", { body: input });
      if (error) throw error;
      return data as { introduction: string; scope: string[]; generation_id: string | null; usage: { input_tokens: number; output_tokens: number; model: string } };
    },
  });
}

export function useConvertQuotePdf() {
  return useMutation({
    mutationFn: async (payload: { docx_storage_path: string; quotation_id?: string }) => {
      const { data, error } = await supabase.functions.invoke("convert-quote-pdf", { body: payload });
      if (error) throw error;
      return data as { pdf_storage_path: string; signed_url: string; expires_at: string; file_size_bytes: number };
    },
  });
}

// Cache-first download helper. Both generate-quote-docx and convert-quote-pdf
// write back to quotations.latest_docx_path / latest_pdf_path after a
// successful render. When those paths exist on the row the download
// flow can serve the cached artifact directly — no edge function call,
// no Microsoft Graph conversion, just a signed URL straight from
// storage. QuotationDetailDialog.handleSave clears both paths on every
// save so this is only a cache hit when the quote really hasn't changed
// since the last render. accept-quotation does the same on customer
// accept so the next download picks up the new signature.
const QUOTE_OUTPUTS_BUCKET = "quote-outputs";
export async function getSignedQuoteFileUrl(
  storagePath: string,
  expirySeconds = 3600,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(QUOTE_OUTPUTS_BUCKET)
    .createSignedUrl(storagePath, expirySeconds);
  if (error) {
    // Missing-file / invalid-path / RLS-denied — caller should fall
    // back to regeneration rather than surface a hard error.
    console.warn("[getSignedQuoteFileUrl]", error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

export async function downloadSignedUrl(signedUrl: string, suggestedFilename: string): Promise<void> {
  const remoteUrl = new URL(signedUrl);
  remoteUrl.searchParams.set("download", suggestedFilename);
  const a = document.createElement("a");
  a.href = remoteUrl.toString();
  a.download = suggestedFilename;
  a.rel = "noopener";
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Single source of truth for "render a quotation PDF" from anywhere in the
// app: runs the master Word template through generate-quote-docx, converts
// it to PDF via convert-quote-pdf, fetches the bytes, and returns base64
// (suitable for email attachment or upload-to-sharepoint).
export async function renderQuotePdfBase64(q: QuotationFull): Promise<string> {
  const docxRes = await supabase.functions.invoke("generate-quote-docx", { body: quotationToQuoteInput(q) });
  if (docxRes.error) throw new Error(`Word generation failed: ${docxRes.error.message}`);
  const docxStoragePath = (docxRes.data as { storage_path?: string } | null)?.storage_path;
  if (!docxStoragePath) throw new Error("Word generator did not return a storage path");

  const pdfRes = await supabase.functions.invoke("convert-quote-pdf", {
    body: { docx_storage_path: docxStoragePath, quotation_id: q.id },
  });
  if (pdfRes.error) throw new Error(`PDF conversion failed: ${pdfRes.error.message}`);
  const signedUrl = (pdfRes.data as { signed_url?: string } | null)?.signed_url;
  if (!signedUrl) throw new Error("PDF converter did not return a signed URL");

  const fetchRes = await fetch(signedUrl);
  if (!fetchRes.ok) throw new Error(`Failed to download generated PDF: ${fetchRes.status}`);
  return blobToBase64(await fetchRes.blob());
}
