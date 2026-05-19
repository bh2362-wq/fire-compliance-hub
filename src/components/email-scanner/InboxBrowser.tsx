import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Mail, Loader2, RefreshCw, Scan, Search,
  Paperclip, AlertCircle, ChevronLeft, ChevronRight, Inbox, Sparkles, X,
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  listInbox, getMessage, searchEmails, listAttachments, getAttachment,
  type OutlookMessage,
} from "@/services/outlookEmailService";

interface AiCitationEmail {
  id: string;
  subject: string;
  from: string;
  fromName: string;
  date: string;
  preview: string;
  hasAttachments: boolean;
}
interface AiCitationQuote {
  id: string;
  quotation_number: string;
  title: string | null;
  total_amount: number;
  status: string;
  site_name?: string;
  customer_name?: string;
  created_at: string;
}
interface AiQueryResult {
  answer: string;
  keywords: string[];
  emails: AiCitationEmail[];
  quotations: AiCitationQuote[];
}


// ── Known client senders ──────────────────────────────────────────────────────
const CLIENT_DOMAINS = [
  "panachefire.co.uk", "churchesfire.com", "towerbm.com",
  "brentwood.gov.uk", "camden.gov.uk", "nhs.uk",
];

function isClientEmail(msg: OutlookMessage): boolean {
  const addr = msg.from?.address?.toLowerCase() || "";
  return CLIENT_DOMAINS.some(d => addr.endsWith(d));
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onScanEmail: (content: string, subject: string, from: string, pdfAttachments?: { name: string; contentBytes: string }[]) => void;
}

export function InboxBrowser({ onScanEmail }: Props) {
  const [filter, setFilter] = useState<"all" | "unread" | "clients">("all");
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [aiQuery, setAiQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AiQueryResult | null>(null);
  const LIMIT = 20;

  // Fetch inbox
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["outlook-inbox", offset, searchQuery],
    queryFn: async () => {
      if (searchQuery) {
        return searchEmails(searchQuery, LIMIT);
      }
      return listInbox({ limit: LIMIT, offset });
    },
    staleTime: 1000 * 60 * 2, // 2 min
    retry: 1,
  });

  const allMessages: OutlookMessage[] = data?.messages || [];

  const filtered = allMessages.filter(msg => {
    if (filter === "unread") return !msg.isRead;
    if (filter === "clients") return isClientEmail(msg);
    return true;
  });

  async function handleScan(msg: OutlookMessage) {
    setLoadingId(msg.id);
    try {
      const [detail, attsResult] = await Promise.all([
        getMessage(msg.id),
        msg.hasAttachments ? listAttachments(msg.id) : Promise.resolve({ attachments: [] }),
      ]);

      const bodyText = detail.body || "";
      const fullContent = [
        `From: ${detail.from?.name || ""} <${detail.from?.address || ""}>`,
        `Subject: ${detail.subject}`,
        `Date: ${format(parseISO(detail.receivedDateTime), "dd MMM yyyy HH:mm")}`,
        "",
        bodyText || "(no body text — content may be in attached PDF)",
      ].join("\n");

      // Fetch PDFs (up to 3)
      // Graph API sometimes returns application/octet-stream for PDFs - always check filename too
      const pdfList = (attsResult.attachments || [])
        .filter(a =>
          a.contentType?.toLowerCase().includes("pdf") ||
          a.name?.toLowerCase().endsWith(".pdf") ||
          (a.contentType === "application/octet-stream" && a.name?.toLowerCase().endsWith(".pdf"))
        )
        .slice(0, 3);

      let pdfAttachments: { name: string; contentBytes: string }[] = [];

      if (pdfList.length > 0) {
        toast.info(`Reading ${pdfList.length} PDF${pdfList.length !== 1 ? "s" : ""}…`);
        const results = await Promise.allSettled(
          pdfList.map(a => getAttachment(msg.id, a.id))
        );
        pdfAttachments = results
          .filter((r): r is PromiseFulfilledResult<{ name: string; contentType: string; contentBytes: string }> => r.status === "fulfilled")
          .map(r => ({ name: r.value.name, contentBytes: r.value.contentBytes }));
      }

      if (!bodyText && pdfAttachments.length === 0) {
        toast.error("Email is empty and has no readable attachments");
        return;
      }

      onScanEmail(fullContent, detail.subject, detail.from?.address || "", pdfAttachments);

      const pdfNote = pdfAttachments.length > 0 ? ` + ${pdfAttachments.length} PDF${pdfAttachments.length !== 1 ? "s" : ""}` : "";
      toast.success(`Email loaded${pdfNote} — click Smart Quote or Book Visit`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load email");
    } finally {
      setLoadingId(null);
    }
  }

  function handleSearch() {
    setSearchQuery(search);
    setOffset(0);
  }

  async function handleAiAsk() {
    const q = aiQuery.trim();
    if (!q) return;
    setAiLoading(true);
    setAiResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("inbox-ai-query", { body: { query: q } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setAiResult(data as AiQueryResult);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "AI query failed");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleScanById(id: string, fallbackSubject = "", fallbackFrom = "") {
    setLoadingId(id);
    try {
      const detail = await getMessage(id);
      const attsResult = detail.hasAttachments ? await listAttachments(id) : { attachments: [] };
      const bodyText = detail.body || "";
      const fullContent = [
        `From: ${detail.from?.name || ""} <${detail.from?.address || fallbackFrom}>`,
        `Subject: ${detail.subject || fallbackSubject}`,
        `Date: ${format(parseISO(detail.receivedDateTime), "dd MMM yyyy HH:mm")}`,
        "",
        bodyText || "(no body text)",
      ].join("\n");
      const pdfList = (attsResult.attachments || [])
        .filter(a =>
          a.contentType?.toLowerCase().includes("pdf") ||
          a.name?.toLowerCase().endsWith(".pdf") ||
          (a.contentType === "application/octet-stream" && a.name?.toLowerCase().endsWith(".pdf"))
        )
        .slice(0, 3);
      let pdfAttachments: { name: string; contentBytes: string }[] = [];
      if (pdfList.length > 0) {
        const results = await Promise.allSettled(pdfList.map(a => getAttachment(id, a.id)));
        pdfAttachments = results
          .filter((r): r is PromiseFulfilledResult<{ name: string; contentType: string; contentBytes: string }> => r.status === "fulfilled")
          .map(r => ({ name: r.value.name, contentBytes: r.value.contentBytes }));
      }
      onScanEmail(fullContent, detail.subject || fallbackSubject, detail.from?.address || fallbackFrom, pdfAttachments);
      toast.success("Email loaded into scanner");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load email");
    } finally {
      setLoadingId(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-xs font-semibold flex items-center gap-1.5">
            <Inbox className="w-3.5 h-3.5" />Inbox — admin@bhofire.com
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Click Scan on any email to load it into the scanner
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs"
          onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("w-3 h-3", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder="Search subject, sender, body…"
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Button size="sm" className="h-8 px-3 text-xs" onClick={handleSearch}>Search</Button>
        {searchQuery && (
          <Button variant="ghost" size="sm" className="h-8 text-xs"
            onClick={() => { setSearch(""); setSearchQuery(""); setOffset(0); }}>
            Clear
          </Button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5">
        {(["all", "unread", "clients"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn(
              "text-[11px] px-2.5 py-1 rounded-full border transition-colors",
              filter === f ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-accent/30"
            )}>
            {f === "all" ? "All" : f === "unread" ? "Unread" : "Clients"}
            {f === "unread" && allMessages.filter(m => !m.isRead).length > 0 && (
              <span className="ml-1 bg-primary-foreground/20 text-primary-foreground rounded-full px-1">
                {allMessages.filter(m => !m.isRead).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Email list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground gap-2 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />Loading inbox…
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-destructive/40 bg-destructive/5 text-xs text-destructive">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Could not connect to Outlook</p>
            <p className="mt-0.5 text-muted-foreground">Check that MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET are set in Supabase Edge Function secrets, and that the app has Mail.Read permission on the mailbox.</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          <Mail className="w-6 h-6 mx-auto mb-1.5 opacity-40" />
          {searchQuery ? `No emails matching "${searchQuery}"` : "No emails in this filter"}
        </div>
      ) : (
        <div className="divide-y divide-border/50 border rounded-lg overflow-hidden">
          {filtered.map(msg => (
            <div key={msg.id}
              className={cn(
                "flex items-start gap-3 px-3 py-2.5 hover:bg-accent/20 transition-colors",
                !msg.isRead && "bg-primary/5 border-l-2 border-l-primary"
              )}>
              {/* Unread dot */}
              <div className="flex-shrink-0 mt-1.5">
                {!msg.isRead
                  ? <div className="w-2 h-2 rounded-full bg-primary" />
                  : <div className="w-2 h-2 rounded-full bg-transparent" />}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2 justify-between">
                  <div className="min-w-0">
                    <p className={cn("text-xs truncate", !msg.isRead ? "font-semibold" : "font-medium")}>
                      {msg.from?.name && msg.from.name !== msg.from?.address
                        ? msg.from.name
                        : msg.from?.address || "Unknown sender"}
                      {msg.from?.address && msg.from?.name !== msg.from?.address && (
                        <span className="text-muted-foreground font-normal ml-1.5">
                          {msg.from.address}
                        </span>
                      )}
                    </p>
                    <p className={cn("text-xs truncate mt-0.5", !msg.isRead ? "font-semibold text-foreground" : "text-muted-foreground")}>
                      {msg.subject || "(no subject)"}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">{msg.bodyPreview}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-2">
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {format(parseISO(msg.receivedDateTime), "dd MMM HH:mm")}
                    </span>
                    <div className="flex gap-1">
                      {msg.hasAttachments && <Paperclip className="w-3 h-3 text-muted-foreground/60" />}
                      {isClientEmail(msg) && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-blue-300/60 text-blue-700">client</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Scan button */}
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs gap-1 flex-shrink-0 self-center"
                onClick={() => handleScan(msg)}
                disabled={loadingId === msg.id}
              >
                {loadingId === msg.id
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Scan className="w-3 h-3" />}
                Scan
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!searchQuery && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Showing {offset + 1}–{offset + (filtered.length || 0)}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-7 w-7 p-0"
              disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0"
              disabled={(data?.messages?.length || 0) < LIMIT}
              onClick={() => setOffset(offset + LIMIT)}>
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
