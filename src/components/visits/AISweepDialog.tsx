import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Package, Wrench, Cpu, HelpCircle, MapPin, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface AISweepDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SweepResult {
  visitId: string;
  siteName: string;
  visitDate: string;
  visitType: string;
  requirements: { category: string; item_name: string; quantity: number }[];
  aiSuggestions: string[];
}

const CATEGORY_ICONS: Record<string, typeof Package> = {
  materials: Package,
  tools: Wrench,
  equipment: Cpu,
  other: HelpCircle,
};

export function AISweepDialog({ open, onOpenChange }: AISweepDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SweepResult[] | null>(null);
  const [aiSummary, setAiSummary] = useState<string>("");

  const handleSweep = async () => {
    setLoading(true);
    setResults(null);
    setAiSummary("");

    try {
      // Fetch all open visits with their requirements and site info
      const { data: visits, error: visitError } = await supabase
        .from("visits")
        .select("id, visit_date, visit_type, status, notes, site:sites(id, name)")
        .in("status", ["scheduled", "in_progress", "pending_review"])
        .order("visit_date", { ascending: true });

      if (visitError) throw visitError;
      if (!visits || visits.length === 0) {
        toast({ title: "No open visits", description: "There are no open visits to analyze." });
        setLoading(false);
        return;
      }

      const visitIds = visits.map((v: any) => v.id);
      const { data: allReqs } = await supabase
        .from("visit_requirements")
        .select("visit_id, category, item_name, quantity")
        .in("visit_id", visitIds);

      // Group requirements by visit
      const reqsByVisit: Record<string, any[]> = {};
      (allReqs || []).forEach((r: any) => {
        if (!reqsByVisit[r.visit_id]) reqsByVisit[r.visit_id] = [];
        reqsByVisit[r.visit_id].push(r);
      });

      const sweepData: SweepResult[] = visits.map((v: any) => ({
        visitId: v.id,
        siteName: v.site?.name || "Unknown Site",
        visitDate: v.visit_date,
        visitType: v.visit_type || "",
        requirements: reqsByVisit[v.id] || [],
        aiSuggestions: [],
      }));

      setResults(sweepData);

      // Call AI for analysis
      const visitsPayload = sweepData.map((s) => ({
        site: s.siteName,
        date: s.visitDate,
        type: s.visitType,
        tagged_items: s.requirements.map((r) => `${r.quantity}x ${r.item_name} (${r.category})`),
      }));

      const { data: aiData, error: aiError } = await supabase.functions.invoke(
        "ai-sweep-visits",
        { body: { visits: visitsPayload } }
      );

      if (aiError) {
        console.error("AI sweep error:", aiError);
        toast({ title: "AI analysis unavailable", description: "Showing tagged items only.", variant: "destructive" });
      } else if (aiData?.summary) {
        setAiSummary(aiData.summary);
      }
    } catch (err) {
      console.error("Sweep error:", err);
      toast({ title: "Error", description: "Failed to run sweep", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            AI Job Requirements Sweep
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Analyze all open visits and compile a complete list of required materials, tools and equipment.
          </p>
        </DialogHeader>

        {!results && (
          <div className="flex flex-col items-center py-8 gap-4">
            <Sparkles className="w-12 h-12 text-primary/30" />
            <p className="text-muted-foreground text-center">
              Run an AI-powered sweep across all open visits to compile a comprehensive requirements report.
            </p>
            <Button onClick={handleSweep} disabled={loading} variant="hero">
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Run AI Sweep
                </>
              )}
            </Button>
          </div>
        )}

        {results && (
          <div className="space-y-4">
            {/* AI Summary */}
            {aiSummary && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                <p className="text-sm font-medium text-primary mb-1 flex items-center gap-1">
                  <Sparkles className="w-4 h-4" /> AI Summary
                </p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{aiSummary}</p>
              </div>
            )}

            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Running AI analysis...
              </div>
            )}

            {/* Per-visit breakdown */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">
                Open Visits ({results.length})
              </p>
              {results.map((r) => (
                <div key={r.visitId} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground">{r.siteName}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(r.visitDate), "MMM d, yyyy")}
                      <Badge variant="outline" className="text-[10px]">{r.visitType}</Badge>
                    </div>
                  </div>
                  {r.requirements.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {r.requirements.map((req, i) => {
                        const Icon = CATEGORY_ICONS[req.category] || HelpCircle;
                        return (
                          <Badge key={i} variant="outline" className="text-xs">
                            <Icon className="w-3 h-3 mr-1" />
                            {req.quantity > 1 ? `${req.quantity}x ` : ""}{req.item_name}
                          </Badge>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No requirements tagged</p>
                  )}
                </div>
              ))}
            </div>

            <Button onClick={handleSweep} disabled={loading} variant="outline" className="w-full">
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Re-run Sweep
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
