import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { Label } from "@/components/ui/label";
import { Loader2, Pencil, Upload, FileText, X, Server, Wind, Flame, Box, PanelTop, Accessibility, Lightbulb, ShieldAlert, Phone, Plus, Trash2, Package, Wrench, Cpu, HelpCircle, Check } from "lucide-react";
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
  notes: z.string().max(10000).optional(),
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

interface Requirement {
  id: string;
  visit_id: string;
  category: string;
  item_name: string;
  quantity: number;
  notes: string | null;
  is_confirmed: boolean;
  created_at: string;
}

const REQ_CATEGORIES = [
  { value: "materials", label: "Materials", icon: Package, color: "bg-primary/10 text-primary border-primary/20" },
  { value: "tools", label: "Tools", icon: Wrench, color: "bg-warning/10 text-warning border-warning/20" },
  { value: "equipment", label: "Special Equipment", icon: Cpu, color: "bg-accent/10 text-accent border-accent/20" },
  { value: "other", label: "Other", icon: HelpCircle, color: "bg-muted text-muted-foreground border-border" },
];

/**
 * Parse visit notes — they may be a JSON string with {asset_type, user_notes}
 * or plain text. Returns the human-readable notes portion.
 */
function parseVisitNotes(raw: string | null | undefined): { assetType: string; userNotes: string } {
  if (!raw) return { assetType: "general", userNotes: "" };
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      return {
        assetType: parsed.asset_type || "general",
        userNotes: parsed.user_notes || "",
      };
    }
  } catch {
    // Not JSON — treat as plain text
  }
  return { assetType: "general", userNotes: raw };
}

function buildVisitNotes(assetType: string, userNotes: string): string | null {
  const trimmed = userNotes.trim();
  if (!trimmed && assetType === "general") return null;
  const obj: Record<string, unknown> = { asset_type: assetType };
  if (trimmed) obj.user_notes = trimmed;
  return JSON.stringify(obj);
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
  const [storedAssetType, setStoredAssetType] = useState("general");
  
  // Requirements state
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loadingReqs, setLoadingReqs] = useState(false);
  const [savingReq, setSavingReq] = useState(false);
  const [newReqCategory, setNewReqCategory] = useState("materials");
  const [newReqName, setNewReqName] = useState("");
  const [newReqQty, setNewReqQty] = useState("1");
  const [newReqNotes, setNewReqNotes] = useState("");
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { assetType: initialAssetType, userNotes: initialUserNotes } = parseVisitNotes(visit.notes);

  const form = useForm<VisitEditFormData>({
    resolver: zodResolver(visitEditSchema),
    defaultValues: {
      visit_date: visit.visit_date,
      visit_type: visit.visit_type,
      status: visit.status || "in_progress",
      notes: initialUserNotes,
    },
  });

  // Reset form and fetch data when visit changes
  useEffect(() => {
    if (open && visit) {
      const { assetType, userNotes } = parseVisitNotes(visit.notes);
      setStoredAssetType(assetType);
      form.reset({
        visit_date: visit.visit_date,
        visit_type: visit.visit_type,
        status: visit.status || "in_progress",
        notes: userNotes,
      });
      fetchUploadedFiles();
      fetchSiteAssets();
      fetchRequirements();
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

  const fetchRequirements = async () => {
    setLoadingReqs(true);
    try {
      const { data, error } = await supabase
        .from("visit_requirements")
        .select("*")
        .eq("visit_id", visit.id)
        .order("category")
        .order("created_at");
      if (!error && data) setRequirements(data as Requirement[]);
    } catch (err) {
      console.error("Error fetching requirements:", err);
    } finally {
      setLoadingReqs(false);
    }
  };

  const handleAddRequirement = async () => {
    if (!newReqName.trim()) return;
    setSavingReq(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavingReq(false); return; }
    const { error } = await supabase.from("visit_requirements").insert({
      visit_id: visit.id,
      category: newReqCategory,
      item_name: newReqName.trim(),
      quantity: parseInt(newReqQty) || 1,
      notes: newReqNotes.trim() || null,
      created_by: user.id,
    });
    if (error) {
      toast({ title: "Error", description: "Failed to add requirement", variant: "destructive" });
    } else {
      setNewReqName("");
      setNewReqQty("1");
      setNewReqNotes("");
      fetchRequirements();
    }
    setSavingReq(false);
  };

  const handleDeleteRequirement = async (id: string) => {
    const { error } = await supabase.from("visit_requirements").delete().eq("id", id);
    if (!error) setRequirements((prev) => prev.filter((r) => r.id !== id));
  };

  const handleToggleConfirm = async (id: string, current: boolean) => {
    const { error } = await supabase.from("visit_requirements").update({ is_confirmed: !current }).eq("id", id);
    if (!error) setRequirements((prev) => prev.map((r) => (r.id === id ? { ...r, is_confirmed: !current } : r)));
  };

  const getReqCategoryConfig = (cat: string) => REQ_CATEGORIES.find((c) => c.value === cat) || REQ_CATEGORIES[3];

  const onSubmit = async (data: VisitEditFormData) => {
    setLoading(true);

    try {
      const { error } = await supabase
        .from("visits")
        .update({
          visit_date: data.visit_date,
          visit_type: data.visit_type,
          status: data.status,
          notes: buildVisitNotes(storedAssetType, data.notes || ""),
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
      }

      // Invalidate appointments cache so calendar updates immediately
      await queryClient.invalidateQueries({ queryKey: ["appointments"] });

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

            {/* Job Requirements Section */}
            <div className="space-y-3 pt-2 border-t">
              <FormLabel className="text-base flex items-center gap-2">
                <Package className="w-4 h-4" />
                Job Requirements ({requirements.length})
              </FormLabel>

              {/* Add new requirement */}
              <div className="space-y-2 border border-border rounded-lg p-3 bg-muted/30">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Category</Label>
                    <Select value={newReqCategory} onValueChange={setNewReqCategory}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REQ_CATEGORIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Qty</Label>
                    <Input className="h-9" type="number" min="1" value={newReqQty} onChange={(e) => setNewReqQty(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Item Name</Label>
                  <Input className="h-9" placeholder="e.g. 10x Smoke Detectors" value={newReqName} onChange={(e) => setNewReqName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddRequirement())} />
                </div>
                <div>
                  <Label className="text-xs">Notes (optional)</Label>
                  <Textarea className="min-h-[40px]" placeholder="Any additional details..." value={newReqNotes} onChange={(e) => setNewReqNotes(e.target.value)} />
                </div>
                <Button type="button" onClick={handleAddRequirement} disabled={savingReq || !newReqName.trim()} size="sm" className="w-full">
                  {savingReq ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                  Add Requirement
                </Button>
              </div>

              {/* Requirements list */}
              {loadingReqs ? (
                <div className="text-sm text-muted-foreground text-center py-3">Loading...</div>
              ) : requirements.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-3 border border-dashed border-border rounded-lg">No requirements added</p>
              ) : (
                <div className="space-y-1.5">
                  {requirements.map((req) => {
                    const cat = getReqCategoryConfig(req.category);
                    const Icon = cat.icon;
                    return (
                      <div key={req.id} className={`flex items-center gap-2 p-2 rounded-lg border ${req.is_confirmed ? "bg-success/5 border-success/20" : "bg-card border-border"}`}>
                        <button type="button" onClick={() => handleToggleConfirm(req.id, req.is_confirmed)} className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${req.is_confirmed ? "bg-success border-success text-success-foreground" : "border-muted-foreground/30 hover:border-primary"}`}>
                          {req.is_confirmed && <Check className="w-3 h-3" />}
                        </button>
                        <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-sm ${req.is_confirmed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                              {req.quantity > 1 ? `${req.quantity}x ` : ""}{req.item_name}
                            </span>
                            <Badge variant="outline" className={`text-[10px] px-1 py-0 h-4 ${cat.color}`}>{cat.label}</Badge>
                          </div>
                          {req.notes && <p className="text-xs text-muted-foreground truncate">{req.notes}</p>}
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive/60 hover:text-destructive" onClick={() => handleDeleteRequirement(req.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    );
                  })}
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