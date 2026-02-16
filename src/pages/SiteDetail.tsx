import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import DeviceInventory from "@/components/sites/DeviceInventory";
import SiteUploadHistory from "@/components/sites/SiteUploadHistory";
import SiteReconciliationHistory from "@/components/sites/SiteReconciliationHistory";
import { SiteServiceContracts } from "@/components/sites/SiteServiceContracts";
import { SiteServiceReports } from "@/components/sites/SiteServiceReports";
import { SiteAssets } from "@/components/sites/SiteAssets";
import { SiteRamsDocuments } from "@/components/sites/SiteRamsDocuments";
import { OpenVisitsCard } from "@/components/visits/OpenVisitsCard";
import DeviceImportDialog from "@/components/sites/DeviceImportDialog";
import VisitFormDialog from "@/components/visits/VisitFormDialog";
import { RamsDocumentDialog } from "@/components/rams/RamsDocumentDialog";
import { CreateSharePointFolderButton } from "@/components/sharepoint/CreateSharePointFolderButton";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Building2, MapPin, Mail, Phone, User, Pencil, Plus, Users, HardHat, Server, FileText, Cpu, Upload, GitCompare, ClipboardList, MoreHorizontal, Trash2, Eye } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import DeleteSiteDialog from "@/components/sites/DeleteSiteDialog";
import { supabase } from "@/integrations/supabase/client";
import { Site } from "@/services/siteService";
import { Customer } from "@/services/customerService";
import SiteFormDialog from "@/components/sites/SiteFormDialog";
import { useToast } from "@/hooks/use-toast";
const statusConfig = {
  active: { label: "Active", className: "bg-success/10 text-success border-success/20" },
  inactive: { label: "Inactive", className: "bg-muted text-muted-foreground border-border" },
  pending: { label: "Pending", className: "bg-warning/10 text-warning border-warning/20" },
};

const SiteDetail = () => {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();
  const [site, setSite] = useState<Site | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [ramsOpen, setRamsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const fetchSite = async () => {
    if (!siteId) return;
    
    setLoading(true);
    const { data, error } = await supabase
      .from("sites")
      .select("*")
      .eq("id", siteId)
      .maybeSingle();

    if (!error && data) {
      setSite(data as Site);
      
      // Fetch customer if site has customer_id
      if (data.customer_id) {
        const { data: customerData } = await supabase
          .from("customers")
          .select("*")
          .eq("id", data.customer_id)
          .maybeSingle();
        
        if (customerData) {
          setCustomer(customerData as Customer);
        }
      } else {
        setCustomer(null);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSite();
  }, [siteId]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div>
              <Skeleton className="h-8 w-64 mb-2" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (!site) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <Building2 className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">Site not found</h2>
          <p className="text-muted-foreground mb-4">
            The site you're looking for doesn't exist or you don't have access.
          </p>
          <Button variant="hero" onClick={() => navigate("/dashboard/sites")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Sites
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const status = statusConfig[site.status as keyof typeof statusConfig] || statusConfig.active;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/dashboard/sites")}
              className="mt-1"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
              <Building2 className="w-7 h-7 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-foreground">{site.name}</h1>
                <Badge variant="outline" className={status.className}>
                  {status.label}
                </Badge>
              </div>
              {customer && (
                <Link 
                  to={`/dashboard/customers/${customer.id}`}
                  className="text-sm text-primary hover:underline flex items-center gap-1 mt-1"
                >
                  <Users className="w-3.5 h-3.5" />
                  {customer.name}
                </Link>
              )}
              {(site.address || site.city || site.postcode) && (
                <p className="text-muted-foreground flex items-center gap-1 mt-1">
                  <MapPin className="w-4 h-4 flex-shrink-0" />
                  {[site.address, site.city, site.postcode].filter(Boolean).join(", ")}
                </p>
              )}
              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                {site.contact_name && (
                  <span className="flex items-center gap-1">
                    <User className="w-3.5 h-3.5" />
                    {site.contact_name}
                  </span>
                )}
                {site.contact_email && (
                  <span className="flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5" />
                    {site.contact_email}
                  </span>
                )}
                {site.contact_phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5" />
                    {site.contact_phone}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <VisitFormDialog
              siteId={site.id}
              siteName={site.name}
              onVisitCreated={() => {
                // Optionally navigate to visits or refresh
              }}
              trigger={
                <Button variant="hero" size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  New Visit
                </Button>
              }
            />
            <Button variant="outline" size="sm" onClick={() => setRamsOpen(true)}>
              <HardHat className="w-4 h-4 mr-2" />
              New RAMS
            </Button>
            <CreateSharePointFolderButton
              entityType="site"
              entityId={site.id}
              entityName={site.name}
              customerName={customer?.name}
              existingFolder={site.sharepoint_folder}
              existingUrl={(site as any).sharepoint_url}
              onFolderCreated={() => fetchSite()}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit Site
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setDeleteOpen(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Site
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card rounded-xl border border-border p-6">
            <p className="text-sm text-muted-foreground">Total Devices</p>
            <p className="text-3xl font-bold text-foreground">{site.total_devices || 0}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-6">
            <p className="text-sm text-muted-foreground">Status</p>
            <p className="text-3xl font-bold text-foreground capitalize">{site.status || "Active"}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-6">
            <p className="text-sm text-muted-foreground">Last Updated</p>
            <p className="text-lg font-medium text-foreground">
              {new Date(site.updated_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Open Visits */}
        <OpenVisitsCard siteId={site.id} />

        {/* Site Assets */}
        <CollapsibleSection title="Site Assets" icon={Server} defaultOpen={false}>
          <SiteAssets siteId={site.id} />
        </CollapsibleSection>

        {/* Service Contracts */}
        <CollapsibleSection title="Service Contracts" icon={FileText} defaultOpen={false}>
          <SiteServiceContracts siteId={site.id} />
        </CollapsibleSection>

        {/* Device Inventory */}
        <CollapsibleSection title="Device Inventory" icon={Cpu} defaultOpen={false}>
          <DeviceInventory siteId={site.id} onImportClick={() => setImportOpen(true)} />
        </CollapsibleSection>

        {/* RAMS Documents */}
        <CollapsibleSection title="RAMS Documents" icon={HardHat} defaultOpen={false}>
          <SiteRamsDocuments siteId={site.id} />
        </CollapsibleSection>

        {/* Service Reports */}
        <CollapsibleSection title="Service Reports" icon={ClipboardList} defaultOpen={false}>
          <SiteServiceReports siteId={site.id} siteName={site.name} customerName={customer?.name} />
        </CollapsibleSection>

        {/* Upload History */}
        <CollapsibleSection title="Upload History" icon={Upload} defaultOpen={false}>
          <SiteUploadHistory siteId={site.id} />
        </CollapsibleSection>

        {/* Reconciliation History */}
        <CollapsibleSection title="Reconciliation History" icon={GitCompare} defaultOpen={false}>
          <SiteReconciliationHistory siteId={site.id} />
        </CollapsibleSection>
      </div>

      {/* Dialogs */}
      <DeviceImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        site={site}
        onSuccess={fetchSite}
      />
      <SiteFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        site={site}
        onSuccess={fetchSite}
      />
      <RamsDocumentDialog
        open={ramsOpen}
        onOpenChange={setRamsOpen}
        preselectedSiteId={site.id}
        onSuccess={() => {}}
      />
      <DeleteSiteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        siteId={site.id}
        siteName={site.name}
        onSuccess={() => navigate("/dashboard/sites")}
      />
    </DashboardLayout>
  );
};

export default SiteDetail;
