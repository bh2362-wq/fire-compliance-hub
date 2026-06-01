// parse-remittance-email
//
// Input:  { scanned_email_id }  (a row id from public.scanned_emails)
// Action: fetch the full email body + any PDF attachments via Outlook Graph,
//         call Claude to extract remittance structure, write a row to
//         public.remittance_advices + per-invoice rows to
//         public.remittance_line_items, and best-effort match each line to
//         an existing xero_invoices row by invoice number.
// Output: { remittance_id, status, line_item_count, matched_count }
//
// Idempotent: if a remittance_advices row already exists for
// (message_id, mailbox) we return it without re-running the AI call. The
// background scan-remittance-emails worker relies on this to safely retry.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ScannedEmail {
  id: string;
  message_id: string;
  mailbox: string;
  from_address: string | null;
  from_name: string | null;
  subject: string | null;
  received_at: string | null;
  body_preview: string | null;
  raw: Record<string, unknown> | null;
}

interface PdfAttachment {
  name: string;
  contentBytes: string;
}

interface FetchedEmail {
  body: string;
  pdfs: PdfAttachment[];
}

interface ParsedRemittance {
  is_remittance: boolean;
  payment_date: string | null;
  total_amount: number | null;
  currency: string | null;
  payer_name: string | null;
  line_items: Array<{
    invoice_number: string | null;
    amount: number | null;
    raw_text: string | null;
  }>;
  confidence_notes: string | null;
}

const SYSTEM_PROMPT = `You are an accounts assistant at BHO Fire Ltd. Your job is to extract structured remittance-advice data from an email (and any attached PDF). Remittance advices tell BHO that one or more of their invoices have been paid.

A remittance advice typically contains:
- A payment date (when funds were transferred)
- A total amount paid
- One or more invoice references, each with the amount allocated to that invoice
- The payer's name (often "Bibby Factoring Solutions" or similar, sometimes the end customer)

INVOICE NUMBER FORMATS — BHO invoices typically look like "INV-1234", "INV-2024-0123", or sometimes just a number ("12345"). Extract whatever invoice references appear; we'll match them downstream.

OUTPUT FORMAT — return ONLY a JSON object, no prose / markdown / code fences:
{
  "is_remittance": true|false,
  "payment_date": "YYYY-MM-DD" | null,
  "total_amount": 1234.56 | null,
  "currency": "GBP" | "EUR" | null,
  "payer_name": "..." | null,
  "line_items": [
    { "invoice_number": "INV-1234" | null, "amount": 250.00 | null, "raw_text": "the snippet you extracted this from" }
  ],
  "confidence_notes": "brief note on whether the extraction is reliable"
}

RULES
- If the email is clearly NOT a remittance advice (e.g. it's a sales enquiry, a complaint, a generic newsletter), set is_remittance=false and return empty line_items.
- Amounts must be plain decimal numbers, no currency symbols, no thousand separators (e.g. 1250.00 not "£1,250.00").
- Dates must be ISO format. If the email gives a date like "30 May 2026" convert to "2026-05-30".
- If you see a sum of allocations that matches a stated total, trust the stated total.
- If an invoice number is partial (e.g. just "1234"), include it as-is; we'll fuzzy-match.
- Never invent invoice numbers that aren't visibly present in the email or PDF.`;

async function fetchEmailWithAttachments(
  supabase: ReturnType<typeof createClient>,
  messageId: string,
  mailbox: string,
  authHeader: string,
): Promise<FetchedEmail> {
  // Step 1: body + hasAttachments flag.
  const { data: msgData, error: msgErr } = await supabase.functions.invoke("outlook-email-proxy", {
    body: { action: "get_message", mailbox, messageId },
    headers: { Authorization: authHeader },
  });
  if (msgErr) throw new Error(`outlook-email-proxy get_message: ${msgErr.message}`);
  if (msgData?.error) throw new Error(`outlook-email-proxy get_message: ${msgData.error}`);

  // The proxy already strips HTML to plain text.
  const body = String(msgData?.body ?? "");
  const hasAttachments = Boolean(msgData?.hasAttachments);

  const pdfs: PdfAttachment[] = [];
  if (hasAttachments) {
    // Step 2: list attachments (metadata only).
    const { data: listData, error: listErr } = await supabase.functions.invoke("outlook-email-proxy", {
      body: { action: "list_attachments", mailbox, messageId },
      headers: { Authorization: authHeader },
    });
    if (listErr) throw new Error(`outlook-email-proxy list_attachments: ${listErr.message}`);

    const items = (listData?.attachments as Array<Record<string, unknown>>) ?? [];
    const pdfMeta = items.filter((a) => {
      const ct = String(a.contentType ?? "").toLowerCase();
      const name = String(a.name ?? "").toLowerCase();
      return ct.includes("pdf") || name.endsWith(".pdf");
    });

    // Step 3: fetch each PDF's contentBytes individually. Capped at 5 to
    // avoid blowing through the Claude attachment limit on a single email.
    for (const att of pdfMeta.slice(0, 5)) {
      const { data: attData, error: attErr } = await supabase.functions.invoke("outlook-email-proxy", {
        body: { action: "get_attachment", mailbox, messageId, attachmentId: String(att.id) },
        headers: { Authorization: authHeader },
      });
      if (attErr || attData?.error) continue; // best-effort — skip a failing attachment
      const contentBytes = String(attData?.contentBytes ?? "");
      if (contentBytes) {
        pdfs.push({ name: String(attData?.name ?? att.name ?? "attachment.pdf"), contentBytes });
      }
    }
  }

  return { body, pdfs };
}

async function callClaude(
  body: string,
  pdfs: PdfAttachment[],
  emailMeta: Pick<ScannedEmail, "subject" | "from_address" | "from_name" | "received_at">,
): Promise<ParsedRemittance> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const userText =
    `Extract remittance data from this email.\n\n` +
    `From: ${emailMeta.from_name ?? ""} <${emailMeta.from_address ?? ""}>\n` +
    `Subject: ${emailMeta.subject ?? ""}\n` +
    `Received: ${emailMeta.received_at ?? ""}\n\n` +
    `--- BODY ---\n${body.slice(0, 30_000)}\n--- END BODY ---\n\n` +
    `Return JSON only.`;

  const content: Array<Record<string, unknown>> = [{ type: "text", text: userText }];
  for (const pdf of pdfs) {
    const b64 = pdf.contentBytes.includes(",") ? pdf.contentBytes.split(",")[1] : pdf.contentBytes;
    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: b64 },
      title: pdf.name,
    });
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API ${response.status}: ${errText.slice(0, 300)}`);
  }
  const data = await response.json();
  const rawText: string =
    data.content
      ?.filter((c: { type: string }) => c.type === "text")
      ?.map((c: { text: string }) => c.text)
      ?.join("\n")
      ?.trim() || "";
  if (!rawText) throw new Error("No text content in Claude response");

  // Tolerate code fences just in case.
  const codeBlock = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = codeBlock ? codeBlock[1] : rawText;

  try {
    return JSON.parse(jsonText) as ParsedRemittance;
  } catch (e) {
    throw new Error(`Failed to parse Claude JSON: ${(e as Error).message}. Raw: ${rawText.slice(0, 200)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const { scanned_email_id } = (await req.json()) as { scanned_email_id?: string };
    if (!scanned_email_id) throw new Error("Missing scanned_email_id");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: email, error: emailErr } = await supabase
      .from("scanned_emails")
      .select("id, message_id, mailbox, from_address, from_name, subject, received_at, body_preview, raw")
      .eq("id", scanned_email_id)
      .maybeSingle();
    if (emailErr || !email) throw new Error(`Email not found: ${emailErr?.message ?? scanned_email_id}`);
    const emailRow = email as unknown as ScannedEmail;

    // Idempotency: short-circuit if we've already parsed this message.
    const { data: existing } = await supabase
      .from("remittance_advices")
      .select("id, status")
      .eq("message_id", emailRow.message_id)
      .eq("mailbox", emailRow.mailbox)
      .maybeSingle();
    if (existing) {
      return new Response(
        JSON.stringify({ remittance_id: existing.id, status: existing.status, line_item_count: 0, matched_count: 0, already_parsed: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let parsed: ParsedRemittance;
    try {
      const { body, pdfs } = await fetchEmailWithAttachments(
        supabase,
        emailRow.message_id,
        emailRow.mailbox,
        authHeader,
      );
      parsed = await callClaude(body, pdfs, emailRow);
    } catch (parseErr) {
      // Record the failed attempt so the office can see it in the review queue.
      const { data: failedRow } = await supabase
        .from("remittance_advices")
        .insert({
          scanned_email_id: emailRow.id,
          message_id: emailRow.message_id,
          mailbox: emailRow.mailbox,
          from_address: emailRow.from_address,
          from_name: emailRow.from_name,
          subject: emailRow.subject,
          received_at: emailRow.received_at,
          status: "failed",
          error_message: (parseErr as Error).message,
        })
        .select("id")
        .single();
      return new Response(
        JSON.stringify({ remittance_id: failedRow?.id, status: "failed", error: (parseErr as Error).message }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Persist header row.
    const headerStatus = !parsed.is_remittance
      ? "dismissed"
      : (parsed.line_items?.length ?? 0) === 0
      ? "needs_review"
      : "parsed";

    const { data: header, error: headerErr } = await supabase
      .from("remittance_advices")
      .insert({
        scanned_email_id: emailRow.id,
        message_id: emailRow.message_id,
        mailbox: emailRow.mailbox,
        from_address: emailRow.from_address,
        from_name: emailRow.from_name,
        subject: emailRow.subject,
        received_at: emailRow.received_at,
        payment_date: parsed.payment_date,
        total_amount: parsed.total_amount,
        currency: parsed.currency ?? "GBP",
        payer_name: parsed.payer_name,
        ai_raw_extract: parsed as unknown as Record<string, unknown>,
        status: headerStatus,
      })
      .select("id")
      .single();
    if (headerErr || !header) throw new Error(`Header insert failed: ${headerErr?.message}`);

    // Line items + best-effort xero_invoices match by exact invoice number.
    let matchedCount = 0;
    const lineItems = (parsed.line_items ?? []).filter((li) => li.invoice_number || li.amount);
    if (lineItems.length > 0) {
      const invoiceNumbers = lineItems
        .map((li) => li.invoice_number)
        .filter((n): n is string => !!n);
      const { data: existingInvoices } = invoiceNumbers.length > 0
        ? await supabase
            .from("xero_invoices")
            .select("id, xero_invoice_number, total_amount")
            .in("xero_invoice_number", invoiceNumbers)
        : { data: [] };
      const byNumber = new Map(
        (existingInvoices ?? []).map((row) => [row.xero_invoice_number, row]),
      );

      const rows = lineItems.map((li) => {
        const matched = li.invoice_number ? byNumber.get(li.invoice_number) : null;
        if (matched) matchedCount++;
        return {
          remittance_id: header.id,
          invoice_number: li.invoice_number,
          amount: li.amount,
          raw_text: li.raw_text,
          matched_xero_invoice_id: matched?.id ?? null,
          match_confidence: matched ? "exact" : null,
        };
      });
      await supabase.from("remittance_line_items").insert(rows);
    }

    // Header status: if anything didn't match, flag for review.
    if (parsed.is_remittance && matchedCount < lineItems.length) {
      await supabase
        .from("remittance_advices")
        .update({ status: "needs_review" })
        .eq("id", header.id);
    }

    return new Response(
      JSON.stringify({
        remittance_id: header.id,
        status: matchedCount < lineItems.length ? "needs_review" : headerStatus,
        line_item_count: lineItems.length,
        matched_count: matchedCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
