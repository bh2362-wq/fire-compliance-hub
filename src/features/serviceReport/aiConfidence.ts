import type { AnalyzedDefect } from "./useLiveDefectAnalysis";

export type ConfidenceLevel = "high" | "medium" | "low";

// Reasonable price band for a single fire-alarm part (GBP). Anything
// outside this gets a confidence demotion — gemini sometimes prices
// detectors at £0.50 or £5,000.
const PRICE_SANITY_MIN = 5;
const PRICE_SANITY_MAX = 1500;

// Typical fire-alarm part-number shapes — manufacturer prefixes + 3+ digits,
// or our "EST-*" sentinel for AI estimates. Catches most Apollo, Hochiki,
// Notifier, C-Tec, Advanced and Morley parts.
const PART_NUMBER_PATTERN = /^([A-Z]{2,5}[-/]?[A-Z0-9]{2,}|EST-[A-Z0-9-]{2,})$/i;

export interface PartConfidence {
  level: ConfidenceLevel;
  reason: string;
}

/**
 * Rule-based confidence for a single suggested part. Catalog matches with
 * a reasonable price + sensible part-number shape go high; AI estimates
 * or anything with funny pricing go medium/low. Reasons are user-facing
 * tooltips in the panel.
 */
export function scorePart(
  part: AnalyzedDefect["suggested_parts"][number],
): PartConfidence {
  const priceOk = part.unit_price >= PRICE_SANITY_MIN && part.unit_price <= PRICE_SANITY_MAX;
  const partNumberOk = PART_NUMBER_PATTERN.test(part.part_number.trim());

  if (part.catalog_match && priceOk && partNumberOk) {
    return { level: "high", reason: "Catalog match with sensible part number and price." };
  }
  if (part.catalog_match && (!priceOk || !partNumberOk)) {
    return {
      level: "medium",
      reason: !priceOk
        ? `Catalog match but price (${part.unit_price}) looks unusual — verify before sending.`
        : "Catalog match but part number format is unusual — verify before sending.",
    };
  }
  if (!part.catalog_match && partNumberOk && priceOk) {
    return {
      level: "medium",
      reason: "AI estimate (no catalog row). Part-number shape + price look plausible — still verify.",
    };
  }
  return {
    level: "low",
    reason: "AI estimate with unusual part number or price. Verify manually before quoting.",
  };
}

/** Roll part confidences up to a defect-level confidence — lowest wins. */
export function scoreDefect(defect: AnalyzedDefect): ConfidenceLevel {
  if (defect.suggested_parts.length === 0) return "high"; // labour-only is reliable
  const levels = defect.suggested_parts.map((p) => scorePart(p).level);
  if (levels.includes("low")) return "low";
  if (levels.includes("medium")) return "medium";
  return "high";
}

export function countNonHighParts(defects: AnalyzedDefect[]): number {
  let n = 0;
  for (const d of defects) {
    for (const p of d.suggested_parts) {
      if (scorePart(p).level !== "high") n++;
    }
  }
  return n;
}

export const CONFIDENCE_COLOURS: Record<ConfidenceLevel, string> = {
  high: "bg-emerald-500",
  medium: "bg-amber-500",
  low: "bg-red-500",
};

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  high: "High confidence",
  medium: "Medium confidence — verify",
  low: "Low confidence — manually check",
};
