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
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      console.error("OAuth error:", error);
      return new Response(
        `<!doctype html><html><body>
          <p>Xero connection failed: ${error}</p>
          <script>setTimeout(() => window.close(), 300);</script>
        </body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    if (!code) {
      throw new Error("No authorization code received");
    }

    const clientId = Deno.env.get("XERO_CLIENT_ID")!;
    const clientSecret = Deno.env.get("XERO_CLIENT_SECRET")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const redirectUri = `${supabaseUrl}/functions/v1/xero-callback`;

    // Exchange code for tokens
    const tokenResponse = await fetch("https://identity.xero.com/connect/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token exchange failed:", errorText);
      throw new Error("Failed to exchange authorization code");
    }

    const tokens = await tokenResponse.json();
    console.log("Token exchange successful");

    // Get tenant connections
    const connectionsResponse = await fetch("https://api.xero.com/connections", {
      headers: {
        "Authorization": `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
      },
    });

    if (!connectionsResponse.ok) {
      throw new Error("Failed to get Xero connections");
    }

    const connections = await connectionsResponse.json();
    console.log("Got connections:", connections.length);

    if (!connections || connections.length === 0) {
      throw new Error("No Xero organizations found");
    }

    // Parse the state to get user_id (we'll encode user_id in state)
    // State format: "userId:randomUUID"
    const [userId] = state?.split(":") || [];
    
    if (!userId) {
      throw new Error("Invalid state - missing user ID");
    }

    // Use service role to save the connection
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const tenant = connections[0];
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const { error: upsertError } = await supabase
      .from("xero_connections")
      .upsert({
        user_id: userId,
        tenant_id: tenant.tenantId,
        tenant_name: tenant.tenantName,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
      }, {
        onConflict: "user_id,tenant_id",
      });

    if (upsertError) {
      console.error("Failed to save connection:", upsertError);
      throw new Error("Failed to save Xero connection");
    }

    console.log("Connection saved successfully for user:", userId);

    // Close the popup window. The main app polls for the saved connection.
    return new Response(
      `<!doctype html><html><body>
        <p>Connected to ${tenant.tenantName}. You can close this window.</p>
        <script>setTimeout(() => window.close(), 300);</script>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (error: unknown) {
    console.error("Callback error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      `<!doctype html><html><body>
        <p>Xero connection failed: ${message}</p>
        <script>setTimeout(() => window.close(), 300);</script>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
});
