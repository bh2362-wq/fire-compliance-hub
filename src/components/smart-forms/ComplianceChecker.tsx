/**
 * ComplianceChecker
 *
 * Phase 3 — AI compliance review before the engineer signs off.
 *
 * Sits in the Preview step of any smart form cert. The engineer clicks
 * "Run Compliance Check", Claude audits the payload against the embedded
 * standard requirements, and returns structured flags with clause references.
 *
 * Results: ✓ pass (green) / ⚠ marginal (amber) / ✗ flag (red)
 *
 * Flags can be acknowledged with a note — creating an audit trail for
 * deliberate deviations. The cert can always be completed regardless
 * (engineer override) — this is an advisory tool, not a gatekeeper.
 *
 * Usage:
 *   <ComplianceChecker
 *     payload={payload}
 *     formType="bs5839_inspection_servicing"
 *     onChecked={(hasFlags) => setHasUnreviewedFlags(hasFlags)}
 *   />
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  ShieldCheck, ShieldAlert, ShieldX, ChevronDown, ChevronRight,
  Loader2, Sparkles, CheckCircle2, AlertTriangle, XCircle, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getCompliancePrompt, getCertLabel, ComplianceResult } from "@/lib/complianceRules";

// ── Types ─────────────────────────────────────────────────────────────────────
interface AcknowledgedFlag {
  item: string;
  note: string;
}

interface Props {
  payload: Record<string, unknown>;
  formType: string;
  onChecked?: (flagCount: number) => void;
}

// ── Result row component ───────────────────────────────────────────────────────
function ResultRow({
  result,
  index,
  acknowledged,
  onAcknowledge,
}: {
  result: ComplianceResult;
  index: number;
  acknowledged?: AcknowledgedFlag;
  onAcknowledge: (item: string, note: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote]         = useState(acknowledged?.note ?? "");

  const isFlag     = result.status === "flag";
  const isMarginal = result.status === "marginal";
  const isPass     = result.status === "pass";

  const styles = {
    flag:     { row: "border-red-500/30 bg-red-500/5",     badge: "bg-red-500/15 text-red-300 border-red-500/30",     Icon: XCircle,       iconCls: "text-red-400"    },
    marginal: { row: "border-amber-500/30 bg-amber-500/5", badge: "bg-amber-500/15 text-amber-300 border-amber-500/30", Icon: AlertTriangle,  iconCls: "text-amber-400"  },
    pass:     { row: "border-green-500/20 bg-green-500/4", badge: "bg-green-500/10 text-green-400 border-green-500/20", Icon: CheckCircle2,   iconCls: "text-green-500"  },
  }[result.status];

  return (
    <div
      className={cn(
        "rounded-lg border overflow-hidden transition-all",
        styles.row,
        "animate-in fade-in slide-in-from-bottom-1",
      )}
      style={{ animationDelay: `${index * 40}ms`, animationFillMode: "both" }}
    >
      <button
        type="button"
        onClick={() => !isPass && setExpanded(e => !e)}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 text-left",
          !isPass && "hover:bg-white/[0.03] cursor-pointer transition-colors",
          isPass && "cursor-default"
        )}
      >
        <styles.Icon className={cn("w-4 h-4 flex-shrink-0", styles.iconCls)} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white/85 leading-snug">{result.item}</p>
          {isPass && (
            <p className="text-xs text-white/40 mt-0.5 leading-snug">{result.detail}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 font-mono hidden sm:flex", styles.badge)}>
            {result.clause.replace("BS 5839-1:2025 ", "").replace("BS EN 54-20", "EN 54-20").replace("BS 5266-1:2016 ", "").replace("BS 9990:2015 ", "")}
          </Badge>
          {acknowledged && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500/30 bg-blue-500/10 text-blue-300">
              Acknowledged
            </Badge>
          )}
          {!isPass && (
            expanded ? <ChevronDown className="w-3.5 h-3.5 text-white/30" /> : <ChevronRight className="w-3.5 h-3.5 text-white/30" />
          )}
        </div>
      </button>

      {/* Expanded detail + acknowledgement */}
      {!isPass && expanded && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-white/[0.06]">
          <p className="text-xs text-white/60 leading-relaxed">{result.detail}</p>
          <p className="text-[10px] font-mono text-white/30">{result.clause}</p>

          {isFlag && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-white/50">
                Acknowledge this flag (optional — adds a note to the audit trail):
              </p>
              <div className="flex gap-2">
                <Textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Reason for proceeding despite this flag…"
                  className="text-xs h-16 bg-white/[0.04] border-white/10 text-white placeholder:text-white/20 resize-none"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-blue-500/30 text-blue-300 hover:bg-blue-500/10"
                onClick={() => { onAcknowledge(result.item, note); setExpanded(false); }}
              >
                <CheckCircle2 className="w-3 h-3 mr-1" />
                {acknowledged ? "Update acknowledgement" : "Acknowledge & continue"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export function ComplianceChecker({ payload, formType, onChecked }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [results, setResults]       = useState<ComplianceResult[]>([]);
  const [error, setError]           = useState<string>("");
  const [acknowledged, setAcknowledged] = useState<Record<string, AcknowledgedFlag>>({});
  const [showAll, setShowAll]       = useState(false);

  const flags     = results.filter(r => r.status === "flag");
  const marginals = results.filter(r => r.status === "marginal");
  const passes    = results.filter(r => r.status === "pass");

  const unacknowledgedFlags = flags.filter(f => !acknowledged[f.item]);

  async function runCheck() {
    setState("loading");
    setResults([]);
    setError("");
    setAcknowledged({});

    try {
      const systemPrompt = getCompliancePrompt(formType);

      // Sanitise payload — remove large blobs, truncate
      const cleanPayload = JSON.parse(JSON.stringify(payload, (key, val) => {
        // Drop base64 images / signatures
        if (typeof val === "string" && val.length > 2000) return `[${val.length} chars truncated]`;
        return val;
      }));

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{
            role: "user",
            content: `Review this ${getCertLabel(formType)} certificate payload:\n\n${JSON.stringify(cleanPayload, null, 2)}`,
          }],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`API error ${response.status}: ${err}`);
      }

      const data = await response.json();
      const text = (data.content ?? [])
        .filter((b: { type: string }) => b.type === "text")
        .map((b: { text: string }) => b.text)
        .join("");

      // Parse JSON — strip any accidental markdown fences
      const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed: ComplianceResult[] = JSON.parse(clean);

      // Sort: flags first, then marginals, then passes
      const sorted = [
        ...parsed.filter(r => r.status === "flag"),
        ...parsed.filter(r => r.status === "marginal"),
        ...parsed.filter(r => r.status === "pass"),
      ];

      setResults(sorted);
      setState("done");
      onChecked?.(sorted.filter(r => r.status === "flag").length);

    } catch (e) {
      console.error("Compliance check failed:", e);
      setError(e instanceof Error ? e.message : "Unknown error");
      setState("error");
    }
  }

  function acknowledge(item: string, note: string) {
    setAcknowledged(prev => ({ ...prev, [item]: { item, note } }));
    onChecked?.(unacknowledgedFlags.filter(f => f.item !== item).length);
  }

  // ── Idle state ─────────────────────────────────────────────────────────────
  if (state === "idle") {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-purple-500/15 flex-shrink-0">
            <Sparkles className="w-4 h-4 text-purple-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white/90">AI Compliance Check</p>
            <p className="text-xs text-white/45 mt-0.5 leading-snug">
              Reviews this certificate against {getCertLabel(formType).split(" ").slice(0, 3).join(" ")} requirements
              and flags anything that needs attention before you sign off.
            </p>
          </div>
        </div>
        <Button
          onClick={runCheck}
          className="w-full bg-purple-600/80 hover:bg-purple-600 text-white border-0"
          size="sm"
        >
          <ShieldCheck className="w-4 h-4 mr-2" />
          Run Compliance Check
        </Button>
      </div>
    );
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (state === "loading") {
    return (
      <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
        <div className="flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-purple-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-white/80">Checking certificate…</p>
            <p className="text-xs text-white/40 mt-0.5">Reviewing against {getCertLabel(formType)}</p>
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          {["Battery & standby power", "Device testing records", "Defects & status", "Documentation completeness"].map((item, i) => (
            <div
              key={item}
              className="flex items-center gap-2 text-xs text-white/30 animate-pulse"
              style={{ animationDelay: `${i * 200}ms` }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-purple-400/40" />
              {item}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (state === "error") {
    return (
      <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-300">Check failed</p>
            <p className="text-xs text-white/40 mt-0.5 break-all">{error}</p>
          </div>
        </div>
        <Button onClick={runCheck} variant="outline" size="sm" className="w-full border-white/10 text-white/60 hover:text-white">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
        </Button>
      </div>
    );
  }

  // ── Results ────────────────────────────────────────────────────────────────
  const statusIcon = flags.length > 0
    ? <ShieldX className="w-5 h-5 text-red-400 flex-shrink-0" />
    : marginals.length > 0
      ? <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0" />
      : <ShieldCheck className="w-5 h-5 text-green-500 flex-shrink-0" />;

  const summaryText = flags.length > 0
    ? `${flags.length} flag${flags.length !== 1 ? "s" : ""} — review before signing`
    : marginals.length > 0
      ? `${marginals.length} item${marginals.length !== 1 ? "s" : ""} to review`
      : "All checks passed";

  const summaryColor = flags.length > 0
    ? "border-red-500/25 bg-red-500/5"
    : marginals.length > 0
      ? "border-amber-500/25 bg-amber-500/5"
      : "border-green-500/20 bg-green-500/5";

  const visibleResults = showAll ? results : results.filter(r => r.status !== "pass");

  return (
    <div className="space-y-3">
      {/* Summary header */}
      <div className={cn("rounded-xl border p-3 flex items-center justify-between gap-3", summaryColor)}>
        <div className="flex items-center gap-3 min-w-0">
          {statusIcon}
          <div>
            <p className="text-sm font-semibold text-white/85">{summaryText}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {flags.length > 0 && (
                <span className="text-[11px] text-red-400">{flags.length} flag{flags.length !== 1 ? "s" : ""}</span>
              )}
              {marginals.length > 0 && (
                <span className="text-[11px] text-amber-400">{marginals.length} marginal</span>
              )}
              {passes.length > 0 && (
                <span className="text-[11px] text-white/35">{passes.length} passed</span>
              )}
              {Object.keys(acknowledged).length > 0 && (
                <span className="text-[11px] text-blue-400">{Object.keys(acknowledged).length} acknowledged</span>
              )}
            </div>
          </div>
        </div>
        <Button
          onClick={runCheck}
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-white/40 hover:text-white/70 flex-shrink-0"
          title="Re-run check"
        >
          <RefreshCw className="w-3 h-3" />
        </Button>
      </div>

      {/* Results list */}
      <div className="space-y-1.5">
        {visibleResults.map((result, i) => (
          <ResultRow
            key={result.item}
            result={result}
            index={i}
            acknowledged={acknowledged[result.item]}
            onAcknowledge={acknowledge}
          />
        ))}
      </div>

      {/* Show/hide passes toggle */}
      {passes.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(s => !s)}
          className="w-full text-xs text-white/30 hover:text-white/50 transition-colors py-1 flex items-center justify-center gap-1"
        >
          {showAll
            ? <><ChevronDown className="w-3 h-3" /> Hide {passes.length} passed checks</>
            : <><ChevronRight className="w-3 h-3" /> Show {passes.length} passed checks</>}
        </button>
      )}

      {/* Unacknowledged flags warning */}
      {unacknowledgedFlags.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/8 border border-red-500/20 text-xs text-red-300">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-red-400" />
          <span>
            {unacknowledgedFlags.length} flag{unacknowledgedFlags.length !== 1 ? "s" : ""} not yet acknowledged.
            Expand each to review and acknowledge, or proceed — your choice.
          </span>
        </div>
      )}

      {/* All clear */}
      {flags.length === 0 && marginals.length === 0 && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-green-500/8 border border-green-500/20 text-sm text-green-300">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          Certificate meets all checked requirements — safe to sign off.
        </div>
      )}
    </div>
  );
}
