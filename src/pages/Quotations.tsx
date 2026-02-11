import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
import {
  ClipboardList,
  Building2,
  Calendar,
  Search,
  Eye,
  Trash2,
  MoreVertical,
  FileCheck,
  Send,
  PoundSterling,
  Undo2,
  Mail,
  Globe,
  Upload,
  ExternalLink,
  Loader2,
  Copy,
  Plus,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { QuotationDetailDialog } from "@/components/quotations/QuotationDetailDialog";
import { AcceptQuotationDialog } from "@/components/quotations/AcceptQuotationDialog";
import { EmailQuotationDialog } from "@/components/quotations/EmailQuotationDialog";
import { NewQuotationDialog } from "@/components/quotations/NewQuotationDialog";
import { generateQuotationPDF, QuotationData, PDFColumnOptions } from "@/lib/quotationPdfGenerator";
import { getCompanySettings } from "@/services/companySettingsService";

interface QuotationWithDetails {
  id: string;
  quotation_number: string;
  report_id: string | null;
  visit_id: string | null;
  site_id: string;
  customer_id: string | null;
  status: string;
  title: string | null;
  summary: string | null;
  total_amount: number;
  valid_until: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  terms: string | null;
  vat_rate: number | null;
  sharepoint_url: string | null;
  sharepoint_folder: string | null;
  sites: { name: string; address?: string | null; city?: string | null; postcode?: string | null; customer_id?: string | null } | null;
  customers: { name: string; contact_name?: string | null; contact_email?: string | null; contact_phone?: string | null; address?: string | null; city?: string | null; postcode?: string | null } | null;
  service_reports: { report_number: string } | null;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: {
    label: "Draft",
    className: "bg-muted text-muted-foreground border-muted",
  },
  sent: {
    label: "Sent",
    className: "bg-primary/10 text-primary border-primary/20",
  },
  accepted: {
    label: "Accepted",
    className: "bg-success/10 text-success border-success/20",
  },
  declined: {
    label: "Declined",
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  expired: {
    label: "Expired",
    className: "bg-warning/10 text-warning border-warning/20",
  },
};

const Quotations = () => {
  const navigate = useNavigate();
  const [quotations, setQuotations] = useState<QuotationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedQuotation, setSelectedQuotation] = useState<QuotationWithDetails | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [quotationToDelete, setQuotationToDelete] = useState<QuotationWithDetails | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [quotationToAccept, setQuotationToAccept] = useState<QuotationWithDetails | null>(null);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [quotationToEmail, setQuotationToEmail] = useState<QuotationWithDetails | null>(null);
  const [emailPdfData, setEmailPdfData] = useState<QuotationData | null>(null);
  const [uploadingToSharePoint, setUploadingToSharePoint] = useState<string | null>(null);
  const [newQuoteOpen, setNewQuoteOpen] = useState(false);

  const fetchQuotations = async () => {
    try {
      const { data, error } = await supabase
        .from("quotations")
        .select(`
          *,
          sites:site_id(name, address, city, postcode, customer_id),
          customers:customer_id(name, contact_name, contact_email, contact_phone, address, city, postcode),
          service_reports:report_id(report_number)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setQuotations((data as any) || []);
    } catch (error) {
      console.error("Error fetching quotations:", error);
      toast.error("Failed to load quotations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotations();
  }, []);

  const handleStatusChange = async (quotationId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("quotations")
        .update({ status: newStatus })
        .eq("id", quotationId);

      if (error) throw error;
      toast.success(`Quotation marked as ${newStatus}`);
      fetchQuotations();
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Failed to update status");
    }
  };

  const handleRevokeAcceptance = async (quotationId: string) => {
    try {
      const { data: linkedVisits } = await supabase
        .from("visits")
        .select("id")
        .eq("quotation_id", quotationId);

      if (linkedVisits && linkedVisits.length > 0) {
        for (const visit of linkedVisits) {
          await supabase.from("appointments").delete().eq("visit_id", visit.id);
          await supabase.from("visits").delete().eq("id", visit.id);
        }
      }

      const { error } = await supabase
        .from("quotations")
        .update({ status: "sent", po_number: null })
        .eq("id", quotationId);

      if (error) throw error;
      toast.success("Acceptance revoked and visit removed");
      fetchQuotations();
    } catch (error) {
      console.error("Error revoking acceptance:", error);
      toast.error("Failed to revoke acceptance");
    }
  };

  const handleDelete = async () => {
    if (!quotationToDelete) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("quotations")
        .delete()
        .eq("id", quotationToDelete.id);
      if (error) throw error;
      toast.success("Quotation deleted");
      fetchQuotations();
    } catch (error) {
      console.error("Error deleting quotation:", error);
      toast.error("Failed to delete quotation");
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setQuotationToDelete(null);
    }
  };

  const buildPDFDataForQuotation = async (quotation: QuotationWithDetails): Promise<{ pdfData: QuotationData; columnOptions: PDFColumnOptions } | null> => {
    try {
      // Fetch line items
      const { data: lineItems } = await supabase
        .from("quotation_line_items")
        .select("*")
        .eq("quotation_id", quotation.id)
        .order("sort_order");

      // Fetch customer if not already loaded
      let customer = quotation.customers;
      if (!customer && quotation.sites?.customer_id) {
        const { data: custData } = await supabase
          .from("customers")
          .select("name, contact_name, contact_email, contact_phone, address, city, postcode")
          .eq("id", quotation.sites.customer_id)
          .single();
        customer = custData;
      }

      const pdfData: QuotationData = {
        quotation_number: quotation.quotation_number,
        title: quotation.title || "",
        summary: quotation.summary || "",
        total_amount: (lineItems || []).reduce((sum, item) => sum + (item.total_price || 0), 0),
        valid_until: quotation.valid_until || "",
        notes: quotation.notes || "",
        terms: quotation.terms || "",
        created_at: quotation.created_at,
        site: {
          name: quotation.sites?.name || "Unknown Site",
          address: quotation.sites?.address,
          city: quotation.sites?.city,
          postcode: quotation.sites?.postcode,
        },
        customer: customer ? {
          name: customer.name,
          contact_name: customer.contact_name || null,
          contact_email: customer.contact_email || null,
          contact_phone: customer.contact_phone || null,
          address: customer.address || null,
          city: customer.city || null,
          postcode: customer.postcode || null,
        } : null,
        line_items: (lineItems || []).map(item => ({
          description: item.description,
          regulation_reference: item.regulation_reference,
          priority: item.priority,
          item_name: item.item_name,
          parent_id: item.parent_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          labour_cost: item.labour_cost || 0,
          total_price: item.total_price,
        })),
        vat_rate: quotation.vat_rate || 20,
      };

      const columnOptions: PDFColumnOptions = {
        showItemNumber: true,
        showDescription: true,
        showRegulationRef: true,
        showPriority: false,
        showItem: true,
        showQuantity: true,
        showUnitPrice: true,
        showLabour: true,
        showTotal: true,
      };

      return { pdfData, columnOptions };
    } catch (err) {
      console.error("Error building PDF data:", err);
      return null;
    }
  };

  const handleEmailQuotation = async (quotation: QuotationWithDetails) => {
    const result = await buildPDFDataForQuotation(quotation);
    if (!result) {
      toast.error("Failed to prepare quotation for email");
      return;
    }
    setEmailPdfData(result.pdfData);
    setQuotationToEmail(quotation);
    setEmailDialogOpen(true);
  };

  const handleUploadToSharePoint = async (quotation: QuotationWithDetails) => {
    setUploadingToSharePoint(quotation.id);
    try {
      const result = await buildPDFDataForQuotation(quotation);
      if (!result) throw new Error("Failed to build PDF data");

      const companySettings = await getCompanySettings();
      const pdfBase64 = await generateQuotationPDF(result.pdfData, companySettings || undefined, true, result.columnOptions);
      if (!pdfBase64) throw new Error("Failed to generate PDF");

      // Determine folder path - try report's visit folder first
      let folderPath: string | null = null;

      if (quotation.report_id) {
        const { data: report } = await supabase
          .from("service_reports")
          .select("sharepoint_folder, report_number, visits(visit_date)")
          .eq("id", quotation.report_id)
          .single();

        if (report?.sharepoint_folder) {
          const visitDate = (report as any).visits?.visit_date;
          const reportNum = report.report_number || "DRAFT";
          const dateStr = visitDate ? format(new Date(visitDate), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
          folderPath = `${report.sharepoint_folder}/${reportNum}_${dateStr}/Quotations`;
        }
      }

      // Fallback to site-level — auto-create if missing
      if (!folderPath) {
        const { data: siteData } = await supabase
          .from("sites")
          .select("sharepoint_folder, name, address")
          .eq("id", quotation.site_id)
          .single();
        if (siteData?.sharepoint_folder) {
          folderPath = `${siteData.sharepoint_folder}/Quotations`;
        } else if (siteData && quotation.customers?.name) {
          // Auto-create SharePoint folder: Customers/{Customer}/{Site}/Quotations
          const siteLabel = [siteData.name, siteData.address].filter(Boolean).join(" ");
          const siteFolderPath = `Customers/${quotation.customers.name}/${siteLabel}`;
          const { data: spData, error: spError } = await supabase.functions.invoke("sharepoint-create-folder", {
            body: {
              folderPath: `${siteFolderPath}/Quotations`,
              entityType: "folder_only",
              entityId: quotation.site_id,
            },
          });
          if (!spError && spData?.success) {
            await supabase.from("sites").update({
              sharepoint_folder: siteFolderPath,
            }).eq("id", quotation.site_id);
            folderPath = `${siteFolderPath}/Quotations`;
          }
        }
      }

      if (!folderPath) throw new Error("Could not create SharePoint folder. Ensure the quotation has a customer and site assigned.");

      const fileName = `${quotation.quotation_number} - ${quotation.sites?.name || "Site"}.pdf`;

      const { data, error } = await supabase.functions.invoke("upload-to-sharepoint", {
        body: { folderPath, fileName, fileBase64: pdfBase64, contentType: "application/pdf" },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Save SharePoint URL to quotation
      if (data?.webUrl) {
        await supabase.from("quotations").update({
          sharepoint_folder: folderPath,
          sharepoint_url: data.webUrl,
        }).eq("id", quotation.id);
      }

      if (data?.skipped) {
        toast.success("Quotation already up to date on SharePoint");
      } else {
        toast.success(`${quotation.quotation_number} uploaded to SharePoint`);
      }
      fetchQuotations();
    } catch (err: any) {
      console.error("SharePoint upload error:", err);
      toast.error(err.message || "Failed to upload to SharePoint");
    } finally {
      setUploadingToSharePoint(null);
    }
  };

  const filteredQuotations = quotations.filter((quotation) => {
    const matchesSearch =
      quotation.quotation_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quotation.sites?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quotation.customers?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quotation.title?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "all" || quotation.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Quotations</h1>
            <p className="text-muted-foreground mt-1">
              Manage quotations generated from service reports
            </p>
          </div>
          <Button onClick={() => setNewQuoteOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Quote
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search quotations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="declined">Declined</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Quotations List */}
        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : filteredQuotations.length === 0 ? (
          <div className="text-center py-12">
            <ClipboardList className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No quotations found</h3>
            <p className="text-muted-foreground">
              {searchTerm || statusFilter !== "all"
                ? "Try adjusting your search or filters"
                : "Generate quotations from completed service reports"}
            </p>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border divide-y divide-border">
            {filteredQuotations.map((quotation) => {
              const status = statusConfig[quotation.status] || statusConfig.draft;
              const isExpired = quotation.valid_until && new Date(quotation.valid_until) < new Date();

              return (
                <div
                  key={quotation.id}
                  className="p-6 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <ClipboardList className="w-6 h-6 text-primary" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground">
                            {quotation.quotation_number}
                          </h3>
                          <Badge variant="outline" className={status.className}>
                            {isExpired && quotation.status === "sent" ? "Expired" : status.label}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium">
                          {quotation.title || quotation.sites?.name || "Untitled"}
                        </p>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Building2 className="w-4 h-4" />
                            {quotation.sites?.name || "Unknown Site"}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {format(new Date(quotation.created_at), "MMM d, yyyy")}
                          </span>
                          {quotation.service_reports?.report_number && (
                            <span>From: {quotation.service_reports.report_number}</span>
                          )}
                        </div>
                        {quotation.summary && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {quotation.summary}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-lg font-semibold">
                          <PoundSterling className="w-4 h-4" />
                          {quotation.total_amount.toFixed(2)}
                        </div>
                        {quotation.valid_until && (
                          <p className="text-xs text-muted-foreground">
                            Valid until {format(new Date(quotation.valid_until), "MMM d, yyyy")}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedQuotation(quotation)}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setSelectedQuotation(quotation)}
                            >
                              <Pencil className="w-4 h-4 mr-2" />
                              Edit Quote
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => navigate(`/dashboard/sites/${quotation.site_id}`)}
                            >
                              <Building2 className="w-4 h-4 mr-2" />
                              View Site
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() => handleEmailQuotation(quotation)}
                            >
                              <Mail className="w-4 h-4 mr-2" />
                              Email Quotation
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            {/* SharePoint submenu */}
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>
                                <Globe className="w-4 h-4 mr-2" />
                                View Online
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent>
                                {quotation.sharepoint_url ? (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() => {
                                        window.open(quotation.sharepoint_url!, "_blank", "noopener,noreferrer");
                                      }}
                                    >
                                      <ExternalLink className="w-4 h-4 mr-2" />
                                      Open in SharePoint
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => {
                                        navigator.clipboard.writeText(quotation.sharepoint_url!);
                                        toast.success("SharePoint link copied to clipboard");
                                      }}
                                    >
                                      <Copy className="w-4 h-4 mr-2" />
                                      Copy SharePoint Link
                                    </DropdownMenuItem>
                                  </>
                                ) : null}
                                <DropdownMenuItem
                                  disabled={uploadingToSharePoint === quotation.id}
                                  onClick={() => handleUploadToSharePoint(quotation)}
                                >
                                  {uploadingToSharePoint === quotation.id ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  ) : (
                                    <Upload className="w-4 h-4 mr-2" />
                                  )}
                                  {quotation.sharepoint_url ? "Update on SharePoint" : "Upload to SharePoint"}
                                </DropdownMenuItem>
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>

                            <DropdownMenuSeparator />

                            {quotation.status === "draft" && (
                              <DropdownMenuItem
                                onClick={() => handleStatusChange(quotation.id, "sent")}
                              >
                                <Send className="w-4 h-4 mr-2" />
                                Mark as Sent
                              </DropdownMenuItem>
                            )}

                            {quotation.status === "sent" && (
                              <>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setQuotationToAccept(quotation);
                                    setAcceptDialogOpen(true);
                                  }}
                                >
                                  <FileCheck className="w-4 h-4 mr-2" />
                                  Accept with PO
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleStatusChange(quotation.id, "declined")}
                                >
                                  <FileCheck className="w-4 h-4 mr-2" />
                                  Mark as Declined
                                </DropdownMenuItem>
                              </>
                            )}

                            {quotation.status === "accepted" && (
                              <DropdownMenuItem
                                onClick={() => handleRevokeAcceptance(quotation.id)}
                              >
                                <Undo2 className="w-4 h-4 mr-2" />
                                Revoke Acceptance
                              </DropdownMenuItem>
                            )}

                            <DropdownMenuSeparator />

                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                setQuotationToDelete(quotation);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* View Quotation Dialog */}
      {selectedQuotation && (
        <QuotationDetailDialog
          open={!!selectedQuotation}
          onOpenChange={(open) => {
            if (!open) setSelectedQuotation(null);
          }}
          quotationId={selectedQuotation.id}
          onUpdate={fetchQuotations}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Quotation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {quotationToDelete?.quotation_number}.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Accept Quotation Dialog */}
      {quotationToAccept && (
        <AcceptQuotationDialog
          open={acceptDialogOpen}
          onOpenChange={(open) => {
            setAcceptDialogOpen(open);
            if (!open) setQuotationToAccept(null);
          }}
          quotation={quotationToAccept}
          onAccepted={fetchQuotations}
        />
      )}

      {/* Email Quotation Dialog */}
      {quotationToEmail && emailPdfData && (
        <EmailQuotationDialog
          open={emailDialogOpen}
          onOpenChange={(open) => {
            setEmailDialogOpen(open);
            if (!open) {
              setQuotationToEmail(null);
              setEmailPdfData(null);
            }
          }}
          quotation={{
            id: quotationToEmail.id,
            quotation_number: quotationToEmail.quotation_number,
            title: quotationToEmail.title || quotationToEmail.sites?.name || "Quotation",
            site_id: quotationToEmail.site_id,
            customer_id: quotationToEmail.customer_id,
            sites: quotationToEmail.sites ? { name: quotationToEmail.sites.name } : null,
          }}
          customerEmail={quotationToEmail.customers?.contact_email || ""}
          customerName={quotationToEmail.customers?.contact_name || quotationToEmail.customers?.name || ""}
          pdfData={emailPdfData}
          columnOptions={{
            showItemNumber: true,
            showDescription: true,
            showRegulationRef: true,
            showPriority: false,
            showItem: true,
            showQuantity: true,
            showUnitPrice: true,
            showLabour: true,
            showTotal: true,
          }}
          onSuccess={() => {
            fetchQuotations();
          }}
        />
      )}
      {/* New Quotation Dialog */}
      <NewQuotationDialog
        open={newQuoteOpen}
        onOpenChange={setNewQuoteOpen}
        onSuccess={fetchQuotations}
      />
    </DashboardLayout>
  );
};

export default Quotations;
