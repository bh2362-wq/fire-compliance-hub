import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token error: ${err}`);
  }
  return (await res.json()).access_token;
}

const GRAPH = "https://graph.microsoft.com/v1.0";
const MSG_SELECT =
  "id,subject,from,toRecipients,receivedDateTime,isRead,hasAttachments,bodyPreview,importance";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, mailbox, query, sender, limit = 20, offset = 0, messageId, attachmentId } = body;

    if (!mailbox) throw new Error("mailbox is required");

    const token = await getAppToken();
    const auth = { Authorization: `Bearer ${token}` };

    // ── list_inbox ─────────────────────────────────────────────────────────────
    if (action === "list_inbox") {
      const top = Math.min(limit, 50);
      const skip = offset;
      let url = `${GRAPH}/users/${mailbox}/messages?$select=${MSG_SELECT}&$top=${top}&$skip=${skip}&$orderby=receivedDateTime desc`;
      if (sender) {
        url = `${GRAPH}/users/${mailbox}/messages?$select=${MSG_SELECT}&$top=${top}&$skip=${skip}&$filter=from/emailAddress/address eq '${sender}'&$orderby=receivedDateTime desc`;
      }
      const r = await fetch(url, { headers: auth });
      if (!r.ok) throw new Error(`Graph error ${r.status}: ${await r.text()}`);
      const data = await r.json();
      return json({ messages: data.value || [], nextLink: data["@odata.nextLink"] });
    }

    // ── search ─────────────────────────────────────────────────────────────────
    if (action === "search") {
      if (!query) throw new Error("query required for search");
      const searchVal = encodeURIComponent(`"${query}"`);
      const url = `${GRAPH}/users/${mailbox}/messages?$search=${searchVal}&$select=${MSG_SELECT}&$top=${Math.min(limit, 50)}`;
      const r = await fetch(url, { headers: auth });
      if (!r.ok) throw new Error(`Graph error ${r.status}: ${await r.text()}`);
      const data = await r.json();
      return json({ messages: data.value || [] });
    }

    // ── get_message ────────────────────────────────────────────────────────────
    if (action === "get_message") {
      if (!messageId) throw new Error("messageId required");
      const url = `${GRAPH}/users/${mailbox}/messages/${messageId}?$select=id,subject,from,receivedDateTime,body,hasAttachments`;
      const r = await fetch(url, { headers: auth });
      if (!r.ok) throw new Error(`Graph error ${r.status}: ${await r.text()}`);
      const msg = await r.json();
      // Strip HTML to plain text for scanner
      const plain = (msg.body?.content || "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s{2,}/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim();
      return json({
        id: msg.id,
        subject: msg.subject,
        from: msg.from?.emailAddress,
        receivedDateTime: msg.receivedDateTime,
        body: plain,
        hasAttachments: msg.hasAttachments,
      });
    }

    // ── list_attachments ───────────────────────────────────────────────────────
    if (action === "list_attachments") {
      if (!messageId) throw new Error("messageId required");
      const url = `${GRAPH}/users/${mailbox}/messages/${messageId}/attachments?$select=id,name,contentType,size`;
      const r = await fetch(url, { headers: auth });
      if (!r.ok) throw new Error(`Graph error ${r.status}: ${await r.text()}`);
      const data = await r.json();
      return json({ attachments: data.value || [] });
    }

    // ── get_attachment ─────────────────────────────────────────────────────────
    // Returns base64-encoded file content for Excel/CSV price lists
    if (action === "get_attachment") {
      if (!messageId || !attachmentId) throw new Error("messageId and attachmentId required");
      const url = `${GRAPH}/users/${mailbox}/messages/${messageId}/attachments/${attachmentId}`;
      const r = await fetch(url, { headers: auth });
      if (!r.ok) throw new Error(`Graph error ${r.status}: ${await r.text()}`);
      const att = await r.json();
      return json({
        name: att.name,
        contentType: att.contentType,
        size: att.size,
        contentBytes: att.contentBytes, // base64
      });
    }

    // ── supplier_price_emails ──────────────────────────────────────────────────
    // Find most recent price list emails from Huvo + BAWFS
    if (action === "supplier_price_emails") {
      const suppliers = [
        { name: "Huvo", email: "sales@huvo.co.uk" },
        { name: "Black & White Fire", email: "admin@bawfs.com" },
      ];
      const results = [];
      for (const s of suppliers) {
        const url = `${GRAPH}/users/${mailbox}/messages?$select=${MSG_SELECT}&$top=5&$filter=from/emailAddress/address eq '${s.email}'&$orderby=receivedDateTime desc`;
        const r = await fetch(url, { headers: auth });
        if (!r.ok) continue;
        const data = await r.json();
        const msgs = (data.value || []).filter((m: any) => m.hasAttachments);
        results.push(...msgs.map((m: any) => ({ ...m, supplierName: s.name })));
      }
      results.sort((a, b) =>
        new Date(b.receivedDateTime).getTime() - new Date(a.receivedDateTime).getTime()
      );
      return json({ messages: results });
    }

    // ── purchase_history ───────────────────────────────────────────────────────
    // Search BAWFS/Huvo emails for a part number to find last purchase price.
    // NOTE: Graph API does not allow combining $search + $filter in one request.
    // Fix: search broadly (no sender filter), then post-filter by supplier email.
    // Also try multiple search variants because KQL treats hyphens as separators.
    if (action === "purchase_history") {
      if (!query) throw new Error("query (part number) required");
      const supplierEmails = ["sales@huvo.co.uk", "admin@bawfs.com"];

      // Build multiple search variants for robustness
      // e.g. "S4-711" → try "S4-711" and "S4 711" (KQL hyphen handling)
      const variants = [
        query,
        query.replace(/-/g, " "),        // S4 711
        query.replace(/-/g, ""),         // S4711
        query.toUpperCase(),
        query.toLowerCase(),
      ].filter((v, i, arr) => arr.indexOf(v) === i); // dedupe

      const seen = new Set<string>();
      const results: any[] = [];

      for (const variant of variants) {
        // Wrap in quotes for exact phrase matching
        const searchVal = encodeURIComponent(`"${variant}"`);
        const url = `${GRAPH}/users/${mailbox}/messages?$search=${searchVal}&$select=${MSG_SELECT}&$top=25&$orderby=receivedDateTime desc`;
        try {
          const r = await fetch(url, { headers: auth });
          if (!r.ok) {
            console.error("Search variant failed:", variant, r.status, await r.text());
            continue;
          }
          const data = await r.json();
          for (const msg of (data.value || [])) {
            if (seen.has(msg.id)) continue;
            const senderAddr = msg.from?.emailAddress?.address?.toLowerCase() || "";
            const matchedSupplier = supplierEmails.find(s => senderAddr.includes(s.split("@")[1]));
            if (matchedSupplier) {
              seen.add(msg.id);
              results.push({ ...msg, supplierEmail: matchedSupplier });
            }
          }
        } catch (e) {
          console.error("Search error:", e);
          continue;
        }
        // Stop early if we found results
        if (results.length >= 10) break;
      }

      results.sort((a, b) =>
        new Date(b.receivedDateTime).getTime() - new Date(a.receivedDateTime).getTime()
      );
      return json({ messages: results.slice(0, 15) });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("outlook-email-proxy:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function json(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
