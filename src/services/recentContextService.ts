export type RecentContextKind = "site" | "job";

export interface RecentContextItem {
  id: string;
  label: string;
  subtitle?: string | null;
  href: string;
  updatedAt: string;
}

const KEYS: Record<RecentContextKind, string> = {
  site: "recentContext.site.v1",
  job: "recentContext.job.v1",
};

export const RECENT_CONTEXT_EVENT = "recent-context-updated";

function emitRecentUpdate() {
  window.dispatchEvent(new CustomEvent(RECENT_CONTEXT_EVENT));
}

export function readRecentContext(kind: RecentContextKind): RecentContextItem | null {
  try {
    const raw = localStorage.getItem(KEYS[kind]);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RecentContextItem;
    if (!parsed?.id || !parsed?.label || !parsed?.href) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeRecentContext(kind: RecentContextKind, item: Omit<RecentContextItem, "updatedAt">) {
  try {
    localStorage.setItem(KEYS[kind], JSON.stringify({ ...item, updatedAt: new Date().toISOString() }));
    emitRecentUpdate();
  } catch {
    // Recent-context chips are a convenience only; ignore storage failures.
  }
}