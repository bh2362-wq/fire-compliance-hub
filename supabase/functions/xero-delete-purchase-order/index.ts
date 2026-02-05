import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface DeletePORequest {
  xero_purchase_order_id: string;
}

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

    const body: DeletePORequest = await req.json();
    console.log("Deleting/Voiding PO in Xero:", body);

    if (!body.xero_purchase_order_id) {
      throw new Error("Xero purchase order ID is required");
    }

    const connection = await refreshTokenIfNeeded(supabaseAdmin);

    // First, fetch the current PO status from Xero
    console.log("Fetching current PO status from Xero...");
    const getResponse = await fetch(
      `https://api.xero.com/api.xro/2.0/PurchaseOrders/${body.xero_purchase_order_id}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${connection.access_token}`,
          "xero-tenant-id": connection.tenant_id,
          Accept: "application/json",
        },
      }
    );

    if (!getResponse.ok) {
      const errorText = await getResponse.text();
      console.error("Failed to fetch PO from Xero:", errorText);
      throw new Error(`Failed to fetch PO from Xero: ${errorText}`);
    }

    const poData = await getResponse.json();
    const currentStatus = poData.PurchaseOrders?.[0]?.Status;
    console.log("Current Xero PO status:", currentStatus);

    // Determine the appropriate action based on current status
    // DRAFT POs can be deleted, SUBMITTED/AUTHORISED can be voided (set to DELETED status)
    let targetStatus: string;
    
    if (currentStatus === "DRAFT") {
      // Draft POs - we'll set to DELETED which removes them
      targetStatus = "DELETED";
      console.log("PO is in DRAFT status - will delete");
    } else if (currentStatus === "SUBMITTED" || currentStatus === "AUTHORISED") {
      // Submitted/Authorised POs - set to DELETED to void them
      targetStatus = "DELETED";
      console.log("PO is in SUBMITTED/AUTHORISED status - will void (set to DELETED)");
    } else if (currentStatus === "BILLED") {
      throw new Error("Cannot delete a Purchase Order that has been billed. Please remove billing first.");
    } else if (currentStatus === "DELETED") {
      console.log("PO is already deleted in Xero");
      return new Response(
        JSON.stringify({
          success: true,
          message: "Purchase Order was already deleted in Xero",
          xero_status: "DELETED",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    } else {
      throw new Error(`Cannot delete PO with status: ${currentStatus}`);
    }

    // Update purchase order status to DELETED in Xero
    console.log(`Setting PO status to ${targetStatus} in Xero...`);
    const xeroResponse = await fetch(
      `https://api.xero.com/api.xro/2.0/PurchaseOrders/${body.xero_purchase_order_id}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${connection.access_token}`,
          "xero-tenant-id": connection.tenant_id,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          PurchaseOrders: [{
            PurchaseOrderID: body.xero_purchase_order_id,
            Status: targetStatus,
          }],
        }),
      }
    );

    const responseText = await xeroResponse.text();
    console.log("Xero response status:", xeroResponse.status);
    console.log("Xero response:", responseText);

    if (!xeroResponse.ok) {
      throw new Error(`Xero API error: ${responseText}`);
    }

    const xeroData = JSON.parse(responseText);
    const updatedPO = xeroData.PurchaseOrders?.[0];

    return new Response(
      JSON.stringify({
        success: true,
        message: currentStatus === "DRAFT" 
          ? "Purchase Order deleted from Xero" 
          : "Purchase Order voided in Xero",
        xero_status: updatedPO?.Status,
        previous_status: currentStatus,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error deleting/voiding PO:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
