/**
 * auto-quote-builder edge function
 * Scans inbox, extracts items, looks up prices, creates draft quotes.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const GRAPH = "https://graph.microsoft.com/v1.0";

async function getGraphToken() {
  const res = await fetch(`https://login.microsoftonline.com/${Deno.env.get("MICROSOFT_TENANT_ID")}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: Deno.env.get("MICROSOFT_CLIENT_ID")!, client_secret: Deno.env.get("MICROSOFT_CLIENT_SECRET")!, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new Error(`Graph token: ${await res.text()}`);
  return (await res.json()).access_token;
}

async function callClaude(apiKey: string, system: string, user: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 3000, system, messages: [{ role: "user", content: user }] }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}`);
  const d = await res.json();
  return d.content?.find((b: any) => b.type === "text")?.text || "";
}

async function lookupItem(sb: any, description: string) {
  const q = description.toLowerCase();
  const [h, c, s] = await Promise.all([
    sb.from("price_list_items").select("part_number,description,short_name,unit_cost,manufacturer,category").or(`part_number.ilike.%${q}%,description.ilike.%${q}%,short_name.ilike.%${q}%`).eq("is_active", true).limit(5),
    sb.from("materials_catalog").select("part_number,description,retail_price,supplier_name,category").or(`part_number.ilike.%${q}%,description.ilike.%${q}%`).limit(5),
    sb.from("supplier_products").select("product_code,description,trade_price,supplier_name,category").or(`product_code.ilike.%${q}%,description.ilike.%${q}%`).limit(5),
  ]);
  const all = [
    ...(h.data||[]).map((r:any) => ({ part_number: r.part_number, description: r.description, unit_cost: Number(r.unit_cost)||0, source: "huvo", supplier: r.manufacturer||"Huvo" })),
    ...(c.data||[]).map((r:any) => ({ part_number: r.part_number, description: r.description, unit_cost: Number(r.retail_price)||0, source: "catalog", supplier: r.supplier_name||"" })),
    ...(s.data||[]).map((r:any) => ({ part_number: r.product_code, description: r.description, unit_cost: Number(r.trade_price)||0, source: "supplier", supplier: r.supplier_name||"" })),
  ];
  const words = q.split(/\s+/).filter((w:string) => w.length > 2);
  const scored = all.map((item:any) => {
    const desc = (item.description||"").toLowerCase();
    const matches = words.filter((w:string) => desc.includes(w)).length;
    return { ...item, confidence: words.length > 0 ? matches / words.length : 0 };
  }).sort((a:any,b:any) => b.confidence - a.confidence);
  if (!scored.length) return { match: null, candidates: [], confidence: 0 };
  const best = scored[0];
  return { match: best.confidence >= 0.7 ? best : null, candidates: scored.slice(0, 3), confidence: best.confidence };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) return new Response(JSON.stringify({ error: "No API key" }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const hoursBack = body.hours_back || 24;
    const mailbox = body.mailbox || Deno.env.get("AQ_MAILBOX") || "admin@bhofire.com";

    const token = await getGraphToken();
    const since = new Date(Date.now() - hoursBack * 3600_000).toISOString();
    const emailRes = await fetch(`${GRAPH}/users/${mailbox}/messages?$filter=receivedDateTime ge ${since}&$select=id,subject,bodyPreview,body,sender,receivedDateTime&$top=20&$orderby=receivedDateTime desc`, { headers: { Authorization: `Bearer ${token}` } });
    if (!emailRes.ok) throw new Error(`Graph ${emailRes.status}`);
    const { value: emails = [] } = await emailRes.json();

    const emailIds = emails.map((e:any) => e.id);
    const { data: processed } = await sb.from("auto_quote_jobs").select("email_id").in("email_id", emailIds);
    const processedSet = new Set((processed||[]).map((r:any) => r.email_id));

    let created = 0, skipped = 0, needsReview = 0;

    for (const email of emails) {
      if (processedSet.has(email.id)) { skipped++; continue; }
      const emailBody = email.body?.content?.replace(/<[^>]*>/g, " ") || email.bodyPreview || "";
      const subject = email.subject || "";

      // Classify
      const classifyText = await callClaude(ANTHROPIC_API_KEY,
        "Classify emails for a fire alarm contractor. Return only valid JSON.",
        `Subject: "${subject}"\n\nBody:\n${emailBody.slice(0, 2000)}\n\nIs this a quote-worthy enquiry/service sheet/remedial request? JSON:\n{"is_quote_request": true/false, "type": "enquiry|service_sheet|remedial|tender|other"}`
      );
      let cls: any;
      try { cls = JSON.parse(classifyText.replace(/```json|```/g, "").trim()); } catch { cls = { is_quote_request: false }; }

      if (!cls.is_quote_request) {
        await sb.from("auto_quote_jobs").insert({ email_id: email.id, subject, sender: email.sender?.emailAddress?.address, status: "not_quote", email_type: cls.type, received_at: email.receivedDateTime });
        skipped++; continue;
      }

      // Extract items
      const extractText = await callClaude(ANTHROPIC_API_KEY,
        "Extract materials from fire alarm job emails. Return only valid JSON.",
        `Subject: "${subject}"\n\nBody:\n${emailBody.slice(0, 4000)}\n\nExtract ALL items to supply/install:\n{"site_name": null, "site_address": null, "items": [{"description": "item from email", "quantity": 1, "notes": ""}]}`
      );
      let extracted: any;
      try { extracted = JSON.parse(extractText.replace(/```json|```/g, "").trim()); } catch { extracted = { items: [] }; }

      if (!extracted.items?.length) {
        await sb.from("auto_quote_jobs").insert({ email_id: email.id, subject, sender: email.sender?.emailAddress?.address, status: "no_items", email_type: cls.type, received_at: email.receivedDateTime });
        skipped++; continue;
      }

      const quotationLines: any[] = [];
      const disambiguationItems: any[] = [];

      for (const item of extracted.items) {
        const { match, candidates, confidence } = await lookupItem(sb, item.description);
        if (match && confidence >= 0.7) {
          quotationLines.push({ description: match.description, quantity: item.quantity || 1, unit_price: match.unit_cost, total_price: match.unit_cost * (item.quantity || 1), part_number: match.part_number, source: match.source, confidence: Math.round(confidence * 100), original_desc: item.description });
        } else {
          disambiguationItems.push({ original_description: item.description, quantity: item.quantity || 1, notes: item.notes || null, candidates: candidates.map((c:any) => ({ part_number: c.part_number, description: c.description, unit_cost: c.unit_cost, source: c.source, supplier: c.supplier, confidence: Math.round(c.confidence * 100) })), status: "pending" });
          needsReview++;
        }
      }

      const { data: quoNum } = await sb.rpc("get_next_quotation_number");
      const totalAmount = quotationLines.reduce((s:number, l:any) => s + l.total_price, 0);

      const { data: quotation } = await sb.from("quotations").insert({
        quotation_number: quoNum,
        title: `Auto-quote: ${extracted.site_name || subject.slice(0, 60)}`,
        summary: `Auto-generated from email: "${subject}". ${disambiguationItems.length} item(s) need review.`,
        status: "draft", total_amount: totalAmount,
        notes: `From: ${email.sender?.emailAddress?.address}`,
      }).select("id").single();

      if (quotation && quotationLines.length > 0) {
        await sb.from("quotation_line_items").insert(
          quotationLines.map((l:any, i:number) => ({ quotation_id: quotation.id, description: l.description, quantity: l.quantity, unit_price: l.unit_price, total_price: l.total_price, item_name: l.part_number || null, priority: "medium", sort_order: i, notes: `${l.source} | ${l.confidence}% match` }))
        );
      }

      const { data: job } = await sb.from("auto_quote_jobs").insert({
        email_id: email.id, subject, sender: email.sender?.emailAddress?.address,
        status: disambiguationItems.length > 0 ? "needs_review" : "complete",
        email_type: cls.type, received_at: email.receivedDateTime,
        quotation_id: quotation?.id || null, site_name: extracted.site_name || null,
        site_address: extracted.site_address || null,
        items_matched: quotationLines.length, items_pending: disambiguationItems.length,
      }).select("id").single();

      if (job && disambiguationItems.length > 0) {
        await sb.from("auto_quote_disambiguations").insert(disambiguationItems.map((d:any) => ({ ...d, job_id: job.id })));
      }
      created++;
    }

    return new Response(JSON.stringify({ success: true, created, skipped, needs_review: needsReview }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("auto-quote-builder:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
