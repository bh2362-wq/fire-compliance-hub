import { supabase } from "@/integrations/supabase/client";
import type { ParsedMatrix } from "./causeEffectParser";

// CRUD for cause-effect matrices. A matrix is composed of three tables:
//   cause_effect_matrices  — header row (one per uploaded matrix)
//   cause_effect_outputs   — output column definitions (ordinal + code)
//   cause_effect_rules     — rule rows with sparse actions JSONB
// The original .xlsx is parked in the cause-effect-matrices storage bucket.

const BUCKET = "cause-effect-matrices";

export interface CauseEffectMatrixRow {
  id: string;
  site_id: string;
  title: string;
  legend: string | null;
  source_file_path: string | null;
  source_file_name: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  notes: string | null;
  is_archived: boolean;
}

export interface CauseEffectOutputRow {
  id: string;
  matrix_id: string;
  ordinal: number;
  code: string;
  panel_location: string | null;
  identification: string | null;
}

export interface CauseEffectRuleRow {
  id: string;
  matrix_id: string;
  ordinal: number;
  ref: string | null;
  trigger_device: string | null;
  trigger_type: string | null;
  trigger_location: string | null;
  notes: string | null;
  actions: Record<string, string>;
}

export interface FullCauseEffectMatrix extends CauseEffectMatrixRow {
  outputs: CauseEffectOutputRow[];
  rules: CauseEffectRuleRow[];
}

export async function listMatrices(
  siteId: string,
): Promise<CauseEffectMatrixRow[]> {
  const { data, error } = await supabase
    .from("cause_effect_matrices")
    .select("*")
    .eq("site_id", siteId)
    .eq("is_archived", false)
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CauseEffectMatrixRow[];
}

export async function getMatrix(
  matrixId: string,
): Promise<FullCauseEffectMatrix> {
  const [matrixRes, outputsRes, rulesRes] = await Promise.all([
    supabase
      .from("cause_effect_matrices")
      .select("*")
      .eq("id", matrixId)
      .single(),
    supabase
      .from("cause_effect_outputs")
      .select("*")
      .eq("matrix_id", matrixId)
      .order("ordinal", { ascending: true }),
    supabase
      .from("cause_effect_rules")
      .select("*")
      .eq("matrix_id", matrixId)
      .order("ordinal", { ascending: true }),
  ]);
  if (matrixRes.error) throw matrixRes.error;
  if (outputsRes.error) throw outputsRes.error;
  if (rulesRes.error) throw rulesRes.error;
  return {
    ...(matrixRes.data as CauseEffectMatrixRow),
    outputs: (outputsRes.data ?? []) as CauseEffectOutputRow[],
    rules: (rulesRes.data ?? []) as CauseEffectRuleRow[],
  };
}

export interface UploadMatrixInput {
  siteId: string;
  title: string;
  notes?: string | null;
  file: File;
  parsed: ParsedMatrix;
}

// Uploads the .xlsx to storage, then inserts the matrix header + child
// rows. Best-effort cleanup on failure — if any insert fails we delete
// the uploaded file and any partial matrix row so the user can retry.
export async function uploadMatrix(
  input: UploadMatrixInput,
): Promise<string> {
  const { siteId, title, notes, file, parsed } = input;
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id ?? null;

  const storagePath = `${siteId}/${Date.now()}-${file.name.replace(
    /[^a-z0-9_.-]/gi,
    "_",
  )}`;

  const upload = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType: file.type, upsert: false });
  if (upload.error) throw upload.error;

  let matrixId: string | null = null;
  try {
    const insertMatrix = await supabase
      .from("cause_effect_matrices")
      .insert({
        site_id: siteId,
        title,
        legend: parsed.legend,
        source_file_path: storagePath,
        source_file_name: file.name,
        uploaded_by: userId,
        notes: notes ?? null,
      })
      .select("id")
      .single();
    if (insertMatrix.error) throw insertMatrix.error;
    matrixId = (insertMatrix.data as { id: string }).id;

    if (parsed.outputs.length > 0) {
      const outputs = parsed.outputs.map((o) => ({
        matrix_id: matrixId,
        ordinal: o.ordinal,
        code: o.code,
        panel_location: o.panel_location,
        identification: o.identification,
      }));
      const insertOutputs = await supabase
        .from("cause_effect_outputs")
        .insert(outputs);
      if (insertOutputs.error) throw insertOutputs.error;
    }

    if (parsed.rules.length > 0) {
      const rules = parsed.rules.map((r) => ({
        matrix_id: matrixId,
        ordinal: r.ordinal,
        ref: r.ref,
        trigger_device: r.trigger_device,
        trigger_type: r.trigger_type,
        trigger_location: r.trigger_location,
        notes: r.notes,
        actions: r.actions,
      }));
      const insertRules = await supabase
        .from("cause_effect_rules")
        .insert(rules);
      if (insertRules.error) throw insertRules.error;
    }

    return matrixId;
  } catch (e) {
    if (matrixId) {
      await supabase.from("cause_effect_matrices").delete().eq("id", matrixId);
    }
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw e;
  }
}

export async function archiveMatrix(matrixId: string): Promise<void> {
  const { error } = await supabase
    .from("cause_effect_matrices")
    .update({ is_archived: true })
    .eq("id", matrixId);
  if (error) throw error;
}

export async function getOriginalDownloadUrl(
  matrix: CauseEffectMatrixRow,
): Promise<string | null> {
  if (!matrix.source_file_path) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(matrix.source_file_path, 60 * 5);
  if (error) throw error;
  return data?.signedUrl ?? null;
}
