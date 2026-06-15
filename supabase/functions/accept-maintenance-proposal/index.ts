/**
 * accept-maintenance-proposal edge function
 *
 * Customer-facing endpoint for /accept-proposal/<token>. Mirrors
 * accept-quotation (PR #228 / #229 / #230) for the maintenance
 * proposal domain.
 *
 *   GET-style fetch via token        → returns proposal summary fields
 *   POST { token, action: "accept" } → records typed signature, locks
 *   POST { token, action: "decline" }→ records decline reason
 *
 * Both writes invalidate the cached DOCX / PDF so the next render
 * picks up the new acceptance state (footer signature etc.).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // GET via ?token=... or POST with body — supports both so the customer-
  // facing page can fetch read-only details, then send action="accept".
  let token: string | null = null;
  let action: string | null = null;
  let acceptedByName: string | null = null;
  let signature: string | null = null;
  let poNumber: string | null = null;
  let declineReason: string | null = null;

  if (req.method === "GET") {
    const u = new URL(req.url);
    token = u.searchParams.get("token");
  } else if (req.method === "POST") {
    try {
      const body = await req.json();
      token = body?.token ?? null;
      action = body?.action ?? "accept";
      acceptedByName = body?.accepted_by_name ?? null;
      signature = body?.signature ?? null;
      poNumber = body?.po_number ?? null;
      declineReason = body?.decline_reason ?? null;
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
  } else {
    return new Response("Method not allowed", { status: 405, headers: CORS });
  }

  if (!token || typeof token !== "string") {
    return new Response(JSON.stringify({ error: "Missing acceptance token" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // ── Read path ─────────────────────────────────────────────────────────────
  // Customer-facing accept page loads what we have via GET.
  const { data: row, error: fetchErr } = await supabase
    .from("maintenance_proposals")
    .select(`
      id, proposal_number, title, introduction, status,
      annual_fee, payment_terms, vat_rate,
      service_visits_per_year, ppm_interval_months, sla_tier,
      fault_response_hours, ooh_response_hours,
      valid_until, client_accepted_at, client_declined_at,
      customer:customers(name),
      site:sites(name, address, city, postcode)
    `)
    .eq("acceptance_token", token)
    .maybeSingle();

  if (fetchErr || !row) {
    return new Response(JSON.stringify({ error: "Proposal not found" }), {
      status: 404, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  if (req.method === "GET") {
    return new Response(JSON.stringify(row), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // ── Write path ────────────────────────────────────────────────────────────

  const proposal = row as Record<string, unknown>;
  if (proposal.client_accepted_at) {
    return new Response(JSON.stringify({ error: "This proposal has already been accepted" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  if (proposal.client_declined_at) {
    return new Response(JSON.stringify({ error: "This proposal has already been declined" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  if (action === "decline") {
    if (!acceptedByName || acceptedByName.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Name is required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const { error: updErr } = await supabase
      .from("maintenance_proposals")
      .update({
        status: "declined",
        client_declined_at: new Date().toISOString(),
        client_decline_reason: declineReason ? escapeHtml(declineReason) : null,
        accepted_by_name: escapeHtml(acceptedByName.trim()),
        // Cached DOCX/PDF no longer reflects the row state.
        latest_docx_path: null,
        latest_pdf_path: null,
      })
      .eq("id", proposal.id as string);
    if (updErr) {
      return new Response(JSON.stringify({ error: "Failed to record decline" }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true, status: "declined" }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Default action: accept.
  if (!acceptedByName || acceptedByName.trim().length === 0 || acceptedByName.length > 200) {
    return new Response(JSON.stringify({ error: "Name is required (max 200 characters)" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  if (!signature || typeof signature !== "string") {
    return new Response(JSON.stringify({ error: "Digital signature is required" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  // Match the quote-acceptance shape: "typed:<name>" (post-PR-#229 flow)
  // or "data:image/<...>" legacy PNG. Length cap differs per shape.
  const isTyped = signature.startsWith("typed:");
  const isImage = signature.startsWith("data:image/");
  if (!isTyped && !isImage) {
    return new Response(JSON.stringify({ error: "Invalid signature format" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  if (signature.length > (isTyped ? 250 : 500000)) {
    return new Response(JSON.stringify({ error: "Signature too large" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  if (isTyped && signature.length <= "typed:".length) {
    return new Response(JSON.stringify({ error: "Please type your name to sign" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  if (poNumber && (typeof poNumber !== "string" || poNumber.length > 100)) {
    return new Response(JSON.stringify({ error: "PO number must be under 100 characters" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const { error: updErr } = await supabase
    .from("maintenance_proposals")
    .update({
      status: "customer_accepted",
      accepted_by_name: escapeHtml(acceptedByName.trim()),
      client_acceptance_signature: signature,
      client_accepted_at: new Date().toISOString(),
      client_po_number: poNumber ? escapeHtml(poNumber.trim()) : null,
      // Invalidate the cached DOCX/PDF so the next download embeds the
      // newly-recorded signature.
      latest_docx_path: null,
      latest_pdf_path: null,
    })
    .eq("id", proposal.id as string);

  if (updErr) {
    return new Response(JSON.stringify({ error: "Failed to record acceptance" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ ok: true, status: "customer_accepted" }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
