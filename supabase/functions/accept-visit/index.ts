import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

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

      const { data: visit, error } = await supabase
        .from("visits")
        .select(`
          id, visit_date, visit_type, status, notes,
          client_accepted_at, accepted_by_name, client_po_number,
          site:sites(id, name, address, city, postcode, customer_id,
            customer:customers(id, name)
          )
        `)
        .eq("acceptance_token", token)
        .single();

      if (error || !visit) {
        return new Response(JSON.stringify({ error: "Visit not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const site = visit.site as any;
      const customer = site?.customer as any;

      return new Response(JSON.stringify({
        visit_date: visit.visit_date,
        visit_type: visit.visit_type,
        status: visit.status,
        client_accepted_at: visit.client_accepted_at,
        accepted_by_name: visit.accepted_by_name,
        client_po_number: visit.client_po_number,
        site_name: site?.name || null,
        site_address: [site?.address, site?.city, site?.postcode].filter(Boolean).join(", ") || null,
        customer_name: customer?.name || null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { token, accepted_by_name, po_number } = body;

      if (!token || token.length < 20 || token.length > 128) {
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!accepted_by_name || typeof accepted_by_name !== "string" || accepted_by_name.trim().length === 0 || accepted_by_name.length > 200) {
        return new Response(JSON.stringify({ error: "Name is required (max 200 characters)" }), {
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

      // Check visit exists and hasn't been accepted
      const { data: visit, error: fetchError } = await supabase
        .from("visits")
        .select("id, status, client_accepted_at")
        .eq("acceptance_token", token)
        .single();

      if (fetchError || !visit) {
        return new Response(JSON.stringify({ error: "Visit not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (visit.client_accepted_at) {
        return new Response(JSON.stringify({ error: "This visit has already been confirmed" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Sanitize inputs
      const safeName = escapeHtml(accepted_by_name.trim());
      const safePo = po_number ? escapeHtml(po_number.trim()) : null;

      // Update visit with client acceptance
      const { error: updateError } = await supabase
        .from("visits")
        .update({
          status: "confirmed",
          accepted_by_name: safeName,
          client_accepted_at: new Date().toISOString(),
          client_po_number: safePo,
        })
        .eq("id", visit.id);

      if (updateError) {
        console.error("Update error:", updateError);
        return new Response(JSON.stringify({ error: "Failed to confirm visit" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Also update linked appointment status to confirmed
      await supabase
        .from("appointments")
        .update({ status: "confirmed" })
        .eq("visit_id", visit.id);

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
