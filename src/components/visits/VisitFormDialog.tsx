import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Calendar, Flame, Wind, Wrench, AlertTriangle, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { createAppointment } from "@/services/appointmentService";
import { sendAppointmentCreatedNotification } from "@/services/notificationService";

const visitFormSchema = z.object({
  site_id: z.string().min(1, "Site is required"),
  visit_date: z.string().min(1, "Visit date is required"),
  asset_type: z.string().min(1, "Asset type is required"),
  visit_type: z.string().min(1, "Visit type is required"),
  notes: z.string().max(1000).optional(),
});

type VisitFormData = z.infer<typeof visitFormSchema>;

interface SiteAsset {
  id: string;
  item_name: string;
  asset_type: string;
  manufacturer: string | null;
  model: string | null;
  location: string | null;
}

interface Site {
  id: string;
  name: string;
}

interface VisitFormDialogProps {
  siteId?: string;
  siteName?: string;
  sites?: Site[];
  onVisitCreated?: (visitId: string) => void;
  trigger?: React.ReactNode;
}

import { SERVICE_FREQUENCY_TYPES, GENERAL_TYPES } from "@/constants/visitTypes";

const VisitFormDialog = ({
  siteId,
  siteName,
  sites = [],
  onVisitCreated,
  trigger,
}: VisitFormDialogProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [internalSites, setInternalSites] = useState<Site[]>([]);
  const [siteAssets, setSiteAssets] = useState<SiteAsset[]>([]);
  const [contractServiceTypes, setContractServiceTypes] = useState<string[]>([]);
  const { toast } = useToast();

  const form = useForm<VisitFormData>({
    resolver: zodResolver(visitFormSchema),
    defaultValues: {
      site_id: siteId || "",
      visit_date: format(new Date(), "yyyy-MM-dd"),
      asset_type: "",
      visit_type: "",
      notes: "",
    },
  });

  const selectedSiteId = form.watch("site_id");
  const selectedAssetType = form.watch("asset_type");
  const selectedVisitType = form.watch("visit_type");

  // Load sites if none provided
  useEffect(() => {
    if (open && sites.length === 0 && !siteId) {
      const fetchSites = async () => {
        const { data } = await supabase
          .from("sites")
          .select("id, name")
          .eq("status", "active")
          .order("name");
        if (data) setInternalSites(data);
      };
      fetchSites();
    }
  }, [open, sites.length, siteId]);

  // Load site assets when site is selected
  useEffect(() => {
    if (selectedSiteId) {
      loadSiteAssets(selectedSiteId);
    } else {
      setSiteAssets([]);
    }
  }, [selectedSiteId]);

  // Update site_id when siteId prop changes
  useEffect(() => {
    if (siteId) {
      form.setValue("site_id", siteId);
    }
  }, [siteId, form]);

  const loadSiteAssets = async (siteId: string) => {
    setLoadingAssets(true);
    try {
      // Load site_assets AND service contracts in parallel
      const [assetsResult, contractsResult] = await Promise.all([
        supabase
          .from("site_assets")
          .select("id, item_name, asset_type, manufacturer, model, location")
          .eq("site_id", siteId)
          .order("asset_type", { ascending: true })
          .order("item_name", { ascending: true }),
        supabase
          .from("site_service_contracts")
          .select("service_type")
          .eq("site_id", siteId),
      ]);
      
      setSiteAssets(assetsResult.data || []);
      // Extract unique service types from contracts
      const contractTypes = (contractsResult.data || []).map(c => c.service_type);
      setContractServiceTypes([...new Set(contractTypes)]);
    } catch (error) {
      console.error("Error loading site assets:", error);
    } finally {
      setLoadingAssets(false);
    }
  };

  const availableSites = sites.length > 0 ? sites : internalSites;
  const showSiteSelector = !siteId && availableSites.length > 0;
  const selectedSiteName = availableSites.find(s => s.id === selectedSiteId)?.name || siteName;

  // Clear visit_type when asset_type changes
  useEffect(() => {
    form.setValue("visit_type", "");
  }, [selectedAssetType, form]);

  // Helper: check if asset type has assets OR a service contract
  const hasType = (type: string) => {
    const assetCount = siteAssets.filter(a => a.asset_type === type).length;
    return assetCount > 0 || contractServiceTypes.includes(type);
  };
  const countForType = (type: string) => siteAssets.filter(a => a.asset_type === type).length;

  // Get available asset types based on site assets AND service contracts
  const assetTypeConfigs: { value: string; label: string; icon: typeof Flame; }[] = [
    { value: "fire", label: "Fire Alarm", icon: Flame },
    { value: "aspirator", label: "Aspirator / ASD", icon: Wind },
    { value: "gas_suppression", label: "Gas Suppression", icon: Flame },
    { value: "emergency_lighting", label: "Emergency Lighting", icon: Flame },
    { value: "disabled_refuge", label: "Disabled Refuge", icon: Phone },
    { value: "room_integrity", label: "Room Integrity", icon: Flame },
    { value: "fire_curtain", label: "Fire Curtain", icon: Flame },
    { value: "intruder_alarm", label: "Intruder Alarm", icon: AlertTriangle },
    { value: "nurse_call", label: "Nurse Call", icon: Phone },
  ];

  const availableAssetTypes = [
    ...assetTypeConfigs
      .filter(cfg => hasType(cfg.value))
      .map(cfg => {
        const count = countForType(cfg.value);
        return {
          value: cfg.value,
          label: count > 1 ? `${cfg.label} (${count} units)` : cfg.label,
          icon: cfg.icon,
          count,
        };
      }),
    { value: "general", label: "General / Other", icon: Wrench, count: 0 },
  ];

  // Get visit type label for display
  const getVisitTypeLabel = () => {
    const allTypes = [...SERVICE_FREQUENCY_TYPES, ...GENERAL_TYPES];
    return allTypes.find(t => t.value === selectedVisitType)?.label || selectedVisitType;
  };

  const onSubmit = async (data: VisitFormData) => {
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user?.id) {
        throw new Error("Not authenticated");
      }

      // Build notes JSON with asset type info
      // The report will look up all assets of this type for the site
      const notesData: Record<string, unknown> = {
        asset_type: data.asset_type, // fire_panel, asd, or general
      };

      if (data.notes) {
        notesData.user_notes = data.notes;
      }

      // Get site and customer info for the appointment and SharePoint folder
      const { data: siteData } = await supabase
        .from("sites")
        .select("id, name, customer_id, address, sharepoint_folder")
        .eq("id", data.site_id)
        .single();

      let customerName = "";
      if (siteData?.customer_id) {
        const { data: custData } = await supabase
          .from("customers")
          .select("name")
          .eq("id", siteData.customer_id)
          .single();
        customerName = custData?.name || "";
      }

      const { data: visit, error } = await supabase
        .from("visits")
        .insert({
          site_id: data.site_id,
          visit_date: data.visit_date,
          visit_type: data.visit_type,
          notes: Object.keys(notesData).length > 0 ? JSON.stringify(notesData) : null,
          engineer_id: user.id,
          status: "in_progress",
        })
        .select("id")
        .single();

      if (error) throw error;

      // Create unique SharePoint folder for this visit
      try {
        const sanitize = (name: string) =>
          name.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, " ").trim();
        const sName = sanitize(siteData?.name || "Site");
        const sAddr = siteData?.address ? ` (${sanitize(siteData.address)})` : "";
        const visitDate = data.visit_date.replace(/-/g, "");
        const shortId = visit.id.substring(0, 8);
        const visitFolder = `${data.visit_type}_${visitDate}_${shortId}`;

        // Build site base path
        const siteBasePath = siteData?.sharepoint_folder ||
          (customerName
            ? `Customers/${sanitize(customerName)}/${sName}${sAddr}`
            : `Sites/${sName}${sAddr}`);

        const fullFolderPath = `${siteBasePath}/Reports/${visitFolder}`;

        // Create folder in SharePoint (fire-and-forget, don't block visit creation)
        supabase.functions.invoke("sharepoint-create-folder", {
          body: { folderPath: fullFolderPath, entityType: "folder_only", entityId: visit.id },
        }).then(({ data: spData }) => {
          // Persist site base path if not already set
          if (!siteData?.sharepoint_folder && siteData?.id) {
            supabase.from("sites").update({ 
              sharepoint_folder: siteBasePath,
              sharepoint_url: spData?.webUrl || null,
            }).eq("id", siteData.id).then(() => {});
          }
        }).catch((spErr) => {
          console.warn("SharePoint folder creation skipped:", spErr);
        });
      } catch (spError) {
        console.warn("SharePoint folder setup skipped:", spError);
      }

      // Create corresponding appointment in the schedule
      const typeLabel = getVisitTypeLabel();
      try {
        const newAppointment = await createAppointment({
          visit_id: visit.id,
          site_id: data.site_id,
          customer_id: siteData?.customer_id || null,
          engineer_id: user.id,
          title: `${typeLabel} - ${siteData?.name || "Site Visit"}`,
          description: data.notes || null,
          appointment_date: data.visit_date,
          start_time: "09:00:00",
          end_time: "17:00:00",
          status: "scheduled",
          visit_type: data.visit_type,
        }, user.id);
        
        // Send confirmation email to customer
        sendAppointmentCreatedNotification(newAppointment.id).catch(console.error);
      } catch (aptError) {
        console.error("Error creating appointment:", aptError);
        // Don't fail the visit creation if appointment fails
      }
      
      toast({
        title: "Visit created",
        description: `${typeLabel} visit created and added to schedule.`,
      });

      form.reset({
        site_id: siteId || "",
        visit_date: format(new Date(), "yyyy-MM-dd"),
        asset_type: "",
        visit_type: "",
        notes: "",
      });
      setOpen(false);
      onVisitCreated?.(visit.id);
    } catch (error) {
      console.error("Error creating visit:", error);
      toast({
        title: "Error",
        description: "Failed to create visit. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="hero" size="sm">
            <Plus className="w-4 h-4 mr-2" />
            New Visit
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Create New Visit
          </DialogTitle>
          <DialogDescription>
            {selectedSiteName
              ? `Create a new service visit for ${selectedSiteName}`
              : "Select a site and create a new service visit"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {showSiteSelector && (
              <FormField
                control={form.control}
                name="site_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Site</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a site" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableSites.map((site) => (
                          <SelectItem key={site.id} value={site.id}>
                            {site.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="visit_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Visit Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Asset Type Selector */}
            <FormField
              control={form.control}
              name="asset_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Asset Type</FormLabel>
                  {loadingAssets ? (
                    <div className="flex items-center gap-2 py-2 text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading site assets...
                    </div>
                  ) : selectedSiteId ? (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select asset type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableAssetTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            <div className="flex items-center gap-2">
                              <type.icon className="w-4 h-4" />
                              <span>{type.label}</span>
                              {type.count > 0 && (
                                <span className="text-muted-foreground text-xs">
                                  ({type.count})
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="text-sm text-muted-foreground py-2">
                      Select a site first
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Service Type Selector - only show after asset type selected */}
            {selectedAssetType && (
              <FormField
                control={form.control}
                name="visit_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Service Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select service type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {selectedAssetType !== "general" ? (
                          <>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                              Service Frequencies
                            </div>
                            {SERVICE_FREQUENCY_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-2">
                              Other
                            </div>
                          </>
                        ) : null}
                        {GENERAL_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Asset info summary - show what will be included */}
            {selectedAssetType && selectedAssetType !== "general" && siteAssets.filter(a => a.asset_type === selectedAssetType).length > 0 && (
              <div className="bg-muted/50 border rounded-lg p-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <span className="font-medium">Assets included in this visit:</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {siteAssets.filter(a => a.asset_type === selectedAssetType).map((asset) => (
                    <Badge key={asset.id} variant="secondary" className="text-xs">
                      {asset.item_name}
                      {asset.manufacturer && ` - ${asset.manufacturer}`}
                      {asset.location && ` (${asset.location})`}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Asset info display */}
            {selectedSiteId && !loadingAssets && siteAssets.length === 0 && (
              <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 text-sm text-warning">
                <AlertTriangle className="w-4 h-4 inline mr-2" />
                No assets found for this site. Add fire panels or ASD units in the Site Details to enable service reports.
              </div>
            )}

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add any notes about this visit..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" variant="hero" disabled={loading || !selectedSiteId}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Visit"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default VisitFormDialog;
