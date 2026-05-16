/**
 * AutoQuoteReview.tsx
 *
 * Shows auto-generated quotes that need review:
 * - "Run Now" button to trigger the email scanner
 * - Jobs needing disambiguation (user picks the right product)
 * - Completed jobs with links to the draft quotation
 */

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Sparkles, CheckCircle2, AlertTriangle,
  ChevronRight, RefreshCw, Mail, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

interface DisambiguationItem {
  id: string;
  job_id: string;
  original_description: string;
  quantity: number;
  notes: string | null;
  status: "pending" | "resolved" | "manual";
  selected_candidate: any | null;
  candidates: Array<{
    part_number: string;
    description: string;
    unit_cost: number;
    source: string;
    supplier: string;
    confidence: number;
  }>;
}

interface AutoQuoteJob {
  id: string;
  email_id: string;
  subject: string;
  sender: string;
  status: "needs_review" | "complete" | "not_quote" | "no_items";
  email_type: string;
  received_at: string;
  quotation_id: string | null;
  site_name: string | null;
  items_matched: number;
  items_pending: number;
  disambiguations?: DisambiguationItem[];
}

export function AutoQuoteReview() {
  const [jobs,     setJobs]     = useState<AutoQuoteJob[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [running,  setRunning]  = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { loadJobs(); }, []);

  async function loadJobs() {
    setLoading(true);
    const { data } = await supabase
      .from("auto_quote_jobs")
      .select("*")
      .in("status", ["needs_review", "complete"])
      .order("received_at", { ascending: false })
      .limit(20);

    const jobs = data || [];

    // Load disambiguations for jobs needing review
    const reviewIds = jobs.filter(j => j.status === "needs_review").map(j => j.id);
    if (reviewIds.length > 0) {
      const { data: disam } = await supabase
        .from("auto_quote_disambiguations")
        .select("*")
        .in("job_id", reviewIds)
        .eq("status", "pending");

      const disamByJob = (disam || []).reduce((acc: Record<string, any[]>, d: any) => {
        (acc[d.job_id] ||= []).push(d);
        return acc;
      }, {});

      jobs.forEach((j: any) => { j.disambiguations = disamByJob[j.id] || []; });
    }

    setJobs(jobs as AutoQuoteJob[]);
    setLoading(false);
  }

  async function runNow() {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("auto-quote-builder", {
        body: { hours_back: 48 },
      });
      if (error) throw error;
      toast.success(`Scan complete — ${data.created} quote(s) created, ${data.needs_review} need review`);
      await loadJobs();
    } catch (e: any) {
      toast.error(`Scan failed: ${e.message}`);
    } finally {
      setRunning(false);
    }
  }

  async function selectCandidate(disamId: string, candidate: any, jobId: string) {
    // Update disambiguation record
    await supabase
      .from("auto_quote_disambiguations")
      .update({ status: "resolved", selected_candidate: candidate })
      .eq("id", disamId);

    // Add line item to the quotation
    const job = jobs.find(j => j.id === jobId);
    const disam = job?.disambiguations?.find(d => d.id === disamId);
    if (job?.quotation_id && disam) {
      await supabase.from("quotation_line_items").insert({
        quotation_id: job.quotation_id,
        description:  candidate.description,
        quantity:     disam.quantity,
        unit_price:   candidate.unit_cost,
        total_price:  candidate.unit_cost * disam.quantity,
        item_name:    candidate.part_number || null,
        priority:     "medium",
        sort_order:   99,
        notes:        `From disambiguation | ${candidate.source} | Original: "${disam.original_description}"`,
      });
    }

    toast.success("Item matched and added to quote");
    await loadJobs();
  }

  async function markManual(disamId: string) {
    await supabase
      .from("auto_quote_disambiguations")
      .update({ status: "manual" })
      .eq("id", disamId);
    toast.info("Item marked for manual pricing");
    await loadJobs();
  }

  const needsReviewCount = jobs.filter(j => j.status === "needs_review").length;

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[#1a1a1a] flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#e85c2c]" />
            Auto-Quote Builder
          </h2>
          <p className="text-[12px] text-[#5f6368]">
            Scans your inbox for enquiries and service sheets, builds draft quotes automatically
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadJobs} disabled={loading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
          <Button
            size="sm"
            className="bg-[#e85c2c] hover:bg-[#d44f20] text-white gap-1"
            onClick={runNow}
            disabled={running}
          >
            {running
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Scanning…</>
              : <><Mail className="w-3.5 h-3.5" /> Scan Inbox Now</>}
          </Button>
        </div>
      </div>

      {/* Status summary */}
      {needsReviewCount > 0 && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-sm text-[12px]">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span className="text-amber-800 font-medium">
            {needsReviewCount} quote{needsReviewCount !== 1 ? "s" : ""} need your input to match unrecognised items
          </span>
        </div>
      )}

      {/* Jobs list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-[#e85c2c]" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-12 text-[#9aa0a6] text-sm">
          No auto-generated quotes yet. Click "Scan Inbox Now" to start.
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map(job => (
            <div
              key={job.id}
              className="border border-[#e0e0e0] rounded-sm overflow-hidden bg-white"
            >
              {/* Job header */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#fafafa] transition-colors"
                onClick={() => setExpanded(expanded === job.id ? null : job.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    {job.status === "needs_review"
                      ? <Badge className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">Needs review</Badge>
                      : <Badge className="text-[10px] bg-green-50 text-green-700 border-green-200">Complete</Badge>}
                    <span className="text-[11px] text-[#9aa0a6]">{job.email_type}</span>
                  </div>
                  <p className="text-[13px] font-medium text-[#1a1a1a] truncate">{job.subject}</p>
                  <p className="text-[11px] text-[#5f6368]">
                    From: {job.sender} · {job.received_at ? format(parseISO(job.received_at), "dd MMM HH:mm") : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 text-[11px] text-[#5f6368]">
                  <span className="text-green-700 font-medium">{job.items_matched} matched</span>
                  {job.items_pending > 0 && (
                    <span className="text-amber-600 font-medium">{job.items_pending} pending</span>
                  )}
                  <ChevronRight className={`w-4 h-4 transition-transform ${expanded === job.id ? "rotate-90" : ""}`} />
                </div>
              </div>

              {/* Expanded: disambiguation items */}
              {expanded === job.id && job.status === "needs_review" && job.disambiguations && job.disambiguations.length > 0 && (
                <div className="border-t border-[#f0f0f0] px-4 py-3 space-y-4 bg-[#fafafa]">
                  <p className="text-[12px] font-semibold text-[#1a1a1a]">
                    Choose the correct product for each unmatched item:
                  </p>
                  {job.disambiguations.map(d => (
                    <div key={d.id} className="bg-white border border-[#e0e0e0] rounded-sm p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[12px] font-medium text-[#1a1a1a]">
                            "{d.original_description}"
                          </p>
                          <p className="text-[11px] text-[#5f6368]">Qty: {d.quantity}{d.notes ? ` · ${d.notes}` : ""}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] text-[#9aa0a6]"
                          onClick={() => markManual(d.id)}
                        >
                          Add manually
                        </Button>
                      </div>

                      {d.candidates.length > 0 ? (
                        <div className="space-y-1.5">
                          {d.candidates.map((c, i) => (
                            <button
                              key={i}
                              onClick={() => selectCandidate(d.id, c, job.id)}
                              className="w-full text-left flex items-center justify-between p-2 rounded border border-[#e8e8e8] hover:border-[#e85c2c] hover:bg-orange-50 transition-colors"
                            >
                              <div className="min-w-0">
                                <p className="text-[12px] font-medium text-[#1a1a1a] truncate">{c.description}</p>
                                <p className="text-[10px] text-[#5f6368]">
                                  {c.part_number} · {c.supplier} · {c.source}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${c.confidence >= 70 ? "bg-green-50 text-green-700" : c.confidence >= 50 ? "bg-amber-50 text-amber-700" : "bg-gray-50 text-gray-600"}`}>
                                  {c.confidence}%
                                </span>
                                <span className="text-[13px] font-bold text-[#1a1a1a]">£{c.unit_cost.toFixed(2)}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-[#9aa0a6] italic">No close matches found — add manually</p>
                      )}
                    </div>
                  ))}

                  {/* Open draft quote */}
                  {job.quotation_id && (
                    <div className="pt-1">
                      <a
                        href={`/quotations?open=${job.quotation_id}`}
                        className="text-[12px] text-[#e85c2c] font-medium hover:underline flex items-center gap-1"
                      >
                        Open draft quote <ChevronRight className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Expanded: complete job */}
              {expanded === job.id && job.status === "complete" && (
                <div className="border-t border-[#f0f0f0] px-4 py-3 bg-[#fafafa]">
                  <div className="flex items-center gap-2 text-[12px] text-green-700">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>All items matched — draft quote ready</span>
                  </div>
                  {job.quotation_id && (
                    <a
                      href={`/quotations?open=${job.quotation_id}`}
                      className="mt-2 inline-flex items-center gap-1 text-[12px] text-[#e85c2c] font-medium hover:underline"
                    >
                      Open draft quote <ChevronRight className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
