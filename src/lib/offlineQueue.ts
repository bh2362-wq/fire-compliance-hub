// Offline queue — IndexedDB-backed store for deferred mutations and photos.
//
// Three object stores:
//   - mutations: queued operations against Supabase that couldn't run online
//   - photos:    captured image blobs awaiting upload to Supabase Storage
//   - drafts:    last-known local copy of a service_reports row so the
//                wizard can reload offline without losing in-flight edits
//
// All operations are tolerant: if IndexedDB is unavailable (private mode,
// quota exceeded) callers see an error but the wizard remains functional —
// it just can't queue work for later sync.

import type { BS5839Checklist, ServiceReport } from "@/services/serviceReportService";

const DB_NAME = "fcc-offline-queue";
const DB_VERSION = 1;

export type QueuedMutation =
  | {
      kind: "report-patch";
      reportId: string;
      updates: Partial<Omit<ServiceReport, "checklist">> & { checklist?: BS5839Checklist };
    }
  | {
      kind: "defect-create";
      id: string; // client-generated UUID, used as the server primary key
      payload: {
        site_id: string;
        visit_id: string;
        report_id: string;
        description: string;
        location: string | null;
        category: 1 | 2 | 3;
        status: "open";
      };
    }
  | {
      kind: "battery-create";
      id: string;
      payload: {
        service_report_id: string;
        panel_or_psu_label: string;
        install_date: string | null;
        terminal_voltage_v: number | null;
        charge_current_ma: number | null;
        load_test_result: "pass" | "fail" | "not_tested" | null;
        recommendation: "retain" | "replace" | null;
        notes: string | null;
      };
    };

export interface QueuedMutationRecord {
  id: string;
  mutation: QueuedMutation;
  queuedAt: number;
  attempts: number;
  lastError: string | null;
}

export interface QueuedPhoto {
  id: string;
  blob: Blob;
  contentType: string;
  fileName: string;
  defectId: string;
  visitId: string;
  siteId: string;
  reportId: string;
  queuedAt: number;
  attempts: number;
  lastError: string | null;
}

export interface DraftRecord {
  reportId: string;
  visitId: string;
  report: ServiceReport;
  updatedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("mutations")) {
        db.createObjectStore("mutations", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("photos")) {
        db.createObjectStore("photos", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("drafts")) {
        db.createObjectStore("drafts", { keyPath: "reportId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
  return dbPromise;
}

function tx<T>(
  storeName: "mutations" | "photos" | "drafts",
  mode: IDBTransactionMode,
  body: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        let result: T;
        Promise.resolve(body(store))
          .then((r) => {
            result = r;
          })
          .catch(reject);
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(transaction.error ?? new Error("tx aborted"));
        transaction.onerror = () => reject(transaction.error ?? new Error("tx error"));
      }),
  );
}

function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb request error"));
  });
}

// ── Mutations ───────────────────────────────────────────────────────────────

export async function queueMutation(mutation: QueuedMutation): Promise<string> {
  const id = crypto.randomUUID();
  const record: QueuedMutationRecord = {
    id,
    mutation,
    queuedAt: Date.now(),
    attempts: 0,
    lastError: null,
  };
  await tx("mutations", "readwrite", (store) => reqAsPromise(store.put(record)));
  return id;
}

export async function listMutations(): Promise<QueuedMutationRecord[]> {
  return tx("mutations", "readonly", async (store) => {
    const all = await reqAsPromise(store.getAll());
    return (all ?? []).sort(
      (a: QueuedMutationRecord, b: QueuedMutationRecord) => a.queuedAt - b.queuedAt,
    );
  });
}

export async function removeMutation(id: string): Promise<void> {
  await tx("mutations", "readwrite", (store) => reqAsPromise(store.delete(id)));
}

export async function bumpMutationAttempt(id: string, errMsg: string): Promise<void> {
  await tx("mutations", "readwrite", async (store) => {
    const existing = (await reqAsPromise(store.get(id))) as QueuedMutationRecord | undefined;
    if (!existing) return;
    existing.attempts += 1;
    existing.lastError = errMsg;
    await reqAsPromise(store.put(existing));
  });
}

// ── Photos ──────────────────────────────────────────────────────────────────

export async function queuePhoto(photo: Omit<QueuedPhoto, "queuedAt" | "attempts" | "lastError">): Promise<void> {
  const record: QueuedPhoto = {
    ...photo,
    queuedAt: Date.now(),
    attempts: 0,
    lastError: null,
  };
  await tx("photos", "readwrite", (store) => reqAsPromise(store.put(record)));
}

export async function listPhotos(): Promise<QueuedPhoto[]> {
  return tx("photos", "readonly", async (store) => {
    const all = await reqAsPromise(store.getAll());
    return (all ?? []).sort((a: QueuedPhoto, b: QueuedPhoto) => a.queuedAt - b.queuedAt);
  });
}

export async function removePhoto(id: string): Promise<void> {
  await tx("photos", "readwrite", (store) => reqAsPromise(store.delete(id)));
}

export async function bumpPhotoAttempt(id: string, errMsg: string): Promise<void> {
  await tx("photos", "readwrite", async (store) => {
    const existing = (await reqAsPromise(store.get(id))) as QueuedPhoto | undefined;
    if (!existing) return;
    existing.attempts += 1;
    existing.lastError = errMsg;
    await reqAsPromise(store.put(existing));
  });
}

// ── Draft mirror ────────────────────────────────────────────────────────────

export async function saveDraft(record: DraftRecord): Promise<void> {
  await tx("drafts", "readwrite", (store) => reqAsPromise(store.put(record)));
}

export async function getDraftByVisit(visitId: string): Promise<DraftRecord | null> {
  return tx("drafts", "readonly", async (store) => {
    const all = (await reqAsPromise(store.getAll())) as DraftRecord[];
    return all.find((d) => d.visitId === visitId) ?? null;
  });
}

// ── Counts (for the offline badge) ─────────────────────────────────────────

export async function pendingCounts(): Promise<{ mutations: number; photos: number }> {
  try {
    const [mutations, photos] = await Promise.all([
      tx("mutations", "readonly", (store) => reqAsPromise(store.count())),
      tx("photos", "readonly", (store) => reqAsPromise(store.count())),
    ]);
    return { mutations: mutations ?? 0, photos: photos ?? 0 };
  } catch {
    return { mutations: 0, photos: 0 };
  }
}
