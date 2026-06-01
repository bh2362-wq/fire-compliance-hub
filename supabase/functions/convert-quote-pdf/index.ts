import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function readGraphConfig() {
  const tenantId = Deno.env.get("GRAPH_TENANT_ID") ?? Deno.env.get("MICROSOFT_TENANT_ID");
  const clientId = Deno.env.get("GRAPH_CLIENT_ID") ?? Deno.env.get("MICROSOFT_CLIENT_ID");
  const clientSecret = Deno.env.get("GRAPH_CLIENT_SECRET") ?? Deno.env.get("MICROSOFT_CLIENT_SECRET");
  // Prefer SharePoint site drive (no per-user licensing required).
  // GRAPH_CONVERSION_SITE can be a site ID (host,siteCollectionId,siteId) or a path like "host:/sites/SiteName".
  const conversionSite = Deno.env.get("GRAPH_CONVERSION_SITE");
  const conversionUser = Deno.env.get("GRAPH_CONVERSION_USER");
  if (!tenantId || !clientId || !clientSecret || (!conversionSite && !conversionUser)) {
    const missing = [
      !tenantId && "GRAPH_TENANT_ID (or MICROSOFT_TENANT_ID)",
      !clientId && "GRAPH_CLIENT_ID (or MICROSOFT_CLIENT_ID)",
      !clientSecret && "GRAPH_CLIENT_SECRET (or MICROSOFT_CLIENT_SECRET)",
      !conversionSite && !conversionUser && "GRAPH_CONVERSION_SITE or GRAPH_CONVERSION_USER",
    ].filter(Boolean).join(", ");
    throw new Error(`Microsoft Graph environment variables missing: ${missing}`);
  }
  return { tenantId, clientId, clientSecret, conversionUser, conversionSite };
}

async function getSiteDriveId(token: string, siteRef: string): Promise<string> {
  // siteRef may be: "{hostname},{siteCollectionId},{siteId}" OR "hostname:/sites/Name"
  const sitePath = siteRef.includes(",") ? siteRef : siteRef;
  const url = `https://graph.microsoft.com/v1.0/sites/${sitePath}/drive`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Graph site drive lookup failed ${res.status}: ${await res.text()}. Check GRAPH_CONVERSION_SITE and that the app registration has Sites.ReadWrite.All.`);
  const id = (await res.json()).id as string | undefined;
  if (!id) throw new Error(`Graph site drive lookup returned no id for ${siteRef}`);
  return id;
}

async function getGraphToken(cfg: ReturnType<typeof readGraphConfig>) {
  const tokenUrl = `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: cfg.clientId, client_secret: cfg.clientSecret,
    scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials",
  });
  const res = await fetch(tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!res.ok) throw new Error(`Graph token error ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token as string;
}

async function getUserDriveId(token: string, userUpn: string): Promise<string> {
  // Fetching /drive provisions OneDrive if needed and returns the driveId.
  // Using driveId directly avoids 404 itemNotFound on the path-based root:/ syntax,
  // which fails when the user's drive isn't yet initialised or the UPN routing is stale.
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userUpn)}/drive`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Graph drive lookup failed ${res.status}: ${await res.text()}. Ensure GRAPH_CONVERSION_USER (${userUpn}) has a licensed OneDrive/SharePoint mailbox.`);
  const id = (await res.json()).id as string | undefined;
  if (!id) throw new Error(`Graph drive lookup returned no id for ${userUpn}`);
  return id;
}

async function uploadToGraph(token: string, driveId: string, fileName: string, bytes: Uint8Array): Promise<string> {
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encodeURIComponent(fileName)}:/content`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    body: bytes,
  });
  if (!res.ok) throw new Error(`Graph upload failed ${res.status}: ${await res.text()}`);
  return (await res.json()).id as string;
}

async function downloadAsPdf(token: string, driveId: string, itemId: string): Promise<Uint8Array> {
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content?format=pdf`;
  const res = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${token}` }, redirect: "follow" });
  if (!res.ok) throw new Error(`Graph PDF conversion failed ${res.status}: ${await res.text()}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function deleteFromGraph(token: string, driveId: string, itemId: string) {
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}`;
  const res = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok && res.status !== 204) console.error(`Graph cleanup warning: ${res.status}`);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    // `bucket` is an optional override so other generators (C&E report)
    // can reuse this conversion path without each needing their own
    // edge function. Defaults to quote-outputs so existing quote flow
    // is unchanged.
    const { docx_storage_path, quotation_id, bucket } = await req.json();
    if (!docx_storage_path) throw new Error("Missing docx_storage_path");
    const storageBucket = (typeof bucket === "string" && bucket.length > 0) ? bucket : "quote-outputs";

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const cfg = readGraphConfig();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: docxBlob, error: dlErr } = await supabase.storage.from(storageBucket).download(docx_storage_path);
    if (dlErr || !docxBlob) throw new Error(`Storage download failed (bucket=${storageBucket}): ${dlErr?.message}`);
    const docxBytes = new Uint8Array(await docxBlob.arrayBuffer());

    const token = await getGraphToken(cfg);
    const driveId = cfg.conversionSite
      ? await getSiteDriveId(token, cfg.conversionSite)
      : await getUserDriveId(token, cfg.conversionUser!);
    const fileName = `${crypto.randomUUID()}.docx`;
    const itemId = await uploadToGraph(token, driveId, fileName, docxBytes);

    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await downloadAsPdf(token, driveId, itemId);
    } finally {
      await deleteFromGraph(token, driveId, itemId);
    }

    const pdfStoragePath = docx_storage_path.replace(/\.docx$/i, ".pdf");
    const { error: upErr } = await supabase.storage.from(storageBucket).upload(pdfStoragePath, pdfBytes, {
      contentType: "application/pdf", upsert: true,
    });
    if (upErr) throw new Error(`PDF upload failed: ${upErr.message}`);

    const { data: signed, error: signErr } = await supabase.storage.from(storageBucket).createSignedUrl(pdfStoragePath, 3600);
    if (signErr || !signed) throw new Error(`Sign failed: ${signErr?.message}`);

    if (quotation_id) {
      await supabase.from("quotations").update({ latest_pdf_path: pdfStoragePath }).eq("id", quotation_id);
    }

    return new Response(JSON.stringify({
      pdf_storage_path: pdfStoragePath,
      signed_url: signed.signedUrl,
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      file_size_bytes: pdfBytes.byteLength,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
