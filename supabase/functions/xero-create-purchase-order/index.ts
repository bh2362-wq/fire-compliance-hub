import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  account_code?: string;
}

interface PurchaseOrderRequest {
  supplier_xero_contact_id: string;
  po_number: string;
  order_date: string;
  expected_delivery_date?: string;
  reference?: string;
  line_items: LineItem[];
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

    const body: PurchaseOrderRequest = await req.json();
    console.log("Creating purchase order in Xero:", body);

    const connection = await refreshTokenIfNeeded(supabaseAdmin);

    // Build line items for Xero
    const xeroLineItems = body.line_items.map((item) => ({
      Description: item.description,
      Quantity: item.quantity,
      UnitAmount: item.unit_price,
      AccountCode: item.account_code || "300", // Default to cost of sales
    }));

    const purchaseOrderData = {
      PurchaseOrders: [
        {
          Contact: {
            ContactID: body.supplier_xero_contact_id,
          },
          PurchaseOrderNumber: body.po_number,
          Date: body.order_date,
          DeliveryDate: body.expected_delivery_date || undefined,
          Reference: body.reference || "",
          LineItems: xeroLineItems,
          Status: "AUTHORISED", // Create directly as authorised
        },
      ],
    };

    console.log("Sending to Xero:", JSON.stringify(purchaseOrderData, null, 2));

    const xeroResponse = await fetch(
      `https://api.xero.com/api.xro/2.0/PurchaseOrders`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${connection.access_token}`,
          "xero-tenant-id": connection.tenant_id,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(purchaseOrderData),
      }
    );

    const responseText = await xeroResponse.text();
    console.log("Xero response status:", xeroResponse.status);
    console.log("Xero response:", responseText);

    if (!xeroResponse.ok) {
      throw new Error(`Xero API error: ${responseText}`);
    }

    const xeroData = JSON.parse(responseText);
    const createdPO = xeroData.PurchaseOrders?.[0];

    return new Response(
      JSON.stringify({
        success: true,
        xero_purchase_order_id: createdPO?.PurchaseOrderID,
        xero_status: createdPO?.Status,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error creating purchase order:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});