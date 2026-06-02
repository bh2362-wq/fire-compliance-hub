/**
 * ReportDetailDrawer
 * Slide-in panel that opens when a report row is tapped on the Reports
 * page. Shows the report's defects, key summary excerpts, and the
 * common actions (View PDF, Email, Generate Quote from Defects, Edit)
 * in one place — closes the "click a report, no side menu" gap.
 */

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText, AlertOctagon, AlertTriangle, Info, Mail, Pencil,
  CheckCircle2, Loader2, ExternalLink, Building2, Calendar,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface ReportSummary {
  id: string;
  site_id: string | null;
  visit_id: string | null;
  report_number: string | null;
  report_date: string | null;
  status: string | null;
  /** Free-text fields the engineer filled on the report. We show short
      excerpts so the drawer reads like a glance — not the full editor. */
  defects_found?: string | null;
  recommendations?: string | null;
  work_carried_out?: string | null;
  site?: { name?: string | null; customers?: { name?: string | null } | null } | null;
}

interface DrawerDefect {
  id: string;
  description: string;
  location: string | null;
  category: number;
  status: string;
  quotation: { id: string; quotation_number: string | null } | null;
}

interface Props {
  report: ReportSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Actions handed in from the parent so behaviour matches whatever
      the row buttons already do (PDF preview, email modal, quote
      flow, wizard navigation). Keeps the drawer presentation-only. */
  onViewPdf: (report: ReportSummary) => void;
  onEmail: (report: ReportSummary) => void;
  onGenerateQuote: (report: ReportSummary) => void;
  onEdit: (report: ReportSummary) => void;
  generatingQuote?: boolean;
}

function catIcon(cat: number) {
  if (cat === 1) return <AlertOctagon className="w-3.5 h-3.5 text-destructive flex-shrink-0" />;
  if (cat === 2) return <AlertTriangle className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />;
  return <Info className="w-3.5 h-3.5 text-yellow-600 flex-shrink-0" />;
}

function statusBadge(status: string) {
  if (status === "remediated") return <Badge variant="secondary" className="text-[10px]">Remediated</Badge>;
  if (status === "quoted") return <Badge variant="outline" className="text-[10px]">Quoted</Badge>;
  if (status === "accepted_risk") return <Badge variant="outline" className="text-[10px]">Accepted risk</Badge>;
  return <Badge variant="destructive" className="text-[10px]">Open</Badge>;
}

// Truncate prose to a few sentences so the drawer doesn't become a
// full editor view. The wizard remains the place to actually edit
// these fields.
function excerpt(text: string | null | undefined, max = 240): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max).trimEnd() + "…";
}

export function ReportDetailDrawer({
  report, open, onOpenChange,
  onViewPdf, onEmail, onGenerateQuote, onEdit,
  generatingQuote,
}: Props) {
  const navigate = useNavigate();
  const [defects, setDefects] = useState<DrawerDefect[]>([]);
  const [loadingDefects, setLoadingDefects] = useState(false);

  useEffect(() => {
    if (!open || !report?.id) {
      setDefects([]);
      return;
    }
    let cancelled = false;
    setLoadingDefects(true);
    (async () => {
      const { data, error } = await supabase
        .from("site_defects")
        .select("id, description, location, category, status, quotation:quotations(id, quotation_number)")
        .eq("report_id", report.id)
        .order("category", { ascending: true })
        .order("raised_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error("Drawer defect load failed:", error);
        setDefects([]);
      } else {
        setDefects((data ?? []) as unknown as DrawerDefect[]);
      }
      setLoadingDefects(false);
    })();
    return () => { cancelled = true; };
  }, [open, report?.id]);

  if (!report) return null;

  const openDefects = defects.filter((d) => d.status === "open");
  const otherDefects = defects.filter((d) => d.status !== "open");
  const siteName = report.site?.name ?? "Unknown site";
  const customerName = report.site?.customers?.name ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto p-0">
        <SheetHeader className="px-5 py-4 border-b sticky top-0 bg-background z-10">
          <SheetTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            {report.report_number || "Report"}
          </SheetTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap pt-1">
            <span className="flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {siteName}
            </span>
            {customerName && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span>{customerName}</span>
              </>
            )}
            {report.report_date && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(report.report_date), "dd MMM yyyy")}
                </span>
              </>
            )}
          </div>
        </SheetHeader>

        <div className="px-5 py-4 space-y-5">
          {/* Defects logged against this report */}
          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Defects ({defects.length})
            </h3>
            {loadingDefects ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : defects.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No defects logged against this report.
              </p>
            ) : (
              <div className="space-y-1.5">
                {[...openDefects, ...otherDefects].map((d) => (
                  <div key={d.id} className="rounded-md border bg-card p-2.5 text-xs space-y-1">
                    <div className="flex items-start gap-2">
                      {catIcon(d.category)}
                      <span className="flex-1 text-foreground">{d.description}</span>
                      {statusBadge(d.status)}
                    </div>
                    {d.location && (
                      <p className="text-muted-foreground pl-5">@ {d.location}</p>
                    )}
                    {d.quotation?.quotation_number && (
                      <button
                        type="button"
                        onClick={() => {
                          onOpenChange(false);
                          navigate("/dashboard/quotations", {
                            state: { openQuotationId: d.quotation!.id },
                          });
                        }}
                        className="text-primary hover:underline pl-5 inline-flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {d.quotation.quotation_number}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Free-text excerpts from the report itself */}
          {(report.defects_found || report.recommendations || report.work_carried_out) && (
            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Report summary
              </h3>
              {excerpt(report.defects_found) && (
                <div className="text-xs space-y-0.5">
                  <p className="font-semibold text-foreground">Defects found</p>
                  <p className="text-muted-foreground whitespace-pre-wrap">{excerpt(report.defects_found)}</p>
                </div>
              )}
              {excerpt(report.work_carried_out) && (
                <div className="text-xs space-y-0.5">
                  <p className="font-semibold text-foreground">Work carried out</p>
                  <p className="text-muted-foreground whitespace-pre-wrap">{excerpt(report.work_carried_out)}</p>
                </div>
              )}
              {excerpt(report.recommendations) && (
                <div className="text-xs space-y-0.5">
                  <p className="font-semibold text-foreground">Recommendations</p>
                  <p className="text-muted-foreground whitespace-pre-wrap">{excerpt(report.recommendations)}</p>
                </div>
              )}
            </section>
          )}
        </div>

        {/* Action bar — sticks to the bottom so the engineer can act
            without scrolling past long defect lists. */}
        <div className="sticky bottom-0 bg-background border-t px-5 py-3 grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={() => onViewPdf(report)} className="gap-1.5">
            <FileText className="w-3.5 h-3.5" /> View PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => onEmail(report)} className="gap-1.5">
            <Mail className="w-3.5 h-3.5" /> Email
          </Button>
          <Button variant="outline" size="sm" onClick={() => onEdit(report)} className="gap-1.5">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
          <Button
            size="sm"
            onClick={() => onGenerateQuote(report)}
            disabled={generatingQuote || openDefects.length === 0}
            className="gap-1.5"
            title={openDefects.length === 0 ? "No open defects to quote" : "Generate a customer quote from this report's open defects"}
          >
            {generatingQuote ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5" />
            )}
            Quote defects
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
