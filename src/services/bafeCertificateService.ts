import { supabase } from "@/integrations/supabase/client";

export type BafeCertificateType = "design" | "installation" | "commissioning" | "maintenance";

export interface BafeCertificate {
  id: string;
  site_id: string;
  certificate_type: BafeCertificateType;
  certificate_number: string;
  issued_date: string;
  issued_by: string;
  expiry_date: string | null;
  linked_form_submission_id: string | null;
  linked_report_id: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const BAFE_PREFIX_MAP: Record<BafeCertificateType, string> = {
  design: "BAFE-D",
  installation: "BAFE-I",
  commissioning: "BAFE-C",
  maintenance: "BAFE-M",
};

export async function generateBafeCertNumber(type: BafeCertificateType): Promise<string> {
  const prefix = BAFE_PREFIX_MAP[type];
  const { data, error } = await supabase.rpc("get_next_qms_number", { prefix });
  if (error) throw error;
  return data as string;
}

export async function getBafeCertificates(siteId: string): Promise<BafeCertificate[]> {
  const { data, error } = await supabase
    .from("site_bafe_certificates")
    .select("*")
    .eq("site_id", siteId)
    .order("certificate_type")
    .order("issued_date", { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as BafeCertificate[];
}

export async function getAllBafeCertificates(): Promise<BafeCertificate[]> {
  const { data, error } = await supabase
    .from("site_bafe_certificates")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as BafeCertificate[];
}

export async function createBafeCertificate(cert: {
  site_id: string;
  certificate_type: BafeCertificateType;
  certificate_number: string;
  issued_date: string;
  issued_by: string;
  expiry_date?: string | null;
  linked_form_submission_id?: string | null;
  linked_report_id?: string | null;
  notes?: string | null;
}): Promise<BafeCertificate> {
  const { data, error } = await supabase
    .from("site_bafe_certificates")
    .insert(cert as any)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as BafeCertificate;
}

export async function updateBafeCertificate(
  id: string,
  updates: Partial<Pick<BafeCertificate, "status" | "expiry_date" | "notes">>
): Promise<BafeCertificate> {
  const { data, error } = await supabase
    .from("site_bafe_certificates")
    .update(updates as any)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as BafeCertificate;
}

export async function deleteBafeCertificate(id: string): Promise<void> {
  const { error } = await supabase
    .from("site_bafe_certificates")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export function getBafeSummary(certs: BafeCertificate[]) {
  const types: BafeCertificateType[] = ["design", "installation", "commissioning", "maintenance"];
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  return types.map((type) => {
    const typeCerts = certs.filter((c) => c.certificate_type === type && c.status === "valid");
    const latest = typeCerts[0] || null;
    const expiringSoon = latest?.expiry_date ? new Date(latest.expiry_date) <= in30Days : false;
    const expired = latest?.expiry_date ? new Date(latest.expiry_date) < now : false;

    return {
      type,
      label: type.charAt(0).toUpperCase() + type.slice(1),
      hasCertificate: !!latest,
      latestCert: latest,
      expiringSoon,
      expired,
    };
  });
}
