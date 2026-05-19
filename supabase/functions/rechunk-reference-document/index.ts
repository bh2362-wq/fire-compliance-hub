// One-off re-chunker for reference library documents.
// Reconstructs per-page text from existing chunks (deduplicating chunk overlap),
// then re-chunks with clause-aware boundaries:
//   - prefers clause/section/annex headings as chunk starts
//   - keeps a sub-clause's full text in a single chunk (up to 1200 tokens)
//   - tags each chunk's metadata with primary_clause when detectable
// Re-embeds via OpenAI and replaces the document's chunks atomically per-document.
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
const TARGET_TOKENS_MIN = 500;
const TARGET_TOKENS_MAX = 800;
const HARD_MAX_TOKENS = 1200;
const TARGET_CHARS_MIN = TARGET_TOKENS_MIN * CHARS_PER_TOKEN;
const TARGET_CHARS_MAX = TARGET_TOKENS_MAX * CHARS_PER_TOKEN;
const HARD_MAX_CHARS = HARD_MAX_TOKENS * CHARS_PER_TOKEN;
const EMBED_BATCH = 50;

// BS standards typically render clause headings as bare numbers ("15.1.5 All fire alarm sounders...")
// while FIA guides and similar use "Clause 15.1.5". Detect both.
// Bare numeric form: digits.dots optionally with trailing letter, followed by at least one space
// and a capital letter / uppercase word starting the heading text.
const clauseHeadingRe = new RegExp(
  String.raw`(?:^|\n)\s*` +
    `(?:` +
      `(?:Clause|Section|Annex|Part)\\s+([0-9]+(?:\\.[0-9]+)*[a-z]?|[A-Z](?:\\.[0-9]+)*)` +
      `|` +
      `([0-9]+(?:\\.[0-9]+){0,4}[a-z]?)(?=\\s+[A-Z][A-Za-z])` +
      `|` +
      `(Annex\\s+[A-Z](?:\\.[0-9]+)*)` +
    `)` +
    `\\b[^\\n]{0,200}`,
  "g",
);

function parseHeading(headingText: string): { kind: string; id: string } | null {
  const m1 = headingText.match(/^\s*(Clause|Section|Annex|Part)\s+([0-9]+(?:\.[0-9]+)*[a-z]?|[A-Z](?:\.[0-9]+)*)/);
  if (m1) return { kind: m1[1], id: m1[2] };
  const m2 = headingText.match(/^\s*([0-9]+(?:\.[0-9]+){0,4}[a-z]?)(?=\s+[A-Z])/);
  if (m2) return { kind: "Clause", id: m2[1] };
  return null;
}

function leadingClauseRef(text: string): string | null {
  const h = parseHeading(text);
  return h ? `${h.kind} ${h.id}` : null;
}

function primaryClauseId(text: string): string | null {
  const h = parseHeading(text);
  return h ? h.id : null;
}

// Strip recurring page-header / footer chrome that interrupts clause text.
const chromeLineRes: RegExp[] = [
  /^\s*BRITISH STANDARD\b.*$/gim,
  /^\s*©\s*THE BRITISH STANDARDS INSTITUTION\b.*$/gim,
  /^\s*BS\s?5839[\u2010\u2011\u2012\u2013\u2014-]?1:?2025\b.*$/gim,
  /^\s*Tel:\s*\+44.*$/gim,
  /^\s*www\.[a-z0-9.\-]+\.[a-z]{2,}\b.*$/gim,
  /^\s*Guide to the changes in BS 5839-1:2025.*$/gim,
  /^\s*\d+\s+of\s+\d+\s*$/gim,
  /^\s*Page\s+\d+\s*$/gim,
];

function stripChrome(text: string): string {
  let out = text;
  for (const re of chromeLineRes) out = out.replace(re, "");
  // Collapse 3+ blank lines down to 2
  out = out.replace(/\n{3,}/g, "\n\n");
  return out;
}

// Reassemble per-page text from overlapping chunks within the same page_number.
function reassemblePage(chunks: Array<{ chunk_index: number; content: string }>): string {
  if (chunks.length === 0) return "";
  chunks.sort((a, b) => a.chunk_index - b.chunk_index);
  let out = chunks[0].content;
  for (let i = 1; i < chunks.length; i++) {
    const next = chunks[i].content;
    // Find largest k such that out.endsWith(next.slice(0, k))
    const max = Math.min(out.length, next.length, 1200);
    let overlap = 0;
    for (let k = max; k > 20; k--) {
      if (out.endsWith(next.slice(0, k))) { overlap = k; break; }
    }
    out += overlap > 0 ? next.slice(overlap) : "\n" + next;
  }
  return out;
}

// Clause-aware chunker. Splits the full document text at clause-heading
// boundaries, then re-balances oversized clauses by paragraph/sentence.
function clauseChunk(
  fullText: string,
  pageMap: Array<{ start: number; end: number; page: number }>,
): Array<{ content: string; page_number: number | null; primary_clause: string | null; section_title: string | null }> {
  const text = fullText;
  // Collect heading positions
  const headings: number[] = [];
  clauseHeadingRe.lastIndex = 0;
  for (let m: RegExpExecArray | null; (m = clauseHeadingRe.exec(text)); ) {
    // index points to optional leading whitespace; advance to actual word start
    const idx = m.index + (m[0].length - m[0].trimStart().length);
    headings.push(idx);
  }
  if (headings.length === 0 || headings[0] > 0) headings.unshift(0);
  headings.push(text.length);

  const rawSegments: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < headings.length - 1; i++) {
    if (headings[i + 1] > headings[i]) {
      rawSegments.push({ start: headings[i], end: headings[i + 1] });
    }
  }

  // Now split oversize segments and merge tiny ones.
  const out: Array<{ content: string; page_number: number | null; primary_clause: string | null; section_title: string | null }> = [];

  const findPage = (pos: number): number | null => {
    for (const p of pageMap) if (pos >= p.start && pos < p.end) return p.page;
    return pageMap[pageMap.length - 1]?.page ?? null;
  };

  const pushChunk = (segText: string, anchorPos: number) => {
    const trimmed = segText.trim();
    if (!trimmed) return;
    const lead = leadingClauseRef(trimmed);
    out.push({
      content: trimmed,
      page_number: findPage(anchorPos),
      primary_clause: primaryClauseId(trimmed),
      section_title: lead ? lead.slice(0, 200) : null,
    });
  };

  let buffer = "";
  let bufferStart = 0;
  const flushBuffer = () => {
    if (buffer.trim()) pushChunk(buffer, bufferStart);
    buffer = "";
  };

  for (const seg of rawSegments) {
    const segText = text.slice(seg.start, seg.end);
    const segLen = segText.length;

    if (segLen <= HARD_MAX_CHARS) {
      // Try to keep in one chunk — but if combining with buffer would still fit min target, batch them.
      if (buffer.length + segLen <= TARGET_CHARS_MAX) {
        if (!buffer) bufferStart = seg.start;
        buffer += (buffer ? "\n\n" : "") + segText;
        if (buffer.length >= TARGET_CHARS_MIN) flushBuffer();
      } else {
        flushBuffer();
        bufferStart = seg.start;
        if (segLen >= TARGET_CHARS_MIN) {
          pushChunk(segText, seg.start);
        } else {
          buffer = segText;
        }
      }
    } else {
      // Oversize — flush buffer, then split at paragraph/sentence boundaries.
      flushBuffer();
      const leadRef = leadingClauseRef(segText);
      let cursor = 0;
      let partIdx = 0;
      while (cursor < segText.length) {
        let end = Math.min(cursor + TARGET_CHARS_MAX, segText.length);
        if (end < segText.length) {
          const slice = segText.slice(cursor, end);
          const para = slice.lastIndexOf("\n\n");
          const sent = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("? "), slice.lastIndexOf("! "));
          const breakAt = para > TARGET_CHARS_MIN ? para + 2 : sent > TARGET_CHARS_MIN ? sent + 2 : slice.length;
          end = cursor + breakAt;
        }
        const piece = segText.slice(cursor, end);
        // Prefix continuation pieces with the parent clause ref so retrieval can still surface it
        const prefixed = partIdx === 0 || !leadRef ? piece : `${leadRef} (cont.)\n${piece}`;
        pushChunk(prefixed, seg.start + cursor);
        cursor = end;
        partIdx++;
      }
    }
  }
  flushBuffer();
  return out;
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

  try {
    const body = await req.json();
    const document_ids: string[] = Array.isArray(body?.document_ids) ? body.document_ids : (body?.document_id ? [body.document_id] : []);
    const dryRun: boolean = !!body?.dry_run;
    if (document_ids.length === 0) {
      return new Response(JSON.stringify({ error: "document_ids[] required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const document_id of document_ids) {
      // Fetch document
      const { data: doc, error: docErr } = await admin
        .from("ref_lib_documents").select("id,title").eq("id", document_id).single();
      if (docErr || !doc) {
        results.push({ document_id, error: `document not found: ${docErr?.message}` });
        continue;
      }

      // Fetch all existing chunks (paginated to avoid 1000-row cap)
      const allRows: Array<{ chunk_index: number; content: string; page_number: number | null }> = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await admin
          .from("ref_lib_chunks")
          .select("chunk_index, content, page_number")
          .eq("document_id", document_id)
          .order("chunk_index", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw new Error(`fetch chunks: ${error.message}`);
        if (!data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      const beforeCount = allRows.length;

      // Group by page_number, reassemble each page
      const byPage = new Map<number, Array<{ chunk_index: number; content: string }>>();
      for (const r of allRows) {
        const pg = r.page_number ?? 0;
        if (!byPage.has(pg)) byPage.set(pg, []);
        byPage.get(pg)!.push({ chunk_index: r.chunk_index, content: r.content });
      }
      const pages = [...byPage.keys()].sort((a, b) => a - b);

      let fullText = "";
      const pageMap: Array<{ start: number; end: number; page: number }> = [];
      for (const pg of pages) {
        const pageText = stripChrome(reassemblePage(byPage.get(pg)!));
        const start = fullText.length;
        fullText += (fullText ? "\n\n" : "") + pageText;
        pageMap.push({ start, end: fullText.length, page: pg });
      }

      const newChunks = clauseChunk(fullText, pageMap);

      // Sample a chunk that contains a sub-clause heading (primary_clause has a dot)
      const subClauseSample = newChunks.find((c) => c.primary_clause && c.primary_clause.includes("."))
        ?? newChunks.find((c) => c.primary_clause);

      const summary: any = {
        document_id,
        title: doc.title,
        before_chunk_count: beforeCount,
        after_chunk_count: newChunks.length,
        pages_reassembled: pages.length,
        reconstructed_chars: fullText.length,
        chunks_with_primary_clause: newChunks.filter((c) => c.primary_clause).length,
        sample_subclause_chunk: subClauseSample
          ? {
              primary_clause: subClauseSample.primary_clause,
              section_title: subClauseSample.section_title,
              page_number: subClauseSample.page_number,
              preview: subClauseSample.content.slice(0, 600),
              length_chars: subClauseSample.content.length,
            }
          : null,
      };

      if (dryRun) {
        results.push({ ...summary, dry_run: true });
        continue;
      }

      // Embed in batches
      const embeddings: number[][] = [];
      for (let i = 0; i < newChunks.length; i += EMBED_BATCH) {
        const batch = newChunks.slice(i, i + EMBED_BATCH).map((c) => c.content);
        const vecs = await embedBatch(batch);
        embeddings.push(...vecs);
      }

      // Delete old chunks, insert new (best-effort atomic — within one document)
      const { error: delErr } = await admin.from("ref_lib_chunks").delete().eq("document_id", document_id);
      if (delErr) throw new Error(`delete old chunks: ${delErr.message}`);

      const rows = newChunks.map((c, i) => ({
        document_id,
        chunk_index: i,
        content: c.content,
        content_preview: c.content.slice(0, 200),
        embedding: embeddings[i] as unknown as string,
        token_count: Math.ceil(c.content.length / CHARS_PER_TOKEN),
        page_number: c.page_number,
        section_title: c.section_title,
        metadata: { primary_clause: c.primary_clause, rechunked: true, rechunk_version: 2 },
      }));

      const INSERT_BATCH = 200;
      for (let i = 0; i < rows.length; i += INSERT_BATCH) {
        const slice = rows.slice(i, i + INSERT_BATCH);
        const { error: insErr } = await admin.from("ref_lib_chunks").insert(slice as any);
        if (insErr) throw new Error(`chunk insert failed: ${insErr.message}`);
      }

      const totalTokens = rows.reduce((s, r) => s + (r.token_count ?? 0), 0);
      await admin.from("ref_lib_documents").update({
        chunk_count: rows.length,
        total_tokens: totalTokens,
        ingest_status: "completed",
        ingested_at: new Date().toISOString(),
      }).eq("id", document_id);

      results.push({ ...summary, dry_run: false });
    }

    return new Response(JSON.stringify({
      success: true,
      duration_ms: Date.now() - started,
      results,
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("rechunk error:", err);
    return new Response(JSON.stringify({ success: false, error: String(err?.message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
