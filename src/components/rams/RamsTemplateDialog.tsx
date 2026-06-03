import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  RamsTemplate,
  RamsHazard,
  MethodStatement,
  createRamsTemplate,
  updateRamsTemplate,
  DEFAULT_PPE_OPTIONS,
  DEFAULT_HAZARD_CATEGORIES,
  calculateRiskLevel,
} from "@/services/ramsService";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface RamsTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: RamsTemplate | null;
}

const emptyHazard: RamsHazard = {
  id: "",
  hazard: "",
  who_affected: "",
  existing_controls: "",
  likelihood: 1,
  severity: 1,
  risk_level: "Low",
  additional_controls: "",
  residual_likelihood: 1,
  residual_severity: 1,
  residual_risk: "Low",
};

const emptyMethod: MethodStatement = {
  step_number: 1,
  description: "",
  responsible_person: "",
  equipment_required: "",
};

export function RamsTemplateDialog({ open, onOpenChange, template }: RamsTemplateDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [hazards, setHazards] = useState<RamsHazard[]>([]);
  const [methodStatements, setMethodStatements] = useState<MethodStatement[]>([]);
  const [ppeRequirements, setPpeRequirements] = useState<string[]>([]);
  const [emergencyProcedures, setEmergencyProcedures] = useState("");
  const [siteSpecificHazards, setSiteSpecificHazards] = useState("");
  const [siteAccessNotes, setSiteAccessNotes] = useState("");

  useEffect(() => {
    if (open) {
      if (template) {
        setName(template.name);
        setDescription(template.description || "");
        setServiceType(template.service_type || "");
        setHazards(template.hazards.length > 0 ? template.hazards : [{ ...emptyHazard, id: crypto.randomUUID() }]);
        setMethodStatements(template.method_statements.length > 0 ? template.method_statements : [{ ...emptyMethod }]);
        setPpeRequirements(template.ppe_requirements);
        setEmergencyProcedures(template.emergency_procedures || "");
        setSiteSpecificHazards(template.site_specific_hazards || "");
        setSiteAccessNotes(template.site_access_notes || "");
      } else {
        setName("");
        setDescription("");
        setServiceType("");
        setHazards([{ ...emptyHazard, id: crypto.randomUUID() }]);
        setMethodStatements([{ ...emptyMethod }]);
        setPpeRequirements([]);
        setEmergencyProcedures("");
        setSiteSpecificHazards("");
        setSiteAccessNotes("");
      }
    }
  }, [open, template]);

  const createMutation = useMutation({
    mutationFn: createRamsTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rams-templates"] });
      toast.success("Template created");
      onOpenChange(false);
    },
    onError: () => toast.error("Failed to create template"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<RamsTemplate> }) =>
      updateRamsTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rams-templates"] });
      toast.success("Template updated");
      onOpenChange(false);
    },
    onError: () => toast.error("Failed to update template"),
  });

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!user?.id) return;

    const data = {
      name: name.trim(),
      description: description.trim() || null,
      service_type: serviceType.trim() || null,
      hazards,
      method_statements: methodStatements.map((m, i) => ({ ...m, step_number: i + 1 })),
      ppe_requirements: ppeRequirements,
      emergency_procedures: emergencyProcedures.trim() || null,
      site_specific_hazards: siteSpecificHazards.trim() || null,
      site_access_notes: siteAccessNotes.trim() || null,
      created_by: user.id,
    };

    if (template) {
      updateMutation.mutate({ id: template.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const addHazard = () => {
    setHazards([...hazards, { ...emptyHazard, id: crypto.randomUUID() }]);
  };

  const removeHazard = (index: number) => {
    setHazards(hazards.filter((_, i) => i !== index));
  };

  const updateHazard = (index: number, field: keyof RamsHazard, value: string | number) => {
    const updated = [...hazards];
    updated[index] = { ...updated[index], [field]: value };
    // Auto-calculate risk levels
    if (field === "likelihood" || field === "severity") {
      updated[index].risk_level = calculateRiskLevel(
        field === "likelihood" ? (value as number) : updated[index].likelihood,
        field === "severity" ? (value as number) : updated[index].severity
      );
    }
    if (field === "residual_likelihood" || field === "residual_severity") {
      updated[index].residual_risk = calculateRiskLevel(
        field === "residual_likelihood" ? (value as number) : updated[index].residual_likelihood,
        field === "residual_severity" ? (value as number) : updated[index].residual_severity
      );
    }
    setHazards(updated);
  };

  const addMethodStep = () => {
    setMethodStatements([...methodStatements, { ...emptyMethod, step_number: methodStatements.length + 1 }]);
  };

  const removeMethodStep = (index: number) => {
    setMethodStatements(methodStatements.filter((_, i) => i !== index));
  };

  const updateMethodStep = (index: number, field: keyof MethodStatement, value: string | number) => {
    const updated = [...methodStatements];
    updated[index] = { ...updated[index], [field]: value };
    setMethodStatements(updated);
  };

  const togglePpe = (item: string) => {
    if (ppeRequirements.includes(item)) {
      setPpeRequirements(ppeRequirements.filter((p) => p !== item));
    } else {
      setPpeRequirements([...ppeRequirements, item]);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90dvh]">
        <DialogHeader>
          <DialogTitle>{template ? "Edit Template" : "New RAMS Template"}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="hazards">Hazards</TabsTrigger>
            <TabsTrigger value="method">Method</TabsTrigger>
            <TabsTrigger value="ppe">PPE & Emergency</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[60vh] pr-4">
            <TabsContent value="details" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Template Name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Fire Alarm Service" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of this template..." />
              </div>
              <div className="space-y-2">
                <Label>Service Type</Label>
                <Input value={serviceType} onChange={(e) => setServiceType(e.target.value)} placeholder="e.g., Fire Alarm Service, Emergency Lighting" />
              </div>
            </TabsContent>

            <TabsContent value="hazards" className="space-y-4 mt-4">
              {hazards.map((hazard, index) => (
                <div key={hazard.id} className="border rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Hazard {index + 1}</h4>
                    {hazards.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => removeHazard(index)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Hazard Description</Label>
                      <Select
                        value={hazard.hazard}
                        onValueChange={(v) => updateHazard(index, "hazard", v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select or type hazard" />
                        </SelectTrigger>
                        <SelectContent>
                          {DEFAULT_HAZARD_CATEGORIES.map((cat) => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Who Might Be Affected</Label>
                      <Input value={hazard.who_affected} onChange={(e) => updateHazard(index, "who_affected", e.target.value)} placeholder="e.g., Engineers, Occupants" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Existing Control Measures</Label>
                    <Textarea value={hazard.existing_controls} onChange={(e) => updateHazard(index, "existing_controls", e.target.value)} />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Likelihood (1-5)</Label>
                      <Select value={String(hazard.likelihood)} onValueChange={(v) => updateHazard(index, "likelihood", parseInt(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Severity (1-5)</Label>
                      <Select value={String(hazard.severity)} onValueChange={(v) => updateHazard(index, "severity", parseInt(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Risk Level</Label>
                      <Input value={hazard.risk_level} readOnly className="bg-muted" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Additional Control Measures</Label>
                    <Textarea value={hazard.additional_controls} onChange={(e) => updateHazard(index, "additional_controls", e.target.value)} />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Residual Likelihood</Label>
                      <Select value={String(hazard.residual_likelihood)} onValueChange={(v) => updateHazard(index, "residual_likelihood", parseInt(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Residual Severity</Label>
                      <Select value={String(hazard.residual_severity)} onValueChange={(v) => updateHazard(index, "residual_severity", parseInt(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Residual Risk</Label>
                      <Input value={hazard.residual_risk} readOnly className="bg-muted" />
                    </div>
                  </div>
                </div>
              ))}
              <Button variant="outline" onClick={addHazard}>
                <Plus className="h-4 w-4 mr-2" />
                Add Hazard
              </Button>
            </TabsContent>

            <TabsContent value="method" className="space-y-4 mt-4">
              {methodStatements.map((step, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Step {index + 1}</h4>
                    {methodStatements.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => removeMethodStep(index)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea value={step.description} onChange={(e) => updateMethodStep(index, "description", e.target.value)} placeholder="Describe this step..." />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Responsible Person</Label>
                      <Input value={step.responsible_person} onChange={(e) => updateMethodStep(index, "responsible_person", e.target.value)} placeholder="e.g., Lead Engineer" />
                    </div>
                    <div className="space-y-2">
                      <Label>Equipment Required</Label>
                      <Input value={step.equipment_required} onChange={(e) => updateMethodStep(index, "equipment_required", e.target.value)} placeholder="e.g., Ladder, PPE" />
                    </div>
                  </div>
                </div>
              ))}
              <Button variant="outline" onClick={addMethodStep}>
                <Plus className="h-4 w-4 mr-2" />
                Add Step
              </Button>
            </TabsContent>

            <TabsContent value="ppe" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>PPE Requirements</Label>
                <div className="grid grid-cols-2 gap-2">
                  {DEFAULT_PPE_OPTIONS.map((item) => (
                    <div key={item} className="flex items-center space-x-2">
                      <Checkbox
                        checked={ppeRequirements.includes(item)}
                        onCheckedChange={() => togglePpe(item)}
                      />
                      <label className="text-sm">{item}</label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Emergency Procedures</Label>
                <Textarea
                  value={emergencyProcedures}
                  onChange={(e) => setEmergencyProcedures(e.target.value)}
                  placeholder="Describe emergency procedures..."
                  rows={6}
                />
              </div>
              <div className="space-y-2">
                <Label>Default Site-Specific Hazards</Label>
                <Textarea
                  value={siteSpecificHazards}
                  onChange={(e) => setSiteSpecificHazards(e.target.value)}
                  placeholder="Default site-specific hazards to pre-fill..."
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label>Default Site Access Notes</Label>
                <Textarea
                  value={siteAccessNotes}
                  onChange={(e) => setSiteAccessNotes(e.target.value)}
                  placeholder="Default site access notes to pre-fill..."
                  rows={4}
                />
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? "Saving..." : template ? "Update" : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
