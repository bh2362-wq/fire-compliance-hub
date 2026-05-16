import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

const GRAPH = "https://graph.microsoft.com/v1.0";
const MSG_SELECT =
  "id,subject,from,toRecipients,receivedDateTime,isRead,hasAttachments,bodyPreview,importance";

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
    },
  );
  if (!res.ok) throw new Error(`Token error: ${await res.text()}`);
  return (await res.json()).access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Mailboxes to poll: env override (comma-separated) or default
    const mailboxesEnv = Deno.env.get("POLL_MAILBOXES") || "ben@bhofire.com";
    const mailboxes = mailboxesEnv.split(",").map((s) => s.trim()).filter(Boolean);
    const limit = 50;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = await getAppToken();
    const auth = { Authorization: `Bearer ${token}` };

    const summary: Record<string, { fetched: number; upserted: number; error?: string }> = {};

    for (const mailbox of mailboxes) {
      summary[mailbox] = { fetched: 0, upserted: 0 };
      try {
        const url = `${GRAPH}/users/${mailbox}/messages?$select=${MSG_SELECT}&$top=${limit}&$orderby=receivedDateTime desc`;
        const r = await fetch(url, { headers: auth });
        if (!r.ok) {
          summary[mailbox].error = `Graph ${r.status}: ${await r.text()}`;
          continue;
        }
        const data = await r.json();
        const messages = data.value || [];
        summary[mailbox].fetched = messages.length;

        if (!messages.length) continue;

        const rows = messages.map((m: any) => ({
          mailbox,
          message_id: m.id,
          subject: m.subject,
          from_address: m.from?.emailAddress?.address ?? null,
          from_name: m.from?.emailAddress?.name ?? null,
          to_recipients: m.toRecipients ?? [],
          received_at: m.receivedDateTime,
          body_preview: m.bodyPreview,
          has_attachments: !!m.hasAttachments,
          is_read: !!m.isRead,
          importance: m.importance,
          raw: m,
        }));

        const { error, count } = await supabase
          .from("scanned_emails")
          .upsert(rows, { onConflict: "mailbox,message_id", count: "exact", ignoreDuplicates: false });

        if (error) {
          summary[mailbox].error = error.message;
        } else {
          summary[mailbox].upserted = count ?? rows.length;
        }
      } catch (e) {
        summary[mailbox].error = e instanceof Error ? e.message : String(e);
      }
    }

    return new Response(JSON.stringify({ ok: true, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("poll-mailbox:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
