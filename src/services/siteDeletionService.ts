import { supabase } from "@/integrations/supabase/client";

export interface SiteDependencies {
  visits: { id: string; visit_date: string; visit_type: string; status: string | null }[];
  serviceReports: { id: string; report_number: string | null; visit_id: string | null }[];
  appointments: { id: string; title: string; appointment_date: string }[];
  devices: number;
  fileUploads: number;
  ramsDocuments: number;
  quotations: number;
  serviceContracts: number;
  siteAssets: number;
  emailLogs: number;
}

export async function fetchSiteDependencies(siteId: string): Promise<SiteDependencies> {
  const [
    { data: visits },
    { data: reports },
    { data: appointments },
    { count: devicesCount },
    { count: uploadsCount },
    { count: ramsCount },
    { count: quotationsCount },
    { count: contractsCount },
    { count: assetsCount },
    { count: emailCount },
  ] = await Promise.all([
    supabase.from("service_visits").select("id, visit_date, visit_type, status").eq("site_id", siteId),
    supabase.from("service_reports").select("id, report_number, visit_id").eq("site_id", siteId),
    supabase.from("appointments").select("id, title, appointment_date").eq("site_id", siteId),
    supabase.from("devices").select("*", { count: "exact", head: true }).eq("site_id", siteId),
    supabase.from("file_uploads").select("*", { count: "exact", head: true }).eq("site_id", siteId),
    supabase.from("rams_documents").select("*", { count: "exact", head: true }).eq("site_id", siteId),
    supabase.from("quotations").select("*", { count: "exact", head: true }).eq("site_id", siteId),
    supabase.from("site_service_contracts").select("*", { count: "exact", head: true }).eq("site_id", siteId),
    supabase.from("site_assets").select("*", { count: "exact", head: true }).eq("site_id", siteId),
    supabase.from("email_logs").select("*", { count: "exact", head: true }).eq("site_id", siteId),
  ]);

  return {
    visits: visits || [],
    serviceReports: reports || [],
    appointments: appointments || [],
    devices: devicesCount || 0,
    fileUploads: uploadsCount || 0,
    ramsDocuments: ramsCount || 0,
    quotations: quotationsCount || 0,
    serviceContracts: contractsCount || 0,
    siteAssets: assetsCount || 0,
    emailLogs: emailCount || 0,
  };
}

export function hasDependencies(deps: SiteDependencies): boolean {
  return (
    deps.visits.length > 0 ||
    deps.serviceReports.length > 0 ||
    deps.appointments.length > 0 ||
    deps.devices > 0 ||
    deps.fileUploads > 0 ||
    deps.ramsDocuments > 0 ||
    deps.quotations > 0 ||
    deps.serviceContracts > 0 ||
    deps.siteAssets > 0 ||
    deps.emailLogs > 0
  );
}

export async function forceDeleteSite(siteId: string): Promise<{ error: Error | null }> {
  try {
    // Delete in dependency order (children first)
    // 1. Delete parsed_device_tests linked to uploads for this site
    const { data: uploads } = await supabase.from("file_uploads").select("id").eq("site_id", siteId);
    if (uploads && uploads.length > 0) {
      const uploadIds = uploads.map(u => u.id);
      await supabase.from("parsed_device_tests").delete().in("upload_id", uploadIds);
    }

    // 2. Delete issues (references devices and visits)
    await supabase.from("issues").delete().eq("site_id", siteId);

    // 3. Delete service reports
    await supabase.from("service_reports").delete().eq("site_id", siteId);

    // 4. Delete customer form submissions
    await supabase.from("customer_form_submissions").delete().eq("site_id", siteId);

    // 5. Delete email logs
    await supabase.from("email_logs").delete().eq("site_id", siteId);

    // 6. Delete appointments
    await supabase.from("appointments").delete().eq("site_id", siteId);

    // 7. Delete file uploads
    await supabase.from("file_uploads").delete().eq("site_id", siteId);

    // 8. Delete visits
    await supabase.from("service_visits").delete().eq("site_id", siteId);

    // 9. Delete devices
    await supabase.from("devices").delete().eq("site_id", siteId);

    // 10. Delete RAMS documents
    await supabase.from("rams_documents").delete().eq("site_id", siteId);

    // 11. Delete quotations
    await supabase.from("quotations").delete().eq("site_id", siteId);

    // 12. Delete contract assets (child of service contracts)
    const { data: contracts } = await supabase.from("site_service_contracts").select("id").eq("site_id", siteId);
    if (contracts && contracts.length > 0) {
      const contractIds = contracts.map(c => c.id);
      await supabase.from("contract_assets").delete().in("contract_id", contractIds);
    }

    // 13. Delete service contracts
    await supabase.from("site_service_contracts").delete().eq("site_id", siteId);

    // 14. Delete site assets
    await supabase.from("site_assets").delete().eq("site_id", siteId);

    // 15. Delete device price lists
    await supabase.from("device_price_lists").delete().eq("site_id", siteId);

    // 16. Delete customer RAMS requirements
    await supabase.from("customer_rams_requirements").delete().eq("site_id", siteId);

    // 17. Delete QMS records
    await supabase.from("qms_ncrs").delete().eq("site_id", siteId);
    await supabase.from("qms_feedback").delete().eq("site_id", siteId);

    // 18. Finally delete the site
    const { error } = await supabase.from("sites").delete().eq("id", siteId);
    if (error) throw error;

    return { error: null };
  } catch (err) {
    console.error("Error force deleting site:", err);
    return { error: err as Error };
  }
}
