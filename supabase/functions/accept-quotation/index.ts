import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    if (req.method === "GET") {
      // Fetch quotation summary by token
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
          client_accepted_at,
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
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { token, accepted_by_name, po_number, signature } = body;

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

      if (!signature || typeof signature !== "string" || !signature.startsWith("data:image/")) {
        return new Response(JSON.stringify({ error: "Digital signature is required" }), {
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

      // Update quotation with client acceptance
      const { error: updateError } = await supabase
        .from("quotations")
        .update({
          status: "customer_accepted",
          accepted_by_name: accepted_by_name.trim(),
          client_acceptance_signature: signature,
          client_accepted_at: new Date().toISOString(),
          client_po_number: po_number?.trim() || null,
        })
        .eq("id", quotation.id);

      if (updateError) {
        console.error("Update error:", updateError);
        return new Response(JSON.stringify({ error: "Failed to accept quotation" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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
