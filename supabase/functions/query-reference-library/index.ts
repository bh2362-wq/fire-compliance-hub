// Query the reference library: embeds the query text and calls the SQL RPC.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const authClient = createClient(SUPABASE_URL, VERIFY_KEY, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await authClient.auth.getUser(token);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "unauthorized", detail: userErr?.message }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const body = await req.json();
    const query_text: string = (body?.query_text || "").toString().trim();
    if (!query_text) throw new Error("query_text is required");
    const doc_types: string[] | null = Array.isArray(body?.doc_types) && body.doc_types.length ? body.doc_types : null;
    const limit: number = Number.isFinite(body?.limit) ? body.limit : 5;
    const min_similarity: number = Number.isFinite(body?.min_similarity) ? body.min_similarity : 0.3;

    // Embed
    const embedResp = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: query_text }),
    });
    if (!embedResp.ok) {
      const t = await embedResp.text();
      throw new Error(`OpenAI embeddings ${embedResp.status}: ${t}`);
    }
    const embedJson = await embedResp.json();
    const embedding: number[] = embedJson.data[0].embedding;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const { data, error } = await admin.rpc("ref_lib_query_by_embedding", {
      query_embedding: embedding as unknown as string,
      match_count: limit,
      filter_doc_type: Array.isArray(doc_types) && doc_types.length === 1 ? doc_types[0] : null,
    });
    if (error) throw new Error(`rpc failed: ${error.message}`);

    return new Response(JSON.stringify({ success: true, results: data ?? [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("query-reference-library error:", err);
    return new Response(JSON.stringify({ success: false, error: String(err?.message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
