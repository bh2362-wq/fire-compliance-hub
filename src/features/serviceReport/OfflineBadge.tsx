import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pendingCounts } from "@/lib/offlineQueue";
import { runSync, subscribeSync, SyncState } from "@/lib/syncWorker";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

// Compact status indicator surfacing offline status + pending queue size.
// Tapping it forces a sync attempt when the user thinks they're back online
// but the event hasn't fired (e.g. captive portal / weak signal).
export function OfflineBadge() {
  const online = useOnlineStatus();
  const [counts, setCounts] = useState<{ mutations: number; photos: number }>({
    mutations: 0,
    photos: 0,
  });
  const [sync, setSync] = useState<SyncState>({
    running: false,
    lastRunAt: null,
    lastError: null,
  });

  const refresh = async () => {
    setCounts(await pendingCounts());
  };

  useEffect(() => {
    void refresh();
    const unsub = subscribeSync((s) => {
      setSync(s);
      void refresh();
    });
    const tick = setInterval(() => void refresh(), 4000);
    return () => {
      unsub();
      clearInterval(tick);
    };
  }, []);

  const pending = counts.mutations + counts.photos;

  if (online && pending === 0 && !sync.running) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-700">
        <CheckCircle2 className="h-3 w-3" />
        Synced
      </span>
    );
  }

  if (!online) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-700">
        <CloudOff className="h-3 w-3" />
        Offline
        {pending > 0 && <span className="font-medium">· {pending} queued</span>}
      </span>
    );
  }

  // Online with pending work or sync in progress.
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => void runSync()}
      disabled={sync.running}
      className="h-6 px-2 text-xs"
    >
      <RefreshCw className={`mr-1 h-3 w-3 ${sync.running ? "animate-spin" : ""}`} />
      {sync.running ? "Syncing…" : `Sync ${pending}`}
    </Button>
  );
}
