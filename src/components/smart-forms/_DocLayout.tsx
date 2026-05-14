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
import { ChevronDown, FileDown, Save, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";

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
