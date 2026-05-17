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
import { FileSignature, Link2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Visit } from "@/hooks/useVisits";
import { cn } from "@/lib/utils";

interface Props {
  visit: Visit | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked?: () => void;
}

interface CertRow {
  id: string;
  form_type: string;
  certificate_reference: string;
  completed_at: string | null;
  job_number: string | null;
  visit_id: string | null;
}

export function LinkExistingCertDialog({ visit, open, onOpenChange, onLinked }: Props) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [closeVisit, setCloseVisit] = useState(true);
  const [saving, setSaving] = useState(false);

  const { data: certs = [], isLoading } = useQuery({
    queryKey: ["link-cert-candidates", visit?.site_id],
    enabled: !!visit?.site_id && open,
    queryFn: async (): Promise<CertRow[]> => {
      const { data, error } = await supabase
        .from("smart_form_submissions")
        .select("id, form_type, certificate_reference, completed_at, job_number, visit_id")
        .eq("site_id", visit!.site_id)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as CertRow[];
    },
  });

  const handleLink = async () => {
    if (!visit || !selectedId) return;
    setSaving(true);
    try {
      // Link cert to this visit (and copy job_number for traceability)
      const { error: linkErr } = await supabase
        .from("smart_form_submissions")
        .update({
          visit_id: visit.id,
          job_number: (visit as any).job_number ?? null,
        })
        .eq("id", selectedId);
      if (linkErr) throw linkErr;

      if (closeVisit) {
        const { error: visitErr } = await supabase
          .from("visits")
          .update({ status: "completed" })
          .eq("id", visit.id);
        if (visitErr) throw visitErr;
      }

      toast.success(closeVisit ? "Certificate linked and visit closed" : "Certificate linked to visit");
      await queryClient.invalidateQueries({ queryKey: ["visits"] });
      await queryClient.invalidateQueries({ queryKey: ["cert-tracker-v3"] });
      onLinked?.();
      onOpenChange(false);
      setSelectedId(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to link certificate");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5" /> Link Existing Certificate
          </DialogTitle>
          <DialogDescription>
            Pick a completed certificate already issued for {visit?.site?.name || "this site"} to attach to this visit.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
          {isLoading ? (
            <>
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </>
          ) : certs.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground border rounded-lg bg-muted/20">
              <FileSignature className="w-8 h-8 mx-auto mb-2 opacity-40" />
              No completed certificates found for this site.
            </div>
          ) : (
            certs.map((c) => {
              const date = c.completed_at && isValid(parseISO(c.completed_at))
                ? format(parseISO(c.completed_at), "dd MMM yyyy") : "—";
              const isSelected = selectedId === c.id;
              const alreadyLinked = c.visit_id && c.visit_id !== visit?.id;
              return (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg border transition-colors",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/40"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{c.form_type.replace(/_/g, " ")}</span>
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {c.certificate_reference}
                        </Badge>
                        {alreadyLinked && (
                          <Badge variant="secondary" className="text-[10px] flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Already linked to another visit
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Completed {date}
                        {c.job_number && <> · Job {c.job_number}</>}
                      </p>
                    </div>
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
            {saving ? "Linking..." : closeVisit ? "Link & Close Visit" : "Link Certificate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
