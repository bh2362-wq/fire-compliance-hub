import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientId = Deno.env.get("XERO_CLIENT_ID");
    if (!clientId) {
      throw new Error("XERO_CLIENT_ID not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const redirectUri = `${supabaseUrl}/functions/v1/xero-callback`;
    
    // Generate a random state for CSRF protection
    const state = crypto.randomUUID();
    
    // Xero OAuth 2.0 authorization URL
    const authUrl = new URL("https://login.xero.com/identity/connect/authorize");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", "openid profile email accounting.transactions accounting.contacts offline_access");
    authUrl.searchParams.set("state", state);

    return new Response(
      JSON.stringify({ 
        authUrl: authUrl.toString(),
        state 
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200 
      }
    );
  } catch (error: unknown) {
    console.error("Error generating auth URL:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500 
      }
    );
  }
});
