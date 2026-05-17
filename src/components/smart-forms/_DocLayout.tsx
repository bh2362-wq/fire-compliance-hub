/**
 * Shared single-page document-style primitives for all smart forms.
 * Mirrors the BS5839CertificateForm layout (sticky header / scrollable
 * document body / sticky footer with section blocks, side-by-side fields,
 * compact YES/NO/N/A status cells and an AI summary collapsible).
 */

import React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, FileDown, Save, Sparkles, AlertCircle, CheckCircle2, Eye } from "lucide-react";

/* ─── Section block ────────────────────────────────────────────── */

export function DocBlock({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-border rounded-md overflow-hidden">
      <div className="bg-[#3c3c3c] text-white text-[11px] font-bold uppercase tracking-wider px-4 py-2 flex items-center justify-between">
        <span>{title}</span>
        {actions}
      </div>
      <div className="p-4 space-y-2">{children}</div>
    </div>
  );
}

/* ─── Compact label/input row ─────────────────────────────────── */

export function DocField({
  label,
  value,
  onChange,
  type = "text",
  multiline = false,
  placeholder,
  rows = 2,
}: {
  label: string;
  value: any;
  onChange: (v: string) => void;
  type?: string;
  multiline?: boolean;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-y-2 items-start text-xs">
      <label className="text-muted-foreground pt-2">{label}</label>
      {multiline ? (
        <Textarea
          rows={rows}
          value={value || ""}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="text-xs"
        />
      ) : (
        <Input
          type={type}
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-xs"
        />
      )}
    </div>
  );
}

/* ─── Stacked compact field for grids ─────────────────────────── */

export function SmallField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: any;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <Input
        type={type}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-xs"
      />
    </div>
  );
}

/* ─── YES / NO / N/A status pill cell ─────────────────────────── */

export function StatusCell({
  active,
  color,
  label,
  onClick,
}: {
  active: boolean;
  color: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <td className="px-2 py-2 text-center align-top">
      <button
        type="button"
        onClick={onClick}
        className={`w-9 h-7 rounded border text-[10px] font-bold transition-colors ${
          active
            ? "text-white border-transparent"
            : "bg-white border-border text-muted-foreground hover:bg-muted/40"
        }`}
        style={active ? { backgroundColor: color } : undefined}
      >
        {label}
      </button>
    </td>
  );
}

/* ─── Tri-state row used by table-style checklists ─────────────── */

export type TriStatus = "YES" | "NO" | "N/A" | "";

export function TriStateRow({
  number,
  label,
  status,
  onStatus,
  comment,
  onComment,
  invert = false,
}: {
  number?: string;
  label: string;
  status: TriStatus;
  onStatus: (s: TriStatus) => void;
  comment?: string;
  onComment?: (v: string) => void;
  invert?: boolean;
}) {
  const isYes = status === "YES";
  const isNo = status === "NO";
  const isNA = status === "N/A";
  const showComment = invert ? isYes : isNo;
  return (
    <>
      <tr
        className={`border-t border-border ${
          (isNo && !invert) || (isYes && invert) ? "bg-red-50/40" : ""
        }`}
      >
        <td className="px-3 py-2 align-top">
          <div className="flex items-start gap-2">
            {number && (
              <span className="font-mono text-[10px] text-muted-foreground pt-0.5 w-12 shrink-0">
                {number}
              </span>
            )}
            <span className="text-xs leading-snug">{label}</span>
          </div>
        </td>
        <StatusCell active={isYes} color="#2e7d32" label="YES" onClick={() => onStatus("YES")} />
        <StatusCell active={isNo} color="#c62828" label="NO" onClick={() => onStatus("NO")} />
        <StatusCell active={isNA} color="#546e7a" label="N/A" onClick={() => onStatus("N/A")} />
      </tr>
      {showComment && onComment && (
        <tr className="bg-red-50/30 border-t border-red-100">
          <td colSpan={4} className="px-3 py-2">
            <Textarea
              rows={2}
              placeholder="Comment required…"
              value={comment || ""}
              onChange={(e) => onComment(e.target.value)}
              className="text-xs"
            />
          </td>
        </tr>
      )}
    </>
  );
}

/* ─── Pass / Fail / N/A legend ────────────────────────────────── */

export function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
      <span>{label}</span>
    </span>
  );
}

/* ─── Sticky header / footer wrappers ─────────────────────────── */

export function StickyHeader({
  title,
  reference,
  status,
  onSaveDraft,
  onComplete,
  saving,
  meta,
}: {
  title: string;
  reference?: string | null;
  status?: "valid" | "warn" | "issues" | null;
  onSaveDraft: () => void;
  onComplete: () => void;
  saving?: boolean;
  meta?: React.ReactNode;
}) {
  return (
    <div className="px-5 py-3 border-b shrink-0 bg-white flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-base font-semibold">{title}</h2>
        {reference && (
          <span className="font-mono text-xs text-muted-foreground">{reference}</span>
        )}
        {status === "valid" && (
          <Badge className="bg-green-600/15 text-green-700 border-green-600/30 gap-1 text-[10px]">
            <CheckCircle2 className="h-3 w-3" />
            Valid
          </Badge>
        )}
        {status === "issues" && (
          <Badge variant="destructive" className="gap-1 text-[10px]">
            <AlertCircle className="h-3 w-3" />
            Issues
          </Badge>
        )}
        {meta}
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={onSaveDraft} disabled={saving}>
          <Save className="h-3.5 w-3.5 mr-1" />
          Save Draft
        </Button>
        <Button size="sm" onClick={onComplete} disabled={saving}>
          <FileDown className="h-3.5 w-3.5 mr-1" />
          Complete &amp; PDF
        </Button>
      </div>
    </div>
  );
}

export function StickyFooter({
  companyName = "BHO Fire Ltd",
  standardLabel,
  onClose,
  onComplete,
  saving,
}: {
  companyName?: string;
  standardLabel?: string;
  onClose: () => void;
  onComplete: () => void;
  saving?: boolean;
}) {
  return (
    <div className="border-t shrink-0 px-5 py-3 bg-white flex items-center justify-between gap-3">
      <p className="text-[11px] text-muted-foreground">
        {companyName}
        {standardLabel ? ` · ${standardLabel}` : ""}
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onClose}>
          Close
        </Button>
        <Button size="sm" onClick={onComplete} disabled={saving}>
          <FileDown className="h-3.5 w-3.5 mr-1" />
          Complete &amp; Download PDF
        </Button>
      </div>
    </div>
  );
}

/* ─── Standard dialog shell ───────────────────────────────────── */

export function DocDialogShell({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[95vh] flex flex-col p-0 gap-0 bg-[#fafaf7]">
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function DocBody({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto p-5 md:p-6 space-y-5">{children}</div>
    </div>
  );
}

/* ─── Title block with ref + date ─────────────────────────────── */

export function TitleBlock({
  title,
  subtitle,
  reference,
  date,
  onDateChange,
  accent = "hsl(25 92% 54%)",
}: {
  title: string;
  subtitle?: string;
  reference?: string | null;
  date?: string;
  onDateChange?: (v: string) => void;
  accent?: string;
}) {
  return (
    <div className="bg-white border border-border rounded-md p-5 flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="text-sm font-semibold mt-1" style={{ color: accent }}>
            {subtitle}
          </p>
        )}
      </div>
      <div className="text-right text-xs space-y-1">
        <div>
          <span className="text-muted-foreground">Ref:</span>{" "}
          <span className="font-mono">{reference || "(auto)"}</span>
        </div>
        {onDateChange && (
          <div>
            <span className="text-muted-foreground">Date:</span>{" "}
            <input
              type="date"
              className="border-0 bg-transparent text-right p-0 font-mono text-xs focus:outline-none focus:ring-0"
              value={date || ""}
              onChange={(e) => onDateChange(e.target.value)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── AI summary collapsible ──────────────────────────────────── */

export function AISummarySection({
  open,
  onOpenChange,
  children,
  label = "Generate plain-English client email summary (AI)",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div className="bg-white border border-border rounded-md overflow-hidden">
        <CollapsibleTrigger asChild>
          <button className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">{label}</span>
            </div>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-4 border-t border-border">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

/* ─── Self-contained Site Prefill block (lazy) ─────────────────── */

export function SitePrefillBlock({
  formType,
  siteId,
  onSiteSelected,
  onPrefillApplied,
}: {
  formType: string;
  siteId?: string | null;
  onSiteSelected?: (siteId: string) => void;
  onPrefillApplied: (fields: Record<string, unknown>, batteryAgeHint?: any) => void;
}) {
  const SitePrefillPanelLazy = React.useMemo(
    () => React.lazy(() => import("./SitePrefillPanel").then((m) => ({ default: m.SitePrefillPanel }))),
    []
  );
  return (
    <React.Suspense fallback={<p className="text-xs text-muted-foreground px-1">Loading site prefill…</p>}>
      <SitePrefillPanelLazy
        formType={formType}
        siteId={siteId}
        onSiteSelected={onSiteSelected}
        onPrefillApplied={onPrefillApplied}
      />
    </React.Suspense>
  );
}

/* ─── Self-contained Photo Analysis block (lazy, collapsible) ───── */

export function PhotoAnalysisBlock({
  submissionId,
  context,
  existingDefects,
  onAddDefects,
  label = "Photo analysis (AI fault detection)",
  defaultOpen = false,
}: {
  submissionId?: string | null;
  context?: string;
  existingDefects?: any[];
  onAddDefects: (defects: any[]) => void;
  label?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const PhotoAnalysisPanelLazy = React.useMemo(
    () => React.lazy(() => import("./PhotoAnalysisPanel").then((m) => ({ default: m.PhotoAnalysisPanel }))),
    []
  );
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="bg-white border border-border rounded-md overflow-hidden">
        <CollapsibleTrigger asChild>
          <button className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">{label}</span>
            </div>
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-4 border-t border-border">
            <React.Suspense fallback={<p className="text-xs text-muted-foreground">Loading…</p>}>
              <PhotoAnalysisPanelLazy
                submissionId={submissionId}
                context={context}
                existingDefects={existingDefects}
                onAddDefects={onAddDefects}
              />
            </React.Suspense>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

/* ─── Self-contained AI summary block (manages its own open state) ─ */

export function AIAssistBlock({
  payload,
  formLabel,
  extraInstruction,
  defaultOpen = false,
}: {
  payload: Record<string, any>;
  formLabel: string;
  extraInstruction?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  // Lazy-import to avoid circular reference at module load
  const ClientSummaryPanelLazy = React.useMemo(
    () => React.lazy(() => import("./ClientSummaryPanel").then((m) => ({ default: m.ClientSummaryPanel }))),
    []
  );
  return (
    <AISummarySection open={open} onOpenChange={setOpen}>
      <React.Suspense fallback={<p className="text-xs text-muted-foreground">Loading…</p>}>
        <ClientSummaryPanelLazy payload={payload} formLabel={formLabel} extraInstruction={extraInstruction} />
      </React.Suspense>
    </AISummarySection>
  );
}

/* ─── Document mockup preview block ────────────────────────────── */

/**
 * Lightweight HTML mockup of how the finished certificate/document will be
 * laid out. NOT the real PDF — it just renders the current `payload` as a
 * stylised A4 page so users can sanity-check structure & data before
 * filling out & completing.
 */

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  return "";
}

function MockupSection({
  number,
  title,
  rows,
}: {
  number: string;
  title: string;
  rows: Array<[string, string]>;
}) {
  if (!rows.length) return null;
  return (
    <div className="mb-3">
      <div className="bg-[#3c3c3c] text-white text-[9px] font-bold uppercase tracking-wider px-2 py-1">
        {number}   {title}
      </div>
      <table className="w-full text-[9px] border border-border border-t-0">
        <tbody>
          {rows.map(([k, v], i) => (
            <tr key={i} className={i % 2 ? "bg-muted/30" : "bg-white"}>
              <td className="px-2 py-1 font-semibold text-muted-foreground w-1/3 align-top border-r border-border">
                {k}
              </td>
              <td className="px-2 py-1 align-top">{v || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MockupArrayTable({
  number,
  title,
  rows,
}: {
  number: string;
  title: string;
  rows: any[];
}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return (
      <div className="mb-3">
        <div className="bg-[#3c3c3c] text-white text-[9px] font-bold uppercase tracking-wider px-2 py-1">
          {number}   {title}  (0)
        </div>
        <div className="border border-t-0 border-border bg-white px-2 py-2 text-[9px] text-muted-foreground">
          No entries.
        </div>
      </div>
    );
  }
  const cols = Array.from(
    rows.reduce<Set<string>>((acc, r) => {
      if (r && typeof r === "object") Object.keys(r).forEach((k) => acc.add(k));
      return acc;
    }, new Set())
  ).slice(0, 6);
  return (
    <div className="mb-3">
      <div className="bg-[#3c3c3c] text-white text-[9px] font-bold uppercase tracking-wider px-2 py-1">
        {number}   {title}  ({rows.length})
      </div>
      <div className="overflow-x-auto border border-t-0 border-border bg-white">
        <table className="w-full text-[9px]">
          <thead>
            <tr className="bg-muted/50">
              {cols.map((c) => (
                <th key={c} className="px-2 py-1 text-left font-semibold border-b border-border">
                  {c.replace(/_/g, " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 8).map((r, i) => (
              <tr key={i} className={i % 2 ? "bg-muted/20" : ""}>
                {cols.map((c) => (
                  <td key={c} className="px-2 py-1 align-top border-b border-border">
                    {formatValue(r?.[c])}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length > 8 && (
              <tr>
                <td colSpan={cols.length} className="px-2 py-1 italic text-muted-foreground">
                  …{rows.length - 8} more rows
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PdfPreviewBlock({
  payload,
  title,
  subtitle,
  reference,
  label = "Document mockup preview",
  defaultOpen = false,
}: {
  payload: Record<string, any>;
  title?: string;
  subtitle?: string;
  reference?: string | null;
  label?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  // Group payload keys into sections: scalars vs arrays of objects.
  const { scalarGroups, arrays } = React.useMemo(() => {
    const scalars: Array<[string, string]> = [];
    const arr: Array<[string, any[]]> = [];
    const skip = new Set([
      "id", "submission_id", "user_id", "site_id", "visit_id",
      "created_at", "updated_at",
    ]);
    Object.entries(payload || {}).forEach(([k, v]) => {
      if (skip.has(k)) return;
      if (Array.isArray(v)) {
        if (v.length && typeof v[0] === "object") arr.push([k, v]);
        else scalars.push([k.replace(/_/g, " "), v.join(", ")]);
      } else if (v && typeof v === "object") {
        // flatten one level
        Object.entries(v as Record<string, any>).forEach(([sk, sv]) => {
          if (typeof sv !== "object")
            scalars.push([`${k}.${sk}`.replace(/_/g, " "), formatValue(sv)]);
        });
      } else {
        scalars.push([k.replace(/_/g, " "), formatValue(v)]);
      }
    });
    // chunk scalars into groups of ~10 for visual sectioning
    const groups: Array<Array<[string, string]>> = [];
    for (let i = 0; i < scalars.length; i += 10) groups.push(scalars.slice(i, i + 10));
    return { scalarGroups: groups, arrays: arr };
  }, [payload]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="bg-white border border-border rounded-md overflow-hidden">
        <CollapsibleTrigger asChild>
          <button className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">{label}</span>
              <span className="text-[10px] text-muted-foreground">
                (layout mockup — not the real PDF)
              </span>
            </div>
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border bg-muted/30 p-4">
            {/* A4-ish stage */}
            <div className="mx-auto bg-white shadow-sm border border-border max-w-[640px] p-6">
              {/* Mock header */}
              <div className="flex items-start justify-between border-b-2 pb-2 mb-3" style={{ borderColor: "hsl(25 92% 54%)" }}>
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-7 rounded-sm flex items-center justify-center text-white text-[8px] font-bold"
                    style={{ backgroundColor: "hsl(25 92% 54%)" }}
                  >
                    LOGO
                  </div>
                  <div className="text-[8px] leading-tight text-muted-foreground">
                    BHO Fire Ltd<br />Standard company header
                  </div>
                </div>
                <div className="text-right text-[8px] text-muted-foreground">
                  Page 1 of N<br />Ref: <span className="font-mono">{reference || "(auto)"}</span>
                </div>
              </div>

              <h1 className="text-base font-bold tracking-tight">{title || "Document"}</h1>
              {subtitle && (
                <p className="text-[10px] font-semibold mb-3" style={{ color: "hsl(25 92% 54%)" }}>
                  {subtitle}
                </p>
              )}

              {scalarGroups.map((g, i) => (
                <MockupSection
                  key={`s${i}`}
                  number={String(i + 1).padStart(2, "0")}
                  title={i === 0 ? "Details" : `Details (cont.)`}
                  rows={g}
                />
              ))}
              {arrays.map(([k, v], i) => (
                <MockupArrayTable
                  key={`a${i}`}
                  number={String(scalarGroups.length + i + 1).padStart(2, "0")}
                  title={k.replace(/_/g, " ")}
                  rows={v}
                />
              ))}

              <div className="mt-4 pt-2 border-t text-[8px] text-center text-muted-foreground">
                Standard company footer · generated on completion
              </div>
            </div>
            <p className="text-[10px] text-center text-muted-foreground mt-3">
              This is a structural mockup. The final downloaded PDF uses the branded template.
            </p>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

