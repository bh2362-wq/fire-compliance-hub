import { supabase } from "@/integrations/supabase/client";

/**
 * Uploads a generated certificate PDF to the site's SharePoint folder
 * and persists the resulting URL on the smart_form_submissions row.
 * Returns the SharePoint web URL (or null if not uploaded).
 */
export async function uploadCertificateToSharePoint(opts: {
  submissionId: string;
  siteId: string | null | undefined;
  fileName: string;
  base64: string;
}): Promise<string | null> {
  if (!opts.siteId) return null;

  // Resolve site SharePoint folder
  const { data: site } = await supabase
    .from("sites")
    .select("sharepoint_folder")
    .eq("id", opts.siteId)
    .maybeSingle();

  const baseFolder = site?.sharepoint_folder;
  if (!baseFolder) return null;

  const folderPath = `${baseFolder}/Certificates`;

  const { data, error } = await supabase.functions.invoke("upload-to-sharepoint", {
    body: {
      folderPath,
      fileName: opts.fileName,
      fileBase64: opts.base64,
      contentType: "application/pdf",
    },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);

  const webUrl: string | null = (data as any)?.webUrl ?? null;

  // Persist pdf_url on the submission for cert tracker visibility
  if (webUrl) {
    await supabase
      .from("smart_form_submissions")
      .update({ pdf_url: webUrl })
      .eq("id", opts.submissionId);
  }
  return webUrl;
}
