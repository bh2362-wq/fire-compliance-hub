import { supabase } from "@/integrations/supabase/client";

/**
 * Duplicate a quotation onto a (possibly different) site/customer.
 *
 * - Copies content fields, metadata fields, and ALL line items (including
 *   sections, parent_id chains and merged_from references — remapped to the
 *   newly-generated line item UUIDs).
 * - Resets status / lifecycle / generated-artifact fields so the duplicate
 *   is a clean draft.
 * - The source quotation is never modified.
 *
 * Returns the new quotation's id and quotation_number.
 */
export async function duplicateQuotation(params: {
  sourceQuotationId: string;
  targetSiteId: string;
  targetCustomerId: string | null;
  currentUserId: string;
}): Promise<{ id: string; quotation_number: string }> {
  const { sourceQuotationId, targetSiteId, targetCustomerId, currentUserId } = params;

  // 1. Fetch source quotation
  const { data: source, error: srcErr } = await supabase
    .from("quotations")
    .select("*")
    .eq("id", sourceQuotationId)
    .single();
  if (srcErr || !source) throw srcErr || new Error("Source quotation not found");

  // 2. Fetch source line items
  const { data: sourceItems, error: itemsErr } = await supabase
    .from("quotation_line_items")
    .select("*")
    .eq("quotation_id", sourceQuotationId)
    .order("sort_order");
  if (itemsErr) throw itemsErr;

  // 3. Get a fresh quotation number via DB function
  const { data: numRow, error: numErr } = await supabase.rpc("get_next_quotation_number");
  if (numErr || !numRow) throw numErr || new Error("Failed to generate quotation number");
  const newQuotationNumber = numRow as unknown as string;

  // 4. Build new quotation row (copy content + metadata, reset lifecycle)
  const sourceRef = source.quotation_number;
  const baseTitle = (source.title || "Untitled").trim();
  const newTitle = baseTitle.toLowerCase().endsWith("(copy)") ? baseTitle : `${baseTitle} (copy)`;

  const newQuoteInsert: Record<string, unknown> = {
    quotation_number: newQuotationNumber,
    site_id: targetSiteId,
    customer_id: targetCustomerId,
    status: "draft",
    title: newTitle,
    summary: source.summary,
    introduction: source.introduction,
    scope: source.scope ?? [],
    assumptions: source.assumptions ?? [],
    exclusions: source.exclusions ?? [],
    terms: source.terms,
    vat_rate: source.vat_rate ?? 20,
    valid_until: null,
    notes: `Duplicated from ${sourceRef}`,

    // Classification / metadata
    works_type: source.works_type,
    job_category: source.job_category,
    system_type: source.system_type,
    building_type: source.building_type,
    system_manufacturer: source.system_manufacturer,
    system_panel: source.system_panel,
    bs5839_category: source.bs5839_category,
    device_count: source.device_count,
    loop_count: source.loop_count,
    gia_sqm: source.gia_sqm,
    region: source.region,
    occupancy_type: source.occupancy_type,
    storeys: source.storeys,
    system_features: source.system_features ?? {},
    device_counts_detail: source.device_counts_detail ?? {},
    existing_system_description: source.existing_system_description,
    show_section_subtotals: source.show_section_subtotals ?? false,

    // Audit
    created_by: currentUserId,

    // Explicitly NOT carried over: report_id, visit_id, po_number,
    // sharepoint_folder, sharepoint_url, latest_docx_path, latest_pdf_path,
    // generated_files, locked_at, locked_by, accepted_by_name,
    // client_acceptance_signature, client_accepted_at, client_po_number,
    // site_visit_date — these are all per-quote lifecycle artefacts.
    generated_files: [],
  };

  const { data: newQuote, error: insErr } = await supabase
    .from("quotations")
    .insert(newQuoteInsert as any)
    .select("id, quotation_number")
    .single();
  if (insErr || !newQuote) throw insErr || new Error("Failed to insert duplicate quotation");

  // 5. Duplicate line items with remapped ids
  if (sourceItems && sourceItems.length > 0) {
    const idMap = new Map<string, string>();
    for (const item of sourceItems) {
      idMap.set(item.id, crypto.randomUUID());
    }

    const remapMergedFrom = (mf: unknown): unknown => {
      if (mf == null) return null;
      if (Array.isArray(mf)) {
        return mf.map((entry) => {
          if (typeof entry === "string") return idMap.get(entry) ?? entry;
          if (entry && typeof entry === "object") {
            const obj: Record<string, unknown> = { ...(entry as Record<string, unknown>) };
            if (typeof obj.id === "string" && idMap.has(obj.id)) obj.id = idMap.get(obj.id);
            if (typeof obj.line_item_id === "string" && idMap.has(obj.line_item_id)) {
              obj.line_item_id = idMap.get(obj.line_item_id);
            }
            return obj;
          }
          return entry;
        });
      }
      return mf;
    };

    const newItems = sourceItems.map((item) => ({
      id: idMap.get(item.id)!,
      quotation_id: newQuote.id,
      description: item.description,
      regulation_reference: item.regulation_reference,
      priority: item.priority,
      source_type: item.source_type,
      source_section: item.source_section,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.total_price,
      notes: item.notes,
      sort_order: item.sort_order,
      item_name: item.item_name,
      parent_id: item.parent_id ? idMap.get(item.parent_id) ?? null : null,
      labour_cost: item.labour_cost,
      cost_price: item.cost_price,
      markup_percent: item.markup_percent,
      labour_included: item.labour_included,
      is_section: item.is_section,
      title: item.title,
      merged_from: remapMergedFrom(item.merged_from),
    }));

    // Insert sections / parents first to satisfy parent_id FK, then children.
    const parents = newItems.filter((i) => !i.parent_id);
    const children = newItems.filter((i) => i.parent_id);

    if (parents.length > 0) {
      const { error: pErr } = await supabase.from("quotation_line_items").insert(parents as any);
      if (pErr) throw pErr;
    }
    if (children.length > 0) {
      const { error: cErr } = await supabase.from("quotation_line_items").insert(children as any);
      if (cErr) throw cErr;
    }
  }

  // 6. Recalculate total_amount from inserted items (DB doesn't auto-sum)
  const total = (sourceItems || [])
    .filter((i) => !i.is_section)
    .reduce((sum, i) => sum + Number(i.total_price || 0), 0);
  await supabase.from("quotations").update({ total_amount: total }).eq("id", newQuote.id);

  return { id: newQuote.id, quotation_number: newQuote.quotation_number };
}
