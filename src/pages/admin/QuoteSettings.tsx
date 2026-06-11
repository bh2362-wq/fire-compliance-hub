import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Upload, CheckCircle2, XCircle, AlertTriangle, Loader2, RefreshCw,
  FileText, Sparkles, FileType, ChevronDown, ChevronRight, Settings, Download,
} from "lucide-react";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { extractEdgeError } from "@/lib/edgeError";
import { useQuotationFull, useGenerateQuoteDocx, useGenerateScope, useConvertQuotePdf } from "@/features/quotes/useQuoteGeneration";

const LOGO_BUCKET = "quote-assets";
const LOGO_PATH = "bho-logo.jpg";
const TEMPLATE_PATH = "master-template.docx";

type SecretStatus = "unknown" | "ok" | "missing";

interface Quotation { id: string; quotation_number: string; title: string | null; }

function StatusPill({ s }: { s: SecretStatus }) {
  if (s === "ok") return <Badge className="gap-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100"><CheckCircle2 className="w-3 h-3" />Set</Badge>;
  if (s === "missing") return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />Missing</Badge>;
  return <Badge variant="outline" className="gap-1">Unknown</Badge>;
}

export default function QuoteSettings() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    (async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      const roles = (data ?? []).map((r: any) => r.role);
      setIsAdmin(roles.includes("owner") || roles.includes("admin"));
    })();
  }, [user]);

  // --- Logo state ---
  const [logoExists, setLogoExists] = useState<boolean | null>(null);
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [logoBusy, setLogoBusy] = useState(false);

  const refreshLogo = async () => {
    const { data } = await supabase.storage.from(LOGO_BUCKET).list("", { search: LOGO_PATH });
    const exists = (data ?? []).some((f) => f.name === LOGO_PATH);
    setLogoExists(exists);
    if (exists) {
      const { data: u } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(LOGO_PATH);
      setLogoUrl(`${u.publicUrl}?t=${Date.now()}`);
    } else {
      setLogoUrl("");
    }
  };

  useEffect(() => { if (isAdmin) refreshLogo(); }, [isAdmin]);

  // --- Template state ---
  const [templateExists, setTemplateExists] = useState<boolean | null>(null);
  const [templateSize, setTemplateSize] = useState<number | null>(null);
  const [templateModified, setTemplateModified] = useState<string | null>(null);
  const [templateBusy, setTemplateBusy] = useState(false);

  const refreshTemplate = async () => {
    const { data } = await supabase.storage.from(LOGO_BUCKET).list("", { search: TEMPLATE_PATH });
    const found = (data ?? []).find((f) => f.name === TEMPLATE_PATH);
    setTemplateExists(!!found);
    setTemplateSize(found?.metadata?.size ?? null);
    setTemplateModified(found?.updated_at ?? found?.created_at ?? null);
  };
  useEffect(() => { if (isAdmin) refreshTemplate(); }, [isAdmin]);

  const onTemplateUpload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("File too large (max 10MB)"); return; }
    if (!file.name.toLowerCase().endsWith(".docx")) { toast.error("Must be a .docx file"); return; }
    setTemplateBusy(true);
    try {
      const { error } = await supabase.storage.from(LOGO_BUCKET).upload(TEMPLATE_PATH, file, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });
      if (error) throw error;
      toast.success("Master template uploaded");
      await refreshTemplate();
    } catch (e: any) {
      toast.error("Template upload failed", { description: e?.message });
    } finally {
      setTemplateBusy(false);
    }
  };

  const onLogoUpload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("File too large (max 5MB)"); return; }
    if (!/^image\/(png|jpeg|jpg|svg\+xml)$/.test(file.type)) {
      toast.error("Must be PNG, JPG or SVG"); return;
    }
    setLogoBusy(true);
    try {
      const { error } = await supabase.storage.from(LOGO_BUCKET).upload(LOGO_PATH, file, {
        contentType: file.type, upsert: true,
      });
      if (error) throw error;
      toast.success("Logo uploaded");
      await refreshLogo();
    } catch (e: any) {
      toast.error("Logo upload failed", { description: e?.message });
    } finally {
      setLogoBusy(false);
    }
  };

  // --- Secrets diagnostics ---
  const [anthropic, setAnthropic] = useState<SecretStatus>("unknown");
  const [graph, setGraph] = useState<SecretStatus>("unknown");
  const [diagBusy, setDiagBusy] = useState(false);
  const [openFix, setOpenFix] = useState<Record<string, boolean>>({});

  const runDiagnostics = async () => {
    setDiagBusy(true);
    try {
      // Anthropic — generate-bs5839-scope with minimal valid input
      try {
        const { data, error } = await supabase.functions.invoke("generate-bs5839-scope", {
          body: {
            works_type: "new_install",
            system: { category: "L1" },
            building: { type: "test", occupancy: "non_sleeping" },
          },
        });
        if (error) {
          const detail = await extractEdgeError(error);
          if (/ANTHROPIC_API_KEY|Anthropic API error 401|Anthropic.*not configured/i.test(detail)) setAnthropic("missing");
          else setAnthropic("ok");
        } else if (data) setAnthropic("ok");
        else setAnthropic("unknown");
      } catch (e) {
        const detail = await extractEdgeError(e);
        setAnthropic(/ANTHROPIC|401/i.test(detail) ? "missing" : "ok");
      }

      // Graph — convert-quote-pdf with dummy path
      try {
        const { error } = await supabase.functions.invoke("convert-quote-pdf", {
          body: { docx_storage_path: "diagnostic/nonexistent.docx" },
        });
        if (error) {
          const detail = await extractEdgeError(error);
          if (/Microsoft Graph environment variables missing|GRAPH_(TENANT|CLIENT|CONVERSION)/i.test(detail)) setGraph("missing");
          else setGraph("ok");
        } else setGraph("ok");
      } catch (e) {
        const detail = await extractEdgeError(e);
        setGraph(/Microsoft Graph|GRAPH_/i.test(detail) ? "missing" : "ok");
      }
      toast.success("Diagnostics complete");
    } finally {
      setDiagBusy(false);
    }
  };

  // --- Pipeline test ---
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const { data: selectedQ } = useQuotationFull(selectedId || undefined);
  const docx = useGenerateQuoteDocx();
  const scope = useGenerateScope();
  const pdf = useConvertQuotePdf();
  const [testOutput, setTestOutput] = useState<{ kind: string; text: string } | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("quotations")
        .select("id, quotation_number, title")
        .order("created_at", { ascending: false })
        .limit(50);
      setQuotations((data ?? []) as Quotation[]);
    })();
  }, [isAdmin]);

  const runDocxTest = async () => {
    if (!selectedQ) { toast.error("Pick a quotation first"); return; }
    try {
      const r = await docx.mutateAsync(selectedQ);
      setTestOutput({ kind: "Word", text: `Success.\nstorage_path: ${r.storage_path}\nsize: ${r.file_size_bytes} bytes\nsigned_url: ${r.signed_url}` });
      toast.success("Word generated");
    } catch (e) {
      const detail = await extractEdgeError(e);
      setTestOutput({ kind: "Word (FAILED)", text: detail });
      toast.error("Word generation failed", { description: detail, duration: 10000 });
    }
  };

  const runScopeTest = async () => {
    try {
      const r = await scope.mutateAsync({
        works_type: "new_install",
        system: { category: "L1", manufacturer: "Gent", panel: "Vigilon", loop_count: 1 },
        building: { type: "hotel", occupancy: "sleeping", features: { kitchens: true, plant_rooms: true } },
      });
      setTestOutput({ kind: "AI Scope", text: `Introduction:\n${r.introduction}\n\nScope:\n${r.scope.map((s,i)=>`${i+1}. ${s}`).join("\n")}` });
      toast.success("Scope generated");
    } catch (e) {
      const detail = await extractEdgeError(e);
      setTestOutput({ kind: "AI Scope (FAILED)", text: detail });
      toast.error("AI scope failed", { description: detail, duration: 10000 });
    }
  };

  const runPdfTest = async () => {
    if (!selectedQ) { toast.error("Pick a quotation first"); return; }
    try {
      const d = await docx.mutateAsync(selectedQ);
      const r = await pdf.mutateAsync({ docx_storage_path: d.storage_path, quotation_id: selectedQ.id });
      setTestOutput({ kind: "PDF", text: `Success.\npdf_storage_path: ${r.pdf_storage_path}\nsize: ${r.file_size_bytes} bytes\nsigned_url: ${r.signed_url}` });
      toast.success("PDF generated");
    } catch (e) {
      const detail = await extractEdgeError(e);
      setTestOutput({ kind: "PDF (FAILED)", text: detail });
      toast.error("PDF generation failed", { description: detail, duration: 10000 });
    }
  };

  if (authLoading || isAdmin === null) {
    return <DashboardLayout><div className="p-8 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div></DashboardLayout>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const secretFixSteps = (name: string, valueHint: string) => (
    <div className="mt-2 rounded bg-muted/50 p-3 text-sm space-y-1">
      <p className="font-medium">How to fix</p>
      <ol className="list-decimal pl-5 space-y-1">
        <li>Open <span className="font-mono text-xs">Backend → Edge Functions → Manage secrets</span></li>
        <li>Click <span className="font-medium">New secret</span></li>
        <li>Name: <span className="font-mono text-xs">{name}</span></li>
        <li>Value: <span className="text-muted-foreground">{valueHint}</span></li>
        <li>Save, then click <span className="font-medium">Run diagnostics</span> again</li>
      </ol>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Settings className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold">Quote Settings</h1>
            <p className="text-sm text-muted-foreground">Manage logo, secrets, and test the quote generation pipeline.</p>
          </div>
        </div>

        {/* Section 1 — Logo */}
        <Card>
          <CardHeader>
            <CardTitle>Brand logo</CardTitle>
            <CardDescription>Stored at <span className="font-mono text-xs">quote-assets/bho-logo.jpg</span>. Used by the Word/PDF generator header.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {logoExists === false && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>No logo uploaded</AlertTitle>
                <AlertDescription>The Word generator will fail until you upload a logo here.</AlertDescription>
              </Alert>
            )}
            <div className="flex items-start gap-4">
              {logoExists && logoUrl ? (
                <div className="border rounded p-2 bg-white">
                  <img src={logoUrl} alt="Current logo" className="h-24 w-auto object-contain" />
                </div>
              ) : (
                <div className="border rounded h-24 w-32 flex items-center justify-center text-xs text-muted-foreground">No logo</div>
              )}
              <label className="flex-1 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/40 transition">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  className="hidden"
                  onChange={(e) => onLogoUpload(e.target.files?.[0])}
                  disabled={logoBusy}
                />
                <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm">{logoBusy ? "Uploading…" : "Click to upload PNG / JPG / SVG (max 5MB)"}</p>
                <p className="text-xs text-muted-foreground mt-1">File will be saved as bho-logo.jpg (overwrites existing)</p>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Section 1b — Master quote template */}
        <Card>
          <CardHeader>
            <CardTitle>Master quote template</CardTitle>
            <CardDescription>
              Stored at <span className="font-mono text-xs">quote-assets/master-template.docx</span>.
              The Word generator loads this on every render and replaces placeholder markers
              (<span className="font-mono text-xs">[Copilot: …]</span>, <span className="font-mono text-xs">[Line item]</span>, etc.)
              with quote-specific content. All static sections (Exclusions, Assumptions, Payment Terms,
              Standards &amp; Accreditations) come verbatim from this file.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {templateExists === false && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>No master template uploaded</AlertTitle>
                <AlertDescription>The Word generator will fail until you upload <span className="font-mono">BHO_Quote_Template_Verdana.docx</span> here.</AlertDescription>
              </Alert>
            )}
            <div className="flex items-start gap-4">
              {templateExists ? (
                <div className="border rounded p-3 bg-muted/30 min-w-[160px] space-y-2">
                  <div>
                    <FileText className="w-8 h-8 text-muted-foreground mb-2" />
                    <p className="text-xs font-medium">master-template.docx</p>
                    {templateSize != null && (
                      <p className="text-[10px] text-muted-foreground">{(templateSize / 1024).toFixed(1)} KB</p>
                    )}
                    {templateModified && (
                      <p className="text-[10px] text-muted-foreground">Updated {new Date(templateModified).toLocaleString("en-GB")}</p>
                    )}
                  </div>
                  {/* Download — needed so the user can grab the
                      current template, edit in Word, and re-upload.
                      Storage.download respects bucket RLS so it
                      works for admins (the same role gate the upload
                      uses). */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-7 text-xs gap-1.5"
                    onClick={async () => {
                      try {
                        const { data, error } = await supabase.storage
                          .from(LOGO_BUCKET).download(TEMPLATE_PATH);
                        if (error || !data) throw new Error(error?.message || "Empty response");
                        const url = URL.createObjectURL(data);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = TEMPLATE_PATH;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        setTimeout(() => URL.revokeObjectURL(url), 0);
                      } catch (e) {
                        toast.error("Couldn't download template", {
                          description: e instanceof Error ? e.message : String(e),
                        });
                      }
                    }}
                  >
                    <Download className="w-3 h-3" />
                    Download
                  </Button>
                </div>
              ) : (
                <div className="border rounded h-24 w-40 flex items-center justify-center text-xs text-muted-foreground">No template</div>
              )}
              <label className="flex-1 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/40 transition">
                <input
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => onTemplateUpload(e.target.files?.[0])}
                  disabled={templateBusy}
                />
                <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm">{templateBusy ? "Uploading…" : "Click to upload .docx (max 10MB)"}</p>
                <p className="text-xs text-muted-foreground mt-1">File will be saved as master-template.docx (overwrites existing)</p>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Section 2 — Secrets */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Edge Function secrets</CardTitle>
              <CardDescription>We can't read secret values, but we can probe each function and infer what's missing.</CardDescription>
            </div>
            <Button onClick={runDiagnostics} disabled={diagBusy} variant="outline" size="sm" className="gap-1">
              {diagBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Run diagnostics
            </Button>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b">
                <tr><th className="py-2">Secret</th><th>Required for</th><th className="text-right">Status</th></tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="py-3 font-mono text-xs align-top">ANTHROPIC_API_KEY</td>
                  <td className="align-top">AI scope writer</td>
                  <td className="text-right align-top"><StatusPill s={anthropic} /></td>
                </tr>
                {anthropic === "missing" && (
                  <tr><td colSpan={3} className="pb-3">
                    <button className="flex items-center gap-1 text-xs text-primary" onClick={() => setOpenFix((o) => ({ ...o, ant: !o.ant }))}>
                      {openFix.ant ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />} How to fix
                    </button>
                    {openFix.ant && secretFixSteps("ANTHROPIC_API_KEY", "your sk-ant-… key from console.anthropic.com → API Keys")}
                  </td></tr>
                )}
                {(["GRAPH_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_SECRET", "GRAPH_CONVERSION_USER"] as const).map((name) => (
                  <tr key={name}>
                    <td className="py-3 font-mono text-xs align-top">{name}</td>
                    <td className="align-top">PDF conversion</td>
                    <td className="text-right align-top"><StatusPill s={graph} /></td>
                  </tr>
                ))}
                {graph === "missing" && (
                  <tr><td colSpan={3} className="pb-3">
                    <button className="flex items-center gap-1 text-xs text-primary" onClick={() => setOpenFix((o) => ({ ...o, graph: !o.graph }))}>
                      {openFix.graph ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />} How to fix
                    </button>
                    {openFix.graph && (
                      <div className="mt-2 rounded bg-muted/50 p-3 text-sm space-y-2">
                        <p className="font-medium">Add all 4 Microsoft Graph secrets</p>
                        <ol className="list-decimal pl-5 space-y-1">
                          <li>In Azure → App registrations, create or pick an app with <span className="font-mono text-xs">Files.ReadWrite.All</span> + <span className="font-mono text-xs">Sites.ReadWrite.All</span> (application).</li>
                          <li>Open <span className="font-mono text-xs">Backend → Edge Functions → Manage secrets</span> and add:
                            <ul className="list-disc pl-5 mt-1 space-y-0.5 font-mono text-xs">
                              <li>GRAPH_TENANT_ID — your Azure tenant ID</li>
                              <li>GRAPH_CLIENT_ID — the app registration's client ID</li>
                              <li>GRAPH_CLIENT_SECRET — a client secret value</li>
                              <li>GRAPH_CONVERSION_USER — the user UPN whose OneDrive will host the conversion (e.g. quotes@yourdomain.co.uk)</li>
                            </ul>
                          </li>
                          <li>Re-run diagnostics.</li>
                        </ol>
                      </div>
                    )}
                  </td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Section 3 — Pipeline test */}
        <Card>
          <CardHeader>
            <CardTitle>Test the pipeline</CardTitle>
            <CardDescription>End-to-end tests against the real Edge Functions. Full error messages are surfaced below.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Quotation:</span>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger className="w-[360px]"><SelectValue placeholder="Pick a quotation" /></SelectTrigger>
                <SelectContent>
                  {quotations.map((q) => (
                    <SelectItem key={q.id} value={q.id}>{q.quotation_number} — {q.title ?? "Untitled"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-1" onClick={runDocxTest} disabled={docx.isPending || !selectedQ}>
                {docx.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Test Word generation
              </Button>
              <Button variant="outline" size="sm" className="gap-1" onClick={runScopeTest} disabled={scope.isPending}>
                {scope.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Test AI scope writer
              </Button>
              <Button variant="outline" size="sm" className="gap-1" onClick={runPdfTest} disabled={pdf.isPending || docx.isPending || !selectedQ}>
                {(pdf.isPending || docx.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileType className="w-4 h-4" />} Test PDF conversion
              </Button>
            </div>
            {testOutput && (
              <div className="rounded border bg-muted/30 p-3">
                <p className="text-xs font-medium mb-1">{testOutput.kind} result</p>
                <pre className="text-xs whitespace-pre-wrap break-all">{testOutput.text}</pre>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
