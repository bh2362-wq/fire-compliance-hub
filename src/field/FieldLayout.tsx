import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ChevronLeft, WifiOff, Wifi, Bell } from "lucide-react";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Capacitor } from "@capacitor/core";
import { useOfflineQueue } from "./hooks/useOfflineQueue";

interface FieldLayoutProps {
  children: React.ReactNode;
}

export function FieldLayout({ children }: FieldLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [online, setOnline] = useState(navigator.onLine);
  const { queuedCount } = useOfflineQueue();

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const isRoot = location.pathname === "/field" || location.pathname === "/field/";

  return (
    <div className="min-h-screen bg-[#F2F1ED] flex flex-col max-w-screen-sm mx-auto">
      <header className="bg-[#C22126] text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        {!isRoot ? (
          <button onClick={() => navigate(-1)} className="p-1 -ml-1 active:opacity-60" aria-label="Back">
            <ChevronLeft className="w-6 h-6" />
          </button>
        ) : (
          <div className="w-8 h-8 bg-white/15 rounded-lg flex items-center justify-center">
            <span className="text-sm font-bold">BHO</span>
          </div>
        )}
        <h1 className="flex-1 text-base font-medium">{getScreenTitle(location.pathname)}</h1>
        <div className="flex items-center gap-2">
          {online ? <Wifi className="w-4 h-4 opacity-80" /> : (
            <div className="flex items-center gap-1 bg-white/15 px-2 py-1 rounded-full text-xs">
              <WifiOff className="w-3 h-3" />
              {queuedCount > 0 && <span>{queuedCount}</span>}
            </div>
          )}
          {isRoot && <Bell className="w-5 h-5 opacity-80" />}
        </div>
      </header>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

function getScreenTitle(pathname: string): string {
  if (pathname === "/field" || pathname === "/field/") {
    const today = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    return `Today — ${today}`;
  }
  if (pathname.endsWith("/briefing")) return "Site briefing";
  if (pathname.endsWith("/test")) return "Test devices";
  if (pathname.endsWith("/defect")) return "Raise defect";
  if (pathname.endsWith("/signoff")) return "Sign-off";
  if (pathname.endsWith("/complete")) return "Job complete";
  if (pathname.includes("/job/")) return "Job in progress";
  return "FireLogbook";
}
