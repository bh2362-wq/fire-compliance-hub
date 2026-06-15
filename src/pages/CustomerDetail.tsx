import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  Building2,
  MapPin,
  Mail,
  Phone,
  User,
  Pencil,
  Plus,
  Loader2,
  FileText,
  ClipboardList,
  BarChart3,
  MoreHorizontal,
  Eye,
  Trash2,
  PowerOff,
  Power,
} from "lucide-react";
import DeleteSiteDialog from "@/components/sites/DeleteSiteDialog";
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
  Customer,
  getCustomer,
  getCustomerSites,
  setCustomerActiveStatus,
} from "@/services/customerService";
import { writeRecentContext } from "@/services/recentContextService";
import { CustomerFormDialog } from "@/components/customers/CustomerFormDialog";
import { CustomerInvoices } from "@/components/customers/CustomerInvoices";
import { CustomerReports } from "@/components/customers/CustomerReports";
import { CustomerEmailLogs } from "@/components/customers/CustomerEmailLogs";
import { CustomerEmailDrafts } from "@/components/customers/CustomerEmailDrafts";
import { CustomerCreateInvoiceDialog } from "@/components/customers/CustomerCreateInvoiceDialog";
import { OpenVisitsCard } from "@/components/visits/OpenVisitsCard";
import { CreditCheckCard } from "@/components/credit-control/CreditCheckCard";
import { CustomerIntelligenceDashboard } from "@/components/customers/CustomerIntelligenceDashboard";
import { CreateSharePointFolderButton } from "@/components/sharepoint/CreateSharePointFolderButton";
import SiteFormDialog from "@/components/sites/SiteFormDialog";
import VisitFormDialog from "@/components/visits/VisitFormDialog";
import { useToast } from "@/hooks/use-toast";

interface Site {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  postcode: string | null;
  total_devices: number | null;
  status: string | null;
}

const CustomerDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showSiteDialog, setShowSiteDialog] = useState(false);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [showIntelligence, setShowIntelligence] = useState(false);
  const [invoiceRefreshKey, setInvoiceRefreshKey] = useState(0);
  const [deleteSiteDialogOpen, setDeleteSiteDialogOpen] = useState(false);
  const [siteToDelete, setSiteToDelete] = useState<Site | null>(null);
  const [showInactiveConfirm, setShowInactiveConfirm] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);

  const isInactive = (customer?.status || "active") !== "active";

  const handleToggleActive = async () => {
    if (!customer) return;
    setTogglingActive(true);
    const { error } = await setCustomerActiveStatus(customer.id, isInactive);
    setTogglingActive(false);
    setShowInactiveConfirm(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: isInactive ? "Customer reactivated" : "Customer marked inactive",
      description: isInactive
        ? "Customer and all sites are now visible in the default lists again."
        : "Customer and all linked sites are hidden from the default lists.",
    });
    loadData();
  };

  const loadData = async () => {
    if (!id) return;
    
    setLoading(true);
    const [customerResult, sitesResult] = await Promise.all([
      getCustomer(id),
      getCustomerSites(id),
    ]);

    if (customerResult.error) {
      toast({
        title: "Error",
        description: customerResult.error.message,
        variant: "destructive",
      });
    } else {
      setCustomer(customerResult.customer);
      // Drop a recent-customer chip so the engineer can jump back from
      // any other page. Mirrors what SiteDetail does for sites.
      writeRecentContext("customer", {
        id: customerResult.customer.id,
        label: customerResult.customer.name,
        subtitle: customerResult.customer.contact_name || customerResult.customer.contact_email || null,
        href: `/dashboard/customers/${customerResult.customer.id}`,
      });
    }

    if (!sitesResult.error) {
      setSites(sitesResult.sites);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [id]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!customer) {
    return (
      <DashboardLayout>
        <div className="text-center py-24">
          <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Customer not found</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/customers")}>
            Back to Customers
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/customers")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">{customer.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={customer.status === "active" ? "default" : "secondary"}>
                    {customer.status || "active"}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {sites.length} site{sites.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {sites.length > 0 && (
              <VisitFormDialog
                sites={sites}
                onVisitCreated={() => loadData()}
                trigger={
                  <Button variant="outline">
                    <ClipboardList className="w-4 h-4 mr-2" />
                    New Visit
                  </Button>
                }
              />
            )}
            <Button variant="outline" onClick={() => setShowInvoiceDialog(true)}>
              <FileText className="w-4 h-4 mr-2" />
              Add Invoice
            </Button>
            <Button variant="outline" onClick={() => setShowIntelligence(true)}>
              <BarChart3 className="w-4 h-4 mr-2" />
              Intelligence
            </Button>
            <CreateSharePointFolderButton
              entityType="customer"
              entityId={customer.id}
              entityName={customer.name}
              existingFolder={(customer as any).sharepoint_folder}
              existingUrl={(customer as any).sharepoint_url}
              onFolderCreated={() => loadData()}
            />
            <Button variant="outline" onClick={() => setShowEditDialog(true)}>
              <Pencil className="w-4 h-4 mr-2" />
              Edit Customer
            </Button>
            {isInactive ? (
              <Button
                variant="outline"
                onClick={handleToggleActive}
                disabled={togglingActive}
              >
                {togglingActive ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Power className="w-4 h-4 mr-2" />
                )}
                Mark as Active
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={() => setShowInactiveConfirm(true)}
                disabled={togglingActive}
              >
                <PowerOff className="w-4 h-4 mr-2" />
                No Longer Active
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Customer Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contact Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {customer.contact_name && (
                <div className="flex items-center gap-3">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{customer.contact_name}</span>
                </div>
              )}
              {customer.contact_email && (
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <a
                    href={`mailto:${customer.contact_email}`}
                    className="text-sm text-primary hover:underline"
                  >
                    {customer.contact_email}
                  </a>
                </div>
              )}
              {customer.contact_phone && (
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <a
                    href={`tel:${customer.contact_phone}`}
                    className="text-sm text-primary hover:underline"
                  >
                    {customer.contact_phone}
                  </a>
                </div>
              )}
              {(customer.address || customer.city || customer.postcode) && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div className="text-sm">
                    {customer.address && <p>{customer.address}</p>}
                    {(customer.city || customer.postcode) && (
                      <p className="text-muted-foreground">
                        {[customer.city, customer.postcode].filter(Boolean).join(", ")}
                      </p>
                    )}
                  </div>
                </div>
              )}
              {!customer.contact_name &&
                !customer.contact_email &&
                !customer.contact_phone &&
                !customer.address && (
                  <p className="text-sm text-muted-foreground">No contact details added</p>
                )}
              {/* Default Email Recipients */}
              {((customer as any).invoice_email_recipients || (customer as any).quote_email_recipients || (customer as any).report_email_recipients || customer.email_recipients) && (
                <div className="pt-3 mt-3 border-t border-border space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Default Email Recipients</p>
                  {(customer as any).invoice_email_recipients && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Invoices:</span>{" "}
                      <span className="text-foreground">{(customer as any).invoice_email_recipients}</span>
                    </div>
                  )}
                  {(customer as any).quote_email_recipients && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Quotes:</span>{" "}
                      <span className="text-foreground">{(customer as any).quote_email_recipients}</span>
                    </div>
                  )}
                  {(customer as any).report_email_recipients && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Reports:</span>{" "}
                      <span className="text-foreground">{(customer as any).report_email_recipients}</span>
                    </div>
                  )}
                  {customer.email_recipients && !(customer as any).invoice_email_recipients && !(customer as any).quote_email_recipients && !(customer as any).report_email_recipients && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">General:</span>{" "}
                      <span className="text-foreground">{customer.email_recipients}</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sites List */}
          <Card className="md:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Sites</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setShowSiteDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Site
              </Button>
            </CardHeader>
            <CardContent>
              {sites.length === 0 ? (
                <div className="text-center py-8">
                  <MapPin className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No sites yet</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => setShowSiteDialog(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add First Site
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {sites.map((site) => (
                    <div
                      key={site.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/sites/${site.id}`)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
                          <MapPin className="w-4 h-4 text-accent" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{site.name}</p>
                          {site.city && (
                            <p className="text-sm text-muted-foreground">{site.city}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{site.total_devices || 0} devices</Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/sites/${site.id}`); }}>
                              <Eye className="w-4 h-4 mr-2" />
                              View Site
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={(e) => { e.stopPropagation(); setSiteToDelete(site); setDeleteSiteDialogOpen(true); }}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete Site
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Credit Check */}
        <CreditCheckCard
          customerId={customer.id}
          customerName={customer.name}
          companyNumber={(customer as any).company_number}
        />

        {/* Open Visits */}
        <OpenVisitsCard customerId={customer.id} />

        {/* Completed Reports */}
        <CustomerReports 
          customerId={customer.id} 
          customerName={customer.name}
          siteIds={sites.map(s => s.id)} 
        />

        {/* Invoices */}
        <CustomerInvoices
          xeroContactId={customer.xero_contact_id} 
          customerName={customer.name}
          refreshKey={invoiceRefreshKey}
        />

        {/* Email Drafts */}
        <CustomerEmailDrafts customerId={customer.id} defaultRecipient={customer.contact_email || undefined} />

        {/* Email Logs */}
        <CustomerEmailLogs customerId={customer.id} />

        {/* Notes */}
        {customer.notes && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {customer.notes}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <CustomerFormDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        customer={customer}
        onSuccess={loadData}
      />

      <SiteFormDialog
        open={showSiteDialog}
        onOpenChange={setShowSiteDialog}
        onSiteCreated={loadData}
        defaultCustomerId={customer.id}
      />

      <CustomerCreateInvoiceDialog
        open={showInvoiceDialog}
        onOpenChange={setShowInvoiceDialog}
        customerId={customer.id}
        customerName={customer.name}
        xeroContactId={customer.xero_contact_id}
        sites={sites}
        onSuccess={() => {
          loadData();
          setInvoiceRefreshKey((prev) => prev + 1);
        }}
      />

      <CustomerIntelligenceDashboard
        open={showIntelligence}
        onOpenChange={setShowIntelligence}
        customerId={customer.id}
        customerName={customer.name}
        companyNumber={(customer as any).company_number}
        xeroContactId={customer.xero_contact_id}
      />

      {siteToDelete && (
        <DeleteSiteDialog
          open={deleteSiteDialogOpen}
          onOpenChange={setDeleteSiteDialogOpen}
          siteId={siteToDelete.id}
          siteName={siteToDelete.name}
          onSuccess={loadData}
        />
      )}

      <AlertDialog open={showInactiveConfirm} onOpenChange={setShowInactiveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark customer as no longer active?</AlertDialogTitle>
            <AlertDialogDescription>
              This customer and all {sites.length} linked site
              {sites.length !== 1 ? "s" : ""} will be hidden from the default
              Customers and Sites lists so you don't get confused with too many
              records. Existing visits, reports and invoices are kept and you
              can re-activate the customer at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={togglingActive}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleActive}
              disabled={togglingActive}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {togglingActive ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <PowerOff className="w-4 h-4 mr-2" />
              )}
              Mark Inactive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default CustomerDetail;
