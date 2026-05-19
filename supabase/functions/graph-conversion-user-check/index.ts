// Read-only diagnostic for GRAPH_CONVERSION_USER.
// Returns whether the configured UPN resolves in Entra and whether it has a OneDrive.
// Does NOT leak the full UPN — only the domain portion.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getToken(tenantId: string, clientId: string, clientSecret: string) {
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`token ${res.status}: ${text}`);
  return JSON.parse(text).access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const tenantId = Deno.env.get("GRAPH_TENANT_ID") ?? Deno.env.get("MICROSOFT_TENANT_ID");
  const clientId = Deno.env.get("GRAPH_CLIENT_ID") ?? Deno.env.get("MICROSOFT_CLIENT_ID");
  const clientSecret = Deno.env.get("GRAPH_CLIENT_SECRET") ?? Deno.env.get("MICROSOFT_CLIENT_SECRET");
  const upn = Deno.env.get("GRAPH_CONVERSION_USER");

  const upnDomain = upn?.includes("@") ? upn.split("@")[1] : null;
  const upnLocalLen = upn?.includes("@") ? upn.split("@")[0].length : (upn?.length ?? 0);

  const out: Record<string, unknown> = {
    secret_present: Boolean(upn),
    upn_domain: upnDomain,
    upn_local_length: upnLocalLen,
    tenant_id_present: Boolean(tenantId),
    client_id_present: Boolean(clientId),
    client_secret_present: Boolean(clientSecret),
  };

  if (!tenantId || !clientId || !clientSecret || !upn) {
    return json({ ok: false, reason: "missing_env", ...out });
  }

  try {
    const token = await getToken(tenantId, clientId, clientSecret);
    out.token_ok = true;

    // 1. Resolve user
    const userRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(upn)}?$select=id,displayName,userPrincipalName,accountEnabled,assignedLicenses`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const userBody = await userRes.text();
    out.user_lookup_status = userRes.status;
    if (!userRes.ok) {
      out.user_lookup_error = userBody;
      return json({ ok: false, reason: "user_not_found", ...out });
    }
    const user = JSON.parse(userBody);
    out.user_display_name = user.displayName;
    out.user_account_enabled = user.accountEnabled;
    out.user_license_count = Array.isArray(user.assignedLicenses) ? user.assignedLicenses.length : 0;

    // 2. Check drive
    const driveRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(upn)}/drive?$select=id,driveType,quota`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const driveBody = await driveRes.text();
    out.drive_lookup_status = driveRes.status;
    if (!driveRes.ok) {
      out.drive_lookup_error = driveBody;
      return json({ ok: false, reason: "drive_missing_or_unlicensed", ...out });
    }
    const drive = JSON.parse(driveBody);
    out.drive_type = drive.driveType;
    out.drive_id_present = Boolean(drive.id);

    return json({ ok: true, ...out });
  } catch (err) {
    return json({ ok: false, reason: "exception", error: err instanceof Error ? err.message : String(err), ...out }, 500);
  }
});
