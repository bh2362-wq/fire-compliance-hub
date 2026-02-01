import { useState, useEffect } from "react";
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
import { ReportPreviewDialog } from "@/components/reports/ReportPreviewDialog";
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

interface InvoiceInfo {
  xero_invoice_number: string | null;
  status: string | null;
}

interface ReportInfo {
  report_number: string | null;
}

interface VisitsTableProps {
  visits: Visit[];
  loading: boolean;
  onRefresh?: () => void;
  initialEditVisitId?: string;
  onInitialVisitOpened?: () => void;
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
  invoiced: {
    label: "Invoiced",
    className: "bg-primary/10 text-primary border-primary/20",
  },
};

const VisitsTable = ({ visits, loading, onRefresh, initialEditVisitId, onInitialVisitOpened }: VisitsTableProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [invoiceVisit, setInvoiceVisit] = useState<Visit | null>(null);
  const [reportVisit, setReportVisit] = useState<Visit | null>(null);
  const [previewVisit, setPreviewVisit] = useState<Visit | null>(null);
  const [showReportTypeSelector, setShowReportTypeSelector] = useState(false);
  const [reportType, setReportType] = useState<"bs5839" | "work" | "asd" | null>(null);
  const [selectedAsdAssets, setSelectedAsdAssets] = useState<ASDAsset[]>([]);
  const [editVisit, setEditVisit] = useState<Visit | null>(null);
  const [deleteVisit, setDeleteVisit] = useState<Visit | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [initialVisitHandled, setInitialVisitHandled] = useState(false);
  const [invoiceMap, setInvoiceMap] = useState<Record<string, InvoiceInfo>>({});
  const [reportMap, setReportMap] = useState<Record<string, ReportInfo>>({});

  // Fetch invoice status and report numbers for all visits
  useEffect(() => {
    const fetchVisitInfo = async () => {
      if (visits.length === 0) return;
      
      const visitIds = visits.map(v => v.id);
      
      // Fetch invoices and reports in parallel
      const [invoicesResult, reportsResult] = await Promise.all([
        supabase
          .from("xero_invoices")
          .select("visit_id, xero_invoice_number, status")
          .in("visit_id", visitIds),
        supabase
          .from("service_reports")
          .select("visit_id, report_number")
          .in("visit_id", visitIds)
      ]);

      if (invoicesResult.data) {
        const map: Record<string, InvoiceInfo> = {};
        invoicesResult.data.forEach((inv) => {
          map[inv.visit_id] = {
            xero_invoice_number: inv.xero_invoice_number,
            status: inv.status,
          };
        });
        setInvoiceMap(map);
      }

      if (reportsResult.data) {
        const map: Record<string, ReportInfo> = {};
        reportsResult.data.forEach((rep) => {
          // Only set if report_number exists (avoid overwriting with null)
          if (rep.report_number) {
            map[rep.visit_id] = {
              report_number: rep.report_number,
            };
          }
        });
        setReportMap(map);
      }
    };

    fetchVisitInfo();
  }, [visits]);

  // Auto-open edit dialog for initial visit ID from URL
  useEffect(() => {
    if (initialEditVisitId && !initialVisitHandled && visits.length > 0) {
      const visitToEdit = visits.find(v => v.id === initialEditVisitId);
      if (visitToEdit) {
        setEditVisit(visitToEdit);
        setInitialVisitHandled(true);
        onInitialVisitOpened?.();
      }
    }
  }, [initialEditVisitId, visits, initialVisitHandled, onInitialVisitOpened]);

  const handleDeleteVisit = async () => {
    if (!deleteVisit) return;
    
    setDeleting(true);
    try {
      // Check if visit has linked invoice
      const hasInvoice = !!invoiceMap[deleteVisit.id];
      if (hasInvoice) {
        toast({
          title: "Cannot delete visit",
          description: "This visit has a linked invoice. Delete or void the invoice in Xero first.",
          variant: "destructive",
        });
        setDeleteVisit(null);
        setDeleting(false);
        return;
      }

      // Check for linked service reports and delete them first
      const { error: reportError } = await supabase
        .from("service_reports")
        .delete()
        .eq("visit_id", deleteVisit.id);

      if (reportError) {
        console.error("Error deleting linked reports:", reportError);
      }

      const { error } = await supabase
        .from("visits")
        .delete()
        .eq("id", deleteVisit.id);

      if (error) {
        // Check for foreign key constraint error
        if (error.code === "23503") {
          toast({
            title: "Cannot delete visit",
            description: "This visit has linked records (invoice or reports). Remove them first.",
            variant: "destructive",
          });
        } else {
          throw error;
        }
      } else {
        toast({
          title: "Visit deleted",
          description: "The visit has been successfully deleted.",
        });
        onRefresh?.();
      }
      
      setDeleteVisit(null);
    } catch (error) {
      console.error("Error deleting visit:", error);
      toast({
        title: "Error",
        description: "Failed to delete visit. Please try again.",
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

  // Empty state is handled after invoice filtering below

  // Separate invoiced and non-invoiced visits
  const invoicedVisits = visits.filter(v => !!invoiceMap[v.id]);
  const activeVisits = visits.filter(v => !invoiceMap[v.id]);

  // Helper to render a visit row
  const renderVisitRow = (visit: Visit, isInvoiced: boolean = false) => {
    const invoiceInfo = invoiceMap[visit.id];
    const reportInfo = reportMap[visit.id];
    const displayStatus = isInvoiced 
      ? statusConfig.invoiced 
      : statusConfig[visit.status || "in_progress"] || statusConfig.in_progress;
    
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
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{visit.visit_type}</span>
                {reportInfo?.report_number && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-muted/50">
                    {reportInfo.report_number}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="col-span-2">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-sm text-foreground">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              {format(new Date(visit.visit_date), "MMM d, yyyy")}
            </div>
            <Badge variant="outline" className={displayStatus.className}>
              {isInvoiced && invoiceInfo?.xero_invoice_number 
                ? `#${invoiceInfo.xero_invoice_number}` 
                : displayStatus.label}
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
          {!isInvoiced && (
            <>
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
                onClick={() => setPreviewVisit(visit)}
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
            </>
          )}
        </div>
      </div>
    );
  };

  if (activeVisits.length === 0 && invoicedVisits.length === 0) {
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
    <div className="space-y-6">
      {/* Active Visits */}
      {activeVisits.length > 0 && (
        <div className="bg-card rounded-xl border border-border">
          <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-muted/50 text-sm font-medium text-muted-foreground border-b border-border">
            <div className="col-span-3">Site</div>
            <div className="col-span-2">Date / Type</div>
            <div className="col-span-2">Devices</div>
            <div className="col-span-1">Coverage</div>
            <div className="col-span-2">Smoke Spray</div>
            <div className="col-span-2">Actions</div>
          </div>
          <div className="divide-y divide-border">
            {activeVisits.map((visit) => renderVisitRow(visit, false))}
          </div>
        </div>
      )}

      {activeVisits.length === 0 && invoicedVisits.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <Calendar className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No active visits</h3>
          <p className="text-muted-foreground">
            All visits have been invoiced. Create a new visit to get started.
          </p>
        </div>
      )}

      {/* Recently Invoiced Section */}
      {invoicedVisits.length > 0 && (
        <div className="bg-card rounded-xl border border-border">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Recently Invoiced
            </h3>
            <p className="text-sm text-muted-foreground">Visits that have been invoiced</p>
          </div>
          <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-muted/50 text-sm font-medium text-muted-foreground border-b border-border">
            <div className="col-span-3">Site</div>
            <div className="col-span-2">Date / Invoice</div>
            <div className="col-span-2">Devices</div>
            <div className="col-span-1">Coverage</div>
            <div className="col-span-2">Smoke Spray</div>
            <div className="col-span-2">Actions</div>
          </div>
          <div className="divide-y divide-border">
            {invoicedVisits.slice(0, 5).map((visit) => renderVisitRow(visit, true))}
          </div>
          {invoicedVisits.length > 5 && (
            <div className="px-6 py-3 text-center border-t border-border">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate("/dashboard/invoices")}
              >
                View all {invoicedVisits.length} invoiced visits
              </Button>
            </div>
          )}
        </div>
      )}

      {invoiceVisit && (
        <CreateInvoiceDialog
          open={!!invoiceVisit}
          onOpenChange={(open) => !open && setInvoiceVisit(null)}
          visit={{ ...invoiceVisit, sites: invoiceVisit.site }}
          onSuccess={onRefresh}
        />
      )}

      {previewVisit && (
        <ReportPreviewDialog
          open={!!previewVisit}
          onOpenChange={(open) => !open && setPreviewVisit(null)}
          visit={previewVisit}
          onEdit={() => {
            setReportVisit(previewVisit);
            setPreviewVisit(null);
            if (previewVisit.visit_type === "remedial" || previewVisit.visit_type === "emergency") {
              setReportType("work");
            } else {
              setShowReportTypeSelector(true);
            }
          }}
        />
      )}

      <ReportTypeSelector
        open={showReportTypeSelector}
        onOpenChange={setShowReportTypeSelector}
        onSelect={(type, asdAssets) => {
          setReportType(type);
          if (asdAssets && asdAssets.length > 0) {
            setSelectedAsdAssets(asdAssets);
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

      {reportVisit && reportType === "asd" && selectedAsdAssets.length > 0 && (
        <ASDReportDialog
          open={!!reportVisit && reportType === "asd"}
          onOpenChange={(open) => {
            if (!open) {
              setReportVisit(null);
              setReportType(null);
              setSelectedAsdAssets([]);
            }
          }}
          visit={{ ...reportVisit, sites: reportVisit.site }}
          assets={selectedAsdAssets}
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
