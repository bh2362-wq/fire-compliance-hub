import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Calendar, Building2, Eye, GitCompare, FileText, ClipboardCheck, Trash2, Loader2, Pencil } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Visit } from "@/hooks/useVisits";
import { CreateInvoiceDialog } from "@/components/xero/CreateInvoiceDialog";
import { ServiceReportDialog } from "@/components/reports/ServiceReportDialog";
import { WorkReportDialog } from "@/components/reports/WorkReportDialog";
import { ASDReportDialog } from "@/components/reports/ASDReportDialog";
import { ReportTypeSelector } from "@/components/reports/ReportTypeSelector";
import { SmokeSprayEstimate } from "./SmokeSprayEstimate";
import VisitEditDialog from "./VisitEditDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ASDAsset {
  id: string;
  item_name: string;
  manufacturer?: string | null;
  model?: string | null;
  location?: string | null;
}

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
  const { toast } = useToast();
  const [invoiceVisit, setInvoiceVisit] = useState<Visit | null>(null);
  const [reportVisit, setReportVisit] = useState<Visit | null>(null);
  const [showReportTypeSelector, setShowReportTypeSelector] = useState(false);
  const [reportType, setReportType] = useState<"bs5839" | "work" | "asd" | null>(null);
  const [selectedAsdAsset, setSelectedAsdAsset] = useState<ASDAsset | null>(null);
  const [editVisit, setEditVisit] = useState<Visit | null>(null);
  const [deleteVisit, setDeleteVisit] = useState<Visit | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteVisit = async () => {
    if (!deleteVisit) return;
    
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("visits")
        .delete()
        .eq("id", deleteVisit.id);

      if (error) throw error;

      toast({
        title: "Visit deleted",
        description: "The visit has been successfully deleted.",
      });
      
      setDeleteVisit(null);
      onRefresh?.();
    } catch (error) {
      console.error("Error deleting visit:", error);
      toast({
        title: "Error",
        description: "Failed to delete visit. It may have linked records.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

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
        <div className="col-span-1">Coverage</div>
        <div className="col-span-2">Smoke Spray</div>
        <div className="col-span-2">Actions</div>
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
              <div className="col-span-1">
                <div className="space-y-2">
                  <div className="flex items-center gap-1">
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
                    <span className="text-xs font-medium text-foreground w-8">
                      {coverage}%
                    </span>
                  </div>
                </div>
              </div>
              <div className="col-span-2">
                <SmokeSprayEstimate siteId={visit.site_id} visitType={visit.visit_type} />
              </div>
              <div className="col-span-2 flex items-center gap-2 flex-wrap">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/dashboard/sites/${visit.site_id}`)}
                >
                  <Eye className="w-4 h-4 mr-1" />
                  Site
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setReportVisit(visit);
                    setShowReportTypeSelector(true);
                  }}
                >
                  <ClipboardCheck className="w-4 h-4 mr-1" />
                  Report
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setInvoiceVisit(visit)}
                >
                  <FileText className="w-4 h-4 mr-1" />
                  Invoice
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditVisit(visit)}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleteVisit(visit)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
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

      <ReportTypeSelector
        open={showReportTypeSelector}
        onOpenChange={setShowReportTypeSelector}
        onSelect={(type, asdAsset) => {
          setReportType(type);
          if (asdAsset) {
            setSelectedAsdAsset(asdAsset);
          }
        }}
        siteId={reportVisit?.site_id}
      />

      {reportVisit && reportType === "work" && (
        <WorkReportDialog
          open={!!reportVisit && reportType === "work"}
          onOpenChange={(open) => {
            if (!open) {
              setReportVisit(null);
              setReportType(null);
            }
          }}
          visit={{ ...reportVisit, sites: reportVisit.site }}
          onSuccess={onRefresh}
        />
      )}

      {reportVisit && reportType === "bs5839" && (
        <ServiceReportDialog
          open={!!reportVisit && reportType === "bs5839"}
          onOpenChange={(open) => {
            if (!open) {
              setReportVisit(null);
              setReportType(null);
            }
          }}
          visit={{ ...reportVisit, sites: reportVisit.site }}
          onSuccess={onRefresh}
        />
      )}

      {reportVisit && reportType === "asd" && selectedAsdAsset && (
        <ASDReportDialog
          open={!!reportVisit && reportType === "asd"}
          onOpenChange={(open) => {
            if (!open) {
              setReportVisit(null);
              setReportType(null);
              setSelectedAsdAsset(null);
            }
          }}
          visit={{ ...reportVisit, sites: reportVisit.site }}
          asset={selectedAsdAsset}
          onSuccess={onRefresh}
        />
      )}

      {editVisit && (
        <VisitEditDialog
          visit={editVisit}
          open={!!editVisit}
          onOpenChange={(open) => !open && setEditVisit(null)}
          onSuccess={onRefresh}
        />
      )}

      <AlertDialog open={!!deleteVisit} onOpenChange={(open) => !open && setDeleteVisit(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Visit</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this visit for{" "}
              <span className="font-medium">{deleteVisit?.site?.name}</span> on{" "}
              <span className="font-medium">
                {deleteVisit?.visit_date && format(new Date(deleteVisit.visit_date), "MMM d, yyyy")}
              </span>
              ?
              <br />
              <span className="text-destructive font-medium mt-2 block">
                This action cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteVisit}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Visit"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default VisitsTable;
