import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

async function refreshTokenIfNeeded(supabase: any, connection: any) {
  const now = new Date();
  const expiresAt = new Date(connection.expires_at);
  
  if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
    console.log("Refreshing Xero token...");
    
    const clientId = Deno.env.get("XERO_CLIENT_ID")!;
    const clientSecret = Deno.env.get("XERO_CLIENT_SECRET")!;
    
    const response = await fetch("https://identity.xero.com/connect/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: connection.refresh_token,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to refresh token");
    }

    const tokens = await response.json();
    const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    
    await supabase
      .from("xero_connections")
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: newExpiresAt,
      })
      .eq("id", connection.id);
    
    return tokens.access_token;
  }
  
  return connection.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claims?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claims.claims.sub;

    // Get user's Xero connection
    const { data: connection, error: connError } = await supabase
      .from("xero_connections")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (connError || !connection) {
      return new Response(
        JSON.stringify({ error: "No Xero connection found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = await refreshTokenIfNeeded(supabase, connection);

    // We want the *next free slot*, not just "the last created".
    // So we scan recent invoices (by Date DESC, multiple pages) and pick the highest
    // purely numeric invoice number, then +1.
    const MAX_PAGES_TO_SCAN = 5;
    let highestNumeric = 0;
    let fallbackLastNumber: string | null = null;

    for (let page = 1; page <= MAX_PAGES_TO_SCAN; page++) {
      // Exclude VOIDED invoices - they shouldn't count toward the next number
      const response = await fetch(
        `https://api.xero.com/api.xro/2.0/Invoices?Statuses=DRAFT,SUBMITTED,AUTHORISED,PAID&order=Date%20DESC&page=${page}`,
        {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Xero-Tenant-Id": connection.tenant_id,
            "Accept": "application/json",
          },
        }
      );

      if (!response.ok) {
        console.error("Failed to fetch invoices:", await response.text());
        return new Response(
          JSON.stringify({ nextNumber: null }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await response.json();
      const invoices = data.Invoices || [];

      if (invoices.length === 0) break;

      if (!fallbackLastNumber) {
        // keep a format fallback from the newest invoice if we can't find numeric-only
        fallbackLastNumber = invoices[0]?.InvoiceNumber ?? null;
      }

      for (const invoice of invoices) {
        const num = invoice?.InvoiceNumber;
        if (!num) continue;
        // Only consider purely numeric invoices with 5 or fewer digits (your main series)
        if (/^\d{1,5}$/.test(num)) {
          const val = parseInt(num, 10);
          if (val > highestNumeric) highestNumeric = val;
        }
      }
    }

    let nextNumber: string | null = null;
    if (highestNumeric > 0) {
      nextNumber = String(highestNumeric + 1);
      console.log(`Highest numeric invoice found: ${highestNumeric}, suggesting: ${nextNumber}`);
    } else if (fallbackLastNumber) {
      const match = fallbackLastNumber.match(/^(.*?)(\d+)$/);
      if (match) {
        const prefix = match[1];
        const numericPart = parseInt(match[2], 10);
        const numLength = match[2].length;
        nextNumber = `${prefix}${(numericPart + 1).toString().padStart(numLength, "0")}`;
        console.log(`No numeric invoices found; using format from ${fallbackLastNumber}, suggesting: ${nextNumber}`);
      }
    }

    return new Response(
      JSON.stringify({ nextNumber }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error getting next invoice number:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message, nextNumber: null }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
