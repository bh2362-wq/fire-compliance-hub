// Reference Library ingest function
// Receives pre-extracted page text from the browser, chunks per-page,
// embeds with OpenAI text-embedding-3-small, and inserts chunks.
// PDF parsing is intentionally NOT done here — the browser extracts text
// with pdfjs-dist to avoid the edge runtime's CPU time limit on large PDFs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const VERIFY_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";

const EMBED_MODEL = "text-embedding-3-small";
const CHARS_PER_TOKEN = 4;
const TARGET_TOKENS = 650;
const OVERLAP_TOKENS = 100;
const TARGET_CHARS = TARGET_TOKENS * CHARS_PER_TOKEN;
const OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN;
const EMBED_BATCH_SIZE = 50;

interface Chunk {
  index: number;
  content: string;
  page_number: number | null;
  section_title: string | null;
  token_count: number;
}

const sectionRe = /^(Clause|Section|Annex|Part)\s+[\d.]+/i;

function detectSection(text: string): string | null {
  const firstLine = text.split("\n").map((l) => l.trim()).find((l) => l.length > 0);
  if (!firstLine) return null;
  if (sectionRe.test(firstLine)) return firstLine.slice(0, 200);
  if (firstLine.length < 80 && firstLine === firstLine.toUpperCase() && /[A-Z]/.test(firstLine)) {
    return firstLine.slice(0, 200);
  }
  return null;
}

function chunkPage(pageText: string, pageNumber: number, startIndex: number): Chunk[] {
  const chunks: Chunk[] = [];
  const text = (pageText || "").trim();
  if (!text) return chunks;

  let cursor = 0;
  let idx = startIndex;
  while (cursor < text.length) {
    let end = Math.min(cursor + TARGET_CHARS, text.length);
    if (end < text.length) {
      const slice = text.slice(cursor, end);
      const paraBreak = slice.lastIndexOf("\n\n");
      const sentBreak = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("? "), slice.lastIndexOf("! "));
      const wordBreak = slice.lastIndexOf(" ");
      const breakAt =
        paraBreak > TARGET_CHARS * 0.5 ? paraBreak + 2 :
        sentBreak > TARGET_CHARS * 0.5 ? sentBreak + 2 :
        wordBreak > TARGET_CHARS * 0.5 ? wordBreak + 1 :
        slice.length;
      end = cursor + breakAt;
    }
    const content = text.slice(cursor, end).trim();
    if (content.length > 0) {
      chunks.push({
        index: idx++,
        content,
        page_number: pageNumber,
        section_title: detectSection(content),
        token_count: Math.ceil(content.length / CHARS_PER_TOKEN),
      });
    }
    if (end >= text.length) break;
    cursor = Math.max(end - OVERLAP_CHARS, cursor + 1);
  }
  return chunks;
}

async function embedBatch(inputs: string[], retries = 3): Promise<number[][]> {
  let delay = 1000;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const resp = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, input: inputs }),
    });
    if (resp.ok) {
      const json = await resp.json();
      return json.data.map((d: any) => d.embedding);
    }
    if (resp.status === 429 && attempt < retries) {
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
      continue;
    }
    const body = await resp.text();
    throw new Error(`OpenAI embeddings ${resp.status}: ${body}`);
  }
  throw new Error("OpenAI embeddings: retries exhausted");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const started = Date.now();

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const authClient = createClient(SUPABASE_URL, VERIFY_KEY, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await authClient.auth.getUser(token);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "unauthorized", detail: userErr?.message }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  let document_id: string | null = null;
  try {
    const body = await req.json();
    document_id = body?.document_id;
    const pages: unknown = body?.pages;
    const total_pages: number | undefined = body?.total_pages;
    const page_offset: number = Number(body?.page_offset ?? 0); // 0-based index of first page in this batch
    const chunk_index_offset: number = Number(body?.chunk_index_offset ?? 0);
    const finalize: boolean = body?.finalize !== false; // default true for back-compat

    if (!document_id) {
      return new Response(JSON.stringify({ success: false, error: "document_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!Array.isArray(pages) || pages.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "pages array is required and must be non-empty" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const pageTexts = (pages as unknown[]).map((p) => String(p ?? ""));

    const { data: doc, error: docErr } = await admin
      .from("ref_lib_documents")
      .select("id")
      .eq("id", document_id)
      .single();
    if (docErr || !doc) throw new Error(`document not found: ${docErr?.message}`);

    await admin.from("ref_lib_documents")
      .update({ ingest_status: "processing", ingest_error: null })
      .eq("id", document_id);

    // Chunk per-page so page_number is preserved. Use real page numbers via page_offset.
    const chunks: Chunk[] = [];
    pageTexts.forEach((pageText, i) => {
      chunks.push(...chunkPage(pageText, page_offset + i + 1, chunk_index_offset + chunks.length));
    });
    if (chunks.length === 0 && !finalize) {
      // Empty batch but more to come — just return ok
      return new Response(JSON.stringify({
        success: true, document_id, batch_chunk_count: 0, batch_token_count: 0,
        next_chunk_index: chunk_index_offset, duration_ms: Date.now() - started,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (chunks.length === 0 && finalize && chunk_index_offset === 0) {
      throw new Error("no extractable text in supplied pages");
    }

    // Embed in batches of 50
    const embeddings: number[][] = [];
    for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBED_BATCH_SIZE).map((c) => c.content);
      const vecs = await embedBatch(batch);
      embeddings.push(...vecs);
    }

    const rows = chunks.map((c, i) => ({
      document_id,
      chunk_index: c.index,
      content: c.content,
      content_preview: c.content.slice(0, 200),
      embedding: embeddings[i] as unknown as string,
      token_count: c.token_count,
      page_number: c.page_number,
      section_title: c.section_title,
    }));

    const INSERT_BATCH = 200;
    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      const slice = rows.slice(i, i + INSERT_BATCH);
      const { error: insErr } = await admin.from("ref_lib_chunks").insert(slice as any);
      if (insErr) throw new Error(`chunk insert failed: ${insErr.message}`);
    }

    const batchTokens = chunks.reduce((s, c) => s + c.token_count, 0);
    const nextChunkIndex = chunk_index_offset + chunks.length;

    if (finalize) {
      // Sum totals across all chunks for this document
      const { count: totalChunkCount } = await admin
        .from("ref_lib_chunks").select("id", { count: "exact", head: true }).eq("document_id", document_id);
      const { data: tokRows } = await admin
        .from("ref_lib_chunks").select("token_count").eq("document_id", document_id);
      const totalTokens = (tokRows ?? []).reduce((s: number, r: any) => s + (r?.token_count ?? 0), 0);

      await admin.from("ref_lib_documents").update({
        ingest_status: "completed",
        ingested_at: new Date().toISOString(),
        chunk_count: totalChunkCount ?? nextChunkIndex,
        total_tokens: totalTokens,
        page_count: total_pages ?? (page_offset + pageTexts.length),
      }).eq("id", document_id);

      return new Response(JSON.stringify({
        success: true, document_id,
        chunk_count: totalChunkCount ?? nextChunkIndex,
        total_tokens: totalTokens,
        duration_ms: Date.now() - started,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      success: true, document_id,
      batch_chunk_count: chunks.length,
      batch_token_count: batchTokens,
      next_chunk_index: nextChunkIndex,
      duration_ms: Date.now() - started,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("ingest-reference-document error:", err);
    if (document_id) {
      await admin.from("ref_lib_documents").update({
        ingest_status: "failed",
        ingest_error: String(err?.message || err).slice(0, 1000),
      }).eq("id", document_id);
    }
    return new Response(JSON.stringify({ success: false, error: String(err?.message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
