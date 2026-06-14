import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY") ?? "");
// Internal address that gets notified when a customer accepts a quote
// on the portal. Override via env so prod / staging can target
// different inboxes without code changes.
const NOTIFY_TO = Deno.env.get("ACCEPTANCE_NOTIFY_TO") ?? "admin@bhofire.com";
const NOTIFY_FROM = "BHO Fire Portal <noreply@firelogbook.co.uk>";

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 10; // max 10 requests per minute per IP

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Rate limiting
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(clientIp)) {
    return new Response(JSON.stringify({ error: "Too many requests. Please try again later." }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const token = url.searchParams.get("token");

      if (!token || token.length < 20 || token.length > 128) {
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: quotation, error } = await supabase
        .from("quotations")
        .select(`
          quotation_number, title, total_amount, valid_until, created_at, status,
          client_accepted_at, latest_pdf_path,
          sites:site_id(name),
          customers:customer_id(name)
        `)
        .eq("acceptance_token", token)
        .single();

      if (error || !quotation) {
        return new Response(JSON.stringify({ error: "Quotation not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Mint a 1h signed URL for the rendered PDF so the customer can
      // review what they're accepting on the portal itself (previously
      // they only saw the summary card — had to dig back into the
      // email to see scope + line items).
      let pdfUrl: string | null = null;
      const pdfPath = (quotation as any).latest_pdf_path as string | null;
      if (pdfPath) {
        const { data: signed } = await supabase.storage
          .from("quote-outputs")
          .createSignedUrl(pdfPath, 3600);
        pdfUrl = signed?.signedUrl ?? null;
      }

      return new Response(JSON.stringify({
        quotation_number: quotation.quotation_number,
        title: quotation.title,
        total_amount: quotation.total_amount,
        valid_until: quotation.valid_until,
        created_at: quotation.created_at,
        status: quotation.status,
        client_accepted_at: quotation.client_accepted_at,
        site_name: (quotation.sites as any)?.name || null,
        customer_name: (quotation.customers as any)?.name || null,
        pdf_url: pdfUrl,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { token, accepted_by_name, po_number, signature, action, decline_reason, declined_by_name } = body;
      // action defaults to "accept" so older clients (pre-decline-flow)
      // keep working. New "decline" branch takes its own light input.
      const flow: "accept" | "decline" = action === "decline" ? "decline" : "accept";

      if (!token || token.length < 20 || token.length > 128) {
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── DECLINE branch — light validation, no signature required ──
      if (flow === "decline") {
        const name = typeof declined_by_name === "string" ? declined_by_name.trim() : "";
        if (!name || name.length > 200) {
          return new Response(JSON.stringify({ error: "Name is required (max 200 characters)" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const reason = typeof decline_reason === "string" ? decline_reason.trim().slice(0, 2000) : "";

        const { data: q, error: qErr } = await supabase
          .from("quotations")
          .select("id, status, client_accepted_at, client_declined_at, quotation_number, customers:customer_id(name), sites:site_id(name)")
          .eq("acceptance_token", token)
          .single();
        if (qErr || !q) {
          return new Response(JSON.stringify({ error: "Quotation not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (q.client_accepted_at || q.status === "accepted" || q.status === "customer_accepted") {
          return new Response(JSON.stringify({ error: "This quotation has already been accepted" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (q.client_declined_at) {
          return new Response(JSON.stringify({ error: "This quotation has already been declined" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { error: updErr } = await supabase
          .from("quotations")
          .update({
            status: "declined",
            client_declined_at: new Date().toISOString(),
            client_decline_reason: reason ? escapeHtml(reason) : null,
            // Reuse accepted_by_name to capture the decliner's name —
            // saves a schema column; the column is semantically "the
            // person who clicked the final button on the portal".
            accepted_by_name: escapeHtml(name),
          })
          .eq("id", q.id);
        if (updErr) {
          console.error("Decline update failed:", updErr);
          return new Response(JSON.stringify({ error: "Failed to record decline" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Notify BHO — fire-and-forget. Sales can follow up on
        // declines (price negotiation, scope clarification).
        try {
          if (Deno.env.get("RESEND_API_KEY")) {
            const number = q.quotation_number ?? "(unknown)";
            const siteName = (q.sites as any)?.name ?? "—";
            const customerName = (q.customers as any)?.name ?? "—";
            const reasonHtml = reason
              ? `<p><strong>Reason given:</strong></p><blockquote style="border-left:3px solid #d1d5db;padding:4px 12px;color:#374151;margin:0">${escapeHtml(reason).replace(/\n/g, "<br>")}</blockquote>`
              : `<p style="color:#6b7280;font-style:italic">No reason provided.</p>`;
            await resend.emails.send({
              from: NOTIFY_FROM,
              to: [NOTIFY_TO],
              subject: `Quote ${number} DECLINED by ${name}`,
              html: `
                <h2 style="margin:0 0 12px 0">Quote ${number} declined</h2>
                <p>${escapeHtml(name)} declined the quote on the customer portal.</p>
                <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
                  <tr><td style="padding:4px 12px 4px 0"><strong>Customer:</strong></td><td>${escapeHtml(customerName)}</td></tr>
                  <tr><td style="padding:4px 12px 4px 0"><strong>Site:</strong></td><td>${escapeHtml(siteName)}</td></tr>
                </table>
                ${reasonHtml}
                <p style="color:#6b7280;font-size:12px;margin-top:16px">Worth a follow-up call — they may negotiate on price, timing, or scope.</p>
              `,
            });
          }
        } catch (e) {
          console.error("Notify-BHO decline email failed (non-fatal):", e);
        }

        return new Response(JSON.stringify({ success: true, status: "declined" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── ACCEPT branch (existing flow) ──
      if (!accepted_by_name || typeof accepted_by_name !== "string" || accepted_by_name.trim().length === 0 || accepted_by_name.length > 200) {
        return new Response(JSON.stringify({ error: "Name is required (max 200 characters)" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Accept two signature shapes now:
      //   - "typed:<name>"          — new typed-name flow (AcceptQuote
      //                                page uses TypedSignature, engineer
      //                                asked for this in June '26).
      //   - "data:image/<…>;base64" — legacy SignaturePad PNGs, kept so
      //                                older browsers or any in-flight
      //                                links don't break mid-acceptance.
      if (!signature || typeof signature !== "string") {
        return new Response(JSON.stringify({ error: "Digital signature is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const isTyped = signature.startsWith("typed:");
      const isImage = signature.startsWith("data:image/");
      if (!isTyped && !isImage) {
        return new Response(JSON.stringify({ error: "Digital signature is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Length caps differ — typed names are tiny, base64 PNGs are huge.
      const maxLen = isTyped ? 250 : 500000;
      if (signature.length > maxLen) {
        return new Response(JSON.stringify({ error: "Signature data too large" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (isTyped && signature.length <= "typed:".length) {
        return new Response(JSON.stringify({ error: "Please type your name into the signature field" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (po_number && (typeof po_number !== "string" || po_number.length > 100)) {
        return new Response(JSON.stringify({ error: "PO number must be under 100 characters" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check quotation exists and is in a valid state
      const { data: quotation, error: fetchError } = await supabase
        .from("quotations")
        .select("id, status, client_accepted_at")
        .eq("acceptance_token", token)
        .single();

      if (fetchError || !quotation) {
        return new Response(JSON.stringify({ error: "Quotation not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (quotation.client_accepted_at) {
        return new Response(JSON.stringify({ error: "This quotation has already been accepted" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (quotation.status === "accepted") {
        return new Response(JSON.stringify({ error: "This quotation has already been accepted" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Sanitize text inputs
      const safeName = escapeHtml(accepted_by_name.trim());
      const safePo = po_number ? escapeHtml(po_number.trim()) : null;

      // Update quotation with client acceptance
      const { error: updateError } = await supabase
        .from("quotations")
        .update({
          status: "customer_accepted",
          accepted_by_name: safeName,
          client_acceptance_signature: signature,
          client_accepted_at: new Date().toISOString(),
          client_po_number: safePo,
        })
        .eq("id", quotation.id);

      if (updateError) {
        console.error("Update error:", updateError);
        return new Response(JSON.stringify({ error: "Failed to accept quotation" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fire-and-forget: notify BHO when a customer accepts on the
      // portal so the sales team doesn't have to manually poll the
      // Quotations page. Failure to send the email must not break
      // acceptance for the customer — they've already signed.
      try {
        const { data: meta } = await supabase
          .from("quotations")
          .select("quotation_number, title, total_amount, latest_pdf_path, sites:site_id(name), customers:customer_id(name, contact_email, contact_name, quote_email_recipients, email_recipients)")
          .eq("id", quotation.id)
          .single();
        const number = meta?.quotation_number ?? "(unknown)";
        const title = meta?.title ?? "Untitled quote";
        const total = typeof meta?.total_amount === "number" ? `£${meta.total_amount.toFixed(2)} + VAT` : "—";
        const siteName = (meta?.sites as any)?.name ?? "—";
        const customerName = (meta?.customers as any)?.name ?? "—";
        const poBit = safePo ? `<p><strong>PO number:</strong> ${safePo}</p>` : "";
        if (Deno.env.get("RESEND_API_KEY")) {
          await resend.emails.send({
            from: NOTIFY_FROM,
            to: [NOTIFY_TO],
            subject: `Quote ${number} accepted by ${safeName}`,
            html: `
              <h2 style="margin:0 0 12px 0">Quote ${number} accepted</h2>
              <p>${safeName} just accepted the quote on the customer portal.</p>
              <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
                <tr><td style="padding:4px 12px 4px 0"><strong>Customer:</strong></td><td>${customerName}</td></tr>
                <tr><td style="padding:4px 12px 4px 0"><strong>Site:</strong></td><td>${siteName}</td></tr>
                <tr><td style="padding:4px 12px 4px 0"><strong>Quote:</strong></td><td>${title}</td></tr>
                <tr><td style="padding:4px 12px 4px 0"><strong>Total:</strong></td><td>${total}</td></tr>
                <tr><td style="padding:4px 12px 4px 0"><strong>Accepted by:</strong></td><td>${safeName}</td></tr>
              </table>
              ${poBit}
              <p style="color:#6b7280;font-size:12px;margin-top:16px">Acceptance signature is stored against the quote in the CRM.</p>
            `,
          });
        }
      } catch (e) {
        console.error("Notify-BHO email failed (non-fatal):", e);
      }

      // Fire-and-forget: send the customer a copy of what they just
      // signed, with the rendered PDF attached. Gives them a record
      // and reduces "can you re-send me the quote?" emails. Failure
      // here must not break acceptance.
      try {
        if (Deno.env.get("RESEND_API_KEY")) {
          const { data: meta } = await supabase
            .from("quotations")
            .select("quotation_number, title, total_amount, latest_pdf_path, customers:customer_id(name, contact_email, quote_email_recipients, email_recipients)")
            .eq("id", quotation.id)
            .single();
          // Pick the best customer email. Multiple-recipient fields
          // are comma-separated; take the whole string for to[] later.
          const cust = (meta?.customers as any) ?? {};
          const recipientStr: string | null =
            cust.quote_email_recipients?.trim() ||
            cust.email_recipients?.trim() ||
            cust.contact_email?.trim() ||
            null;
          const recipients = recipientStr
            ? recipientStr.split(/[,;]+/).map((s: string) => s.trim()).filter((s: string) => /.+@.+\..+/.test(s))
            : [];
          if (recipients.length > 0) {
            // Attach the signed PDF if rendered. Fetch via service
            // role download, base64-encode for Resend.
            let attachments: Array<{ filename: string; content: string }> = [];
            const pdfPath = (meta as any)?.latest_pdf_path as string | null;
            if (pdfPath) {
              const { data: pdfBlob } = await supabase.storage.from("quote-outputs").download(pdfPath);
              if (pdfBlob) {
                const bytes = new Uint8Array(await pdfBlob.arrayBuffer());
                // Deno-native base64 — Buffer isn't available here.
                let bin = "";
                for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
                attachments = [{
                  filename: `${meta?.quotation_number ?? "quote"}.pdf`,
                  content: btoa(bin),
                }];
              }
            }
            const number = meta?.quotation_number ?? "(unknown)";
            const title = meta?.title ?? "your quotation";
            const total = typeof meta?.total_amount === "number" ? `£${meta.total_amount.toFixed(2)} + VAT` : "—";
            await resend.emails.send({
              from: NOTIFY_FROM,
              to: recipients,
              subject: `Confirmation: Quote ${number} accepted`,
              attachments,
              html: `
                <p>Hi ${escapeHtml(safeName)},</p>
                <p>Thanks for accepting <strong>${escapeHtml(title)}</strong> (${number}). We'll be in touch within one working day to schedule the works.</p>
                <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;margin:12px 0">
                  <tr><td style="padding:4px 12px 4px 0"><strong>Quote:</strong></td><td>${escapeHtml(number)}</td></tr>
                  <tr><td style="padding:4px 12px 4px 0"><strong>Total:</strong></td><td>${total}</td></tr>
                  ${safePo ? `<tr><td style="padding:4px 12px 4px 0"><strong>Your PO:</strong></td><td>${safePo}</td></tr>` : ""}
                  <tr><td style="padding:4px 12px 4px 0"><strong>Accepted:</strong></td><td>${new Date().toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}</td></tr>
                </table>
                ${attachments.length > 0 ? `<p>A signed copy of the quotation is attached for your records.</p>` : ""}
                <p>Questions? Reply to this email or call <a href="tel:+443300438659">0330 043 8659</a>.</p>
                <p style="margin-top:24px;color:#6b7280;font-size:12px">BHO Fire Ltd · Company Reg No. 12235152 · St Georges Business Park, Castle Rd, Sittingbourne ME10 3TB</p>
              `,
            });
          }
        }
      } catch (e) {
        console.error("Customer copy-back email failed (non-fatal):", e);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
