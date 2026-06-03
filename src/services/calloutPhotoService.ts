import { supabase } from "@/integrations/supabase/client";

// Photo evidence captured during a callout visit. Storage paths live in
// the `callout-photos` bucket (private; signed URLs only). The metadata
// row in callout_photos pins the photo to its visit and gives the
// engineer a place to caption what each frame shows.

export interface CalloutPhoto {
  id: string;
  visit_id: string;
  ordinal: number;
  storage_path: string;
  caption: string | null;
  uploaded_at: string;
}

const BUCKET = "callout-photos";

export async function listCalloutPhotos(visitId: string): Promise<CalloutPhoto[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("callout_photos")
    .select("id, visit_id, ordinal, storage_path, caption, uploaded_at")
    .eq("visit_id", visitId)
    .order("ordinal");
  if (error) throw error;
  return (data ?? []) as CalloutPhoto[];
}

/**
 * Upload a single photo for this visit. Two-stage: writes the bytes
 * to storage under `<visit_id>/<uuid>.<ext>` then inserts the metadata
 * row. The metadata row's ordinal is computed from the current count
 * so a partial network failure (storage upload succeeds, DB insert
 * fails) leaves an orphan file we can clean up later — better than a
 * DB row pointing at nothing.
 */
export async function uploadCalloutPhoto(
  visitId: string,
  file: File,
  caption?: string,
): Promise<CalloutPhoto> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${visitId}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type });
  if (upErr) throw upErr;

  const existing = await listCalloutPhotos(visitId);
  const nextOrdinal = (existing[existing.length - 1]?.ordinal ?? 0) + 1;

  const { data: userData } = await supabase.auth.getUser();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error: insErr } = await (supabase as any)
    .from("callout_photos")
    .insert({
      visit_id: visitId,
      ordinal: nextOrdinal,
      storage_path: path,
      caption: caption ?? null,
      uploaded_by: userData.user?.id ?? null,
    })
    .select("id, visit_id, ordinal, storage_path, caption, uploaded_at")
    .single();
  if (insErr) {
    // Try to clean up the orphan file so the bucket doesn't fill with
    // bytes the DB can't see. Best-effort — if cleanup fails the user
    // already got an error from the insert and we don't double-toast.
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw insErr;
  }
  return data as CalloutPhoto;
}

/**
 * Delete a photo — removes both the storage object and the metadata
 * row. Storage object goes first so a half-failure leaves an orphan
 * row (recoverable via the wizard) rather than an orphan file (which
 * the engineer can't see to clean up).
 */
export async function deleteCalloutPhoto(photo: CalloutPhoto): Promise<void> {
  await supabase.storage.from(BUCKET).remove([photo.storage_path]).catch(() => {});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("callout_photos")
    .delete()
    .eq("id", photo.id);
  if (error) throw error;
}

export async function updateCalloutPhotoCaption(
  photoId: string,
  caption: string | null,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("callout_photos")
    .update({ caption })
    .eq("id", photoId);
  if (error) throw error;
}

/**
 * Resolve a storage path to a short-lived signed URL the engineer's
 * browser can display. Returns null on RLS failure so the wizard can
 * render a placeholder instead of crashing.
 */
export async function signCalloutPhotoUrl(
  storagePath: string,
  ttlSeconds = 300,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, ttlSeconds);
  if (error) {
    console.warn("[signCalloutPhotoUrl] sign failed:", error.message);
    return null;
  }
  return data.signedUrl;
}
