import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, FileText, ClipboardCheck, Settings, FileCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  ServiceReport,
  BS5839Checklist,
  getDefaultChecklist,
  getServiceReport,
  createServiceReport,
  updateServiceReport,
  SYSTEM_TYPES,
} from "@/services/serviceReportService";
import { ServiceReportChecklist } from "./ServiceReportChecklist";

interface VisitForReport {
  id: string;
  visit_type: string;
  visit_date: string;
  site_id: string;
  sites?: { name: string } | null;
}

interface ServiceReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visit: VisitForReport;
  onSuccess?: () => void;
}

export function ServiceReportDialog({
  open,
  onOpenChange,
  visit,
  onSuccess,
}: ServiceReportDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState<ServiceReport | null>(null);
  const [activeTab, setActiveTab] = useState("details");

  // Form state
  const [engineerName, setEngineerName] = useState("");
  const [clientName, setClientName] = useState("");
  const [panelManufacturer, setPanelManufacturer] = useState("");
  const [panelModel, setPanelModel] = useState("");
  const [panelLocation, setPanelLocation] = useState("");
  const [systemType, setSystemType] = useState("");
  const [zonesCount, setZonesCount] = useState<number | "">("");
  const [devicesCount, setDevicesCount] = useState<number | "">("");
  const [checklist, setChecklist] = useState<BS5839Checklist>(getDefaultChecklist());
  const [systemCondition, setSystemCondition] = useState("");
  const [defectsFound, setDefectsFound] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [workCarriedOut, setWorkCarriedOut] = useState("");
  const [partsUsed, setPartsUsed] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open && user) {
      loadReport();
    }
  }, [open, user, visit.id]);

  const loadReport = async () => {
    if (!user) return;
    setLoading(true);

    try {
      let existingReport = await getServiceReport(visit.id);

      if (!existingReport) {
        existingReport = await createServiceReport(visit.id, visit.site_id, user.id, {
          engineer_name: user.user_metadata?.full_name || "",
        });
      }

      setReport(existingReport);
      populateForm(existingReport);
    } catch (error) {
      console.error("Failed to load report:", error);
      toast.error("Failed to load service report");
    } finally {
      setLoading(false);
    }
  };

  const populateForm = (r: ServiceReport) => {
    setEngineerName(r.engineer_name || "");
    setClientName(r.client_name || "");
    setPanelManufacturer(r.panel_manufacturer || "");
    setPanelModel(r.panel_model || "");
    setPanelLocation(r.panel_location || "");
    setSystemType(r.system_type || "");
    setZonesCount(r.zones_count || "");
    setDevicesCount(r.devices_count || "");
    setChecklist(r.checklist || getDefaultChecklist());
    setSystemCondition(r.system_condition || "");
    setDefectsFound(r.defects_found || "");
    setRecommendations(r.recommendations || "");
    setWorkCarriedOut(r.work_carried_out || "");
    setPartsUsed(r.parts_used || "");
    setNotes(r.notes || "");
  };

  const handleSave = async (complete = false) => {
    if (!report) return;

    setSaving(true);
    try {
      await updateServiceReport(report.id, {
        engineer_name: engineerName,
        client_name: clientName,
        panel_manufacturer: panelManufacturer,
        panel_model: panelModel,
        panel_location: panelLocation,
        system_type: systemType,
        zones_count: zonesCount === "" ? null : zonesCount,
        devices_count: devicesCount === "" ? null : devicesCount,
        checklist,
        system_condition: systemCondition,
        defects_found: defectsFound,
        recommendations,
        work_carried_out: workCarriedOut,
        parts_used: partsUsed,
        notes,
        status: complete ? "completed" : "draft",
      });

      toast.success(complete ? "Service report completed" : "Service report saved");
      if (complete) {
        onOpenChange(false);
        onSuccess?.();
      }
    } catch (error) {
      console.error("Failed to save report:", error);
      toast.error("Failed to save service report");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            BS5839:2025 Service Report
          </DialogTitle>
          <DialogDescription>
            {visit.visit_type} at {visit.sites?.name} - {visit.visit_date}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="details" className="flex items-center gap-1">
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">System Details</span>
            </TabsTrigger>
            <TabsTrigger value="checklist" className="flex items-center gap-1">
              <ClipboardCheck className="w-4 h-4" />
              <span className="hidden sm:inline">Checklist</span>
            </TabsTrigger>
            <TabsTrigger value="summary" className="flex items-center gap-1">
              <FileCheck className="w-4 h-4" />
              <span className="hidden sm:inline">Summary</span>
            </TabsTrigger>
            <TabsTrigger value="notes" className="flex items-center gap-1">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Notes</span>
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto py-4">
            <TabsContent value="details" className="mt-0 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Engineer Name</Label>
                  <Input
                    value={engineerName}
                    onChange={(e) => setEngineerName(e.target.value)}
                    placeholder="Engineer name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Client Representative</Label>
                  <Input
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Client name"
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">System Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Panel Manufacturer</Label>
                    <Input
                      value={panelManufacturer}
                      onChange={(e) => setPanelManufacturer(e.target.value)}
                      placeholder="e.g., Kentec, Advanced, Morley"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Panel Model</Label>
                    <Input
                      value={panelModel}
                      onChange={(e) => setPanelModel(e.target.value)}
                      placeholder="Panel model/type"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Panel Location</Label>
                    <Input
                      value={panelLocation}
                      onChange={(e) => setPanelLocation(e.target.value)}
                      placeholder="e.g., Main Reception"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>System Category</Label>
                    <Select value={systemType} onValueChange={setSystemType}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select system type" />
                      </SelectTrigger>
                      <SelectContent>
                        {SYSTEM_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Number of Zones</Label>
                    <Input
                      type="number"
                      value={zonesCount}
                      onChange={(e) => setZonesCount(e.target.value ? parseInt(e.target.value) : "")}
                      placeholder="Zones"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Number of Devices</Label>
                    <Input
                      type="number"
                      value={devicesCount}
                      onChange={(e) => setDevicesCount(e.target.value ? parseInt(e.target.value) : "")}
                      placeholder="Total devices"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="checklist" className="mt-0">
              <ServiceReportChecklist
                checklist={checklist}
                onChange={setChecklist}
              />
            </TabsContent>

            <TabsContent value="summary" className="mt-0 space-y-4">
              <div className="space-y-2">
                <Label>System Condition</Label>
                <Select value={systemCondition} onValueChange={setSystemCondition}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select overall condition" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="satisfactory">Satisfactory</SelectItem>
                    <SelectItem value="requires_attention">Requires Attention</SelectItem>
                    <SelectItem value="unsatisfactory">Unsatisfactory</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Defects Found</Label>
                <Textarea
                  value={defectsFound}
                  onChange={(e) => setDefectsFound(e.target.value)}
                  placeholder="List any defects or faults identified..."
                  className="min-h-[100px]"
                />
              </div>

              <div className="space-y-2">
                <Label>Recommendations</Label>
                <Textarea
                  value={recommendations}
                  onChange={(e) => setRecommendations(e.target.value)}
                  placeholder="Recommended actions or improvements..."
                  className="min-h-[100px]"
                />
              </div>
            </TabsContent>

            <TabsContent value="notes" className="mt-0 space-y-4">
              <div className="space-y-2">
                <Label>Work Carried Out</Label>
                <Textarea
                  value={workCarriedOut}
                  onChange={(e) => setWorkCarriedOut(e.target.value)}
                  placeholder="Describe work performed during this visit..."
                  className="min-h-[100px]"
                />
              </div>

              <div className="space-y-2">
                <Label>Parts Used</Label>
                <Textarea
                  value={partsUsed}
                  onChange={(e) => setPartsUsed(e.target.value)}
                  placeholder="List any parts or materials used..."
                  className="min-h-[80px]"
                />
              </div>

              <div className="space-y-2">
                <Label>Additional Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any other observations or comments..."
                  className="min-h-[100px]"
                />
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Draft
          </Button>
          <Button variant="hero" onClick={() => handleSave(true)} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Complete Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
