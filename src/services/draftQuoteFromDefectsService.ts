import { supabase } from "@/integrations/supabase/client";
import { updateDefect } from "./defectService";
import type { DefectAnalysis } from "@/features/serviceReport/useLiveDefectAnalysis";

interface CreateDraftQuoteArgs {
  analysis: DefectAnalysis;
  siteId: string;
  visitId: string;
  reportId: string;
  customerId: string | null;
  userId: string;
  siteName: string;
}

/**
 * Convert an in-flight AI defect analysis into a persisted draft quotation:
 *   1. Get a fresh quotation_number from the RPC.
 *   2. Insert the quotations row (status="draft", works_type="reactive_remedial").
 *   3. Insert one quotation_line_items row per detected part + one labour
 *      line per defect (grouped under a section header per defect).
 *   4. Mark each LOGGED site_defect with status="quoted" and quotation_id
 *      pointing at the new quote.
 *
 * Returns the new quotation id + number. Failure of step 4 doesn't roll
 * back the quote — the office can manually link defects later.
 */
export async function createDraftQuoteFromAnalysis({
  analysis,
  siteId,
  visitId,
  reportId,
  customerId,
  userId,
  siteName,
}: CreateDraftQuoteArgs): Promise<{ id: string; quotation_number: string }> {
  const { data: numberData, error: numberErr } = await supabase.rpc("get_next_quotation_number");
  if (numberErr) throw new Error(`Could not generate quotation number: ${numberErr.message}`);
  const quotationNumber = String(numberData);

  const { data: quote, error: quoteErr } = await supabase
    .from("quotations")
    .insert({
      quotation_number: quotationNumber,
      site_id: siteId,
      customer_id: customerId,
      visit_id: visitId,
      report_id: reportId,
      created_by: userId,
      status: "draft",
      works_type: "reactive_remedial",
      title: `Remedial works — ${siteName}`,
      introduction: analysis.scope_introduction,
      scope: analysis.defects.map((d) => d.scope_note).filter(Boolean),
      total_amount: analysis.totals.subtotal,
      show_section_subtotals: true,
      vat_rate: 20,
      summary: `Auto-drafted from AI analysis of visit ${visitId.slice(0, 8)}. ${analysis.defects.length} defect${analysis.defects.length === 1 ? "" : "s"} detected.`,
    })
    .select("id, quotation_number")
    .single();
  if (quoteErr || !quote) {
    throw new Error(`Could not create quotation: ${quoteErr?.message ?? "unknown error"}`);
  }

  // Build line items grouped by defect. Each defect produces one section row
  // (is_section=true) followed by its parts + labour lines as children.
  const lineItems: Array<{
    quotation_id: string;
    description: string;
    is_section: boolean;
    parent_id: string | null;
    sort_order: number;
    quantity?: number;
    unit_price?: number;
    total_price?: number;
    source_type?: string;
    title?: string;
    item_name?: string;
    labour_included?: boolean;
    labour_cost?: number;
  }> = [];

  for (let i = 0; i < analysis.defects.length; i++) {
    const d = analysis.defects[i];
    // Section header for the defect — inserted standalone so we can capture
    // its server-side id and parent the children to it in pass 2.
    lineItems.push({
      quotation_id: quote.id,
      description: d.description,
      title: `Cat ${d.category} — ${d.location ?? "Site-wide"}`,
      is_section: true,
      parent_id: null,
      sort_order: i * 100,
      source_type: "ai_defect_analysis",
    });
  }

  // Insert sections first so we have parent ids for the part / labour lines.
  const { data: sections, error: sectionsErr } = await supabase
    .from("quotation_line_items")
    .insert(lineItems)
    .select("id, sort_order");
  if (sectionsErr || !sections) {
    throw new Error(`Could not create section rows: ${sectionsErr?.message ?? "unknown error"}`);
  }

  // Pair each defect with its section's id by sort_order (which we set above).
  const sortedSections = [...sections].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const children: typeof lineItems = [];
  for (let i = 0; i < analysis.defects.length; i++) {
    const d = analysis.defects[i];
    const parentId = sortedSections[i]?.id;
    if (!parentId) continue;
    let childOrder = 1;
    for (const p of d.suggested_parts) {
      children.push({
        quotation_id: quote.id,
        parent_id: parentId,
        is_section: false,
        description: p.description,
        item_name: p.part_number,
        quantity: p.qty,
        unit_price: p.unit_price,
        total_price: p.qty * p.unit_price,
        sort_order: i * 100 + childOrder++,
        source_type: p.catalog_match ? "ai_catalog" : "ai_estimate",
      });
    }
    if (d.labour_hours > 0) {
      children.push({
        quotation_id: quote.id,
        parent_id: parentId,
        is_section: false,
        description: `Engineer labour — ${d.labour_hours.toFixed(2)} hr`,
        item_name: "LABOUR",
        quantity: d.labour_hours,
        unit_price: d.labour_cost / d.labour_hours,
        total_price: d.labour_cost,
        labour_included: true,
        labour_cost: d.labour_cost,
        sort_order: i * 100 + childOrder++,
        source_type: "ai_labour_estimate",
      });
    }
  }

  if (children.length > 0) {
    const { error: childErr } = await supabase.from("quotation_line_items").insert(children);
    if (childErr) {
      console.error("Failed to insert child line items (quote already created):", childErr);
    }
  }

  // Best-effort: mark each LOGGED defect as quoted + linked. Don't roll back
  // the quote if this fails (the office can re-link manually).
  for (const d of analysis.defects) {
    if (d.source === "logged" && d.source_defect_id) {
      try {
        await updateDefect(d.source_defect_id, {
          status: "quoted",
          quotation_id: quote.id,
        });
      } catch (e) {
        console.error(`Failed to link defect ${d.source_defect_id} to quote:`, e);
      }
    }
  }

  return { id: quote.id, quotation_number: quote.quotation_number };
}
