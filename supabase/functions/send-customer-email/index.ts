import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

interface Req {
  to: string | string[];
  subject: string;
  body: string; // plain text
  customerId?: string;
  siteId?: string;
  visitId?: string;
  draftId?: string; // if sending an existing draft, mark it sent
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { to, subject, body, customerId, siteId, visitId, draftId }: Req = await req.json();

    const recipients = (Array.isArray(to) ? to : [to])
      .map((e) => (e || "").trim())
      .filter(Boolean);

    if (!recipients.length) return json({ error: "No recipients" }, 400);
    if (!subject?.trim()) return json({ error: "Missing subject" }, 400);
    if (!body?.trim()) return json({ error: "Missing body" }, 400);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalid = recipients.filter((e) => !emailRegex.test(e));
    if (invalid.length) return json({ error: `Invalid email(s): ${invalid.join(", ")}` }, 400);

    const html = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; white-space: pre-wrap; line-height: 1.5;">${escapeHtml(body)}</div>`;

    const { data, error } = await resend.emails.send({
      from: "Fire Log Book <noreply@firelogbook.co.uk>",
      to: recipients,
      subject,
      html,
      text: body,
    });

    if (error) {
      console.error("Resend error:", error);
      return json({ error: error.message || "Send failed" }, 500);
    }

    // Service-role client for server-side logging (bypasses RLS)
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    await sb.from("email_logs").insert({
      customer_id: customerId || null,
      site_id: siteId || null,
      visit_id: visitId || null,
      recipients,
      subject,
      email_type: "client_summary",
      resend_id: data?.id,
      status: "sent",
    });

    if (draftId) {
      await sb
        .from("customer_email_drafts")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", draftId);
    }

    return json({ success: true, id: data?.id });
  } catch (e) {
    console.error("send-customer-email error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
