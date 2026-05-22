// generate-signed-url — issues a short-lived signed URL for a visit document.
//
// Flow:
//   1. Verify the caller can SELECT the visit_documents row. We do this by
//      querying with a user-scoped client, so the table's RLS policy is the
//      single source of truth — no access logic is duplicated here.
//   2. Mint a Storage signed URL for the row's file_path using the service
//      role (signed URLs are generated server-side; the bucket stays private).
//   3. Write an audit_logs entry for the view.
//
// Input:  { document_id: uuid, expires_in_seconds?: int }  (default 300, max 3600)
// Output: { signed_url: string, expires_at: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "visit-documents";
const DEFAULT_EXPIRY = 300;
const MAX_EXPIRY = 3600;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const body = await req.json().catch(() => ({}));
    const documentId = body?.document_id;
    if (!documentId || typeof documentId !== "string") {
      return json({ error: "document_id is required" }, 400);
    }
    const expiresIn = Math.min(
      Math.max(Math.floor(Number(body?.expires_in_seconds) || DEFAULT_EXPIRY), 1),
      MAX_EXPIRY,
    );

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // User-scoped client — RLS on visit_documents decides what is visible.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Invalid session" }, 401);

    // If RLS denies the row, this returns no row — treated as 403.
    const { data: doc, error: docErr } = await userClient
      .from("visit_documents")
      .select("id, file_path, is_archived")
      .eq("id", documentId)
      .maybeSingle();

    if (docErr) return json({ error: docErr.message }, 500);
    if (!doc) {
      return json({ error: "Document not found or access denied" }, 403);
    }

    // Service-role client — sign the URL and record the audit entry.
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: signed, error: signErr } = await adminClient.storage
      .from(BUCKET)
      .createSignedUrl(doc.file_path, expiresIn);

    if (signErr || !signed) {
      return json({ error: signErr?.message ?? "Could not sign URL" }, 500);
    }

    await adminClient.from("audit_logs").insert({
      user_id: user.id,
      action: "document_view",
      entity_type: "visit_document",
      entity_id: documentId,
      details: { expires_in_seconds: expiresIn, is_archived: doc.is_archived },
    });

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    return json({ signed_url: signed.signedUrl, expires_at: expiresAt });
  } catch (e) {
    return json({ error: (e as Error)?.message ?? "Unexpected error" }, 500);
  }
});
