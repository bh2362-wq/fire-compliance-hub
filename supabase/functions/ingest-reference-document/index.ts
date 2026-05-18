// Reference Library ingest function
// Downloads a file from Supabase Storage, extracts text, chunks it,
// embeds with OpenAI text-embedding-3-small, and inserts chunks.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
const BATCH_SIZE = 100;

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
  const text = pageText.trim();
  if (!text) return chunks;

  let cursor = 0;
  let idx = startIndex;
  while (cursor < text.length) {
    let end = Math.min(cursor + TARGET_CHARS, text.length);
    if (end < text.length) {
      // Prefer paragraph, then sentence, then word boundary
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

async function extractPdf(buffer: ArrayBuffer): Promise<{ pages: string[] }> {
  // pdf-parse returns flat text; we approximate pages by form-feed (\f) splits when present
  const pdfParse = (await import("https://esm.sh/pdf-parse@1.1.1")).default as any;
  const result = await pdfParse(new Uint8Array(buffer));
  const text: string = result.text || "";
  const pages = text.includes("\f") ? text.split("\f") : [text];
  return { pages };
}

async function extractDocx(buffer: ArrayBuffer): Promise<{ pages: string[] }> {
  const mammoth = await import("https://esm.sh/mammoth@1.6.0");
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return { pages: [result.value || ""] };
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

  // Dual-auth: require an authenticated user
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const authClient = createClient(SUPABASE_URL, VERIFY_KEY, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await authClient.auth.getUser(token);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "unauthorized", detail: userErr?.message }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  let document_id: string | null = null;
  try {
    const body = await req.json();
    document_id = body?.document_id;
    if (!document_id) throw new Error("document_id is required");

    const { data: doc, error: docErr } = await admin
      .from("ref_lib_documents")
      .select("*")
      .eq("id", document_id)
      .single();
    if (docErr || !doc) throw new Error(`document not found: ${docErr?.message}`);
    if (!doc.source_storage_path) throw new Error("source_storage_path is empty");

    await admin.from("ref_lib_documents")
      .update({ ingest_status: "processing", ingest_error: null })
      .eq("id", document_id);

    // Download
    const { data: file, error: dlErr } = await admin.storage.from("reference-library").download(doc.source_storage_path);
    if (dlErr || !file) throw new Error(`download failed: ${dlErr?.message}`);
    const buffer = await file.arrayBuffer();
    const name = (doc.source_filename || doc.source_storage_path).toLowerCase();

    // Extract
    let extracted: { pages: string[] };
    if (name.endsWith(".pdf")) extracted = await extractPdf(buffer);
    else if (name.endsWith(".docx")) extracted = await extractDocx(buffer);
    else if (name.endsWith(".txt")) extracted = { pages: [new TextDecoder().decode(buffer)] };
    else throw new Error(`unsupported file type: ${name}`);

    // Chunk
    const chunks: Chunk[] = [];
    extracted.pages.forEach((pageText, i) => {
      chunks.push(...chunkPage(pageText, i + 1, chunks.length));
    });
    if (chunks.length === 0) throw new Error("no extractable text");

    // Embed in batches
    const embeddings: number[][] = [];
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE).map((c) => c.content);
      const vecs = await embedBatch(batch);
      embeddings.push(...vecs);
    }

    // Insert chunks (batched insert)
    const rows = chunks.map((c, i) => ({
      document_id,
      chunk_index: c.index,
      content: c.content,
      content_preview: c.content.slice(0, 200),
      embedding: embeddings[i] as unknown as string, // pgvector accepts JSON array
      token_count: c.token_count,
      page_number: c.page_number,
      section_title: c.section_title,
    }));

    // Insert in slices to avoid payload limits
    const INSERT_BATCH = 200;
    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      const slice = rows.slice(i, i + INSERT_BATCH);
      const { error: insErr } = await admin.from("ref_lib_chunks").insert(slice as any);
      if (insErr) throw new Error(`chunk insert failed: ${insErr.message}`);
    }

    const totalTokens = chunks.reduce((s, c) => s + c.token_count, 0);
    await admin.from("ref_lib_documents").update({
      ingest_status: "completed",
      ingested_at: new Date().toISOString(),
      chunk_count: chunks.length,
      total_tokens: totalTokens,
      page_count: extracted.pages.length,
    }).eq("id", document_id);

    return new Response(JSON.stringify({
      success: true,
      document_id,
      chunk_count: chunks.length,
      total_tokens: totalTokens,
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
