// syncWorker — drains the offline queue against Supabase.
//
// Triggered on online-status flips and explicit user actions. Idempotent:
// each mutation is keyed by client UUID so replaying a partially-applied
// queue (e.g. after a tab close) doesn't double-insert.
//
// Retry policy: each item has a `attempts` counter; we stop trying after
// MAX_ATTEMPTS and leave the record in the queue with `lastError` set so
// the UI can surface it.

import { supabase } from "@/integrations/supabase/client";
import {
  bumpMutationAttempt,
  bumpPhotoAttempt,
  listMutations,
  listPhotos,
  QueuedMutation,
  QueuedMutationRecord,
  QueuedPhoto,
  removeMutation,
  removePhoto,
} from "./offlineQueue";
import { updateServiceReport } from "@/services/serviceReportService";
import { createDefect } from "@/services/defectService";
import { createBatteryTest } from "@/services/batteryTestService";

const MAX_ATTEMPTS = 5;
const STORAGE_BUCKET = "engineer-app";

let running = false;
let listeners: Array<(state: SyncState) => void> = [];

export interface SyncState {
  running: boolean;
  lastRunAt: number | null;
  lastError: string | null;
}

let state: SyncState = { running: false, lastRunAt: null, lastError: null };

function publish(next: Partial<SyncState>) {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn(state));
}

export function subscribeSync(fn: (state: SyncState) => void): () => void {
  listeners.push(fn);
  fn(state);
  return () => {
    listeners = listeners.filter((f) => f !== fn);
  };
}

async function applyMutation(m: QueuedMutation): Promise<void> {
  switch (m.kind) {
    case "report-patch":
      await updateServiceReport(m.reportId, m.updates);
      return;
    case "defect-create":
      await createDefect({ ...m.payload, id: m.id } as never);
      return;
    case "battery-create":
      await createBatteryTest({ id: m.id, ...m.payload } as never);
      return;
  }
}

async function uploadPhoto(p: QueuedPhoto): Promise<void> {
  const path = `service-photos/${p.siteId}/${p.visitId}/${p.id}-${p.fileName}`;
  const { error: upErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, p.blob, { contentType: p.contentType, upsert: true });
  if (upErr) throw upErr;

  // Record in file_uploads so the report generator and dashboards can find it.
  const { data: userData } = await supabase.auth.getUser();
  const insertPayload: Record<string, unknown> = {
    visit_id: p.visitId,
    site_id: p.siteId,
    uploaded_by: userData.user?.id ?? null,
    file_name: p.fileName,
    file_type: p.contentType,
    file_size: p.blob.size,
    storage_path: path,
    defect_id: p.defectId,
  };
  const { error: insErr } = await supabase
    .from("file_uploads")
    .insert(insertPayload as never);
  if (insErr) throw insErr;
}

export async function runSync(): Promise<void> {
  if (running) return;
  running = true;
  publish({ running: true, lastError: null });

  try {
    // 1. Mutations first — photos may reference defect IDs that were inserted here.
    const mutations: QueuedMutationRecord[] = await listMutations();
    for (const rec of mutations) {
      if (rec.attempts >= MAX_ATTEMPTS) continue;
      try {
        await applyMutation(rec.mutation);
        await removeMutation(rec.id);
      } catch (e) {
        await bumpMutationAttempt(rec.id, (e as Error).message);
      }
    }

    // 2. Photos.
    const photos: QueuedPhoto[] = await listPhotos();
    for (const p of photos) {
      if (p.attempts >= MAX_ATTEMPTS) continue;
      try {
        await uploadPhoto(p);
        await removePhoto(p.id);
      } catch (e) {
        await bumpPhotoAttempt(p.id, (e as Error).message);
      }
    }

    publish({ lastRunAt: Date.now(), lastError: null });
  } catch (e) {
    publish({ lastError: (e as Error).message });
  } finally {
    running = false;
    publish({ running: false });
  }
}

// Auto-trigger on browser online events.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    void runSync();
  });
}
