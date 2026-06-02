// generate-tender-pack — merges every PDF in a tender's pack into one
// deliverable, uploads to the tender-packs bucket, returns a signed URL.
//
// Order is taken from tender_pack_items.sort_order. Each item points to
// either a company_documents row (preferred — has file_storage_path) or
// carries a custom_url. Non-PDF items are skipped with a warning.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument } from "npm:pdf-lib@1.17.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface PackItem {
  id: string;
  sort_order: number;
  custom_title: string | null;
  custom_url: string | null;
  company_document: {
    id: string;
    title: string;
    file_url: string | null;
    file_storage_path: string | null;
  } | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json().catch(() => ({}));
    const tenderId = body?.tender_id as string | undefined;
    if (!tenderId) {
      return new Response(JSON.stringify({ error: "tender_id required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { data: tender, error: tenderErr } = await supabase
      .from("tenders")
      .select("id, title, buyer_org")
      .eq("id", tenderId)
      .single();
    if (tenderErr || !tender) throw new Error(`Tender not found: ${tenderErr?.message ?? "no row"}`);

    const { data: items, error: itemsErr } = await supabase
      .from("tender_pack_items")
      .select("id, sort_order, custom_title, custom_url, company_document:company_documents(id, title, file_url, file_storage_path)")
      .eq("tender_id", tenderId)
      .order("sort_order");
    if (itemsErr) throw itemsErr;

    const packItems = (items ?? []) as unknown as PackItem[];
    if (packItems.length === 0) {
      return new Response(JSON.stringify({ error: "Pack is empty" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const merged = await PDFDocument.create();
    const warnings: string[] = [];

    for (const item of packItems) {
      const label = item.company_document?.title ?? item.custom_title ?? "Untitled";
      const storagePath = item.company_document?.file_storage_path ?? null;
      const directUrl = item.custom_url ?? item.company_document?.file_url ?? null;

      let bytes: ArrayBuffer | null = null;
      try {
        if (storagePath) {
          // Prefer storage path — works regardless of signed URL expiry.
          const { data, error } = await supabase.storage.from("tender-assets").download(storagePath);
          if (error) throw error;
          bytes = await data.arrayBuffer();
        } else if (directUrl) {
          const res = await fetch(directUrl);
          if (!res.ok) throw new Error(`fetch ${res.status}`);
          bytes = await res.arrayBuffer();
        } else {
          warnings.push(`${label}: no file source`);
          continue;
        }

        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await merged.copyPages(src, src.getPageIndices());
        for (const p of pages) merged.addPage(p);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        warnings.push(`${label}: ${msg}`);
        console.warn(`[generate-tender-pack] skipped "${label}":`, msg);
      }
    }

    if (merged.getPageCount() === 0) {
      throw new Error(`No pages produced. ${warnings.join("; ") || "All items failed to load."}`);
    }

    const mergedBytes = await merged.save();
    const slug = (tender.title ?? "tender").toString()
      .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "tender";
    const storagePath = `${tender.id}/${Date.now()}_${slug}.pdf`;

    const { error: upErr } = await supabase.storage
      .from("tender-packs")
      .upload(storagePath, mergedBytes, { contentType: "application/pdf", upsert: false });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { data: signed, error: signErr } = await supabase.storage
      .from("tender-packs")
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
    if (signErr || !signed?.signedUrl) throw new Error(`Sign failed: ${signErr?.message ?? "no url"}`);

    return new Response(JSON.stringify({
      signed_url: signed.signedUrl,
      storage_path: storagePath,
      page_count: merged.getPageCount(),
      items_included: packItems.length - warnings.length,
      warnings,
    }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[generate-tender-pack] failed", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
