import { useCallback, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// ── Public types ──────────────────────────────────────────────────────────────

export type WorkItemSource = "defect" | "email" | "manual";

export interface WorkItem {
  description: string;
  location?: string | null;
  urgency?: string | null;
  source: WorkItemSource;
}

export interface QuoteGenerationContext {
  siteName: string;
  buildingType?: string | null;
  sitePostcode?: string | null;
}

export interface CostLine {
  description: string;
  quantity: number;
  unit_price: number;
  notes: string;
  regulation_reference?: string;
}

export interface CategorisedLineItems {
  labour: CostLine[];
  materials: CostLine[];
  extras: CostLine[];
}

export type GenerationStatus = "idle" | "generating" | "ready" | "error";

// Insert payload shape for quotation_line_items. Mirrors the DB schema fields
// the hook actually writes; the rest accept their DB defaults.
export interface QuotationLineItemInsert {
  quotation_id: string;
  is_section: boolean;
  title?: string | null;
  description: string;
  quantity?: number;
  unit_price?: number;
  cost_price?: number;
  labour_cost?: number;
  labour_included?: boolean;
  total_price?: number;
  notes?: string | null;
  regulation_reference?: string | null;
  sort_order: number;
  parent_id?: string | null;
  source_type?: string | null;
}

// ── Adapters (normalise the three input paths) ────────────────────────────────

interface DefectLike {
  description: string;
  location?: string | null;
  category?: number | null; // 1 | 2 | 3
}

export function defectsToWorkItems(defects: DefectLike[]): WorkItem[] {
  const urgencyForCat = (c: number | null | undefined) =>
    c === 1 ? "Cat1-Immediate" : c === 2 ? "Cat2-Urgent" : "Cat3-Advisory";
  return defects
    .slice()
    .sort((a, b) => (a.category ?? 9) - (b.category ?? 9))
    .map((d) => ({
      description: d.description,
      location: d.location ?? null,
      urgency: urgencyForCat(d.category),
      source: "defect" as const,
    }));
}

interface EmailExtractedItem {
  description: string;
  location?: string | null;
  quantity?: number;
}

export function emailItemsToWorkItems(items: EmailExtractedItem[]): WorkItem[] {
  return items.map((i) => ({
    description: i.quantity && i.quantity > 1 ? `${i.quantity} x ${i.description}` : i.description,
    location: i.location ?? null,
    urgency: null,
    source: "email" as const,
  }));
}

// ── Hook ──────────────────────────────────────────────────────────────────────

const EMPTY_BUCKETS: CategorisedLineItems = { labour: [], materials: [], extras: [] };

export function useQuoteGeneration() {
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [scopeContent, setScopeContent] = useState<string>("");
  const [lineItems, setLineItems] = useState<CategorisedLineItems>(EMPTY_BUCKETS);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setScopeContent("");
    setLineItems(EMPTY_BUCKETS);
  }, []);

  const generate = useCallback(async (ctx: QuoteGenerationContext, workItems: WorkItem[]) => {
    if (workItems.length === 0) {
      setError("No work items to generate from");
      setStatus("error");
      return;
    }
    setStatus("generating");
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("generate-quote-scope-costs", {
        body: {
          site_name: ctx.siteName,
          building_type: ctx.buildingType ?? null,
          site_postcode: ctx.sitePostcode ?? null,
          work_items: workItems,
        },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (!data || typeof data.scope_content !== "string" || !data.line_items) {
        throw new Error("Edge function returned an unexpected shape");
      }
      setScopeContent(data.scope_content);
      setLineItems({
        labour:    Array.isArray(data.line_items.labour)    ? data.line_items.labour    : [],
        materials: Array.isArray(data.line_items.materials) ? data.line_items.materials : [],
        extras:    Array.isArray(data.line_items.extras)    ? data.line_items.extras    : [],
      });
      setStatus("ready");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Quote generation failed";
      setError(msg);
      setStatus("error");
    }
  }, []);

  // Convert the edited buckets into rows for quotation_line_items.
  //
  // No section divider rows emitted — the user wants the pricing table to
  // contain ONLY real costed rows. Bucket grouping is implicit from item
  // content (a labour day vs a device name vs a surcharge).
  const toLineItemRows = useCallback(
    (quotationId: string): QuotationLineItemInsert[] => {
      const rows: QuotationLineItemInsert[] = [];
      let sort = 0;

      const pushBucket = (_title: string, items: CostLine[], isLabour: boolean) => {
        if (items.length === 0) return;
        for (const item of items) {
          const qty = Number(item.quantity) || 1;
          const unit = Number(item.unit_price) || 0;
          // For labour rows the price lives in labour_cost ONLY — keeping
          // unit_price at 0 prevents the same value appearing in both the
          // "Cost £" and "Labour £" inputs of the detail dialog, where
          // editing one looked like the other had reverted. For non-labour
          // rows the price lives in unit_price (and cost_price mirrors it
          // pre-markup).
          // total_price is computed here so the parent quote's total_amount
          // is correct on insert — the DB default of 0 used to leave new
          // quotes showing £0 until something re-saved each line.
          rows.push({
            quotation_id: quotationId,
            is_section: false,
            description: item.description,
            quantity: qty,
            unit_price: isLabour ? 0 : unit,
            cost_price: isLabour ? 0 : unit,
            labour_cost: isLabour ? unit : 0,
            labour_included: isLabour,
            total_price: qty * unit,
            notes: item.notes || null,
            regulation_reference: item.regulation_reference || null,
            sort_order: sort++,
          });
        }
      };

      pushBucket("Labour",    lineItems.labour,    true);
      pushBucket("Materials", lineItems.materials, false);
      pushBucket("Extras",    lineItems.extras,    false);

      return rows;
    },
    [lineItems],
  );

  const totals = useMemo(() => {
    const sumBucket = (items: CostLine[]) =>
      items.reduce((s, i) => s + (Number(i.quantity) || 1) * (Number(i.unit_price) || 0), 0);
    const labour    = sumBucket(lineItems.labour);
    const materials = sumBucket(lineItems.materials);
    const extras    = sumBucket(lineItems.extras);
    return { labour, materials, extras, exVat: labour + materials + extras };
  }, [lineItems]);

  return {
    status,
    error,
    scopeContent,
    setScopeContent,
    lineItems,
    setLineItems,
    generate,
    reset,
    toLineItemRows,
    totals,
  };
}
