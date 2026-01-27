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
        `<html><body><script>window.opener.postMessage({ type: 'xero-auth-error', error: '${error}' }, '*'); window.close();</script></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    if (!code) {
      throw new Error("No authorization code received");
    }

    const clientId = Deno.env.get("XERO_CLIENT_ID")!;
    const clientSecret = Deno.env.get("XERO_CLIENT_SECRET")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
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

    // Return success with tokens and tenant info for the frontend to store
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    
    // Return HTML that posts message to opener and closes
    return new Response(
      `<html><body><script>
        window.opener.postMessage({ 
          type: 'xero-auth-success', 
          data: {
            accessToken: '${tokens.access_token}',
            refreshToken: '${tokens.refresh_token}',
            expiresAt: '${expiresAt}',
            connections: ${JSON.stringify(connections)}
          }
        }, '*'); 
        window.close();
      </script></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (error: unknown) {
    console.error("Callback error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      `<html><body><script>window.opener.postMessage({ type: 'xero-auth-error', error: '${message}' }, '*'); window.close();</script></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
});
