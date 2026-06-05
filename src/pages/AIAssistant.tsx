import { useState, useRef, useEffect } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Sparkles, Send, FileText, Upload, Loader2, Bot, User, FileSearch, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Citation {
  chunk_id: string;
  document_id: string;
  document_title: string;
  standard_reference: string | null;
  page_number: number | null;
  section_title: string | null;
  similarity: number;
}

type Msg = {
  role: "user" | "assistant";
  content: string;
  sources?: Citation[];
};

async function extractPdfText(file: File): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist");
  // @ts-ignore worker
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  let text = "";
  const maxPages = Math.min(pdf.numPages, 50);
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it: any) => it.str).join(" ") + "\n\n";
  }
  return text;
}

async function readTextFile(file: File): Promise<string> {
  return await file.text();
}

function MarkdownLite({ text }: { text: string }) {
  // Lightweight markdown rendering — preserves line breaks, basic headings, lists, bold
  const html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.*)$/gm, '<h3 class="text-base font-semibold mt-3 mb-1">$1</h3>')
    .replace(/^## (.*)$/gm, '<h2 class="text-lg font-semibold mt-4 mb-2">$1</h2>')
    .replace(/^# (.*)$/gm, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-muted rounded text-xs">$1</code>')
    .replace(/^\- (.*)$/gm, '<li class="ml-5 list-disc">$1</li>')
    .replace(/\n/g, "<br/>");
  return <div className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function AIAssistant() {
  const [tab, setTab] = useState("chat");

  // Chat state
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  // BAFE grounding: when on, every chat message is augmented server-side
  // with top-K chunks from the BAFE-tagged docs in the reference library.
  // Default ON — the page-level CTA for this assistant is the BAFE
  // knowledge work, vanilla chat is the backup.
  const [groundInBafe, setGroundInBafe] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Document analysis state
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docText, setDocText] = useState("");
  const [docResult, setDocResult] = useState("");
  const [docLoading, setDocLoading] = useState(false);
  const [docMode, setDocMode] = useState<"analyze" | "summarise">("analyze");

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const callClaude = async (payload: any): Promise<{ content: string; sources?: Citation[] }> => {
    const { data, error } = await supabase.functions.invoke("claude-chat", { body: payload });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return {
      content: (data?.content as string) || "",
      sources: Array.isArray(data?.sources) ? (data.sources as Citation[]) : undefined,
    };
  };

  const sendChat = async () => {
    const text = input.trim();
    if (!text || chatLoading) return;
    // Strip sources from the messages sent to the server — they're UI-only.
    const wireMessages = [...messages, { role: "user" as const, content: text }].map(
      ({ role, content }) => ({ role, content })
    );
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setChatLoading(true);
    try {
      const { content, sources } = await callClaude({
        messages: wireMessages,
        mode: "chat",
        useReferenceLibrary: groundInBafe,
        referenceDocTypes: ["bafe"],
      });
      setMessages([
        ...next,
        { role: "assistant", content: content || "(no response)", sources },
      ]);
    } catch (e: any) {
      toast.error(e.message || "Claude request failed");
      setMessages(next);
    } finally {
      setChatLoading(false);
    }
  };

  const handleDocUpload = async (file: File) => {
    setDocFile(file);
    setDocResult("");
    try {
      let text = "";
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        toast.info("Extracting PDF text…");
        text = await extractPdfText(file);
      } else if (file.type.startsWith("text/") || /\.(txt|md|csv|json|log)$/i.test(file.name)) {
        text = await readTextFile(file);
      } else {
        toast.error("Unsupported file. Use PDF or text files.");
        return;
      }
      setDocText(text);
      toast.success(`Loaded ${text.length.toLocaleString()} characters`);
    } catch (e: any) {
      toast.error(e.message || "Failed to read file");
    }
  };

  const runDocAnalysis = async () => {
    if (!docText.trim()) {
      toast.error("Upload a document first");
      return;
    }
    setDocLoading(true);
    setDocResult("");
    try {
      const { content } = await callClaude({
        mode: docMode,
        documentText: docText,
        messages: [
          {
            role: "user",
            content:
              docMode === "analyze"
                ? "Analyse this document and extract findings, defects, recommendations, and compliance issues."
                : "Produce an executive summary of this report.",
          },
        ],
      });
      setDocResult(content);
    } catch (e: any) {
      toast.error(e.message || "Claude request failed");
    } finally {
      setDocLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 p-4 md:p-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" />
              AI Assistant
              <Badge variant="secondary" className="ml-1">Claude</Badge>
            </h1>
            <p className="text-sm text-muted-foreground">
              Powered by Anthropic Claude — fire safety expert chat, document analysis, and report summarisation.
            </p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList>
            <TabsTrigger value="chat"><Bot className="w-4 h-4 mr-1.5" />Chat</TabsTrigger>
            <TabsTrigger value="analyze"><FileSearch className="w-4 h-4 mr-1.5" />Analyse Document</TabsTrigger>
            <TabsTrigger value="summarise"><FileText className="w-4 h-4 mr-1.5" />Summarise Report</TabsTrigger>
          </TabsList>

          {/* Chat */}
          <TabsContent value="chat" className="mt-4">
            <Card className="flex flex-col h-[calc(100vh-280px)] min-h-[500px]">
              {/* BAFE grounding toggle — when on, answers are restricted
                  to the BAFE-tagged documents in the reference library
                  and every claim is cited. */}
              <div className="flex items-center justify-between border-b px-4 py-2.5 gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <BookOpen className="w-4 h-4 text-secondary flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight">BAFE knowledge grounding</p>
                    <p className="text-xs text-muted-foreground leading-tight truncate">
                      {groundInBafe
                        ? "Answers restricted to BAFE-tagged docs in the reference library, with citations."
                        : "Vanilla chat — Claude answers from training data, no library lookup."}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={groundInBafe}
                  onCheckedChange={setGroundInBafe}
                  aria-label="Ground answers in BAFE library"
                />
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-12">
                    <Bot className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p>
                      {groundInBafe
                        ? "Ask about BAFE SP203 requirements, scopes, audit criteria — answers will cite the library."
                        : "Ask Claude anything about fire safety, BS 5839/BS 5266, BAFE, or compliance."}
                    </p>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                      m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                    )}>
                      {m.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>
                    <div className={cn(
                      "rounded-lg px-3 py-2 max-w-[80%] space-y-2",
                      m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                    )}>
                      <MarkdownLite text={m.content} />
                      {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                        <SourcesPanel sources={m.sources} />
                      )}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="bg-muted rounded-lg px-3 py-2 flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" /> Thinking…
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="border-t p-3 flex gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendChat();
                    }
                  }}
                  placeholder={
                    groundInBafe
                      ? "Ask about BAFE SP203 modules, audit scope, evidence requirements…"
                      : "Ask about BS 5839, fire alarm zones, BAFE requirements…"
                  }
                  className="min-h-[44px] max-h-[120px] resize-none"
                  disabled={chatLoading}
                />
                <Button onClick={sendChat} disabled={chatLoading || !input.trim()}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          </TabsContent>

          {/* Analyse Document */}
          <TabsContent value="analyze" className="mt-4">
            <DocumentPanel
              title="Analyse Document"
              description="Upload a PDF or text file (e.g. fire risk assessment, panel log, client spec). Claude extracts key findings, defects and recommendations."
              mode="analyze"
              docFile={docFile}
              docText={docText}
              docResult={docMode === "analyze" ? docResult : ""}
              docLoading={docLoading && docMode === "analyze"}
              onUpload={handleDocUpload}
              onRun={() => { setDocMode("analyze"); runDocAnalysis(); }}
            />
          </TabsContent>

          {/* Summarise */}
          <TabsContent value="summarise" className="mt-4">
            <DocumentPanel
              title="Summarise Report"
              description="Upload a completed service or inspection report. Claude produces an executive summary."
              mode="summarise"
              docFile={docFile}
              docText={docText}
              docResult={docMode === "summarise" ? docResult : ""}
              docLoading={docLoading && docMode === "summarise"}
              onUpload={handleDocUpload}
              onRun={() => { setDocMode("summarise"); runDocAnalysis(); }}
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function SourcesPanel({ sources }: { sources: Citation[] }) {
  return (
    <div className="mt-2 pt-2 border-t border-foreground/10 space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Sources ({sources.length})
      </p>
      <ol className="space-y-1">
        {sources.map((s, i) => {
          const ref = s.standard_reference ? ` · ${s.standard_reference}` : "";
          const page = s.page_number ? ` · p.${s.page_number}` : "";
          const section = s.section_title ? ` — ${s.section_title}` : "";
          return (
            <li key={s.chunk_id} className="text-xs leading-snug">
              <span className="font-semibold">[{i + 1}]</span>{" "}
              <span className="text-foreground/85">{s.document_title}</span>
              <span className="text-muted-foreground">{ref}{page}{section}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function DocumentPanel({
  title, description, docFile, docText, docResult, docLoading, onUpload, onRun,
}: {
  title: string; description: string; mode: "analyze" | "summarise";
  docFile: File | null; docText: string; docResult: string; docLoading: boolean;
  onUpload: (f: File) => void; onRun: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Card className="p-4 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,.md,.csv,.log,.json,text/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
          }}
        />
        <Button variant="outline" onClick={() => inputRef.current?.click()}>
          <Upload className="w-4 h-4 mr-1.5" /> Upload PDF or text
        </Button>
        {docFile && (
          <span className="text-sm text-muted-foreground flex items-center gap-1.5">
            <FileText className="w-4 h-4" /> {docFile.name}
            {docText && <Badge variant="secondary">{docText.length.toLocaleString()} chars</Badge>}
          </span>
        )}
        <Button onClick={onRun} disabled={!docText.trim() || docLoading} className="ml-auto">
          {docLoading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
          Run with Claude
        </Button>
      </div>

      {docResult && (
        <Card className="p-4 bg-muted/30">
          <MarkdownLite text={docResult} />
        </Card>
      )}
    </Card>
  );
}
