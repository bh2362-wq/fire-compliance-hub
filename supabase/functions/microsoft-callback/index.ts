import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    if (error) {
      console.error("Microsoft OAuth error:", error, errorDescription);
      return new Response(
        `<!doctype html><html><body>
          <p>Microsoft connection failed: ${error}</p>
          <script>setTimeout(() => window.close(), 300);</script>
        </body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    if (!code) {
      throw new Error("No authorization code received");
    }

    const clientId = Deno.env.get("MICROSOFT_CLIENT_ID")!;
    const clientSecret = Deno.env.get("MICROSOFT_CLIENT_SECRET")!;
    const tenantId = Deno.env.get("MICROSOFT_TENANT_ID")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const redirectUri = `${supabaseUrl}/functions/v1/microsoft-callback`;

    // Exchange code for tokens
    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
          scope: "offline_access Files.ReadWrite.All Sites.ReadWrite.All",
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Microsoft token exchange failed:", errorText);
      throw new Error("Failed to exchange authorization code");
    }

    const tokens = await tokenResponse.json();
    console.log("Microsoft token exchange successful");

    const [userId] = state?.split(":") || [];
    if (!userId) {
      throw new Error("Invalid state - missing user ID");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Delete any existing tokens, then insert the new one
    await supabase.from("microsoft_tokens").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    const { error: insertError } = await supabase.from("microsoft_tokens").insert({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      scope: tokens.scope,
      connected_by: userId,
    });

    if (insertError) {
      console.error("Failed to save Microsoft tokens:", insertError);
      throw new Error("Failed to save Microsoft connection");
    }

    console.log("Microsoft connection saved for user:", userId);

    return new Response(
      `<!doctype html><html><body>
        <p>Microsoft connected successfully. You can close this window.</p>
        <script>
          if (window.opener) { window.opener.postMessage({ type: 'microsoft-connected' }, '*'); }
          setTimeout(() => window.close(), 1500);
        </script>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (error: unknown) {
    console.error("Microsoft callback error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      `<!doctype html><html><body>
        <p>Microsoft connection failed: ${message}</p>
        <script>setTimeout(() => window.close(), 3000);</script>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
});
