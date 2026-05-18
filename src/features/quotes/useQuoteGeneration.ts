import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface QuotationFull {
  id: string;
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
  customers: { name: string; contact_name: string | null; contact_email: string | null; address: string | null; city: string | null; postcode: string | null } | null;
  sites: { name: string; address: string | null; city: string | null; postcode: string | null } | null;
  quotation_line_items: { description: string; quantity: number | null; unit_price: number | null; sort_order: number | null }[];
}

export function useQuotationFull(quotationId: string | undefined) {
  return useQuery({
    queryKey: ["quotation-full", quotationId],
    enabled: !!quotationId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("quotations")
        .select(`
          *,
          customers ( name, contact_name, contact_email, address, city, postcode ),
          sites ( name, address, city, postcode ),
          quotation_line_items ( description, quantity, unit_price, sort_order )
        `)
        .eq("id", quotationId)
        .single();
      if (error) throw error;
      return data as unknown as QuotationFull;
    },
  });
}

function formatUKDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function siteAddress(s: QuotationFull["sites"]): string {
  if (!s) return "";
  return [s.name, s.address, s.city, s.postcode].filter(Boolean).join(", ");
}

export function quotationToQuoteInput(q: QuotationFull) {
  return {
    ref: q.quotation_number,
    issued_date: formatUKDate(q.created_at),
    valid_until: formatUKDate(q.valid_until),
    project_title: q.title ?? "",
    client: {
      company: q.customers?.name ?? "",
      contact: q.customers?.contact_name ?? "",
      address: siteAddress(q.sites),
    },
    introduction: q.introduction ?? q.summary ?? "",
    scope: q.scope ?? [],
    items: (q.quotation_line_items ?? [])
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((li) => ({ desc: li.description, qty: li.quantity ?? 1, unit: li.unit_price ?? 0 })),
    assumptions: q.assumptions ?? [],
    exclusions: q.exclusions ?? [],
    vat_rate: q.vat_rate ?? 0.20,
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

export async function downloadSignedUrl(signedUrl: string, suggestedFilename: string): Promise<void> {
  const res = await fetch(signedUrl);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedFilename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
