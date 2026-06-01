import { supabase } from "@/integrations/supabase/client";

// Gemini 2.5 Flash list pricing as of 2026-01 (Lovable gateway invoices in
// USD; we apply a simple USD→GBP at runtime). If pricing changes, update
// these two constants — the rest of the meter is unitless.
const GEMINI_FLASH_INPUT_USD_PER_MTOK = 0.075;
const GEMINI_FLASH_OUTPUT_USD_PER_MTOK = 0.30;
const USD_TO_GBP = 0.79; // rough — meter is informational, not invoice-grade

export interface AiUsageSnapshot {
  /** Sum of GBP spent on analyze-bs5839-defects by this user today. */
  spentTodayGbp: number;
  /** Run count today (used for the hard cap). */
  runsToday: number;
  /** Cap above which the hook refuses to fire today. */
  dailyRunCap: number;
}

export const DAILY_RUN_CAP = 20;

export function tokensToGbp(inputTokens: number, outputTokens: number): number {
  const usd =
    (inputTokens / 1_000_000) * GEMINI_FLASH_INPUT_USD_PER_MTOK +
    (outputTokens / 1_000_000) * GEMINI_FLASH_OUTPUT_USD_PER_MTOK;
  return usd * USD_TO_GBP;
}

/**
 * Count today's analyze-bs5839-defects runs by the current user + sum
 * approximate cost. Cheap one-shot query against the existing
 * scope_generations audit table — no migration needed.
 *
 * Returns { spentTodayGbp: 0, runsToday: 0 } if the user is signed-out
 * or the query fails — better to gracefully degrade than block the AI
 * flow on a meter glitch.
 */
export async function getTodaysAnalysisUsage(): Promise<AiUsageSnapshot> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      return { spentTodayGbp: 0, runsToday: 0, dailyRunCap: DAILY_RUN_CAP };
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from("scope_generations")
      .select("tokens_input, tokens_output, inputs")
      .eq("generated_by", userId)
      .gte("created_at", todayStart.toISOString())
      .limit(500);

    if (!data) {
      return { spentTodayGbp: 0, runsToday: 0, dailyRunCap: DAILY_RUN_CAP };
    }

    // We only meter analyze-bs5839-defects runs — scope writes from the
    // standard quote builder shouldn't pollute the count.
    const ours = data.filter((row) => {
      const kind = (row.inputs as { kind?: string } | null)?.kind;
      return kind === "analyze-bs5839-defects";
    });

    const spent = ours.reduce(
      (sum, r) => sum + tokensToGbp(r.tokens_input ?? 0, r.tokens_output ?? 0),
      0,
    );

    return { spentTodayGbp: spent, runsToday: ours.length, dailyRunCap: DAILY_RUN_CAP };
  } catch {
    return { spentTodayGbp: 0, runsToday: 0, dailyRunCap: DAILY_RUN_CAP };
  }
}

export function formatGBP(n: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: n < 1 ? 3 : 2,
    maximumFractionDigits: n < 1 ? 3 : 2,
  }).format(n || 0);
}
