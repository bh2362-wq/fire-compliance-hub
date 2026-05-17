import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const DB_NAME = "firelogbook-field";
const STORE = "sync_queue";
const DB_VERSION = 1;

interface QueueItem {
  id?: number;
  table: string;
  payload: Record<string, unknown>;
  created_at: string;
  attempts: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => rej(req.error);
    req.onsuccess = () => res(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
  });
}

async function add(item: Omit<QueueItem, "id">): Promise<void> {
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add(item);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

async function getAll(): Promise<QueueItem[]> {
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => res(req.result as QueueItem[]);
    req.onerror = () => rej(req.error);
  });
}

async function remove(id: number): Promise<void> {
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

async function updateAttempts(id: number, attempts: number): Promise<void> {
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const item = getReq.result as QueueItem | undefined;
      if (item) {
        item.attempts = attempts;
        store.put(item);
      }
    };
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export function useOfflineQueue() {
  const [queuedCount, setQueuedCount] = useState(0);

  const refreshCount = useCallback(async () => {
    const items = await getAll();
    setQueuedCount(items.length);
  }, []);

  const enqueue = useCallback(async (input: { table: string; payload: Record<string, unknown> }) => {
    await add({ table: input.table, payload: input.payload, created_at: new Date().toISOString(), attempts: 0 });
    await refreshCount();
  }, [refreshCount]);

  const flush = useCallback(async () => {
    if (!navigator.onLine) return;
    const items = await getAll();
    for (const item of items) {
      if (!item.id) continue;
      try {
        const { error } = await (supabase.from as any)(item.table).insert(item.payload);
        if (error) {
          await updateAttempts(item.id, item.attempts + 1);
          if (item.attempts >= 5) await remove(item.id);
        } else {
          await remove(item.id);
        }
      } catch (e) {
        console.error("Queue flush error", e);
      }
    }
    await refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    refreshCount();
    const onOnline = () => flush();
    window.addEventListener("online", onOnline);
    const interval = setInterval(() => { if (navigator.onLine) flush(); }, 30_000);
    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(interval);
    };
  }, [refreshCount, flush]);

  return { queuedCount, enqueue, flush };
}
