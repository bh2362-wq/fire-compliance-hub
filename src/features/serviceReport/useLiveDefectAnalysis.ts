import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ServiceReport } from "@/services/serviceReportService";
import type { SiteDefect } from "@/services/defectService";

export interface AnalyzedDefect {
  description: string;
  category: 1 | 2 | 3;
  location: string | null;
  source: "logged" | "extracted";
  source_defect_id: string | null;
  suggested_parts: Array<{
    part_number: string;
    description: string;
    qty: number;
    unit_price: number;
    catalog_match: boolean;
  }>;
  labour_hours: number;
  labour_cost: number;
  scope_note: string;
  subtotal: number;
}

export interface DefectAnalysis {
  defects: AnalyzedDefect[];
  scope_introduction: string;
  totals: { parts: number; labour: number; subtotal: number };
  content_hash: string;
  generated_at: number;
}

export interface UseLiveDefectAnalysisOptions {
  enabled: boolean;
  /** Debounce ms before kicking the edge function after the last change. */
  debounceMs?: number;
  /** Soft cap on AI calls per mounted hook instance to keep runaway costs at bay. */
  maxRuns?: number;
}

interface AnalysisState {
  analysis: DefectAnalysis | null;
  loading: boolean;
  error: Error | null;
  runs: number;
  paused: boolean;
}

// Stable content-hash over the inputs that meaningfully change the AI's
// answer. We include free-text fields + the defects array (id + description
// + category). Anything else (timestamps, signatures, etc.) is ignored so we
// don't re-fire on every keystroke that touches an unrelated column.
function buildContentHash(
  report: Pick<
    ServiceReport,
    "recommendations" | "defects_found" | "system_condition" | "work_carried_out" | "notes"
  >,
  defects: SiteDefect[],
): string {
  const payload = JSON.stringify({
    r: report.recommendations ?? "",
    df: report.defects_found ?? "",
    sc: report.system_condition ?? "",
    wc: report.work_carried_out ?? "",
    n: report.notes ?? "",
    d: defects
      .map((d) => `${d.id}|${d.category}|${d.description}|${d.location ?? ""}`)
      .sort()
      .join("§"),
  });
  // FNV-1a 32-bit — cheap, stable, no crypto dependency.
  let h = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16);
}

// Cheap "is this worth analysing at all" gate — avoids burning AI calls on
// empty / near-empty reports.
function hasMeaningfulInput(
  report: Pick<
    ServiceReport,
    "recommendations" | "defects_found" | "system_condition" | "work_carried_out" | "notes"
  >,
  defects: SiteDefect[],
): boolean {
  if (defects.length > 0) return true;
  const total =
    (report.recommendations?.length ?? 0) +
    (report.defects_found?.length ?? 0) +
    (report.system_condition?.length ?? 0) +
    (report.work_carried_out?.length ?? 0) +
    (report.notes?.length ?? 0);
  return total >= 20;
}

/**
 * Watches the free-text fields + logged defects on a BS 5839 report and,
 * after a quiet period, calls the analyze-bs5839-defects edge function to
 * produce a structured remedial register + draft quote payload.
 *
 * Cost discipline:
 *   - Debounced (default 5s) so rapid typing collapses to one call.
 *   - Content-hashed: re-renders with no meaningful change don't fire.
 *   - maxRuns soft cap (default 8) so a stuck editor can't burn credit.
 *   - Skips when there's clearly nothing to analyse yet.
 *
 * Returns the latest analysis (or null), loading + error state, a paused
 * flag the UI can flip to stop further runs, and a manual refresh() escape
 * hatch for re-running on demand.
 */
export function useLiveDefectAnalysis(
  report: ServiceReport | null,
  defects: SiteDefect[],
  site: { name: string; address?: string | null; occupancy_type?: string | null },
  options: UseLiveDefectAnalysisOptions,
): AnalysisState & { refresh: () => void; setPaused: (v: boolean) => void } {
  const { enabled, debounceMs = 5000, maxRuns = 8 } = options;
  const [state, setState] = useState<AnalysisState>({
    analysis: null,
    loading: false,
    error: null,
    runs: 0,
    paused: false,
  });
  const lastHashRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const contentHash = useMemo(() => {
    if (!report) return null;
    return buildContentHash(report, defects);
  }, [report, defects]);

  const runAnalysis = useCallback(async () => {
    if (!report || !contentHash) return;
    if (state.runs >= maxRuns) {
      setState((s) => ({
        ...s,
        error: new Error(`AI analysis cap reached (${maxRuns} runs). Press Refresh to retry.`),
      }));
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { data, error } = await supabase.functions.invoke("analyze-bs5839-defects", {
        body: {
          report_id: report.id,
          site: {
            name: site.name,
            address: site.address ?? null,
            occupancy_type: site.occupancy_type ?? null,
            bs5839_category: null,
            system_type: report.system_type,
            panel_manufacturer: report.panel_manufacturer,
          },
          defects: defects.map((d) => ({
            id: d.id,
            description: d.description,
            location: d.location,
            category: d.category,
          })),
          free_text: {
            recommendations: report.recommendations,
            defects_found: report.defects_found,
            system_condition: report.system_condition,
            work_carried_out: report.work_carried_out,
            notes: report.notes,
          },
          content_hash: contentHash,
        },
      });

      if (error) throw new Error(error.message);
      if (!data || data.error) throw new Error(data?.error ?? "AI analysis failed");

      setState((s) => ({
        ...s,
        loading: false,
        runs: s.runs + 1,
        analysis: {
          defects: data.defects ?? [],
          scope_introduction: data.scope_introduction ?? "",
          totals: data.totals ?? { parts: 0, labour: 0, subtotal: 0 },
          content_hash: data.content_hash ?? contentHash,
          generated_at: Date.now(),
        },
      }));
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setState((s) => ({ ...s, loading: false, error: e as Error }));
    }
  }, [report, defects, site, contentHash, maxRuns, state.runs]);

  // Schedule a debounced run whenever the content hash changes.
  useEffect(() => {
    if (!enabled || state.paused) return;
    if (!report || !contentHash) return;
    if (!hasMeaningfulInput(report, defects)) return;
    if (lastHashRef.current === contentHash) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      lastHashRef.current = contentHash;
      void runAnalysis();
    }, debounceMs);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [enabled, state.paused, contentHash, report, defects, debounceMs, runAnalysis]);

  // Cleanup any in-flight call on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const refresh = useCallback(() => {
    // Force a re-run even when the hash hasn't changed.
    lastHashRef.current = null;
    setState((s) => ({ ...s, runs: 0, error: null }));
    void runAnalysis();
  }, [runAnalysis]);

  const setPaused = useCallback((v: boolean) => {
    setState((s) => ({ ...s, paused: v }));
  }, []);

  return { ...state, refresh, setPaused };
}
