import { supabase } from "@/integrations/supabase/client";

// New tables aren't in the generated Supabase types until `npm run gen:types`
// is run, so we cast through `sb` (same pattern as QuoteSettings.tsx).
const sb = supabase as any;

export type BidStatus = "draft" | "in_progress" | "submitted" | "won" | "lost" | "withdrawn";
export type QuestionStatus = "todo" | "drafted" | "reviewed" | "final";
export type RefineInstruction = "improve" | "expand" | "shorten" | "fit_limit" | "custom";

export interface Bid {
  id: string;
  bid_reference: string | null;
  title: string;
  buyer_name: string | null;
  customer_id: string | null;
  site_id: string | null;
  portal_name: string | null;
  submission_deadline: string | null;
  estimated_value: number | null;
  status: BidStatus;
  summary: string | null;
  outcome_notes: string | null;
  sharepoint_url: string | null;
  sharepoint_folder: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customers?: { name: string; contact_name?: string | null; contact_email?: string | null } | null;
  sites?: { name: string } | null;
}

export interface BidQuestion {
  id: string;
  bid_id: string;
  sort_order: number;
  section: string | null;
  question_ref: string | null;
  question_text: string;
  guidance: string | null;
  word_limit: number | null;
  char_limit: number | null;
  weighting: number | null;
  answer: string | null;
  status: QuestionStatus;
  created_at: string;
  updated_at: string;
}

export const BID_STATUS_LABELS: Record<BidStatus, string> = {
  draft: "Draft",
  in_progress: "In Progress",
  submitted: "Submitted",
  won: "Won",
  lost: "Lost",
  withdrawn: "Withdrawn",
};

export const QUESTION_STATUS_LABELS: Record<QuestionStatus, string> = {
  todo: "To do",
  drafted: "Drafted",
  reviewed: "Reviewed",
  final: "Final",
};

// ── Bids ────────────────────────────────────────────────────────────────
export async function listBids(): Promise<Bid[]> {
  const { data, error } = await sb
    .from("bids")
    .select(`*, customers:customer_id(name, contact_name, contact_email), sites:site_id(name)`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Bid[];
}

export async function getBid(id: string): Promise<Bid> {
  const { data, error } = await sb
    .from("bids")
    .select(`*, customers:customer_id(name, contact_name, contact_email), sites:site_id(name)`)
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as Bid;
}

export async function createBid(input: Partial<Bid>): Promise<Bid> {
  const { data: userRes } = await supabase.auth.getUser();
  const { data, error } = await sb
    .from("bids")
    .insert({ ...input, created_by: userRes?.user?.id ?? null })
    .select()
    .single();
  if (error) throw error;
  return data as Bid;
}

export async function updateBid(id: string, updates: Partial<Bid>): Promise<void> {
  const { error } = await sb.from("bids").update(updates).eq("id", id);
  if (error) throw error;
}

export async function deleteBid(id: string): Promise<void> {
  const { error } = await sb.from("bids").delete().eq("id", id);
  if (error) throw error;
}

// ── Questions ─────────────────────────────────────────────────────────────
export async function listQuestions(bidId: string): Promise<BidQuestion[]> {
  const { data, error } = await sb
    .from("bid_questions")
    .select("*")
    .eq("bid_id", bidId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as BidQuestion[];
}

export async function createQuestion(bidId: string, input: Partial<BidQuestion>): Promise<BidQuestion> {
  const { data, error } = await sb
    .from("bid_questions")
    .insert({ bid_id: bidId, ...input })
    .select()
    .single();
  if (error) throw error;
  return data as BidQuestion;
}

export async function bulkCreateQuestions(
  bidId: string,
  questions: Array<Partial<BidQuestion>>,
  startOrder = 0,
): Promise<void> {
  if (!questions.length) return;
  const rows = questions.map((q, i) => ({ bid_id: bidId, sort_order: startOrder + i, ...q }));
  const { error } = await sb.from("bid_questions").insert(rows);
  if (error) throw error;
}

export async function updateQuestion(id: string, updates: Partial<BidQuestion>): Promise<void> {
  const { error } = await sb.from("bid_questions").update(updates).eq("id", id);
  if (error) throw error;
}

export async function deleteQuestion(id: string): Promise<void> {
  const { error } = await sb.from("bid_questions").delete().eq("id", id);
  if (error) throw error;
}

// ── AI generation ───────────────────────────────────────────────────────
export interface GenerateAnswerParams {
  mode: "draft" | "refine";
  question: BidQuestion;
  bid: Bid;
  company: { company_name?: string; accreditations?: string; about?: string };
  instruction?: RefineInstruction;
  custom_instruction?: string;
}

export async function generateAnswer(params: GenerateAnswerParams): Promise<string> {
  const { question, bid, company, mode, instruction, custom_instruction } = params;
  const { data, error } = await supabase.functions.invoke("generate-bid-answer", {
    body: {
      mode,
      question_text: question.question_text,
      guidance: question.guidance ?? undefined,
      word_limit: question.word_limit,
      char_limit: question.char_limit,
      current_answer: mode === "refine" ? question.answer ?? "" : undefined,
      instruction,
      custom_instruction,
      company,
      bid: { bid_title: bid.title, buyer_name: bid.buyer_name ?? undefined, section: question.section ?? undefined },
      bid_id: bid.id,
      question_id: question.id,
    },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return (data as any).answer as string;
}

// ── Helpers ───────────────────────────────────────────────────────────────
export function countWords(text: string | null | undefined): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Parse pasted tender questions into structured rows.
 * Questions are separated by blank lines. An optional leading reference
 * ("3.1 ", "Q4:", "Question 2 -") is split off into question_ref.
 * A trailing "(500 words)" / "(2000 characters)" sets the limit.
 */
export function parsePastedQuestions(raw: string): Array<Partial<BidQuestion>> {
  const blocks = raw
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  return blocks.map((block) => {
    let text = block.replace(/\s+/g, " ").trim();
    let question_ref: string | null = null;
    let word_limit: number | null = null;
    let char_limit: number | null = null;

    const refMatch = text.match(/^(?:Q(?:uestion)?\s*)?(\d+(?:\.\d+)*)[):.\-\s]+/i);
    if (refMatch) {
      question_ref = refMatch[1];
      text = text.slice(refMatch[0].length).trim();
    }

    const wordMatch = text.match(/\(?\s*(?:max(?:imum)?\s*)?(\d[\d,]*)\s*words?\s*\)?\s*$/i);
    const charMatch = text.match(/\(?\s*(?:max(?:imum)?\s*)?(\d[\d,]*)\s*characters?\s*\)?\s*$/i);
    if (wordMatch) {
      word_limit = parseInt(wordMatch[1].replace(/,/g, ""), 10);
      text = text.slice(0, wordMatch.index).trim().replace(/[(\-–—:]\s*$/, "").trim();
    } else if (charMatch) {
      char_limit = parseInt(charMatch[1].replace(/,/g, ""), 10);
      text = text.slice(0, charMatch.index).trim().replace(/[(\-–—:]\s*$/, "").trim();
    }

    return { question_text: text, question_ref, word_limit, char_limit };
  });
}
