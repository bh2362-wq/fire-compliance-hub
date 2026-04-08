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

interface FolderInfo {
  name: string;
  id: string;
  path: string;
  childCount: number;
  children: FolderInfo[];
}

async function listFolderChildren(accessToken: string, path: string): Promise<FolderInfo[]> {
  const cleanPath = path.replace(/^\/+|\/+$/g, "");
  const graphUrl = cleanPath
    ? `https://graph.microsoft.com/v1.0/me/drive/root:/${cleanPath}:/children?$filter=folder ne null&$select=name,id,folder,parentReference&$top=200`
    : `https://graph.microsoft.com/v1.0/me/drive/root/children?$filter=folder ne null&$select=name,id,folder,parentReference&$top=200`;

  const response = await fetch(graphUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error(`Failed to list folders at ${path}: ${response.status}`);
  }

  const data = await response.json();
  return (data.value || []).map((item: any) => ({
    name: item.name,
    id: item.id,
    path: cleanPath ? `${cleanPath}/${item.name}` : item.name,
    childCount: item.folder?.childCount || 0,
    children: [],
  }));
}

async function listAllChildren(accessToken: string, path: string): Promise<any[]> {
  const cleanPath = path.replace(/^\/+|\/+$/g, "");
  const graphUrl = cleanPath
    ? `https://graph.microsoft.com/v1.0/me/drive/root:/${cleanPath}:/children?$select=name,id,folder,file,parentReference&$top=200`
    : `https://graph.microsoft.com/v1.0/me/drive/root/children?$select=name,id,folder,file,parentReference&$top=200`;

  const response = await fetch(graphUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) return [];
  const data = await response.json();
  return data.value || [];
}

async function moveItem(accessToken: string, itemId: string, targetFolderId: string, newName?: string): Promise<boolean> {
  const body: any = {
    parentReference: { id: targetFolderId },
  };
  if (newName) body.name = newName;

  const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${itemId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return res.ok;
}

async function deleteFolder(accessToken: string, itemId: string): Promise<boolean> {
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${itemId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.ok || res.status === 404;
}

async function getFolderIdByPath(accessToken: string, path: string): Promise<string | null> {
  const cleanPath = path.replace(/^\/+|\/+$/g, "");
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${cleanPath}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.id;
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
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

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action } = body; // "scan" or "execute"

    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: tokenRow, error: tokenError } = await serviceClient
      .from("microsoft_tokens")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (tokenError || !tokenRow) {
      return new Response(
        JSON.stringify({ error: "Microsoft not connected." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = await refreshMicrosoftToken(serviceClient, tokenRow);

    // Get all customers and sites from DB
    const { data: customers } = await serviceClient
      .from("customers")
      .select("id, name, sharepoint_folder, status")
      .order("name");

    const { data: sites } = await serviceClient
      .from("sites")
      .select("id, name, address, customer_id, sharepoint_folder, status")
      .order("name");

    // Scan SharePoint Customers folder
    const customerFolders = await listFolderChildren(accessToken, "Customers");

    // For each customer folder, get site subfolders
    for (const cf of customerFolders) {
      cf.children = await listFolderChildren(accessToken, cf.path);
    }

    // Build cleanup plan
    const plan: any = {
      duplicateCustomerFolders: [],
      orphanCustomerFolders: [],
      duplicateSiteFolders: [],
      orphanSiteFolders: [],
      emptyFolders: [],
      customerMappings: [],
    };

    // Group customer folders by normalized name
    const custFolderGroups = new Map<string, FolderInfo[]>();
    for (const cf of customerFolders) {
      const key = normalize(cf.name);
      const arr = custFolderGroups.get(key) || [];
      arr.push(cf);
      custFolderGroups.set(key, arr);
    }

    // Match customer folders to DB customers
    const dbCustByNorm = new Map<string, any>();
    for (const c of customers || []) {
      dbCustByNorm.set(normalize(c.name), c);
    }

    for (const [normName, folders] of custFolderGroups.entries()) {
      const dbCust = dbCustByNorm.get(normName);
      const canonicalName = dbCust?.name || folders[0].name;
      const canonicalFolder = dbCust?.sharepoint_folder || `Customers/${canonicalName}`;

      if (folders.length > 1) {
        plan.duplicateCustomerFolders.push({
          canonicalName,
          canonicalFolder,
          dbCustomerId: dbCust?.id || null,
          folders: folders.map(f => ({ name: f.name, path: f.path, id: f.id, childCount: f.childCount })),
        });
      }

      if (!dbCust) {
        for (const f of folders) {
          plan.orphanCustomerFolders.push({
            name: f.name,
            path: f.path,
            id: f.id,
            childCount: f.childCount,
          });
        }
      }

      // Check site subfolders within each customer folder group
      if (dbCust) {
        const dbSitesForCust = (sites || []).filter(s => s.customer_id === dbCust.id);
        const dbSiteByNorm = new Map<string, any>();
        for (const s of dbSitesForCust) {
          dbSiteByNorm.set(normalize(s.name), s);
        }

        // Collect all site folders across all customer folder variants
        const allSiteFolders: FolderInfo[] = [];
        for (const cf of folders) {
          for (const sf of cf.children) {
            allSiteFolders.push(sf);
          }
        }

        // Group site folders by normalized name
        const siteFolderGroups = new Map<string, FolderInfo[]>();
        for (const sf of allSiteFolders) {
          const key = normalize(sf.name);
          const arr = siteFolderGroups.get(key) || [];
          arr.push(sf);
          siteFolderGroups.set(key, arr);
        }

        for (const [siteNorm, siteFolders] of siteFolderGroups.entries()) {
          const dbSite = dbSiteByNorm.get(siteNorm);

          if (siteFolders.length > 1) {
            plan.duplicateSiteFolders.push({
              customerName: canonicalName,
              siteName: dbSite?.name || siteFolders[0].name,
              dbSiteId: dbSite?.id || null,
              folders: siteFolders.map(f => ({ name: f.name, path: f.path, id: f.id, childCount: f.childCount })),
            });
          }

          if (!dbSite) {
            for (const sf of siteFolders) {
              plan.orphanSiteFolders.push({
                customerName: canonicalName,
                name: sf.name,
                path: sf.path,
                id: sf.id,
                childCount: sf.childCount,
              });
            }
          }
        }

        // Map customer to canonical folder
        plan.customerMappings.push({
          customerId: dbCust.id,
          customerName: dbCust.name,
          canonicalFolder,
          currentFolder: dbCust.sharepoint_folder,
          folderCount: folders.length,
          spFolderNames: folders.map(f => f.name),
        });
      }
    }

    // Find completely empty folders (customer or site level with 0 children)
    for (const cf of customerFolders) {
      if (cf.childCount === 0) {
        plan.emptyFolders.push({ name: cf.name, path: cf.path, id: cf.id, level: "customer" });
      }
      for (const sf of cf.children) {
        if (sf.childCount === 0) {
          plan.emptyFolders.push({ name: sf.name, path: sf.path, id: sf.id, level: "site", parent: cf.name });
        }
      }
    }

    if (action === "scan") {
      return new Response(
        JSON.stringify({ success: true, plan }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    if (action === "execute") {
      const results: string[] = [];

      // 1. Merge duplicate customer folders: move contents from duplicates into canonical
      for (const dup of plan.duplicateCustomerFolders) {
        const canonicalPath = dup.canonicalFolder;
        // Ensure canonical folder exists
        let canonicalId = await getFolderIdByPath(accessToken, canonicalPath);
        if (!canonicalId) {
          // Create it
          const segments = canonicalPath.split("/");
          let currentPath = "";
          for (const seg of segments) {
            const parentPath = currentPath || "root";
            currentPath = currentPath ? `${currentPath}/${seg}` : seg;
            const checkRes = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${currentPath}`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (!checkRes.ok) {
              const parentUrl = parentPath === "root"
                ? "https://graph.microsoft.com/v1.0/me/drive/root/children"
                : `https://graph.microsoft.com/v1.0/me/drive/root:/${parentPath}:/children`;
              await fetch(parentUrl, {
                method: "POST",
                headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
                body: JSON.stringify({ name: seg, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
              });
            }
          }
          canonicalId = await getFolderIdByPath(accessToken, canonicalPath);
        }

        if (!canonicalId) {
          results.push(`SKIP: Could not create canonical folder ${canonicalPath}`);
          continue;
        }

        // Move contents from non-canonical folders
        for (const folder of dup.folders) {
          if (folder.path === canonicalPath) continue;

          const children = await listAllChildren(accessToken, folder.path);
          for (const child of children) {
            // Check if same-named item exists in target
            const moved = await moveItem(accessToken, child.id, canonicalId);
            if (moved) {
              results.push(`MOVED: ${child.name} from ${folder.path} → ${canonicalPath}`);
            } else {
              results.push(`CONFLICT: ${child.name} already exists in ${canonicalPath}, skipped`);
            }
          }

          // Delete the now-empty duplicate folder
          const deleted = await deleteFolder(accessToken, folder.id);
          if (deleted) {
            results.push(`DELETED: duplicate folder ${folder.path}`);
          }
        }

        // Update DB customer record
        if (dup.dbCustomerId) {
          await serviceClient.from("customers")
            .update({ sharepoint_folder: canonicalPath })
            .eq("id", dup.dbCustomerId);
          results.push(`DB: Updated customer ${dup.canonicalName} folder to ${canonicalPath}`);
        }
      }

      // 2. Merge duplicate site folders similarly
      for (const dup of plan.duplicateSiteFolders) {
        if (!dup.dbSiteId) continue;

        const dbSite = (sites || []).find(s => s.id === dup.dbSiteId);
        const dbCust = (customers || []).find(c => c.id === dbSite?.customer_id);
        if (!dbCust) continue;

        const custFolder = dbCust.sharepoint_folder || `Customers/${dbCust.name}`;
        const canonicalSitePath = `${custFolder}/${dup.siteName}`;

        let canonicalId = await getFolderIdByPath(accessToken, canonicalSitePath);
        if (!canonicalId) {
          // Canonical folder doesn't exist, use the first folder as canonical
          canonicalId = dup.folders[0].id;
        }

        for (const folder of dup.folders) {
          if (folder.id === canonicalId) continue;

          const children = await listAllChildren(accessToken, folder.path);
          for (const child of children) {
            const moved = await moveItem(accessToken, child.id, canonicalId!);
            if (moved) {
              results.push(`MOVED: ${child.name} from ${folder.path} → ${canonicalSitePath}`);
            }
          }

          const deleted = await deleteFolder(accessToken, folder.id);
          if (deleted) {
            results.push(`DELETED: duplicate site folder ${folder.path}`);
          }
        }

        // Update DB site record
        await serviceClient.from("sites")
          .update({ sharepoint_folder: canonicalSitePath })
          .eq("id", dup.dbSiteId);
        results.push(`DB: Updated site ${dup.siteName} folder to ${canonicalSitePath}`);
      }

      // 3. Delete empty folders
      for (const empty of plan.emptyFolders) {
        const deleted = await deleteFolder(accessToken, empty.id);
        if (deleted) {
          results.push(`DELETED: empty ${empty.level} folder ${empty.path}`);
        }
      }

      // 4. Delete orphan folders (no matching DB record)
      for (const orphan of plan.orphanCustomerFolders) {
        // Only delete if truly empty or user confirmed
        if (orphan.childCount === 0) {
          const deleted = await deleteFolder(accessToken, orphan.id);
          if (deleted) {
            results.push(`DELETED: orphan customer folder ${orphan.path}`);
          }
        } else {
          results.push(`SKIPPED: orphan customer folder ${orphan.path} has ${orphan.childCount} items - review manually`);
        }
      }

      for (const orphan of plan.orphanSiteFolders) {
        if (orphan.childCount === 0) {
          const deleted = await deleteFolder(accessToken, orphan.id);
          if (deleted) {
            results.push(`DELETED: orphan site folder ${orphan.path} (under ${orphan.customerName})`);
          }
        } else {
          results.push(`SKIPPED: orphan site folder ${orphan.path} has ${orphan.childCount} items`);
        }
      }

      return new Response(
        JSON.stringify({ success: true, results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use 'scan' or 'execute'." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("SharePoint cleanup error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
