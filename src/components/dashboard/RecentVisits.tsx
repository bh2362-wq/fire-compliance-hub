import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, User, ChevronRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface RecentVisit {
  id: string;
  site_name: string;
  visit_date: string;
  engineer_name: string | null;
  status: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-muted/50 text-muted-foreground border-muted" },
  confirmed: { label: "Confirmed", className: "bg-primary/10 text-primary border-primary/20" },
  in_progress: { label: "In Progress", className: "bg-warning/10 text-warning border-warning/20" },
  completed: { label: "Completed", className: "bg-success/10 text-success border-success/20" },
  cancelled: { label: "Cancelled", className: "bg-destructive/10 text-destructive border-destructive/20" },
  invoiced: { label: "Invoiced", className: "bg-accent/10 text-accent border-accent/20" },
};

const RecentVisits = () => {
  const navigate = useNavigate();
  const [visits, setVisits] = useState<RecentVisit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecentVisits = async () => {
      try {
        const { data, error } = await supabase
          .from("visits")
          .select(`
            id,
            visit_date,
            status,
            sites (name),
            profiles:engineer_id (full_name)
          `)
          .order("visit_date", { ascending: false })
          .limit(5);

        if (error) throw error;

        const formattedVisits: RecentVisit[] = (data || []).map((visit: any) => ({
          id: visit.id,
          site_name: visit.sites?.name || "Unknown Site",
          visit_date: visit.visit_date,
          engineer_name: visit.profiles?.full_name || null,
          status: visit.status || "scheduled",
        }));

        setVisits(formattedVisits);
      } catch (err) {
        console.error("Error fetching recent visits:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchRecentVisits();
  }, []);

  const getStatusConfig = (status: string) => {
    return statusConfig[status] || { label: status, className: "bg-muted text-muted-foreground" };
  };

  if (loading) {
    return (
      <div className="bg-card rounded-xl border border-border">
        <div className="p-6 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">Recent Visits</h3>
          <p className="text-sm text-muted-foreground">Latest service visits across all sites</p>
        </div>
        <div className="p-8 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border">
      <div className="p-6 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Recent Visits</h3>
          <p className="text-sm text-muted-foreground">Latest service visits across all sites</p>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          className="text-accent"
          onClick={() => navigate("/dashboard/visits")}
        >
          View All
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
      
      {visits.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">
          <p>No visits yet</p>
          <p className="text-sm mt-1">Create your first visit to see it here</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {visits.map((visit) => {
            const status = getStatusConfig(visit.status);
            return (
              <div 
                key={visit.id} 
                className="p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => navigate("/dashboard/visits")}
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-foreground">{visit.site_name}</h4>
                  <Badge variant="outline" className={status.className}>
                    {status.label}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    <span>{new Date(visit.visit_date).toLocaleDateString('en-GB', { 
                      day: 'numeric', 
                      month: 'short' 
                    })}</span>
                  </div>
                  {visit.engineer_name && (
                    <div className="flex items-center gap-1.5">
                      <User className="w-4 h-4" />
                      <span>{visit.engineer_name}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RecentVisits;
