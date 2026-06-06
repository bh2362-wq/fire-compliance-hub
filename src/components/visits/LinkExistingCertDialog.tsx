import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, isValid } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { FileSignature, Link2, AlertTriangle, FileText, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Visit } from "@/hooks/useVisits";
import { cn } from "@/lib/utils";

// Picker for linking an EXISTING report or certificate to this visit.
//
// Was scoped to smart_form_submissions only — so BAFE-cert-style entries
// could be picked but BS5839 service_reports and ce_audibility_reports
// were invisible. The user couldn't close out a "No report" visit by
// pointing at a report that already existed.
//
// Now queries all three tables in parallel, merges and sorts the
// results, and dispatches the visit_id update to the right table on
// save.

interface Props {
  visit: Visit | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked?: () => void;
}

type SourceTable =
  | "smart_form_submissions"
  | "service_reports"
  | "ce_audibility_reports";

interface CandidateRow {
  source: SourceTable;
  id: string;
  // Display fields
  kind_label: string;        // e.g. "BS5839 inspection cert"
  reference: string;         // certificate / report number
  // Linkage / sorting
  visit_id: string | null;   // null = unlinked; populated = already on a visit
  date: string | null;       // completed_at | created_at — for sort + display
  job_number: string | null;
}

const SOURCE_META: Record<SourceTable, { icon: typeof FileSignature; toneIcon: string; label: string }> = {
  smart_form_submissions: { icon: FileSignature, toneIcon: "text-secondary", label: "Certificate" },
  service_reports:        { icon: FileText,      toneIcon: "text-primary",   label: "Service report" },
  ce_audibility_reports:  { icon: Volume2,       toneIcon: "text-warning",   label: "C&E / Audibility" },
};

function formatFormType(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export function LinkExistingCertDialog({ visit, open, onOpenChange, onLinked }: Props) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [closeVisit, setCloseVisit] = useState(true);
  const [saving, setSaving] = useState(false);

  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["link-report-candidates", visit?.site_id],
    enabled: !!visit?.site_id && open,
    queryFn: async (): Promise<CandidateRow[]> => {
      // Three sources, queried in parallel. Each returns the columns we
      // need to render a unified picker row.
      const siteId = visit!.site_id;
      const [sfsQ, srQ, ceQ] = await Promise.all([
        supabase
          .from("smart_form_submissions")
          .select("id, form_type, certificate_reference, completed_at, job_number, visit_id")
          .eq("site_id", siteId)
          .eq("status", "completed")
          .order("completed_at", { ascending: false })
          .limit(50),
        supabase
          .from("service_reports")
          .select("id, report_number, status, visit_id, created_at")
          .eq("site_id", siteId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("ce_audibility_reports")
          .select("id, report_number, status, visit_id, created_at")
          .eq("site_id", siteId)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      const rows: CandidateRow[] = [];

      for (const r of (sfsQ.data ?? []) as any[]) {
        rows.push({
          source: "smart_form_submissions",
          id: r.id,
          kind_label: formatFormType(r.form_type ?? "Certificate"),
          reference: r.certificate_reference ?? "(no ref)",
          visit_id: r.visit_id ?? null,
          date: r.completed_at ?? null,
          job_number: r.job_number ?? null,
        });
      }
      for (const r of (srQ.data ?? []) as any[]) {
        rows.push({
          source: "service_reports",
          id: r.id,
          kind_label: "Service report",
          reference: r.report_number ?? "(no number)",
          visit_id: r.visit_id ?? null,
          date: r.created_at ?? null,
          job_number: null,
        });
      }
      for (const r of (ceQ.data ?? []) as any[]) {
        rows.push({
          source: "ce_audibility_reports",
          id: r.id,
          kind_label: "C&E / Audibility test",
          reference: r.report_number ?? "(no number)",
          visit_id: r.visit_id ?? null,
          date: r.created_at ?? null,
          job_number: null,
        });
      }

      // Sort newest first by date.
      rows.sort((a, b) => {
        const ad = a.date ? Date.parse(a.date) : 0;
        const bd = b.date ? Date.parse(b.date) : 0;
        return bd - ad;
      });
      return rows;
    },
  });

  const selected = candidates.find((c) => c.id === selectedId) ?? null;

  const handleLink = async () => {
    if (!visit || !selected) return;
    setSaving(true);
    try {
      // Update the right table based on which source the user picked.
      // smart_form_submissions also gets a job_number copy across for
      // traceability (matching the previous behaviour). service_reports
      // and ce_audibility_reports have visit_id NOT NULL in schema, so
      // we're re-pointing to this visit if they were on another one.
      const updatePayload: Record<string, unknown> = { visit_id: visit.id };
      if (selected.source === "smart_form_submissions") {
        updatePayload.job_number = (visit as any).job_number ?? null;
      }

      const { error: linkErr } = await supabase
        .from(selected.source)
        .update(updatePayload)
        .eq("id", selected.id);
      if (linkErr) throw linkErr;

      if (closeVisit) {
        const { error: visitErr } = await supabase
          .from("service_visits")
          .update({ status: "completed" })
          .eq("id", visit.id);
        if (visitErr) throw visitErr;
      }

      toast.success(closeVisit ? "Report linked and visit closed" : "Report linked to visit");
      await queryClient.invalidateQueries({ queryKey: ["visits"] });
      await queryClient.invalidateQueries({ queryKey: ["cert-tracker-v3"] });
      onLinked?.();
      onOpenChange(false);
      setSelectedId(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to link report");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5" /> Link Existing Report
          </DialogTitle>
          <DialogDescription>
            Pick a completed report or certificate already on file for{" "}
            {visit?.site?.name || "this site"} to attach to this visit.
            Includes BAFE-style certificates, service reports, and C&amp;E /
            audibility tests.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
          {isLoading ? (
            <>
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </>
          ) : candidates.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground border rounded-lg bg-muted/20">
              <FileSignature className="w-8 h-8 mx-auto mb-2 opacity-40" />
              No existing reports or certificates found for this site.
            </div>
          ) : (
            candidates.map((c) => {
              const date = c.date && isValid(parseISO(c.date))
                ? format(parseISO(c.date), "dd MMM yyyy") : "—";
              const isSelected = selectedId === c.id;
              const alreadyLinked = c.visit_id && c.visit_id !== visit?.id;
              const meta = SOURCE_META[c.source];
              const Icon = meta.icon;
              return (
                <button
                  type="button"
                  key={`${c.source}-${c.id}`}
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg border transition-colors flex items-start gap-3",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/40",
                  )}
                >
                  <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <Icon className={cn("w-4 h-4", meta.toneIcon)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{c.kind_label}</span>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {c.reference}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {meta.label}
                      </Badge>
                      {alreadyLinked && (
                        <Badge variant="secondary" className="text-[10px] flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Already linked to another visit
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {date}
                      {c.job_number && <> · Job {c.job_number}</>}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-2 pt-2 border-t">
          <Checkbox
            id="close-visit"
            checked={closeVisit}
            onCheckedChange={(v) => setCloseVisit(v === true)}
          />
          <label htmlFor="close-visit" className="text-sm cursor-pointer select-none">
            Mark visit as completed after linking
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleLink} disabled={!selectedId || saving}>
            {saving ? "Linking..." : closeVisit ? "Link & Close Visit" : "Link Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
