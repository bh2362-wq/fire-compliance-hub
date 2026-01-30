import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList, Calendar, MapPin, ArrowRight, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface OpenVisit {
  id: string;
  visit_date: string;
  visit_type: string;
  status: string;
  site_id: string;
  sites?: {
    name: string;
  } | null;
}

interface OpenVisitsCardProps {
  siteId?: string;
  customerId?: string;
  onVisitClick?: (visitId: string) => void;
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
};

export function OpenVisitsCard({ siteId, customerId, onVisitClick }: OpenVisitsCardProps) {
  const navigate = useNavigate();
  const [visits, setVisits] = useState<OpenVisit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOpenVisits();
  }, [siteId, customerId]);

  const loadOpenVisits = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("visits")
        .select("id, visit_date, visit_type, status, site_id, sites(name)")
        .in("status", ["in_progress", "scheduled", "pending"])
        .order("visit_date", { ascending: true });

      if (siteId) {
        query = query.eq("site_id", siteId);
      } else if (customerId) {
        // Get all sites for this customer, then filter visits
        const { data: sites } = await supabase
          .from("sites")
          .select("id")
          .eq("customer_id", customerId);

        if (sites && sites.length > 0) {
          const siteIds = sites.map((s) => s.id);
          query = query.in("site_id", siteIds);
        } else {
          setVisits([]);
          setLoading(false);
          return;
        }
      }

      const { data, error } = await query;

      if (error) throw error;
      setVisits((data as OpenVisit[]) || []);
    } catch (error) {
      console.error("Failed to load open visits:", error);
      setVisits([]);
    } finally {
      setLoading(false);
    }
  };

  const handleVisitClick = (visit: OpenVisit) => {
    if (onVisitClick) {
      onVisitClick(visit.id);
    } else {
      navigate("/dashboard/visits");
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="w-4 h-4" />
            Open Visits
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (visits.length === 0) {
    return null; // Don't show card if no open visits
  }

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600" />
          <span className="text-amber-800">Open Visits</span>
          <Badge variant="secondary" className="ml-auto bg-amber-100 text-amber-800">
            {visits.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {visits.map((visit) => (
            <div
              key={visit.id}
              onClick={() => handleVisitClick(visit)}
              className="flex items-center justify-between p-3 rounded-lg bg-white border border-amber-200 hover:border-amber-300 hover:bg-amber-50 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                  <ClipboardList className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">
                      {visitTypeLabels[visit.visit_type] || visit.visit_type}
                    </p>
                    <Badge
                      variant="outline"
                      className={
                        visit.status === "in_progress"
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : visit.status === "scheduled"
                          ? "bg-purple-50 text-purple-700 border-purple-200"
                          : "bg-gray-50 text-gray-700 border-gray-200"
                      }
                    >
                      {visit.status === "in_progress" ? "In Progress" : visit.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(visit.visit_date), "dd MMM yyyy")}
                    </span>
                    {visit.sites?.name && !siteId && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {visit.sites.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </div>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-3 text-amber-700 hover:text-amber-800 hover:bg-amber-100"
          onClick={() => navigate("/dashboard/visits")}
        >
          View All Visits
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  );
}
