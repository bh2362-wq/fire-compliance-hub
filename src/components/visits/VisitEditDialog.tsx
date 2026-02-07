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
import { Loader2, Pencil, Upload, FileText, X, Server, Wind, Flame, Box, PanelTop, Accessibility, Lightbulb, ShieldAlert, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Visit } from "@/hooks/useVisits";
import { sendAppointmentUpdatedNotification } from "@/services/notificationService";
import { SERVICE_TYPES } from "@/services/serviceContractService";

interface SiteAsset {
  id: string;
  asset_type: string;
  item_name: string;
  manufacturer: string | null;
  model: string | null;
  location: string | null;
  zones_count: number | null;
  loops_count: number | null;
}

const ASSET_TYPE_ICONS: Record<string, typeof Server> = {
  fire: Server,
  aspirator: Wind,
  gas_suppression: Flame,
  room_integrity: Box,
  fire_curtain: PanelTop,
  disabled_refuge: Accessibility,
  emergency_lighting: Lightbulb,
  intruder_alarm: ShieldAlert,
  nurse_call: Phone,
};

const visitEditSchema = z.object({
  visit_date: z.string().min(1, "Visit date is required"),
  visit_type: z.string().min(1, "Visit type is required"),
  status: z.string().min(1, "Status is required"),
  notes: z.string().max(2000).optional(),
});

type VisitEditFormData = z.infer<typeof visitEditSchema>;

const VISIT_TYPES = [
  { value: "quarterly_service", label: "Quarterly Service" },
  { value: "biannual_service", label: "6-Monthly Service" },
  { value: "annual_inspection", label: "Annual Inspection" },
  { value: "emergency", label: "Emergency Callout" },
  { value: "remedial", label: "Remedial Works" },
  { value: "supply_only", label: "Supply Only" },
];

const STATUSES = [
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "pending_review", label: "Pending Review" },
  { value: "invoiced", label: "Invoiced" },
];

interface VisitEditDialogProps {
  visit: Visit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface UploadedFile {
  id: string;
  file_name: string;
  file_type: string;
  created_at: string;
}

const VisitEditDialog = ({
  visit,
  open,
  onOpenChange,
  onSuccess,
}: VisitEditDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [siteAssets, setSiteAssets] = useState<SiteAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const { toast } = useToast();

  const form = useForm<VisitEditFormData>({
    resolver: zodResolver(visitEditSchema),
    defaultValues: {
      visit_date: visit.visit_date,
      visit_type: visit.visit_type,
      status: visit.status || "in_progress",
      notes: visit.notes || "",
    },
  });

  // Reset form and fetch assets when visit changes
  useEffect(() => {
    if (open && visit) {
      form.reset({
        visit_date: visit.visit_date,
        visit_type: visit.visit_type,
        status: visit.status || "in_progress",
        notes: visit.notes || "",
      });
      fetchUploadedFiles();
      fetchSiteAssets();
    }
  }, [open, visit, form]);

  const fetchSiteAssets = async () => {
    setLoadingAssets(true);
    try {
      const { data, error } = await supabase
        .from("site_assets")
        .select("id, asset_type, item_name, manufacturer, model, location, zones_count, loops_count")
        .eq("site_id", visit.site_id)
        .order("asset_type", { ascending: true })
        .order("item_name", { ascending: true });

      if (error) throw error;
      setSiteAssets(data || []);
    } catch (error) {
      console.error("Error fetching site assets:", error);
    } finally {
      setLoadingAssets(false);
    }
  };

  const groupedAssets = siteAssets.reduce((acc, asset) => {
    if (!acc[asset.asset_type]) acc[asset.asset_type] = [];
    acc[asset.asset_type].push(asset);
    return acc;
  }, {} as Record<string, SiteAsset[]>);

  const getAssetTypeLabel = (type: string) => {
    return SERVICE_TYPES.find((t) => t.value === type)?.label || type;
  };

  const fetchUploadedFiles = async () => {
    setLoadingFiles(true);
    try {
      const { data, error } = await supabase
        .from("file_uploads")
        .select("id, file_name, file_type, created_at")
        .eq("visit_id", visit.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setUploadedFiles(data || []);
    } catch (error) {
      console.error("Error fetching files:", error);
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        // Create file upload record
        const { error } = await supabase.from("file_uploads").insert({
          file_name: file.name,
          file_type: file.type || "application/octet-stream",
          file_size: file.size,
          site_id: visit.site_id,
          visit_id: visit.id,
        });

        if (error) throw error;
      }

      toast({
        title: "Files uploaded",
        description: `${files.length} file(s) linked to this visit`,
      });

      fetchUploadedFiles();
    } catch (error) {
      console.error("Error uploading files:", error);
      toast({
        title: "Upload failed",
        description: "Failed to upload files. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      // Reset the input
      event.target.value = "";
    }
  };

  const onSubmit = async (data: VisitEditFormData) => {
    setLoading(true);

    try {
      const { error } = await supabase
        .from("visits")
        .update({
          visit_date: data.visit_date,
          visit_type: data.visit_type,
          status: data.status,
          notes: data.notes || null,
        })
        .eq("id", visit.id);

      if (error) throw error;

      // Update corresponding appointment in the schedule
      const visitTypeLabel = VISIT_TYPES.find(t => t.value === data.visit_type)?.label || data.visit_type;
      const appointmentStatus = data.status === "completed" ? "completed" : 
                               data.status === "in_progress" ? "in_progress" : "scheduled";

      try {
        // Find and update the appointment linked to this visit
        const { data: existingApt } = await supabase
          .from("appointments")
          .select("id")
          .eq("visit_id", visit.id)
          .single();

        if (existingApt) {
          await supabase
            .from("appointments")
            .update({
              appointment_date: data.visit_date,
              visit_type: data.visit_type,
              status: appointmentStatus,
              title: `${visitTypeLabel} - ${visit.site?.name || "Site Visit"}`,
            })
            .eq("id", existingApt.id);
          
          // Send update notification email
          sendAppointmentUpdatedNotification(existingApt.id).catch(console.error);
        } else {
          // Create appointment if it doesn't exist (for legacy visits)
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.id) {
            await supabase.from("appointments").insert({
              visit_id: visit.id,
              site_id: visit.site_id,
              customer_id: null,
              engineer_id: visit.engineer_id || user.id,
              title: `${visitTypeLabel} - ${visit.site?.name || "Site Visit"}`,
              appointment_date: data.visit_date,
              start_time: "09:00:00",
              end_time: "17:00:00",
              status: appointmentStatus,
              visit_type: data.visit_type,
              created_by: user.id,
            });
          }
        }
      } catch (aptError) {
        console.error("Error updating appointment:", aptError);
        // Don't fail the visit update if appointment update fails
      }

      toast({
        title: "Visit updated",
        description: "The visit and schedule have been updated.",
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error("Error updating visit:", error);
      toast({
        title: "Error",
        description: "Failed to update visit. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-primary" />
            Edit Visit
          </DialogTitle>
          <DialogDescription>
            Update visit details for {visit.site?.name || "this site"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="visit_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Visit Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {VISIT_TYPES.map((type) => (
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

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {STATUSES.map((status) => (
                          <SelectItem key={status.value} value={status.value}>
                            {status.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add any notes about this visit..."
                      className="resize-none"
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Site Assets Section */}
            <div className="space-y-3 pt-2 border-t">
              <FormLabel className="text-base">Site Assets</FormLabel>
              {loadingAssets ? (
                <div className="flex items-center gap-2 py-4 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading assets...
                </div>
              ) : siteAssets.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No assets registered for this site
                </p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(groupedAssets).map(([type, assets]) => {
                    const Icon = ASSET_TYPE_ICONS[type] || Server;
                    return (
                      <div key={type}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            {getAssetTypeLabel(type)}
                          </span>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                            {assets.length}
                          </Badge>
                        </div>
                        <div className="space-y-1">
                          {assets.map((asset) => (
                            <div
                              key={asset.id}
                              className="flex items-center gap-3 p-2 rounded-lg bg-muted/30 border text-sm"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-foreground truncate">{asset.item_name}</p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  {asset.manufacturer && <span>{asset.manufacturer}</span>}
                                  {asset.model && <span>{asset.model}</span>}
                                  {asset.location && <span>📍 {asset.location}</span>}
                                  {asset.zones_count && <span>{asset.zones_count} zones</span>}
                                  {asset.loops_count && <span>{asset.loops_count} loops</span>}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* File Uploads Section */}
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <FormLabel className="text-base">Attached Files</FormLabel>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={uploading}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploading}
                    asChild
                  >
                    <span>
                      {uploading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4 mr-2" />
                      )}
                      Upload Files
                    </span>
                  </Button>
                </label>
              </div>

              {loadingFiles ? (
                <div className="flex items-center gap-2 py-4 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading files...
                </div>
              ) : uploadedFiles.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No files attached to this visit
                </p>
              ) : (
                <div className="space-y-2">
                  {uploadedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 border"
                    >
                      <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(file.created_at), "MMM d, yyyy HH:mm")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" variant="hero" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default VisitEditDialog;