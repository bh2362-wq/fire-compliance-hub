import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Building2, Eye, GitCompare, FileText } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Visit } from "@/hooks/useVisits";
import { CreateInvoiceDialog } from "@/components/xero/CreateInvoiceDialog";

interface VisitsTableProps {
  visits: Visit[];
  loading: boolean;
  onRefresh?: () => void;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  completed: {
    label: "Completed",
    className: "bg-success/10 text-success border-success/20",
  },
  in_progress: {
    label: "In Progress",
    className: "bg-warning/10 text-warning border-warning/20",
  },
  pending_review: {
    label: "Pending Review",
    className: "bg-accent/10 text-accent border-accent/20",
  },
};

const VisitsTable = ({ visits, loading, onRefresh }: VisitsTableProps) => {
  const navigate = useNavigate();
  const [invoiceVisit, setInvoiceVisit] = useState<Visit | null>(null);

  if (loading) {
    return (
      <div className="bg-card rounded-xl border border-border">
        <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-muted/50 border-b border-border">
          <div className="col-span-3"><Skeleton className="h-4 w-16" /></div>
          <div className="col-span-3"><Skeleton className="h-4 w-20" /></div>
          <div className="col-span-2"><Skeleton className="h-4 w-16" /></div>
          <div className="col-span-2"><Skeleton className="h-4 w-16" /></div>
          <div className="col-span-2"><Skeleton className="h-4 w-16" /></div>
        </div>
        <div className="divide-y divide-border">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="grid grid-cols-12 gap-4 px-6 py-4">
              <div className="col-span-3"><Skeleton className="h-12 w-full" /></div>
              <div className="col-span-3"><Skeleton className="h-12 w-full" /></div>
              <div className="col-span-2"><Skeleton className="h-8 w-full" /></div>
              <div className="col-span-2"><Skeleton className="h-8 w-full" /></div>
              <div className="col-span-2"><Skeleton className="h-8 w-full" /></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (visits.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-12 text-center">
        <Calendar className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">No visits found</h3>
        <p className="text-muted-foreground">
          Select a site and create a new visit to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border">
      {/* Table header */}
      <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-muted/50 text-sm font-medium text-muted-foreground border-b border-border">
        <div className="col-span-3">Site</div>
        <div className="col-span-2">Date / Type</div>
        <div className="col-span-2">Devices</div>
        <div className="col-span-2">Coverage</div>
        <div className="col-span-3">Actions</div>
      </div>

      {/* Table body */}
      <div className="divide-y divide-border">
        {visits.map((visit) => {
          const status = statusConfig[visit.status || "in_progress"] || statusConfig.in_progress;
          const coverage = Number(visit.coverage_percentage) || 0;

          return (
            <div
              key={visit.id}
              className="grid grid-cols-12 gap-4 px-6 py-4 hover:bg-muted/30 transition-colors items-center"
            >
              <div className="col-span-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      {visit.site?.name || "Unknown Site"}
                    </p>
                    <p className="text-xs text-muted-foreground">{visit.visit_type}</p>
                  </div>
                </div>
              </div>
              <div className="col-span-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-sm text-foreground">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    {format(new Date(visit.visit_date), "MMM d, yyyy")}
                  </div>
                  <Badge variant="outline" className={status.className}>
                    {status.label}
                  </Badge>
                </div>
              </div>
              <div className="col-span-2">
                <div className="space-y-1">
                  <p className="text-sm text-foreground">
                    {visit.devices_tested || 0} / {visit.total_devices || 0} tested
                  </p>
                  {(visit.issues_count || 0) > 0 && (
                    <p className="text-xs text-destructive">{visit.issues_count} issues</p>
                  )}
                </div>
              </div>
              <div className="col-span-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          coverage >= 95
                            ? "bg-success"
                            : coverage >= 80
                            ? "bg-warning"
                            : "bg-destructive"
                        }`}
                        style={{ width: `${coverage}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-foreground w-10">
                      {coverage}%
                    </span>
                  </div>
                </div>
              </div>
              <div className="col-span-3 flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/dashboard/sites/${visit.site_id}`)}
                >
                  <Eye className="w-4 h-4 mr-1" />
                  View Site
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    navigate(`/dashboard/reconciliation?siteId=${visit.site_id}&visitId=${visit.id}`)
                  }
                >
                  <GitCompare className="w-4 h-4 mr-1" />
                  Reconcile
                </Button>
                {visit.status === "completed" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setInvoiceVisit(visit)}
                  >
                    <FileText className="w-4 h-4 mr-1" />
                    Invoice
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {invoiceVisit && (
        <CreateInvoiceDialog
          open={!!invoiceVisit}
          onOpenChange={(open) => !open && setInvoiceVisit(null)}
          visit={{ ...invoiceVisit, sites: invoiceVisit.site }}
          onSuccess={onRefresh}
        />
      )}
    </div>
  );
};

export default VisitsTable;
