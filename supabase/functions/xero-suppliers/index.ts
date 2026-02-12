import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function refreshTokenIfNeeded(supabaseAdmin: any) {
  const { data: connection } = await supabaseAdmin
    .from("xero_connections")
    .select("*")
    .single();

  if (!connection) {
    throw new Error("No Xero connection found");
  }

  const now = new Date();
  const expiresAt = new Date(connection.expires_at);

  if (now >= expiresAt) {
    console.log("Token expired, refreshing...");
    const clientId = Deno.env.get("XERO_CLIENT_ID");
    const clientSecret = Deno.env.get("XERO_CLIENT_SECRET");

    const tokenResponse = await fetch("https://identity.xero.com/connect/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: connection.refresh_token,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error("Failed to refresh token");
    }

    const tokens = await tokenResponse.json();
    const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await supabaseAdmin
      .from("xero_connections")
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: newExpiresAt.toISOString(),
      })
      .eq("id", connection.id);

    return { ...connection, access_token: tokens.access_token };
  }

  return connection;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const connection = await refreshTokenIfNeeded(supabaseAdmin);

    // Fetch contacts from Xero that are suppliers (IsSupplier = true)
    const xeroResponse = await fetch(
      `https://api.xero.com/api.xro/2.0/Contacts?where=IsSupplier==true`,
      {
        headers: {
          Authorization: `Bearer ${connection.access_token}`,
          "xero-tenant-id": connection.tenant_id,
          Accept: "application/json",
        },
      }
    );

    if (!xeroResponse.ok) {
      const errorText = await xeroResponse.text();
      console.error("Xero API error:", errorText);
      throw new Error(`Xero API error: ${errorText}`);
    }

    const xeroData = await xeroResponse.json();
    const suppliers = xeroData.Contacts || [];

    console.log(`Fetched ${suppliers.length} suppliers from Xero`);

    // Map to a simpler format
    const mappedSuppliers = suppliers.map((contact: any) => ({
      xero_contact_id: contact.ContactID,
      name: contact.Name,
      email: contact.EmailAddress || null,
      phone: contact.Phones?.find((p: any) => p.PhoneType === "DEFAULT")?.PhoneNumber || null,
      address: contact.Addresses?.find((a: any) => a.AddressType === "POBOX")?.AddressLine1 || 
               contact.Addresses?.find((a: any) => a.AddressType === "STREET")?.AddressLine1 || null,
      city: contact.Addresses?.find((a: any) => a.AddressType === "POBOX")?.City || 
            contact.Addresses?.find((a: any) => a.AddressType === "STREET")?.City || null,
      postcode: contact.Addresses?.find((a: any) => a.AddressType === "POBOX")?.PostalCode || 
                contact.Addresses?.find((a: any) => a.AddressType === "STREET")?.PostalCode || null,
    }));

    return new Response(
      JSON.stringify({ suppliers: mappedSuppliers }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error fetching suppliers:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});