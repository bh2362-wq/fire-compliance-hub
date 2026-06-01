// Client-side cache for paste-AI-notes extractions.
//
// Keyed by FNV-1a hash of (report_type + notes_text). When the engineer
// pastes the same text twice (e.g. apply failed, paste again; or
// re-opening the dialog after a refresh), we serve the prior extraction
// instantly instead of re-billing the AI call.
//
// Storage: localStorage. Survives across reloads on the same device,
// doesn't need a DB migration, and the entries are small enough
// (~5-20KB each) that a 50-entry cap keeps us well under the 5MB
// per-origin localStorage quota. Entries older than 7 days are
// considered stale on read so a tweaked prompt or model swap doesn't
// poison long-lived caches.

const CACHE_KEY = "bho:paste-extract:cache:v1";
const MAX_ENTRIES = 50;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface CachedEntry<T> {
  hash: string;
  output: T;
  cachedAt: number;
}

// Stable, deterministic 32-bit hash. Same shape as the FNV-1a we use in
// useLiveDefectAnalysis so the two caches don't drift in behaviour.
function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16);
}

export function hashExtractionInput(reportType: string, text: string): string {
  // Normalise the input slightly so trivial whitespace changes don't
  // miss the cache (trim, collapse runs of whitespace).
  const normalised = text.trim().replace(/\s+/g, " ");
  return fnv1a(`${reportType}::${normalised}`);
}

function readAll<T>(): CachedEntry<T>[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CachedEntry<T>[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll<T>(entries: CachedEntry<T>[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(entries));
  } catch {
    // Quota exceeded / private-mode block — silently skip caching.
  }
}

export function getCachedExtraction<T>(hash: string): T | null {
  const all = readAll<T>();
  const entry = all.find((e) => e.hash === hash);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > MAX_AGE_MS) return null;
  return entry.output;
}

export function setCachedExtraction<T>(hash: string, output: T): void {
  const existing = readAll<T>();
  // Drop any prior entry for this hash, push the fresh one to the front
  // (LRU: most-recent first), then cap to MAX_ENTRIES so old extractions
  // age out automatically.
  const filtered = existing.filter((e) => e.hash !== hash);
  filtered.unshift({ hash, output, cachedAt: Date.now() });
  writeAll(filtered.slice(0, MAX_ENTRIES));
}
