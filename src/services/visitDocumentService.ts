import { supabase } from "@/integrations/supabase/client";

// visitDocumentService — upload + listing for manually-attached visit
// documents (PAVA records, sub-contractor reports, external certs, photos…).
// Auto-generated documents (service reports, quotes) keep their own tables;
// this is only for files that arrive as uploads.

export const VISIT_DOCUMENT_CATEGORIES = [
  { value: "pava_record", label: "PAVA Record" },
  { value: "subcontractor_report", label: "Subcontractor Report" },
  { value: "external_certificate", label: "External Certificate" },
  { value: "site_survey", label: "Site Survey" },
  { value: "risk_assessment", label: "Risk Assessment" },
  { value: "photograph", label: "Photograph" },
  { value: "correspondence", label: "Correspondence" },
  { value: "manufacturer_documentation", label: "Manufacturer Documentation" },
  { value: "other", label: "Other" },
] as const;

export type VisitDocumentCategory =
  (typeof VISIT_DOCUMENT_CATEGORIES)[number]["value"];

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/heic",
];

export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
const BUCKET = "visit-documents";

export interface VisitDocument {
  id: string;
  service_visit_id: string;
  customer_id: string;
  site_id: string;
  category: VisitDocumentCategory;
  title: string;
  description: string | null;
  issued_by: string | null;
  document_date: string;
  file_path: string;
  file_size_bytes: number;
  file_mime_type: string;
  file_original_name: string;
  uploaded_by: string;
  uploaded_at: string;
  is_archived: boolean;
  share_with_customer: boolean;
  version_of_id: string | null;
}

export interface UploadVisitDocumentInput {
  file: File;
  serviceVisitId: string;
  siteId: string;
  customerId: string;
  category: VisitDocumentCategory;
  title: string;
  documentDate: string; // YYYY-MM-DD
  description?: string | null;
  issuedBy?: string | null;
  versionOfId?: string | null;
}

export function fileValidationError(file: File): string | null {
  if (file.size > MAX_FILE_BYTES) {
    return `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 25 MB.`;
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return `${file.name} is not an accepted type (PDF, Word, JPEG, PNG or HEIC).`;
  }
  return null;
}

// Strip anything that isn't safe in a storage object key.
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
}

export async function listVisitDocuments(
  serviceVisitId: string,
): Promise<VisitDocument[]> {
  const { data, error } = await supabase
    .from("visit_documents" as never)
    .select("*")
    .eq("service_visit_id", serviceVisitId)
    .eq("is_archived", false)
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as VisitDocument[];
}

export async function uploadVisitDocument(
  input: UploadVisitDocumentInput,
): Promise<VisitDocument> {
  const validation = fileValidationError(input.file);
  if (validation) throw new Error(validation);

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not signed in");

  const id = crypto.randomUUID();
  const path = `${input.customerId}/${input.serviceVisitId}/${id}-${sanitizeFilename(input.file.name)}`;

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, input.file, {
      contentType: input.file.type,
      upsert: false,
    });
  if (uploadErr) throw uploadErr;

  const row = {
    id,
    service_visit_id: input.serviceVisitId,
    customer_id: input.customerId,
    site_id: input.siteId,
    category: input.category,
    title: input.title,
    description: input.description ?? null,
    issued_by: input.issuedBy ?? null,
    document_date: input.documentDate,
    file_path: path,
    file_size_bytes: input.file.size,
    file_mime_type: input.file.type,
    file_original_name: input.file.name,
    uploaded_by: userId,
    version_of_id: input.versionOfId ?? null,
  };

  const { data, error } = await supabase
    .from("visit_documents" as never)
    .insert(row as never)
    .select()
    .single();

  if (error) {
    // Roll back the orphaned upload so a failed insert doesn't leak a file.
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw error;
  }
  return data as unknown as VisitDocument;
}
