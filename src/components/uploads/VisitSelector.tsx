import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar, Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import VisitFormDialog from "@/components/visits/VisitFormDialog";

interface Visit {
  id: string;
  visit_date: string;
  visit_type: string;
  status: string | null;
}

interface VisitSelectorProps {
  siteId: string;
  siteName?: string;
  value: string;
  onValueChange: (visitId: string) => void;
  disabled?: boolean;
}

const VisitSelector = ({
  siteId,
  siteName,
  value,
  onValueChange,
  disabled = false,
}: VisitSelectorProps) => {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVisits = async () => {
    if (!siteId || siteId === "none") {
      setVisits([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("visits")
      .select("id, visit_date, visit_type, status")
      .eq("site_id", siteId)
      .order("visit_date", { ascending: false })
      .limit(20);

    if (!error && data) {
      setVisits(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchVisits();
    // Reset visit selection when site changes
    onValueChange("");
  }, [siteId]);

  const handleVisitCreated = (visitId: string) => {
    fetchVisits();
    onValueChange(visitId);
  };

  if (!siteId || siteId === "none") {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 h-10 px-3 border border-border rounded-md bg-muted/30">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading visits...</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground flex items-center gap-2">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        Link to Visit
      </label>
      <div className="flex gap-2">
        <Select value={value} onValueChange={onValueChange} disabled={disabled}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Select a visit (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No visit (unlinked)</SelectItem>
            {visits.length === 0 ? (
              <SelectItem value="empty" disabled>
                No visits available
              </SelectItem>
            ) : (
              visits.map((visit) => (
                <SelectItem key={visit.id} value={visit.id}>
                  {format(new Date(visit.visit_date), "MMM d, yyyy")} - {visit.visit_type}
                  {visit.status === "in_progress" && " (In Progress)"}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <VisitFormDialog
          siteId={siteId}
          siteName={siteName}
          onVisitCreated={handleVisitCreated}
          trigger={
            <Button variant="outline" size="icon" disabled={disabled}>
              <Plus className="w-4 h-4" />
            </Button>
          }
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Link uploads to a visit for tracking and reconciliation
      </p>
    </div>
  );
};

export default VisitSelector;
