import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar, Loader2, Sparkles, ClipboardList } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { RamsHazard, MethodStatement } from "@/services/ramsService";

interface OpenVisit {
  id: string;
  visit_date: string;
  visit_type: string;
  status: string;
  notes: string | null;
}

const visitTypeLabels: Record<string, string> = {
  quarterly: "Quarterly Service",
  biannual: "Biannual Service",
  annual: "Annual Service",
  emergency: "Emergency",
  remedial: "Remedial",
  installation: "Installation",
  commissioning: "Commissioning",
  supply_only: "Supply Only",
  room_integrity: "Room Integrity Test",
  gas_suppression: "Gas Suppression Service",
  subcontract: "Subcontract",
};

export interface AIRamsResult {
  title: string;
  hazards: RamsHazard[];
  method_statements: MethodStatement[];
  ppe_requirements: string[];
  emergency_procedures: string;
  site_specific_hazards: string;
  selectedVisitIds: string[];
}

interface RamsJobSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string;
  siteName: string;
  siteAddress?: string;
  onGenerated: (result: AIRamsResult) => void;
}

export function RamsJobSelectorDialog({
  open,
  onOpenChange,
  siteId,
  siteName,
  siteAddress,
  onGenerated,
}: RamsJobSelectorDialogProps) {
  const [visits, setVisits] = useState<OpenVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (open) {
      loadVisits();
      setSelectedIds(new Set());
    }
  }, [open, siteId]);

  const loadVisits = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("service_visits")
        .select("id, visit_date, visit_type, status, notes")
        .eq("site_id", siteId)
        .in("status", ["in_progress", "scheduled", "pending"])
        .order("visit_date", { ascending: true });

      if (error) throw error;
      setVisits(data || []);
    } catch (err) {
      console.error("Failed to load visits:", err);
      setVisits([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleVisit = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === visits.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visits.map((v) => v.id)));
    }
  };

  const handleGenerate = async () => {
    if (selectedIds.size === 0) {
      toast.error("Please select at least one job");
      return;
    }

    setGenerating(true);
    try {
      const selectedVisits = visits.filter((v) => selectedIds.has(v.id));
      const jobs = selectedVisits.map((v) => ({
        visit_type: visitTypeLabels[v.visit_type] || v.visit_type,
        notes: v.notes,
        visit_date: v.visit_date,
      }));

      const { data, error } = await supabase.functions.invoke("generate-rams-ai", {
        body: { jobs, siteName, siteAddress },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Ensure hazard IDs exist
      const hazards = (data.hazards || []).map((h: any) => ({
        ...h,
        id: h.id || crypto.randomUUID(),
      }));

      onGenerated({
        title: data.title || `RAMS - ${siteName}`,
        hazards,
        method_statements: data.method_statements || [],
        ppe_requirements: data.ppe_requirements || [],
        emergency_procedures: data.emergency_procedures || "",
        site_specific_hazards: data.site_specific_hazards || "",
        selectedVisitIds: Array.from(selectedIds),
      });

      toast.success("RAMS generated successfully — review and save");
      onOpenChange(false);
    } catch (err: any) {
      console.error("RAMS generation failed:", err);
      toast.error(err.message || "Failed to generate RAMS");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={generating ? undefined : onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Generate RAMS from Jobs
          </DialogTitle>
          <DialogDescription>
            Select the open jobs to include. AI will read the job descriptions and generate a combined risk assessment and method statement.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : visits.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No open jobs for this site.</p>
            <p className="text-xs mt-1">Create a visit first, then generate RAMS.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <button
                onClick={toggleAll}
                className="text-sm text-primary hover:underline"
              >
                {selectedIds.size === visits.length ? "Deselect All" : "Select All"}
              </button>
              <span className="text-xs text-muted-foreground">
                {selectedIds.size} of {visits.length} selected
              </span>
            </div>

            <ScrollArea className="max-h-[40vh]">
              <div className="space-y-2 pr-2">
                {visits.map((visit) => (
                  <label
                    key={visit.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedIds.has(visit.id)
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <Checkbox
                      checked={selectedIds.has(visit.id)}
                      onCheckedChange={() => toggleVisit(visit.id)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-foreground">
                          {visitTypeLabels[visit.visit_type] || visit.visit_type}
                        </span>
                        <Badge
                          variant="outline"
                          className={
                            visit.status === "in_progress"
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : "bg-purple-50 text-purple-700 border-purple-200"
                          }
                        >
                          {visit.status === "in_progress" ? "In Progress" : visit.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(visit.visit_date), "dd MMM yyyy")}
                      </div>
                      {visit.notes && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {visit.notes}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </ScrollArea>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={generating}
              >
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={selectedIds.size === 0 || generating}
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating RAMS...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate RAMS ({selectedIds.size} jobs)
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
