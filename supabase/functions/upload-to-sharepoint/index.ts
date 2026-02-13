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

  console.log("Refreshing Microsoft token...");
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
    const errorText = await response.text();
    console.error("Token refresh failed:", errorText);
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

async function ensureFolderExists(accessToken: string, folderPath: string): Promise<void> {
  const segments = folderPath.replace(/^\/+|\/+$/g, "").split("/");
  let currentPath = "";

  for (const segment of segments) {
    const parentPath = currentPath || "root";
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;

    const checkUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${currentPath}`;
    const checkResponse = await fetch(checkUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (checkResponse.ok) continue;

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

    if (!createResponse.ok) {
      const err = await createResponse.text();
      if (createResponse.status !== 409) {
        console.error(`Failed to create folder ${segment}:`, err);
        throw new Error(`Failed to create folder: ${segment}`);
      }
    }
  }
}

// Simple hash for checksum comparison
async function computeHash(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data.buffer as ArrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
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

    const { folderPath, fileName, fileBase64, contentType } = await req.json();

    if (!folderPath || typeof folderPath !== "string" || folderPath.length > 500) {
      return new Response(
        JSON.stringify({ error: "Invalid folder path" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!fileName || typeof fileName !== "string" || fileName.length > 255) {
      return new Response(
        JSON.stringify({ error: "Invalid file name" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!fileBase64 || typeof fileBase64 !== "string") {
      return new Response(
        JSON.stringify({ error: "File data is required" }),
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

    // Ensure the folder exists
    await ensureFolderExists(accessToken, cleanPath);

    // Convert base64 to binary
    const binaryString = atob(fileBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Compute SHA-256 hash of the new file
    const newFileHash = await computeHash(bytes);
    const newFileSize = bytes.length;
    console.log(`New file: ${fileName}, size: ${newFileSize} bytes, SHA-256: ${newFileHash.substring(0, 16)}...`);

    // Check if file already exists and compare
    const existingUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${cleanPath}/${fileName}`;
    const existingResponse = await fetch(existingUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    let skipped = false;
    if (existingResponse.ok) {
      const existingMeta = await existingResponse.json();
      const existingSize = existingMeta.size;
      const existingHash = existingMeta.file?.hashes?.sha256Hash?.toLowerCase();

      console.log(`Existing file: size: ${existingSize} bytes, SHA-256: ${existingHash?.substring(0, 16) || "N/A"}...`);

      // Compare by hash if available, otherwise by size
      if (existingHash && existingHash === newFileHash) {
        console.log("File unchanged (hash match) - skipping upload");
        skipped = true;
      } else if (!existingHash && existingSize === newFileSize) {
        // Size match without hash - still upload to be safe, but log it
        console.log("Size matches but no hash available - uploading to ensure latest version");
      } else {
        console.log(`File changed (old: ${existingSize}b, new: ${newFileSize}b) - uploading update`);
      }
    } else {
      console.log("File does not exist yet - uploading new file");
    }

    if (skipped) {
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          message: "File unchanged - no upload needed",
          fileName,
          newFileHash: newFileHash.substring(0, 16),
          newFileSize,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Upload file (PUT overwrites existing)
    const uploadUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${cleanPath}/${fileName}:/content`;
    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": contentType || "application/pdf",
      },
      body: bytes,
    });

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      console.error("SharePoint upload failed:", errText);
      throw new Error(`Upload failed: ${uploadResponse.status}`);
    }

    const result = await uploadResponse.json();
    const uploadedHash = result.file?.hashes?.sha256Hash?.toLowerCase() || "N/A";
    console.log(`File uploaded successfully: ${result.name}, size: ${result.size}b, SHA-256: ${uploadedHash.substring(0, 16)}...`);

    // Verify the uploaded file matches what we sent
    if (uploadedHash !== "n/a" && uploadedHash !== newFileHash) {
      console.warn(`WARNING: Upload hash mismatch! Sent: ${newFileHash.substring(0, 16)}, Got: ${uploadedHash.substring(0, 16)}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        skipped: false,
        fileName: result.name,
        webUrl: result.webUrl,
        newFileSize,
        newFileHash: newFileHash.substring(0, 16),
        uploadedSize: result.size,
        uploadedHash: uploadedHash.substring(0, 16),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    console.error("SharePoint upload error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
