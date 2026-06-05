// Claude (Anthropic) chat edge function
//
// Modes:
//   - chat       : plain chat (default)
//   - analyze    : document analyst — uses `documentText` payload
//   - summarise  : report summariser — uses `documentText` payload
//
// Optional flag `useReferenceLibrary` (chat mode only):
//   When true, the last user message is used as a retrieval query against
//   the reference library (filtered by `referenceDocTypes`, defaulting to
//   ["bafe"]). The top-K chunks are injected into the system prompt as a
//   citation-bearing reference block, and the model is instructed to cite
//   each claim. The retrieved sources are returned alongside the answer
//   so the UI can render citations underneath.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Msg {
  role: "user" | "assistant";
  content: string;
}

interface RetrievedChunk {
  chunk_id: string;
  document_id: string;
  document_title: string;
  doc_type: string;
  standard_reference: string | null;
  page_number: number | null;
  section_title: string | null;
  content: string;
  similarity: number;
}

async function retrieveReferenceContext(
  queryText: string,
  docTypes: string[],
  limit: number,
  userAuthHeader: string | null,
): Promise<RetrievedChunk[]> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) return [];
  // query-reference-library verifies the caller via auth.getUser(token),
  // so the service-role JWT is rejected. We forward the caller's own
  // Authorization header — the client has already authenticated through
  // supabase.functions.invoke() which attaches the user JWT.
  if (!userAuthHeader) {
    console.warn("retrieveReferenceContext: no caller auth header, cannot query reference library");
    return [];
  }

  // query-reference-library currently accepts `doc_types?: string[]` and uses
  // the first element to drive its single-tag RPC filter. We pass exactly one
  // tag so the existing RPC signature is sufficient.
  const resp = await fetch(`${supabaseUrl}/functions/v1/query-reference-library`, {
    method: "POST",
    headers: {
      Authorization: userAuthHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query_text: queryText,
      doc_types: docTypes,
      limit,
      min_similarity: 0.25,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    console.warn("query-reference-library failed", resp.status, errText);
    return [];
  }
  const data = await resp.json().catch(() => null);
  if (!data || !Array.isArray(data?.results)) return [];
  return data.results as RetrievedChunk[];
}

function formatCitation(c: RetrievedChunk): string {
  const ref = c.standard_reference ? ` (${c.standard_reference})` : "";
  const page = c.page_number ? `, p.${c.page_number}` : "";
  return `${c.document_title}${ref}${page}`;
}

function buildReferenceBlock(chunks: RetrievedChunk[]): string {
  const lines = chunks.map((c, i) => {
    const cite = formatCitation(c);
    const section = c.section_title ? ` — ${c.section_title}` : "";
    return `[${i + 1}] ${cite}${section}\n${c.content.trim()}`;
  });
  return lines.join("\n\n---\n\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const messages: Msg[] = Array.isArray(body?.messages) ? body.messages : [];
    const systemOverride: string | undefined = body?.system;
    const documentText: string | undefined = body?.documentText;
    const mode: string = body?.mode || "chat"; // chat | analyze | summarise
    const useReferenceLibrary: boolean = Boolean(body?.useReferenceLibrary);
    const referenceDocTypes: string[] = Array.isArray(body?.referenceDocTypes) && body.referenceDocTypes.length > 0
      ? body.referenceDocTypes
      : ["bafe"];
    const referenceLimit: number = typeof body?.referenceLimit === "number" ? body.referenceLimit : 5;
    const requestedModel: string = body?.model || "claude-sonnet-4-5";
    const MODEL_ALIASES: Record<string, string> = {
      "claude-sonnet-4-20250514": "claude-sonnet-4-5",
      "claude-sonnet-4": "claude-sonnet-4-5",
      "claude-3-5-sonnet-latest": "claude-3-5-sonnet-20241022",
    };
    const model: string = MODEL_ALIASES[requestedModel] || requestedModel;

    if (messages.length === 0 && !documentText) {
      return new Response(
        JSON.stringify({ error: "messages or documentText required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── System prompts per mode ────────────────────────────────────────────
    let system = systemOverride ||
      "You are a helpful AI assistant for BHO Fire Ltd, a UK fire safety and alarm specialist. " +
      "Provide expert guidance on BS 5839 (fire detection), BS 5266 (emergency lighting), BAFE SP203, " +
      "and UK fire safety regulations. Use UK English spelling. Be concise and practical.";

    if (mode === "analyze") {
      system = "You are a fire safety document analyst. Extract key findings, defects, " +
        "recommendations, compliance issues, and action items from the document. " +
        "Use UK English. Format as structured Markdown with clear headings.";
    } else if (mode === "summarise") {
      system = "You are a fire safety report summariser. Produce an executive summary covering: " +
        "scope of work, key findings, defects/non-conformities, recommendations, and compliance status. " +
        "Keep it under 400 words. Use UK English and Markdown headings.";
    }

    // ── Retrieval (chat mode + flag) ──────────────────────────────────────
    // Pulls the top-K reference chunks matching the user's latest message,
    // filtered to the requested doc-types (BAFE by default). The chunks are
    // injected as a numbered reference block; the model is told to cite as
    // [n] and to refuse questions that aren't covered by the references.
    let sources: RetrievedChunk[] = [];
    if (useReferenceLibrary && mode === "chat") {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      if (lastUser && lastUser.content.trim()) {
        const userAuthHeader = req.headers.get("authorization");
        try {
          sources = await retrieveReferenceContext(
            lastUser.content.trim().slice(0, 2000),
            referenceDocTypes,
            referenceLimit,
            userAuthHeader,
          );
        } catch (e) {
          console.warn("retrieveReferenceContext threw, continuing without context", e);
        }
      }
      if (sources.length > 0) {
        const refBlock = buildReferenceBlock(sources);
        system = "You are a BAFE compliance specialist for BHO Fire Ltd, a UK fire safety and alarm contractor. " +
          "Answer using ONLY the BAFE reference excerpts provided in the 'References' block below. " +
          "Cite every factual claim with the bracketed number, e.g. [1]. " +
          "If the answer is not contained in the references, say so plainly and suggest what to check. " +
          "Use UK English. Be concise and practical.\n\n" +
          "References:\n" + refBlock;
      } else {
        // Retrieval ran but returned nothing — be explicit so the model
        // doesn't hallucinate a BAFE-flavoured answer from training data.
        system = "You are a BAFE compliance specialist for BHO Fire Ltd. No BAFE reference excerpts " +
          "matched the user's question. Tell the user no relevant BAFE content was found in the " +
          "reference library, and suggest they upload the relevant standard via the Reference Library " +
          "admin page (or rephrase the question). Do not answer from general knowledge.";
      }
    }

    // ── Document context (analyze / summarise) ────────────────────────────
    const finalMessages: Msg[] = [...messages];
    if (documentText && documentText.trim()) {
      const truncated = documentText.slice(0, 180_000);
      const docMsg = `Document content:\n\n"""\n${truncated}\n"""`;
      if (finalMessages.length === 0) {
        finalMessages.push({ role: "user", content: docMsg });
      } else {
        finalMessages[0] = {
          role: "user",
          content: `${docMsg}\n\n${finalMessages[0].content}`,
        };
      }
    }

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 16000,
        system,
        messages: finalMessages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Anthropic error:", resp.status, errText);
      if (resp.status === 401) {
        return new Response(
          JSON.stringify({ error: "Invalid Anthropic API key" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (resp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Claude rate limit exceeded, please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: `Claude API error: ${errText}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await resp.json();
    const text = Array.isArray(data?.content)
      ? data.content.map((c: any) => c?.text || "").join("\n").trim()
      : "";

    console.log("claude-chat response", JSON.stringify({
      model: data?.model,
      stop_reason: data?.stop_reason,
      usage: data?.usage,
      text_length: text.length,
      sources_count: sources.length,
      text_head: text.slice(0, 400),
    }));

    return new Response(
      JSON.stringify({
        content: text,
        model: data?.model,
        usage: data?.usage,
        stop_reason: data?.stop_reason,
        sources: sources.map((s) => ({
          chunk_id: s.chunk_id,
          document_id: s.document_id,
          document_title: s.document_title,
          standard_reference: s.standard_reference,
          page_number: s.page_number,
          section_title: s.section_title,
          similarity: s.similarity,
          // omit raw content from the wire payload — the citation panel
          // only needs the metadata; full content stays server-side.
        })),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("claude-chat error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
