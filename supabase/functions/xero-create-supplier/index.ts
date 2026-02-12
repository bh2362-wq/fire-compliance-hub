import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SupplierRequest {
  name: string;
  contact_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  address?: string;
  address_line_2?: string;
  city?: string;
  region?: string;
  postcode?: string;
  country?: string;
  tax_number?: string;
  bank_account_name?: string;
  bank_account_number?: string;
  bank_sort_code?: string;
  default_currency?: string;
  notes?: string;
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

    const body: SupplierRequest = await req.json();
    console.log("Creating supplier in Xero:", body.name);

    if (!body.name) {
      throw new Error("Supplier name is required");
    }

    const connection = await refreshTokenIfNeeded(supabaseAdmin);

    // Build Xero contact object for supplier
    const xeroContact: any = {
      Name: body.name,
      IsSupplier: true,
      IsCustomer: false,
    };

    // Add email
    if (body.email) {
      xeroContact.EmailAddress = body.email;
    }

    // Add contact person
    if (body.first_name || body.last_name || body.contact_name) {
      xeroContact.ContactPersons = [{
        FirstName: body.first_name || body.contact_name?.split(' ')[0] || "",
        LastName: body.last_name || body.contact_name?.split(' ').slice(1).join(' ') || "",
        EmailAddress: body.email || "",
        IncludeInEmails: true,
      }];
    }

    // Add phones
    const phones: any[] = [];
    if (body.phone) {
      phones.push({
        PhoneType: "DEFAULT",
        PhoneNumber: body.phone,
      });
    }
    if (body.mobile) {
      phones.push({
        PhoneType: "MOBILE",
        PhoneNumber: body.mobile,
      });
    }
    if (phones.length > 0) {
      xeroContact.Phones = phones;
    }

    // Add addresses
    if (body.address || body.city || body.postcode) {
      xeroContact.Addresses = [
        {
          AddressType: "POBOX",
          AddressLine1: body.address || "",
          AddressLine2: body.address_line_2 || "",
          City: body.city || "",
          Region: body.region || "",
          PostalCode: body.postcode || "",
          Country: body.country || "United Kingdom",
        },
        {
          AddressType: "STREET",
          AddressLine1: body.address || "",
          AddressLine2: body.address_line_2 || "",
          City: body.city || "",
          Region: body.region || "",
          PostalCode: body.postcode || "",
          Country: body.country || "United Kingdom",
        },
      ];
    }

    // Add tax number (VAT)
    if (body.tax_number) {
      xeroContact.TaxNumber = body.tax_number;
    }

    // Add bank details
    if (body.bank_account_number || body.bank_sort_code) {
      xeroContact.BankAccountDetails = `${body.bank_sort_code || ""} ${body.bank_account_number || ""}`.trim();
    }

    // Add default currency
    if (body.default_currency) {
      xeroContact.DefaultCurrency = body.default_currency;
    }

    console.log("Sending to Xero:", JSON.stringify(xeroContact, null, 2));

    const xeroResponse = await fetch(
      `https://api.xero.com/api.xro/2.0/Contacts`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${connection.access_token}`,
          "xero-tenant-id": connection.tenant_id,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ Contacts: [xeroContact] }),
      }
    );

    const responseText = await xeroResponse.text();
    console.log("Xero response status:", xeroResponse.status);
    console.log("Xero response:", responseText);

    if (!xeroResponse.ok) {
      throw new Error(`Xero API error: ${responseText}`);
    }

    const xeroData = JSON.parse(responseText);
    const createdContact = xeroData.Contacts?.[0];

    if (!createdContact?.ContactID) {
      throw new Error("Xero did not return a contact ID");
    }

    return new Response(
      JSON.stringify({
        success: true,
        xero_contact_id: createdContact.ContactID,
        name: createdContact.Name,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error creating supplier:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});