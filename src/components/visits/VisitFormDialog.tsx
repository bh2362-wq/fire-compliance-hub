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
import { Loader2, Plus, Calendar, Flame, Wind, Wrench, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const visitFormSchema = z.object({
  site_id: z.string().min(1, "Site is required"),
  visit_date: z.string().min(1, "Visit date is required"),
  visit_type: z.string().min(1, "Visit type is required"),
  asset_id: z.string().optional(),
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

// Visit types grouped by asset type
const FIRE_SERVICE_TYPES = [
  { value: "fire_quarterly", label: "Fire Alarm - Quarterly Service" },
  { value: "fire_biannual", label: "Fire Alarm - 6-Monthly Service" },
  { value: "fire_annual", label: "Fire Alarm - Annual Inspection" },
];

const ASD_SERVICE_TYPES = [
  { value: "asd_quarterly", label: "ASD - Quarterly Service" },
  { value: "asd_biannual", label: "ASD - 6-Monthly Service" },
  { value: "asd_annual", label: "ASD - Annual Inspection" },
];

const GENERAL_TYPES = [
  { value: "emergency", label: "Emergency Callout" },
  { value: "remedial", label: "Remedial Works" },
];

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
  const { toast } = useToast();

  const form = useForm<VisitFormData>({
    resolver: zodResolver(visitFormSchema),
    defaultValues: {
      site_id: siteId || "",
      visit_date: format(new Date(), "yyyy-MM-dd"),
      visit_type: "",
      asset_id: "",
      notes: "",
    },
  });

  const selectedSiteId = form.watch("site_id");
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
      const { data } = await supabase
        .from("site_assets")
        .select("id, item_name, asset_type, manufacturer, model, location")
        .eq("site_id", siteId)
        .order("asset_type", { ascending: true })
        .order("item_name", { ascending: true });
      
      setSiteAssets(data || []);
    } catch (error) {
      console.error("Error loading site assets:", error);
    } finally {
      setLoadingAssets(false);
    }
  };

  const availableSites = sites.length > 0 ? sites : internalSites;
  const showSiteSelector = !siteId && availableSites.length > 0;
  const selectedSiteName = availableSites.find(s => s.id === selectedSiteId)?.name || siteName;

  // Group assets by type
  const fireAssets = siteAssets.filter(a => a.asset_type === "fire_panel");
  const asdAssets = siteAssets.filter(a => a.asset_type === "asd");

  // Determine if we need to show asset selector based on visit type
  const isAsdVisit = selectedVisitType?.startsWith("asd_");
  const showAssetSelector = isAsdVisit && asdAssets.length > 1;

  // Build available visit types based on assets
  const getAvailableVisitTypes = () => {
    const types: { value: string; label: string; icon: typeof Flame; assetInfo?: string }[] = [];
    
    // Add fire alarm options if site has fire panels
    if (fireAssets.length > 0) {
      FIRE_SERVICE_TYPES.forEach(t => {
        types.push({
          ...t,
          icon: Flame,
          assetInfo: fireAssets.length === 1 
            ? fireAssets[0].item_name 
            : `${fireAssets.length} panels`,
        });
      });
    }
    
    // Add ASD options if site has ASD units
    if (asdAssets.length > 0) {
      ASD_SERVICE_TYPES.forEach(t => {
        types.push({
          ...t,
          icon: Wind,
          assetInfo: asdAssets.length === 1 
            ? asdAssets[0].item_name 
            : `${asdAssets.length} units`,
        });
      });
    }
    
    // Always add general types
    GENERAL_TYPES.forEach(t => {
      types.push({
        ...t,
        icon: t.value === "emergency" ? AlertTriangle : Wrench,
      });
    });
    
    return types;
  };

  const visitTypes = getAvailableVisitTypes();

  const onSubmit = async (data: VisitFormData) => {
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Build notes JSON with asset info
      const notesData: Record<string, unknown> = {};
      
      if (data.asset_id) {
        const selectedAsset = siteAssets.find(a => a.id === data.asset_id);
        notesData.asset_id = data.asset_id;
        notesData.asset_name = selectedAsset?.item_name;
      } else if (isAsdVisit && asdAssets.length === 1) {
        // Auto-select single ASD
        notesData.asset_id = asdAssets[0].id;
        notesData.asset_name = asdAssets[0].item_name;
      }

      if (data.notes) {
        notesData.user_notes = data.notes;
      }

      const { data: visit, error } = await supabase
        .from("visits")
        .insert({
          site_id: data.site_id,
          visit_date: data.visit_date,
          visit_type: data.visit_type,
          notes: Object.keys(notesData).length > 0 ? JSON.stringify(notesData) : null,
          engineer_id: user?.id || null,
          status: "in_progress",
        })
        .select("id")
        .single();

      if (error) throw error;

      const typeLabel = visitTypes.find(t => t.value === data.visit_type)?.label || data.visit_type;
      
      toast({
        title: "Visit created",
        description: `${typeLabel} visit created successfully.`,
      });

      form.reset({
        site_id: siteId || "",
        visit_date: format(new Date(), "yyyy-MM-dd"),
        visit_type: "",
        asset_id: "",
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

            <FormField
              control={form.control}
              name="visit_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Service Type</FormLabel>
                  {loadingAssets ? (
                    <div className="flex items-center gap-2 py-2 text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading site assets...
                    </div>
                  ) : selectedSiteId ? (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select service type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {/* Fire Alarm Services */}
                        {fireAssets.length > 0 && (
                          <>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground flex items-center gap-1">
                              <Flame className="w-3 h-3" />
                              Fire Alarm Services ({fireAssets.length} panel{fireAssets.length > 1 ? "s" : ""})
                            </div>
                            {FIRE_SERVICE_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label.replace("Fire Alarm - ", "")}
                              </SelectItem>
                            ))}
                          </>
                        )}
                        
                        {/* ASD Services */}
                        {asdAssets.length > 0 && (
                          <>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground flex items-center gap-1 border-t mt-1 pt-2">
                              <Wind className="w-3 h-3" />
                              ASD Services ({asdAssets.length} unit{asdAssets.length > 1 ? "s" : ""})
                            </div>
                            {ASD_SERVICE_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label.replace("ASD - ", "")}
                              </SelectItem>
                            ))}
                          </>
                        )}

                        {/* General Services */}
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-2">
                          Other Services
                        </div>
                        {GENERAL_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="text-sm text-muted-foreground py-2">
                      Select a site first to see available service types
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ASD Asset Selector - only show if multiple ASD units */}
            {showAssetSelector && (
              <FormField
                control={form.control}
                name="asset_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Select ASD Unit</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select ASD unit" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {asdAssets.map((asset) => (
                          <SelectItem key={asset.id} value={asset.id}>
                            <div className="flex items-center gap-2">
                              <Wind className="w-4 h-4 text-primary" />
                              <span>{asset.item_name}</span>
                              {asset.location && (
                                <Badge variant="outline" className="text-xs">
                                  {asset.location}
                                </Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
