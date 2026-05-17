import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  MessageCircle, Loader2, RefreshCw, Scan, AlertCircle,
  CheckCircle2, User, Sparkles, ArrowRight, Upload, FileArchive,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// ── Known business contact identifiers ────────────────────────────────────────
const BUSINESS_NAMES = [
  "panache", "churches", "palantir", "solar fire", "bawfs",
  "fire", "security", "facilities", "management", "building",
  "ltd", "limited", "plc", "group", "services", "solutions",
  "stoddon", "lynne", "giles", "louise",
];

function isBusinessContact(name: string, preview: string): boolean {
  const n = name.toLowerCase();
  const p = preview.toLowerCase();
  return (
    BUSINESS_NAMES.some(b => n.includes(b)) ||
    p.includes("quote") || p.includes("quotation") ||
    p.includes("detector") || p.includes("alarm") ||
    p.includes("fire") || p.includes("service") ||
    p.includes("install") || p.includes("survey") ||
    p.includes("repair") || p.includes("fault") ||
    p.includes("panel") || p.includes("engineer")
  );
}

interface WaChat {
  name: string;
  preview: string;
  time: string;
  unread: string;
  isBusiness: boolean;
}

interface Props {
  onScanMessage: (content: string, from: string) => void;
}

class ExtensionMissingError extends Error {
  constructor() {
    super("WhatsApp helper extension not detected");
    this.name = "ExtensionMissingError";
  }
}

function waitForExtensionChats(script: string): Promise<any[]> {
  const requestId = `wa-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new ExtensionMissingError());
    }, 4000);

    const extractChats = (payload: any): any[] | null => {
      if (!payload || payload.requestId !== requestId) return null;
      if (Array.isArray(payload.chats)) return payload.chats;
      if (Array.isArray(payload.result)) return payload.result;
      if (typeof payload.result === "string") {
        try {
          const parsed = JSON.parse(payload.result);
          return Array.isArray(parsed) ? parsed : parsed?.chats || null;
        } catch {
          return null;
        }
      }
      return null;
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      const chats = extractChats(event.data);
      if (!chats) return;
      cleanup();
      resolve(chats);
    };

    const onCustomEvent = (event: Event) => {
      const chats = extractChats((event as CustomEvent).detail);
      if (!chats) return;
      cleanup();
      resolve(chats);
    };

    const cleanup = () => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("firelogbook:whatsapp-result", onCustomEvent);
    };

    window.addEventListener("message", onMessage);
    window.addEventListener("firelogbook:whatsapp-result", onCustomEvent);

    const payload = {
      source: "fire-logbook",
      type: "READ_WHATSAPP_CHATS",
      requestId,
      script,
    };

    window.dispatchEvent(new CustomEvent("firelogbook:read-whatsapp", { detail: payload }));
    window.postMessage(payload, window.location.origin);
  });
}

export function WhatsAppScanner({ onScanMessage }: Props) {
  const [chats, setChats] = useState<WaChat[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [rawText, setRawText] = useState("");
  const [mode, setMode] = useState<"auto" | "paste" | "upload">("auto");
  const [lastRead, setLastRead] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "business" | "unread">("business");
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileUpload(file: File) {
    setLoading(true);
    try {
      let text = "";
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".zip")) {
        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(file);
        const txtEntry = Object.values(zip.files).find(f =>
          !f.dir && f.name.toLowerCase().endsWith(".txt")
        );
        if (!txtEntry) throw new Error("No .txt chat file found inside the zip");
        text = await txtEntry.async("string");
      } else if (lower.endsWith(".txt")) {
        text = await file.text();
      } else {
        throw new Error("Upload a WhatsApp export .zip or exported .txt file");
      }
      if (!text.trim()) throw new Error("The chat file is empty");
      setRawText(text);
      setUploadedName(file.name);
      toast.success(`Loaded ${file.name} (${(text.length / 1024).toFixed(1)} KB)`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to read file";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  // ── Read WhatsApp via Chrome extension script bridge ─────────────────────────
  async function readWhatsApp() {
    setLoading(true);
    try {
      const { data, error, response } = await supabase.functions.invoke("whatsapp-reader", {});

      let payload: any = data;
      if (error) {
        if (response?.json) payload = await response.clone().json();
        else throw error;
      }

      const sourceChats = payload?.script
        ? await waitForExtensionChats(payload.script)
        : payload?.chats;

      if (!Array.isArray(sourceChats) || sourceChats.length === 0) {
        throw new Error("No WhatsApp chats were returned from the Chrome extension");
      }

      const parsed: WaChat[] = sourceChats.map((c: any) => ({
        ...c,
        isBusiness: isBusinessContact(c.name, c.preview),
      }));

      setChats(parsed);
      setLastRead(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));

      const business = parsed.filter(c => c.isBusiness).length;
      const unread = parsed.filter(c => c.unread && parseInt(c.unread) > 0).length;
      toast.success(`${parsed.length} chats — ${business} business contacts, ${unread} unread`);
    } catch (err: unknown) {
      if (err instanceof ExtensionMissingError) {
        setMode("paste");
        toast.info("Auto-read needs the Chrome helper — switched to paste mode. Copy your WhatsApp chat into the box below.");
      } else {
        const msg = err instanceof Error ? err.message : "Failed to read WhatsApp";
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  function handlePasteScan() {
    if (!rawText.trim()) { toast.error("Paste a WhatsApp conversation first"); return; }
    onScanMessage(rawText, "WhatsApp");
    toast.success("Loaded — click Smart Quote or Book Visit");
  }

  function handleChatScan(chat: WaChat) {
    setScanningId(chat.name);
    const content = [
      `WhatsApp message from: ${chat.name}`,
      `Time: ${chat.time}`,
      ``,
      chat.preview,
    ].join("\n");
    onScanMessage(content, chat.name);
    toast.success(`"${chat.name}" loaded — click Smart Quote or Book Visit`);
    setScanningId(null);
  }

  const filtered = chats.filter(c => {
    if (filter === "business") return c.isBusiness;
    if (filter === "unread") return c.unread && parseInt(c.unread) > 0;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold flex items-center gap-1.5">
            <MessageCircle className="w-3.5 h-3.5 text-green-600" />
            WhatsApp — web.whatsapp.com
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {lastRead ? `Last read at ${lastRead}` : "Click Read WhatsApp to scan your open chats"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["auto", "paste", "upload"] as const).map(m => (
            <Button
              key={m}
              variant={mode === m ? "default" : "outline"}
              size="sm"
              className={cn("h-7 text-xs", mode === m && m === "auto" && "bg-green-600 hover:bg-green-700")}
              onClick={() => setMode(m)}
            >
              {m === "auto" ? "Auto" : m === "paste" ? "Paste" : "Upload export"}
            </Button>
          ))}
          {mode === "auto" && (
            <Button
              size="sm"
              className="h-7 gap-1.5 text-xs bg-green-600 hover:bg-green-700"
              onClick={readWhatsApp}
              disabled={loading}
            >
              {loading
                ? <><Loader2 className="w-3 h-3 animate-spin" />Reading…</>
                : <><RefreshCw className="w-3 h-3" />Read WhatsApp</>}
            </Button>
          )}
        </div>
      </div>

      {/* Upload mode */}
      {mode === "upload" && (
        <div className="space-y-3">
          <div className="rounded-lg border border-green-200/60 bg-green-50 dark:bg-green-950/20 p-3 text-xs text-green-800 dark:text-green-400 space-y-1">
            <p className="font-semibold">Upload mode:</p>
            <p>In WhatsApp open the chat → menu → <strong>More → Export chat → Without media</strong>, then upload the .zip (or .txt) here.</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,.txt"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleFileUpload(f);
              e.target.value = "";
            }}
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); }}
            onDrop={e => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleFileUpload(f);
            }}
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-accent/20 transition-colors"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />Reading file…
              </div>
            ) : uploadedName ? (
              <div className="flex items-center justify-center gap-2 text-sm">
                <FileArchive className="w-4 h-4 text-green-600" />
                <span className="font-medium">{uploadedName}</span>
                <span className="text-muted-foreground">— click to replace</span>
              </div>
            ) : (
              <div className="space-y-1">
                <Upload className="w-5 h-5 mx-auto text-muted-foreground" />
                <p className="text-sm font-medium">Drop your WhatsApp export here</p>
                <p className="text-[11px] text-muted-foreground">.zip or .txt — click to browse</p>
              </div>
            )}
          </div>
          {rawText.trim() && (
            <div className="flex gap-2">
              <Button onClick={handlePasteScan} className="flex-1 gap-2">
                <Sparkles className="w-4 h-4" />Smart Quote
              </Button>
              <Button variant="outline" onClick={() => onScanMessage(rawText, "WhatsApp")} className="flex-1 gap-2">
                <Scan className="w-4 h-4" />Book Visit
              </Button>
            </div>
          )}
        </div>
      )}

      {/* How it works banner (first time) */}
      {chats.length === 0 && mode === "auto" && (
        <div className="rounded-lg border border-green-200/60 bg-green-50 dark:bg-green-950/20 p-3 text-xs text-green-800 dark:text-green-400 space-y-1.5">
          <p className="font-semibold">How the auto mode works:</p>
          <p>1. Keep <strong>web.whatsapp.com</strong> open in Chrome with your phone connected</p>
          <p>2. Make sure the Claude extension has permission on that tab</p>
          <p>3. Click <strong>Read WhatsApp</strong> — Claude reads your chat list automatically</p>
          <p>4. Business contacts are highlighted — click <strong>Scan</strong> to process any message</p>
        </div>
      )}

      {/* Paste mode */}
      {mode === "paste" && (
        <div className="space-y-3">
          <div className="rounded-lg border border-green-200/60 bg-green-50 dark:bg-green-950/20 p-3 text-xs text-green-800 dark:text-green-400 space-y-1">
            <p className="font-semibold">Paste mode:</p>
            <p>Open WhatsApp Desktop or web.whatsapp.com → open the conversation → select all text → paste below</p>
          </div>
          <Textarea
            value={rawText}
            onChange={e => setRawText(e.target.value)}
            placeholder="Paste WhatsApp conversation here…&#10;&#10;e.g.&#10;Gill Stoddon: Hi Ben, could you quote for replacing 12 smoke detectors at our office? We have a Gent system."
            className="min-h-[160px] text-sm resize-none"
          />
          {rawText.trim() && (
            <div className="flex gap-2">
              <Button onClick={handlePasteScan} className="flex-1 gap-2">
                <Sparkles className="w-4 h-4" />Smart Quote
              </Button>
              <Button variant="outline" onClick={() => onScanMessage(rawText, "WhatsApp")} className="flex-1 gap-2">
                <Scan className="w-4 h-4" />Book Visit
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Auto mode — chat list */}
      {mode === "auto" && chats.length > 0 && (
        <>
          {/* Filter tabs */}
          <div className="flex gap-1.5">
            {(["business", "unread", "all"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={cn(
                  "text-[11px] px-2.5 py-1 rounded-full border transition-colors",
                  filter === f
                    ? "bg-green-600 text-white border-green-600"
                    : "border-border text-muted-foreground hover:bg-accent/30"
                )}>
                {f === "business" ? `Business (${chats.filter(c => c.isBusiness).length})`
                  : f === "unread" ? `Unread (${chats.filter(c => c.unread && parseInt(c.unread) > 0).length})`
                  : `All (${chats.length})`}
              </button>
            ))}
          </div>

          {/* Chat rows */}
          <div className="divide-y divide-border/50 border rounded-lg overflow-hidden">
            {filtered.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No {filter} messages found
              </div>
            ) : filtered.map(chat => (
              <div key={chat.name}
                className={cn(
                  "flex items-start gap-3 px-3 py-2.5 hover:bg-accent/20 transition-colors",
                  chat.isBusiness && "bg-green-50/40 dark:bg-green-950/10"
                )}>
                {/* Avatar */}
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5",
                  chat.isBusiness ? "bg-green-600 text-white" : "bg-muted text-muted-foreground"
                )}>
                  {chat.name[0]?.toUpperCase()}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium truncate">{chat.name}</p>
                    {chat.isBusiness && (
                      <Badge className="text-[8px] h-3.5 px-1 bg-green-100 text-green-800 border-green-300/60 hover:bg-green-100 flex-shrink-0">
                        business
                      </Badge>
                    )}
                    {chat.unread && parseInt(chat.unread) > 0 && (
                      <span className="w-4 h-4 rounded-full bg-green-600 text-white text-[9px] flex items-center justify-center font-bold flex-shrink-0">
                        {chat.unread}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">{chat.preview}</p>
                </div>

                {/* Time + scan */}
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-[10px] text-muted-foreground">{chat.time}</span>
                  <Button size="sm" variant="outline"
                    className="h-6 px-2 text-[10px] gap-1"
                    onClick={() => handleChatScan(chat)}
                    disabled={scanningId === chat.name}
                  >
                    {scanningId === chat.name
                      ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      : <Scan className="w-2.5 h-2.5" />}
                    Scan
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
