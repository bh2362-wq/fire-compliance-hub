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

    const url = new URL(req.url);
    const folderPath = url.searchParams.get("path") || "";
    const filterImages = url.searchParams.get("images") === "true";

    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: tokenRow, error: tokenError } = await serviceClient
      .from("microsoft_tokens")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (tokenError || !tokenRow) {
      return new Response(
        JSON.stringify({ error: "Microsoft not connected" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = await refreshMicrosoftToken(serviceClient, tokenRow);

    const cleanPath = folderPath.replace(/^\/+|\/+$/g, "");
    
    // List children (files) in the folder
    let graphUrl: string;
    if (cleanPath) {
      graphUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${cleanPath}:/children?$select=name,id,size,file,webUrl,lastModifiedDateTime,@microsoft.graph.downloadUrl&$top=200`;
    } else {
      graphUrl = `https://graph.microsoft.com/v1.0/me/drive/root/children?$select=name,id,size,file,webUrl,lastModifiedDateTime,@microsoft.graph.downloadUrl&$top=200`;
    }

    const response = await fetch(graphUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errText = await response.text();
      // If folder doesn't exist, return empty list
      if (response.status === 404) {
        return new Response(
          JSON.stringify({ files: [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }
      console.error("Graph API error:", errText);
      throw new Error(`Failed to list files: ${response.status}`);
    }

    const data = await response.json();
    
    const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".heic", ".heif", ".tiff", ".tif"];
    
    let items = (data.value || [])
      .filter((item: any) => item.file) // Only files, not folders
      .map((item: any) => ({
        name: item.name,
        id: item.id,
        size: item.size,
        mimeType: item.file?.mimeType || "",
        webUrl: item.webUrl,
        downloadUrl: item["@microsoft.graph.downloadUrl"] || "",
        lastModified: item.lastModifiedDateTime,
        thumbnailUrl: "", // Will be populated below if needed
      }));

    // Filter to images only if requested
    if (filterImages) {
      items = items.filter((item: any) => {
        const ext = "." + item.name.split(".").pop()?.toLowerCase();
        return imageExtensions.includes(ext) || item.mimeType.startsWith("image/");
      });
    }

    // Fetch thumbnails for image files
    if (items.length > 0) {
      const thumbnailPromises = items.map(async (item: any) => {
        try {
          const thumbUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${item.id}/thumbnails/0/medium`;
          const thumbRes = await fetch(thumbUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (thumbRes.ok) {
            const thumbData = await thumbRes.json();
            item.thumbnailUrl = thumbData.url || "";
          }
        } catch {
          // Ignore thumbnail errors
        }
        return item;
      });
      items = await Promise.all(thumbnailPromises);
    }

    return new Response(
      JSON.stringify({ files: items }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    console.error("SharePoint list files error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
