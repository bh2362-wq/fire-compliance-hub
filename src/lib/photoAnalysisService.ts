/**
 * photoAnalysisService.ts
 *
 * Client-side service for uploading site photos and getting AI-powered
 * fault analysis. Handles:
 *   - Image resizing before upload (keep size manageable for vision API)
 *   - Calling the analyze-photo edge function
 *   - Uploading photos to Supabase Storage
 *   - Returning structured fault data ready to add to defects register
 */

import { supabase } from "@/integrations/supabase/client";
import type { DefectEntry } from "@/services/smartFormService";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PhotoAnalysisResult {
  photo_type: "panel_screen" | "physical_defect" | "document" | "event_log" | "unknown";
  confidence: "high" | "medium" | "low";
  needs_clarification: boolean;
  clarification_question: string | null;
  panel_info: {
    manufacturer: string | null;
    model: string | null;
    panel_id: string | null;
    total_faults_shown: number;
  };
  detected_faults: Array<{
    description: string;
    severity: "Critical" | "Major" | "Minor" | "Advisory";
    location: string;
    recommended_action: string;
    regulation_reference: string;
  }>;
  summary: string;
  raw_text_extracted: string;
}

export interface AnalysedPhoto {
  id: string;                         // local temp ID
  file:        File;
  previewUrl:  string;                // object URL for display
  uploadedUrl: string | null;         // Supabase Storage URL after upload
  status: "pending" | "analysing" | "done" | "error";
  error?: string;
  result?: PhotoAnalysisResult;
  clarificationResponse?: string;     // user's answer if AI asked for help
}

// ── Image resize helper (keep under 1.5MB for API) ───────────────────────────

async function resizeImage(file: File, maxDim = 1600): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      // Use JPEG for photos, preserve PNG for screenshots
      const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
      const quality = mimeType === "image/jpeg" ? 0.85 : undefined;
      const dataUrl = quality !== undefined
        ? canvas.toDataURL(mimeType, quality)
        : canvas.toDataURL(mimeType);
      const base64 = dataUrl.split(",")[1];
      resolve({ base64, mediaType: mimeType });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}

// ── Upload photo to Supabase Storage ─────────────────────────────────────────

export async function uploadPhoto(
  file: File,
  submissionId: string,
  photoId: string
): Promise<string | null> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `cert-photos/${submissionId}/${photoId}.${ext}`;
  const { error } = await supabase.storage
    .from("cert-attachments")
    .upload(path, file, { contentType: file.type, upsert: true });
  if (error) { console.error("[PhotoUpload] Failed:", error); return null; }
  const { data } = supabase.storage.from("cert-attachments").getPublicUrl(path);
  return data?.publicUrl ?? null;
}

// ── Main analysis function ────────────────────────────────────────────────────

export async function analysePhoto(
  file: File,
  opts: {
    context?: string;              // e.g. site name, panel type, form type
    existingDefects?: string[];    // descriptions already on form
    clarificationResponse?: string; // user's answer if AI previously asked
  } = {}
): Promise<PhotoAnalysisResult> {

  const { base64, mediaType } = await resizeImage(file);

  let context = opts.context ?? "";
  if (opts.clarificationResponse) {
    context += `\nAdditional context from engineer: ${opts.clarificationResponse}`;
  }

  const { data, error } = await supabase.functions.invoke("analyze-photo", {
    body: {
      image_base64:     base64,
      media_type:       mediaType,
      context:          context || undefined,
      existing_defects: opts.existingDefects?.length ? opts.existingDefects : undefined,
    },
  });

  if (error) throw new Error(`Analysis failed: ${error.message}`);
  if (!data)  throw new Error("No response from analysis service");

  return data as PhotoAnalysisResult;
}

// ── Convert AI fault to DefectEntry for the form ─────────────────────────────

export function faultToDefectEntry(
  fault: PhotoAnalysisResult["detected_faults"][number],
  photoUrl: string | null
): DefectEntry {
  return {
    id:                  Math.random().toString(36).slice(2, 10),
    location:            fault.location || "",
    description:         fault.description,
    severity:            fault.severity as DefectEntry["severity"],
    bs_reference:        fault.regulation_reference,
    recommended_action:  fault.recommended_action,
    photo_url:           photoUrl ?? undefined,
    status:              "Open",
  };
}
