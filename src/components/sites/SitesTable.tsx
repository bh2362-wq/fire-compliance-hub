import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
import { Building2, MapPin, Cpu, MoreHorizontal, Plus, Pencil, Trash2, Upload, Loader2, Eye } from "lucide-react";
import { Site, getSites, deleteSite } from "@/services/siteService";
import SiteFormDialog from "./SiteFormDialog";
import DeviceImportDialog from "./DeviceImportDialog";
import { useToast } from "@/hooks/use-toast";

const statusConfig = {
  active: { label: "Active", className: "bg-success/10 text-success border-success/20" },
  inactive: { label: "Inactive", className: "bg-muted text-muted-foreground border-border" },
  pending: { label: "Pending", className: "bg-warning/10 text-warning border-warning/20" },
};

const SitesTable = () => {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [siteToDelete, setSiteToDelete] = useState<Site | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const loadSites = async () => {
    setLoading(true);
    const { sites: data, error } = await getSites();
    if (error) {
      toast({
        title: "Error loading sites",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setSites(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadSites();
  }, []);

  const handleAddSite = () => {
    setSelectedSite(null);
    setFormOpen(true);
  };

  const handleEditSite = (site: Site) => {
    setSelectedSite(site);
    setFormOpen(true);
  };

  const handleImportDevices = (site: Site) => {
    setSelectedSite(site);
    setImportOpen(true);
  };

  const handleDeleteClick = (site: Site) => {
    setSiteToDelete(site);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!siteToDelete) return;

    const { error } = await deleteSite(siteToDelete.id);
    if (error) {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Site deleted",
        description: `${siteToDelete.name} has been removed.`,
      });
      loadSites();
    }
    setDeleteDialogOpen(false);
    setSiteToDelete(null);
  };

  if (loading) {
    return (
      <div className="bg-card rounded-xl border border-border p-12 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="bg-card rounded-xl border border-border">
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Sites</h3>
            <p className="text-sm text-muted-foreground">
              {sites.length} site{sites.length !== 1 ? "s" : ""} managed
            </p>
          </div>
          <Button variant="hero" size="sm" onClick={handleAddSite}>
            <Plus className="w-4 h-4 mr-2" />
            Add Site
          </Button>
        </div>

        {sites.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No sites yet</h3>
            <p className="text-muted-foreground mb-4">
              Add your first site to start managing fire alarm installations.
            </p>
            <Button variant="hero" onClick={handleAddSite}>
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Site
            </Button>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-muted/50 text-sm font-medium text-muted-foreground border-b border-border">
              <div className="col-span-4">Site</div>
              <div className="col-span-2">Devices</div>
              <div className="col-span-2">Contact</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2"></div>
            </div>

            {/* Table body */}
            <div className="divide-y divide-border">
              {sites.map((site) => {
                const status = statusConfig[site.status as keyof typeof statusConfig] || statusConfig.active;
                return (
                  <div
                    key={site.id}
                    className="grid grid-cols-12 gap-4 px-6 py-4 hover:bg-muted/30 transition-colors items-center cursor-pointer"
                    onClick={() => navigate(`/dashboard/sites/${site.id}`)}
                  >
                    <div className="col-span-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{site.name}</p>
                          {(site.address || site.city) && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {[site.address, site.city, site.postcode].filter(Boolean).join(", ")}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <div className="flex items-center gap-2 text-foreground">
                        <Cpu className="w-4 h-4 text-muted-foreground" />
                        <span>{site.total_devices || 0}</span>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-sm">
                        {site.contact_name && (
                          <p className="text-foreground truncate">{site.contact_name}</p>
                        )}
                        {site.contact_email && (
                          <p className="text-xs text-muted-foreground truncate">{site.contact_email}</p>
                        )}
                        {!site.contact_name && !site.contact_email && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <Badge variant="outline" className={status.className}>
                        {status.label}
                      </Badge>
                    </div>
                    <div className="col-span-2 flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/dashboard/sites/${site.id}`);
                        }}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
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
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            handleEditSite(site);
                          }}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit Site
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            handleImportDevices(site);
                          }}>
                            <Upload className="w-4 h-4 mr-2" />
                            Import Devices
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClick(site);
                            }}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete Site
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Form Dialog */}
      <SiteFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        site={selectedSite}
        onSuccess={loadSites}
      />

      {/* Import Dialog */}
      {selectedSite && (
        <DeviceImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          site={selectedSite}
          onSuccess={loadSites}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Site</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <span className="font-medium">{siteToDelete?.name}</span>? 
              This will also delete all associated devices, visits, and uploads. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default SitesTable;
