// import-supplier-prices — scheduled cron job
// Runs daily. Searches for new emails from Black & White Fire (bawfs.com)
// and Huvo (huvo.co.uk), extracts prices from PDF/Excel attachments,
// and upserts into price_list_items.
//
// Schedule via Supabase SQL (run once):
//   SELECT cron.schedule(
//     'import-supplier-prices',
//     '0 7 * * *',
//     $$ SELECT net.http_post(url:='YOUR_SUPABASE_URL/functions/v1/import-supplier-prices',
//        headers:='{"Authorization":"Bearer YOUR_SERVICE_ROLE_KEY","Content-Type":"application/json"}'::jsonb,
//        body:='{}'::jsonb) $$
//   );

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH = "https://graph.microsoft.com/v1.0";
const MAILBOX = "ben@bhofire.com";

// Suppliers to watch — name used for price_list_items.manufacturer fallback
const WATCHED_SUPPLIERS = [
  { domain: "bawfs.com",   name: "Black & White Fire", senderFilter: "" },
  { domain: "huvo.co.uk",  name: "Huvo",               senderFilter: "" },
];

// Only watch emails from "adam" at BAWFS (per user requirement)
const ADAM_FILTER = "adam";

async function getAppToken(): Promise<string> {
  const tenantId = Deno.env.get("MICROSOFT_TENANT_ID")!;
  const clientId = Deno.env.get("MICROSOFT_CLIENT_ID")!;
  const clientSecret = Deno.env.get("MICROSOFT_CLIENT_SECRET")!;
  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId, client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials",
      }),
    }
  );
  if (!res.ok) throw new Error(`Token error: ${await res.text()}`);
  return (await res.json()).access_token;
}

async function extractPricesFromPdf(
  pdfBase64: string, filename: string, supplierName: string, supabaseUrl: string, serviceKey: string
): Promise<any[]> {
  const res = await fetch(`${supabaseUrl}/functions/v1/extract-pdf-prices`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ pdfBase64, filename, supplierName }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.rows || [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const results = { processed: 0, imported: 0, updated: 0, errors: [] as string[] };

  try {
    const token = await getAppToken();
    const auth = { Authorization: `Bearer ${token}` };

    // Look back 48 hours to catch any missed emails
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    for (const supplier of WATCHED_SUPPLIERS) {
      // Build filter: sender domain + optional name filter (adam for BAWFS)
      const filter = encodeURIComponent(`hasAttachments eq true and receivedDateTime ge ${since}`);
      const orderby = encodeURIComponent(`receivedDateTime desc`);
      const select = encodeURIComponent(`id,subject,from,receivedDateTime,hasAttachments`);
      const url = `${GRAPH}/users/${MAILBOX}/messages?$select=${select}&$filter=${filter}&$top=20&$orderby=${orderby}`;

      const r = await fetch(url, { headers: auth });
      if (!r.ok) {
        const errBody = await r.text();
        console.error(`Graph error for ${supplier.name}: ${r.status} ${errBody}`);
        results.errors.push(`Graph error for ${supplier.name}: ${r.status} - ${errBody.slice(0, 200)}`);
        continue;
      }

      const data = await r.json();
      const messages = (data.value || []).filter((m: any) => {
        const addr = m.from?.emailAddress?.address?.toLowerCase() || "";
        const name = m.from?.emailAddress?.name?.toLowerCase() || "";
        const matchesDomain = addr.includes(supplier.domain);
        // For BAWFS: only process emails from Adam
        if (supplier.domain === "bawfs.com") {
          return matchesDomain && (addr.includes(ADAM_FILTER) || name.includes(ADAM_FILTER));
        }
        return matchesDomain;
      });

      console.log(`${supplier.name}: ${messages.length} emails with attachments`);

      for (const msg of messages) {
        // Get attachments
        const attRes = await fetch(
          `${GRAPH}/users/${MAILBOX}/messages/${msg.id}/attachments?$select=id,name,contentType,size`,
          { headers: auth }
        );
        if (!attRes.ok) continue;
        const attData = await attRes.json();

        for (const att of (attData.value || [])) {
          const name: string = att.name || "";
          const ct: string = (att.contentType || "").toLowerCase();
          const isPdf = ct.includes("pdf") || name.toLowerCase().endsWith(".pdf");
          const isExcel = ct.includes("excel") || ct.includes("spreadsheet") ||
            name.toLowerCase().endsWith(".xlsx") || name.toLowerCase().endsWith(".xls");

          if (!isPdf && !isExcel) continue;
          if (att.size > 10 * 1024 * 1024) continue; // skip >10MB

          results.processed++;

          // Fetch attachment content
          const contentRes = await fetch(
            `${GRAPH}/users/${MAILBOX}/messages/${msg.id}/attachments/${att.id}`,
            { headers: auth }
          );
          if (!contentRes.ok) continue;
          const contentData = await contentRes.json();
          const b64: string = contentData.contentBytes || "";
          if (!b64) continue;

          let rows: any[] = [];

          if (isPdf) {
            rows = await extractPricesFromPdf(b64, name, supplier.name, supabaseUrl, serviceKey);
          } else {
            // Excel — parse client-side via CSV conversion would need XLSX library
            // For edge function, we'll use a simple approach: try to extract via Claude as a document
            rows = await extractPricesFromPdf(b64, name, supplier.name, supabaseUrl, serviceKey);
          }

          if (rows.length === 0) {
            console.log(`No prices extracted from ${name}`);
            continue;
          }

          console.log(`Extracted ${rows.length} prices from ${name}`);

          // Upsert into price_list_items — update price if part number exists
          for (const row of rows) {
            if (!row.part_number || !row.unit_cost) continue;

            // Check if part number exists
            const { data: existing } = await supabase
              .from("price_list_items")
              .select("id, unit_cost")
              .eq("part_number", row.part_number)
              .eq("is_active", true)
              .maybeSingle();

            if (existing) {
              // Update price if changed
              if (Math.abs(existing.unit_cost - row.unit_cost) > 0.01) {
                await supabase.from("price_list_items").update({
                  unit_cost: row.unit_cost,
                  labour_cost: row.labour_cost || existing.unit_cost,
                  updated_at: new Date().toISOString(),
                  notes: `Price updated from ${supplier.name} ${name} on ${new Date().toLocaleDateString("en-GB")}`,
                }).eq("id", existing.id);
                results.updated++;
              }
            } else {
              // Insert new item
              await supabase.from("price_list_items").insert({
                part_number: row.part_number,
                description: row.description,
                manufacturer: row.manufacturer || supplier.name,
                model: row.model || null,
                category: row.category || "Other",
                unit_cost: row.unit_cost,
                labour_cost: row.labour_cost || 0,
                markup_pct: 25,
                keywords: [row.part_number.toLowerCase(), ...(row.description?.toLowerCase().split(/\s+/) || [])].filter(w => w.length > 2),
                is_active: true,
                upload_batch: `AUTO-${supplier.name}-${new Date().toISOString().split("T")[0]}`,
                notes: `Auto-imported from ${supplier.name} ${name}`,
              });
              results.imported++;
            }
          }
        }
      }
    }

    console.log("import-supplier-prices complete:", results);
    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("import-supplier-prices:", msg);
    return new Response(JSON.stringify({ error: msg, ...results }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
