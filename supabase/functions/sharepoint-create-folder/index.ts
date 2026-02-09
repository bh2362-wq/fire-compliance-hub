import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function refreshMicrosoftToken(supabase: any, tokenRow: any): Promise<string> {
  const clientId = Deno.env.get("MICROSOFT_CLIENT_ID")!;
  const clientSecret = Deno.env.get("MICROSOFT_CLIENT_SECRET")!;
  const tenantId = Deno.env.get("MICROSOFT_TENANT_ID")!;

  const expiresAt = new Date(tokenRow.expires_at);
  if (expiresAt.getTime() > Date.now() + 5 * 60 * 1000) {
    return tokenRow.access_token;
  }

  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokenRow.refresh_token,
        grant_type: "refresh_token",
        scope: "offline_access Files.ReadWrite.All Sites.ReadWrite.All",
      }),
    }
  );

  if (!response.ok) {
    throw new Error("Microsoft token expired. Please reconnect Microsoft.");
  }

  const tokens = await response.json();
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  await supabase.from("microsoft_tokens").update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || tokenRow.refresh_token,
    expires_at: newExpiresAt,
  }).eq("id", tokenRow.id);

  return tokens.access_token;
}

async function createFolderPath(accessToken: string, folderPath: string): Promise<string> {
  const segments = folderPath.replace(/^\/+|\/+$/g, "").split("/");
  let currentPath = "";
  let webUrl = "";

  for (const segment of segments) {
    const parentPath = currentPath || "root";
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;

    const checkUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${currentPath}`;
    const checkResponse = await fetch(checkUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (checkResponse.ok) {
      const data = await checkResponse.json();
      webUrl = data.webUrl || "";
      continue;
    }

    const parentUrl = parentPath === "root"
      ? "https://graph.microsoft.com/v1.0/me/drive/root/children"
      : `https://graph.microsoft.com/v1.0/me/drive/root:/${parentPath}:/children`;

    const createResponse = await fetch(parentUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: segment,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      }),
    });

    if (createResponse.ok) {
      const data = await createResponse.json();
      webUrl = data.webUrl || "";
    } else if (createResponse.status !== 409) {
      const err = await createResponse.text();
      throw new Error(`Failed to create folder: ${segment}`);
    } else {
      // 409 conflict = already exists, get webUrl
      const existsRes = await fetch(checkUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (existsRes.ok) {
        const data = await existsRes.json();
        webUrl = data.webUrl || "";
      }
    }
  }

  return webUrl;
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claims?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { folderPath, entityType, entityId } = await req.json();

    if (!folderPath || !entityType || !entityId) {
      return new Response(
        JSON.stringify({ error: "folderPath, entityType, and entityId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: tokenRow, error: tokenError } = await serviceClient
      .from("microsoft_tokens")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (tokenError || !tokenRow) {
      return new Response(
        JSON.stringify({ error: "Microsoft not connected. Please connect Microsoft first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = await refreshMicrosoftToken(serviceClient, tokenRow);
    const cleanPath = folderPath.replace(/^\/+|\/+$/g, "");
    const webUrl = await createFolderPath(accessToken, cleanPath);

    // Save the folder path and webUrl back to the entity
    const table = entityType === "customer" ? "customers" : "sites";
    await supabase.from(table).update({ sharepoint_folder: cleanPath, sharepoint_url: webUrl || null }).eq("id", entityId);

    return new Response(
      JSON.stringify({ success: true, folderPath: cleanPath, webUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    console.error("SharePoint create folder error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
