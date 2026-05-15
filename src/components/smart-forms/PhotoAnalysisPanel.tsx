/**
 * PhotoAnalysisPanel
 *
 * Drop zone for site photos — panel screenshots, physical defects, event logs.
 * AI analyses each image and identifies faults.
 * Engineer reviews detected faults and adds them to the defects register.
 *
 * Props:
 *   submissionId   — cert submission ID for storage paths
 *   context        — site name, panel type etc. to help the AI
 *   existingDefects — current defects array (to avoid duplication)
 *   onAddDefects   — callback to add detected defects to the form
 */

import { useRef, useState, useCallback } from "react";
import { Upload, Camera, Loader2, CheckCircle2, AlertCircle, HelpCircle, ChevronDown, ChevronUp, Plus, Trash2, Zap, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  analysePhoto, uploadPhoto, faultToDefectEntry,
  type AnalysedPhoto, type PhotoAnalysisResult,
} from "@/lib/photoAnalysisService";
import { captureDefectPhoto } from "@/lib/capacitorCameraService";
import type { DefectEntry } from "@/services/smartFormService";

// ── Severity badge ─────────────────────────────────────────────────────────────
function SeverityBadge({ severity }: { severity: string }) {
  const style =
    severity === "Critical" ? "bg-red-100 text-red-800 border-red-200" :
    severity === "Major"    ? "bg-orange-100 text-orange-800 border-orange-200" :
    severity === "Minor"    ? "bg-amber-100 text-amber-800 border-amber-200" :
                              "bg-blue-100 text-blue-800 border-blue-200";
  return (
    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border", style)}>
      {severity}
    </span>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────────
interface Props {
  submissionId?: string | null;
  context?: string;
  existingDefects?: DefectEntry[];
  onAddDefects: (defects: DefectEntry[]) => void;
}

function uid() { return Math.random().toString(36).slice(2, 10); }

// ── Component ──────────────────────────────────────────────────────────────────
export function PhotoAnalysisPanel({ submissionId, context, existingDefects, onAddDefects }: Props) {
  const [photos, setPhotos]       = useState<AnalysedPhoto[]>([]);
  const [dragging, setDragging]   = useState(false);
  const [expanded, setExpanded]   = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  // Clarification state — when AI needs help
  const [clarifyId, setClarifyId]     = useState<string | null>(null);
  const [clarifyText, setClarifyText] = useState("");

  // ── Process an uploaded file ────────────────────────────────────────────────
  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error(`${file.name} is not an image`);
      return;
    }

    const id         = uid();
    const previewUrl = URL.createObjectURL(file);

    // Add to list as "analysing"
    const photo: AnalysedPhoto = { id, file, previewUrl, uploadedUrl: null, status: "analysing" };
    setPhotos(prev => [...prev, photo]);

    try {
      // Upload to storage (in background, non-blocking)
      const storagePath = submissionId
        ? await uploadPhoto(file, submissionId, id).catch(() => null)
        : null;

      // AI analysis
      const existingDescriptions = (existingDefects ?? []).map(d => d.description).filter(Boolean);
      const result = await analysePhoto(file, {
        context,
        existingDefects: existingDescriptions,
      });

      setPhotos(prev => prev.map(p =>
        p.id === id ? { ...p, status: "done", uploadedUrl: storagePath, result } : p
      ));

      // Auto-ask for clarification if needed
      if (result.needs_clarification) {
        setClarifyId(id);
      }

    } catch (err: any) {
      console.error("[PhotoAnalysis] Error:", err);
      setPhotos(prev => prev.map(p =>
        p.id === id ? { ...p, status: "error", error: err?.message ?? "Analysis failed" } : p
      ));
      toast.error(`Failed to analyse photo: ${err?.message}`);
    }
  }, [submissionId, context, existingDefects]);

  // ── Handle drop / file select ──────────────────────────────────────────────
  const handleFiles = useCallback((files: File[]) => {
    // Stagger uploads to avoid hammering the AI provider's concurrent-request rate limit
    files.slice(0, 40).forEach((f, i) => {
      setTimeout(() => processFile(f), i * 800);
    });
  }, [processFile]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(Array.from(e.dataTransfer.files));
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  // ── Camera (Capacitor native) ──────────────────────────────────────────────
  const handleCamera = async () => {
    const base64DataUrl = await captureDefectPhoto();
    if (!base64DataUrl) return;
    // Convert data URL to File
    const res  = await fetch(base64DataUrl);
    const blob = await res.blob();
    const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
    processFile(file);
  };

  // ── Re-analyse with clarification ──────────────────────────────────────────
  const handleClarify = async (photoId: string, answer: string) => {
    const photo = photos.find(p => p.id === photoId);
    if (!photo) return;
    setClarifyId(null);
    setClarifyText("");

    setPhotos(prev => prev.map(p =>
      p.id === photoId ? { ...p, status: "analysing", result: undefined } : p
    ));

    try {
      const existingDescriptions = (existingDefects ?? []).map(d => d.description).filter(Boolean);
      const result = await analysePhoto(photo.file, {
        context,
        existingDefects: existingDescriptions,
        clarificationResponse: answer,
      });
      setPhotos(prev => prev.map(p =>
        p.id === photoId ? { ...p, status: "done", result, clarificationResponse: answer } : p
      ));
      if (result.needs_clarification) {
        setClarifyId(photoId);
      }
    } catch (err: any) {
      setPhotos(prev => prev.map(p =>
        p.id === photoId ? { ...p, status: "error", error: err?.message } : p
      ));
    }
  };

  // ── Add faults to defects register ────────────────────────────────────────
  const addFaults = (photo: AnalysedPhoto, indices?: number[]) => {
    if (!photo.result?.detected_faults.length) return;
    const allFaults = photo.result.detected_faults;
    const idxSet = indices ? new Set(indices) : new Set(allFaults.map((_, i) => i));
    const faults = allFaults.filter((_, i) => idxSet.has(i));
    if (!faults.length) return;
    const newDefects = faults.map(f => faultToDefectEntry(f, photo.uploadedUrl));
    onAddDefects(newDefects);
    toast.success(`${newDefects.length} defect${newDefects.length !== 1 ? "s" : ""} added to report`);

    // Remove this photo from the list (or strip the added faults if a subset were chosen)
    const remaining = allFaults.filter((_, i) => !idxSet.has(i));
    if (remaining.length === 0) {
      URL.revokeObjectURL(photo.previewUrl);
      setPhotos(prev => prev.filter(p => p.id !== photo.id));
      if (clarifyId === photo.id) setClarifyId(null);
    } else {
      setPhotos(prev => prev.map(p =>
        p.id === photo.id && p.result
          ? { ...p, result: { ...p.result, detected_faults: remaining } }
          : p
      ));
    }
  };

  const removePhoto = (id: string) => {
    setPhotos(prev => {
      const p = prev.find(ph => ph.id === id);
      if (p) URL.revokeObjectURL(p.previewUrl);
      return prev.filter(ph => ph.id !== id);
    });
    if (clarifyId === id) setClarifyId(null);
  };

  const totalFaults = photos
    .filter(p => p.status === "done")
    .reduce((n, p) => n + (p.result?.detected_faults.length ?? 0), 0);

  const analysing = photos.some(p => p.status === "analysing");

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="border-b border-[#e0e0e0]">

      {/* Section header */}
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex-1 bg-[#3c3c3c] text-white text-[11px] font-bold uppercase tracking-wide px-3 py-1.5 text-left flex items-center gap-2"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          PHOTOS & AI FAULT DETECTION
          {totalFaults > 0 && (
            <span className="ml-1 bg-[#e85c2c] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {totalFaults} fault{totalFaults !== 1 ? "s" : ""}
            </span>
          )}
          {analysing && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
        </button>
        <div className="flex items-center gap-1 px-2 bg-[#3c3c3c]">
          <button
            type="button"
            onClick={handleCamera}
            className="text-[11px] text-white/70 hover:text-white px-2 py-0.5 hover:bg-white/10 rounded flex items-center gap-1"
            title="Take photo with camera"
          >
            <Camera className="w-3 h-3" />Camera
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-[11px] text-white/70 hover:text-white px-2 py-0.5 hover:bg-white/10 rounded flex items-center gap-1"
          >
            <Upload className="w-3 h-3" />Upload
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileInput} />
      </div>

      {expanded && (
        <div className="p-4 space-y-4">

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-sm p-5 text-center cursor-pointer transition-colors",
              dragging
                ? "border-[#e85c2c] bg-orange-50"
                : "border-[#dadce0] hover:border-[#e85c2c] hover:bg-[#fafafa]"
            )}
          >
            <Zap className="w-6 h-6 text-[#9aa0a6] mx-auto mb-2" />
            <p className="text-[12px] font-medium text-[#1a1a1a]">Drop photos here or click to browse</p>
            <p className="text-[11px] text-[#5f6368] mt-1">
              Panel screenshots · fault displays · physical defects · event logs
            </p>
            <p className="text-[10px] text-[#9aa0a6] mt-1">
              AI will read fault codes, identify defects, and add them to the report automatically
            </p>
          </div>

          {/* Photo grid */}
          {photos.length > 0 && (
            <div className="space-y-3">
              {photos.map(photo => (
                <div
                  key={photo.id}
                  className="border border-[#e0e0e0] rounded-sm overflow-hidden bg-white"
                >
                  {/* Photo row */}
                  <div className="flex gap-3 p-3">
                    {/* Thumbnail */}
                    <div className="relative flex-shrink-0 w-24 h-20 bg-[#f5f6f8] rounded-sm overflow-hidden">
                      <img
                        src={photo.previewUrl}
                        alt="Uploaded photo"
                        className="w-full h-full object-cover"
                      />
                      {/* Status overlay */}
                      {photo.status === "analysing" && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <Loader2 className="w-5 h-5 text-white animate-spin" />
                        </div>
                      )}
                    </div>

                    {/* Status & summary */}
                    <div className="flex-1 min-w-0">
                      {photo.status === "analysing" && (
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-3.5 h-3.5 text-[#e85c2c] animate-spin flex-shrink-0" />
                          <span className="text-[12px] text-[#5f6368]">Analysing with AI…</span>
                        </div>
                      )}

                      {photo.status === "error" && (
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-[12px] font-medium text-red-700">Analysis failed</p>
                            <p className="text-[11px] text-[#5f6368]">{photo.error}</p>
                          </div>
                        </div>
                      )}

                      {photo.status === "done" && photo.result && (
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            {photo.result.detected_faults.length > 0 ? (
                              <AlertCircle className="w-3.5 h-3.5 text-[#e85c2c] flex-shrink-0" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                            )}
                            <p className="text-[12px] font-medium text-[#1a1a1a] truncate">
                              {photo.result.summary}
                            </p>
                          </div>

                          {/* Panel info if detected */}
                          {photo.result.panel_info?.manufacturer && (
                            <p className="text-[11px] text-[#5f6368]">
                              {[photo.result.panel_info.manufacturer, photo.result.panel_info.model, photo.result.panel_info.panel_id].filter(Boolean).join(" · ")}
                            </p>
                          )}

                          {photo.result.detected_faults.length > 0 && (
                            <p className="text-[11px] text-[#e85c2c] font-medium mt-0.5">
                              {photo.result.detected_faults.length} fault{photo.result.detected_faults.length !== 1 ? "s" : ""} detected
                              {photo.result.confidence === "low" && " (low confidence)"}
                            </p>
                          )}

                          {photo.result.detected_faults.length === 0 && (
                            <p className="text-[11px] text-green-700 mt-0.5">No faults detected in this photo</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => removePhoto(photo.id)}
                        className="text-[#9aa0a6] hover:text-[#c62828] transition-colors"
                        title="Remove photo"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      {photo.status === "done" && (photo.result?.detected_faults.length ?? 0) > 0 && (
                        <Button
                          size="sm"
                          type="button"
                          className="h-6 text-[11px] gap-1 bg-[#e85c2c] hover:bg-[#d44f20] text-white"
                          onClick={() => addFaults(photo)}
                        >
                          <Plus className="w-3 h-3" />
                          Add all
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Clarification needed */}
                  {photo.status === "done" && photo.result?.needs_clarification && clarifyId === photo.id && (
                    <div className="mx-3 mb-3 p-3 bg-amber-50 border border-amber-200 rounded-sm">
                      <div className="flex items-start gap-2 mb-2">
                        <HelpCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <p className="text-[12px] font-medium text-amber-900">
                          AI needs more information
                        </p>
                      </div>
                      <p className="text-[12px] text-amber-800 mb-2 ml-6">
                        {photo.result.clarification_question}
                      </p>
                      <div className="ml-6 flex gap-2">
                        <Input
                          className="h-7 text-xs border-amber-200 flex-1"
                          placeholder="Type your answer…"
                          value={clarifyId === photo.id ? clarifyText : ""}
                          onChange={e => setClarifyText(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter" && clarifyText.trim()) {
                              handleClarify(photo.id, clarifyText.trim());
                            }
                          }}
                        />
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={!clarifyText.trim()}
                          onClick={() => handleClarify(photo.id, clarifyText.trim())}
                        >
                          Re-analyse
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Detected faults list */}
                  {photo.status === "done" && (photo.result?.detected_faults.length ?? 0) > 0 && (
                    <div className="border-t border-[#f0f0f0]">
                      {photo.result!.detected_faults.map((fault, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-3 px-3 py-2 border-b border-[#f8f8f8] last:border-0 hover:bg-[#fafafa] transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <SeverityBadge severity={fault.severity} />
                              {fault.location && (
                                <span className="text-[10px] text-[#5f6368] truncate">{fault.location}</span>
                              )}
                            </div>
                            <p className="text-[12px] text-[#1a1a1a]">{fault.description}</p>
                            {fault.recommended_action && (
                              <p className="text-[11px] text-[#5f6368] mt-0.5">→ {fault.recommended_action}</p>
                            )}
                            {fault.regulation_reference && (
                              <p className="text-[10px] text-[#e85c2c] font-medium mt-0.5">{fault.regulation_reference}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => addFaults(photo, [i])}
                            className="flex-shrink-0 text-[11px] text-[#e85c2c] hover:text-[#d44f20] font-medium flex items-center gap-1 mt-0.5"
                          >
                            <Plus className="w-3 h-3" />Add
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {photos.length === 0 && (
            <p className="text-[11px] text-[#9aa0a6] italic text-center">
              No photos uploaded yet. Drop images above or use the Upload / Camera buttons.
            </p>
          )}

        </div>
      )}
    </div>
  );
}
