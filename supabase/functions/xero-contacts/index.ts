import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  // supabase-js adds `x-supabase-client-platform` which must be allowed for CORS preflight.
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

async function refreshTokenIfNeeded(supabase: any, connection: any) {
  const now = new Date();
  const expiresAt = new Date(connection.expires_at);
  
  // Refresh if expires in less than 5 minutes
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
    
    // Update token in database
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

    // Refresh token if needed
    const accessToken = await refreshTokenIfNeeded(supabase, connection);

    // Parse query params
    const url = new URL(req.url);
    const search = url.searchParams.get("search") || "";
    const customersOnly = url.searchParams.get("customersOnly") === "true";
    
    // Build where clause - filter to customers only (those with invoices/purchases history)
    let whereClause = "";
    if (customersOnly) {
      // IsCustomer=true means they have at least one invoice
      whereClause = "IsCustomer==true";
    }
    if (search) {
      const searchFilter = `Name.Contains("${search}")`;
      whereClause = whereClause ? `${whereClause}&&${searchFilter}` : searchFilter;
    }
    
    let xeroUrl = `https://api.xero.com/api.xro/2.0/Contacts`;
    if (whereClause) {
      xeroUrl += `?where=${encodeURIComponent(whereClause)}`;
    }

    console.log("Fetching contacts from Xero:", xeroUrl);

    const contactsResponse = await fetch(xeroUrl, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenant_id,
        "Accept": "application/json",
      },
    });

    if (!contactsResponse.ok) {
      const errorText = await contactsResponse.text();
      console.error("Failed to fetch contacts:", errorText);
      throw new Error("Failed to fetch contacts from Xero");
    }

    const contactsData = await contactsResponse.json();
    const contacts = (contactsData.Contacts || []).map((c: any) => ({
      ContactID: c.ContactID,
      Name: c.Name,
      EmailAddress: c.EmailAddress,
      FirstName: c.FirstName,
      LastName: c.LastName,
      Addresses: c.Addresses,
      Phones: c.Phones,
      IsCustomer: c.IsCustomer,
      IsSupplier: c.IsSupplier,
      ContactStatus: c.ContactStatus,
      HasOutstandingBalance: (c.Balances?.AccountsReceivable?.Outstanding || 0) > 0,
      OutstandingBalance: c.Balances?.AccountsReceivable?.Outstanding || 0,
    }));

    return new Response(
      JSON.stringify({ contacts }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error fetching contacts:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
