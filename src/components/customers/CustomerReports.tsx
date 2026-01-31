import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardCheck, Calendar, MapPin, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, isValid } from "date-fns";

interface ServiceReport {
  id: string;
  report_date: string;
  status: string;
  report_number: string | null;
  system_type: string | null;
  site_id: string;
  visit_id: string;
  site?: {
    name: string;
  };
}

interface CustomerReportsProps {
  customerId: string;
  siteIds: string[];
}

export function CustomerReports({ customerId, siteIds }: CustomerReportsProps) {
  const [reports, setReports] = useState<ServiceReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadReports = async () => {
      if (siteIds.length === 0) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("service_reports")
          .select(`
            id,
            report_date,
            status,
            report_number,
            system_type,
            site_id,
            visit_id,
            site:sites(name)
          `)
          .in("site_id", siteIds)
          .eq("status", "completed")
          .order("report_date", { ascending: false })
          .limit(20);

        if (error) throw error;
        
        // Transform the data to match our interface
        const transformedData = (data || []).map((report: any) => ({
          ...report,
          site: report.site ? { name: report.site.name } : undefined,
        }));
        
        setReports(transformedData);
      } catch (err) {
        console.error("Error loading reports:", err);
      } finally {
        setLoading(false);
      }
    };

    loadReports();
  }, [siteIds]);

  const formatDate = (dateStr: string): string => {
    try {
      const date = parseISO(dateStr);
      return isValid(date) ? format(date, "dd MMM yyyy") : "N/A";
    } catch {
      return "N/A";
    }
  };

  const getReportTypeLabel = (systemType: string | null): string => {
    if (!systemType) return "Service Report";
    if (systemType.toLowerCase().includes("asd")) return "ASD Report";
    if (systemType.toLowerCase().includes("work")) return "Work Report";
    return "BS 5839-1 Report";
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4" />
            Completed Reports
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4" />
          Completed Reports
        </CardTitle>
      </CardHeader>
      <CardContent>
        {reports.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">No completed reports yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {reports.map((report) => (
              <div
                key={report.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {report.report_number || "Report"}
                    </span>
                    <Badge variant="secondary">
                      {getReportTypeLabel(report.system_type)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(report.report_date)}
                    </span>
                    {report.site?.name && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {report.site.name}
                      </span>
                    )}
                  </div>
                </div>
                <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                  Completed
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
