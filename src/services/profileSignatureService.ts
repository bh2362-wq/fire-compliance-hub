import { supabase } from "@/integrations/supabase/client";

// Engineer signature stored on profiles.engineer_signature so it can be
// reused across visits without re-drawing each time. The value is a PNG
// data URL produced by SignaturePad.

export async function getEngineerSignature(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("engineer_signature" as never)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const row = data as { engineer_signature?: string | null } | null;
  return row?.engineer_signature ?? null;
}

export async function setEngineerSignature(
  userId: string,
  dataUrl: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ engineer_signature: dataUrl } as never)
    .eq("user_id", userId);
  if (error) throw error;
}
