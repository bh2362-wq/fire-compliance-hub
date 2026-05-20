/**
 * Pull the 10 fire-alarm spec metadata fields from the most recent prior
 * quotation for a given site. Used by:
 *   - AIDefectQuoteDialog (auto-inherit on defect→quote creation)
 *   - QuotationDetailDialog "Inherit metadata from previous quote" button
 *
 * Fields that are NULL on every prior quote stay NULL — we never invent
 * defaults. Returns an empty object when there is no usable prior quote.
 */
import { supabase } from "@/integrations/supabase/client";

export const INHERITABLE_METADATA_FIELDS = [
  "building_type",
  "system_type",
  "system_manufacturer",
  "bs5839_category",
  "device_count",
  "loop_count",
  "gia_sqm",
  "region",
  "occupancy_type",
  "storeys",
] as const;

export type InheritableMetadataField = (typeof INHERITABLE_METADATA_FIELDS)[number];
export type InheritedMetadata = Partial<Record<InheritableMetadataField, unknown>>;

export interface InheritResult {
  values: InheritedMetadata;
  sourceQuotationNumber: string | null;
  fieldsFound: InheritableMetadataField[];
}

/**
 * Look up the most recent prior quotation on this site (optionally excluding
 * a specific quote id) and return any non-null values for the inheritable
 * fields. Walks back through history if the latest prior is all-NULL.
 */
export async function inheritMetadataFromPriorQuote(
  siteId: string,
  excludeQuoteId?: string,
): Promise<InheritResult> {
  const empty: InheritResult = { values: {}, sourceQuotationNumber: null, fieldsFound: [] };
  if (!siteId) return empty;

  let q = supabase
    .from("quotations")
    .select(`quotation_number, ${INHERITABLE_METADATA_FIELDS.join(", ")}` as "*")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (excludeQuoteId) q = q.neq("id", excludeQuoteId);

  const { data, error } = await q;
  if (error || !data || data.length === 0) return empty;

  // Pick the first prior quote that has at least one non-null inheritable field.
  for (const rowAny of data as unknown as Array<Record<string, unknown>>) {
    const values: InheritedMetadata = {};
    const fieldsFound: InheritableMetadataField[] = [];
    for (const field of INHERITABLE_METADATA_FIELDS) {
      const v = rowAny[field];
      if (v !== null && v !== undefined && v !== "") {
        values[field] = v;
        fieldsFound.push(field);
      }
    }
    if (fieldsFound.length > 0) {
      return {
        values,
        sourceQuotationNumber: (rowAny.quotation_number as string | null) ?? null,
        fieldsFound,
      };
    }
  }
  return empty;
}

/**
 * True when a quotation row is "thin" — i.e. all the inheritable metadata
 * fields are NULL/empty and the inherit-from-previous button is worth offering.
 */
export function isQuotationMetadataThin(row: Record<string, unknown> | null | undefined): boolean {
  if (!row) return false;
  return INHERITABLE_METADATA_FIELDS.every((f) => {
    const v = row[f];
    return v === null || v === undefined || v === "";
  });
}
