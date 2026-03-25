import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { format, addMonths } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { SignaturePad } from "@/components/ui/signature-pad";
import {
  RamsDocument,
  RamsTemplate,
  RamsHazard,
  MethodStatement,
  createRamsDocument,
  updateRamsDocument,
  getRamsTemplates,
  DEFAULT_PPE_OPTIONS,
  DEFAULT_HAZARD_CATEGORIES,
  calculateRiskLevel,
} from "@/services/ramsService";
import { RamsActivity } from "@/services/ramsActivityService";
import { RamsActivitySelector } from "@/components/rams/RamsActivitySelector";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface RamsDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document?: RamsDocument | null;
  templateToUse?: RamsTemplate | null;
  preselectedSiteId?: string;
  onSuccess?: () => void;
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

export function RamsDocumentDialog({
  open,
  onOpenChange,
  document = null,
  templateToUse = null,
  preselectedSiteId,
  onSuccess,
}: RamsDocumentDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Form state
  const [title, setTitle] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [visitId, setVisitId] = useState<string | null>(null);
  const [contractId, setContractId] = useState<string | null>(null);
  const [hazards, setHazards] = useState<RamsHazard[]>([]);
  const [methodStatements, setMethodStatements] = useState<MethodStatement[]>([]);
  const [ppeRequirements, setPpeRequirements] = useState<string[]>([]);
  const [emergencyProcedures, setEmergencyProcedures] = useState("");
  const [siteSpecificHazards, setSiteSpecificHazards] = useState("");
  const [siteAccessNotes, setSiteAccessNotes] = useState("");
  const [status, setStatus] = useState("draft");
  const [reviewDate, setReviewDate] = useState("");
  const [preparerSignature, setPreparerSignature] = useState<string | null>(null);
  const [preparerName, setPreparerName] = useState("");
  const [reviewerSignature, setReviewerSignature] = useState<string | null>(null);
  const [reviewerName, setReviewerName] = useState("");
  const [clientSignature, setClientSignature] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [activityKey, setActivityKey] = useState<string | null>(null);

  // Fetch data
  const { data: sites = [] } = useQuery({
    queryKey: ["sites"],
    queryFn: async () => {
      const { data } = await supabase.from("sites").select("id, name").order("name");
      return data || [];
    },
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["rams-templates"],
    queryFn: getRamsTemplates,
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ["service-contracts", siteId],
    queryFn: async () => {
      if (!siteId) return [];
      const { data } = await supabase
        .from("site_service_contracts")
        .select("id, service_type")
        .eq("site_id", siteId);
      return data || [];
    },
    enabled: !!siteId,
  });

  // Initialize form
  useEffect(() => {
    if (open) {
      if (document) {
        setTitle(document.title);
        setTemplateId(document.template_id);
        setSiteId(document.site_id);
        setVisitId(document.visit_id);
        setContractId(document.contract_id);
        setHazards(document.hazards.length > 0 ? document.hazards : [{ ...emptyHazard, id: crypto.randomUUID() }]);
        setMethodStatements(document.method_statements.length > 0 ? document.method_statements : [{ ...emptyMethod }]);
        setPpeRequirements(document.ppe_requirements);
        setEmergencyProcedures(document.emergency_procedures || "");
        setSiteSpecificHazards(document.site_specific_hazards || "");
        setSiteAccessNotes(document.site_access_notes || "");
        setStatus(document.status);
        setReviewDate(document.review_date || "");
        setPreparerSignature(document.preparer_signature);
        setPreparerName((document as any).preparer_name || "");
        setReviewerSignature(document.reviewer_signature);
        setReviewerName((document as any).reviewer_name || "");
        setClientSignature(document.client_signature);
        setClientName(document.client_name || "");
      } else if (templateToUse) {
        setTitle(templateToUse.name);
        setTemplateId(templateToUse.id);
        setSiteId(preselectedSiteId || null);
        setVisitId(null);
        setContractId(null);
        setHazards(templateToUse.hazards.length > 0 ? templateToUse.hazards : [{ ...emptyHazard, id: crypto.randomUUID() }]);
        setMethodStatements(templateToUse.method_statements.length > 0 ? templateToUse.method_statements : [{ ...emptyMethod }]);
        setPpeRequirements(templateToUse.ppe_requirements);
        setEmergencyProcedures(templateToUse.emergency_procedures || "");
        setSiteSpecificHazards(templateToUse.site_specific_hazards || "");
        setSiteAccessNotes(templateToUse.site_access_notes || "");
        setStatus("draft");
        setReviewDate(format(addMonths(new Date(), 12), "yyyy-MM-dd"));
        setPreparerSignature(null);
        setPreparerName("");
        setReviewerSignature(null);
        setReviewerName("");
        setClientSignature(null);
        setClientName("");
      } else {
        setTitle("");
        setTemplateId(null);
        setSiteId(preselectedSiteId || null);
        setVisitId(null);
        setContractId(null);
        setHazards([{ ...emptyHazard, id: crypto.randomUUID() }]);
        setMethodStatements([{ ...emptyMethod }]);
        setPpeRequirements([]);
        setEmergencyProcedures("");
        setSiteSpecificHazards("");
        setSiteAccessNotes("");
        setStatus("draft");
        setReviewDate(format(addMonths(new Date(), 12), "yyyy-MM-dd"));
        setPreparerSignature(null);
        setPreparerName("");
        setReviewerSignature(null);
        setReviewerName("");
        setClientSignature(null);
        setClientName("");
      }
    }
  }, [open, document, templateToUse, preselectedSiteId]);

  // Load template when selected
  const handleTemplateChange = (id: string) => {
    setTemplateId(id);
    const template = templates.find((t) => t.id === id);
    if (template) {
      setHazards(template.hazards.length > 0 ? template.hazards : [{ ...emptyHazard, id: crypto.randomUUID() }]);
      setMethodStatements(template.method_statements.length > 0 ? template.method_statements : [{ ...emptyMethod }]);
      setPpeRequirements(template.ppe_requirements);
      setEmergencyProcedures(template.emergency_procedures || "");
      setSiteSpecificHazards(template.site_specific_hazards || "");
      setSiteAccessNotes(template.site_access_notes || "");
      if (!title) setTitle(template.name);
    }
  };

  const createMutation = useMutation({
    mutationFn: createRamsDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rams-documents"] });
      toast.success("RAMS document created");
      onOpenChange(false);
      onSuccess?.();
    },
    onError: () => toast.error("Failed to create document"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<RamsDocument> }) =>
      updateRamsDocument(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rams-documents"] });
      toast.success("RAMS document updated");
      onOpenChange(false);
      onSuccess?.();
    },
    onError: () => toast.error("Failed to update document"),
  });

  const handleSubmit = () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!user?.id) return;

    const data = {
      title: title.trim(),
      template_id: templateId,
      site_id: siteId,
      visit_id: visitId,
      contract_id: contractId,
      hazards,
      method_statements: methodStatements.map((m, i) => ({ ...m, step_number: i + 1 })),
      ppe_requirements: ppeRequirements,
      emergency_procedures: emergencyProcedures.trim() || null,
      site_specific_hazards: siteSpecificHazards.trim() || null,
      site_access_notes: siteAccessNotes.trim() || null,
      status,
      review_date: reviewDate || null,
      preparer_signature: preparerSignature,
      preparer_signed_at: preparerSignature ? new Date().toISOString() : null,
      preparer_name: preparerName.trim() || null,
      reviewer_signature: reviewerSignature,
      reviewer_signed_at: reviewerSignature ? new Date().toISOString() : null,
      reviewer_name: reviewerName.trim() || null,
      client_signature: clientSignature,
      client_signed_at: clientSignature ? new Date().toISOString() : null,
      client_name: clientName.trim() || null,
      created_by: user.id,
    };

    if (document) {
      updateMutation.mutate({ id: document.id, data });
    } else {
      createMutation.mutate(data as any);
    }
  };

  // Hazard management
  const addHazard = () => setHazards([...hazards, { ...emptyHazard, id: crypto.randomUUID() }]);
  const removeHazard = (index: number) => setHazards(hazards.filter((_, i) => i !== index));
  const updateHazard = (index: number, field: keyof RamsHazard, value: string | number) => {
    const updated = [...hazards];
    updated[index] = { ...updated[index], [field]: value };
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

  // Method statement management
  const addMethodStep = () => setMethodStatements([...methodStatements, { ...emptyMethod, step_number: methodStatements.length + 1 }]);
  const removeMethodStep = (index: number) => setMethodStatements(methodStatements.filter((_, i) => i !== index));
  const updateMethodStep = (index: number, field: keyof MethodStatement, value: string | number) => {
    const updated = [...methodStatements];
    updated[index] = { ...updated[index], [field]: value };
    setMethodStatements(updated);
  };

  const togglePpe = (item: string) => {
    setPpeRequirements(ppeRequirements.includes(item) ? ppeRequirements.filter((p) => p !== item) : [...ppeRequirements, item]);
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{document ? `Edit ${document.rams_number}` : "New RAMS Document"}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue={document ? "details" : "activity"} className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="hazards">Hazards</TabsTrigger>
            <TabsTrigger value="method">Method</TabsTrigger>
            <TabsTrigger value="ppe">PPE</TabsTrigger>
            <TabsTrigger value="signatures">Signatures</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[55vh] pr-4">
            <TabsContent value="activity" className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Select an activity type to auto-populate hazards, method statements, and PPE requirements from our industry-standard library.
              </p>
              <RamsActivitySelector
                selectedKey={activityKey}
                onSelect={(activity: RamsActivity) => {
                  setActivityKey(activity.activity_key);
                  setHazards(activity.hazards.length > 0 ? activity.hazards : [{ ...emptyHazard, id: crypto.randomUUID() }]);
                  setMethodStatements(activity.method_statements.length > 0 ? activity.method_statements : [{ ...emptyMethod }]);
                  setPpeRequirements(activity.ppe_requirements);
                  setEmergencyProcedures(activity.emergency_procedures || "");
                  setSiteSpecificHazards(activity.default_site_hazards || "");
                  if (!title) setTitle(activity.activity_name);
                }}
              />
            </TabsContent>

            <TabsContent value="details" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Title *</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="RAMS title" />
                </div>
                <div className="space-y-2">
                  <Label>Template</Label>
                  <Select value={templateId || ""} onValueChange={handleTemplateChange}>
                    <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Site</Label>
                  <Select value={siteId || ""} onValueChange={(v) => { setSiteId(v); setContractId(null); }}>
                    <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                    <SelectContent>
                      {sites.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Service Contract</Label>
                  <Select value={contractId || ""} onValueChange={setContractId} disabled={!siteId}>
                    <SelectTrigger><SelectValue placeholder="Select contract" /></SelectTrigger>
                    <SelectContent>
                      {contracts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.service_type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="pending_approval">Pending Approval</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="superseded">Superseded</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Review Date</Label>
                  <Input type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Site-Specific Hazards</Label>
                <Textarea value={siteSpecificHazards} onChange={(e) => setSiteSpecificHazards(e.target.value)} placeholder="Any hazards specific to this site..." />
              </div>
              <div className="space-y-2">
                <Label>Site Access Notes</Label>
                <Textarea value={siteAccessNotes} onChange={(e) => setSiteAccessNotes(e.target.value)} placeholder="Access requirements, parking, contacts..." />
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
                      <Label>Hazard</Label>
                      <Select value={hazard.hazard} onValueChange={(v) => updateHazard(index, "hazard", v)}>
                        <SelectTrigger><SelectValue placeholder="Select hazard" /></SelectTrigger>
                        <SelectContent>
                          {DEFAULT_HAZARD_CATEGORIES.map((cat) => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Who Affected</Label>
                      <Input value={hazard.who_affected} onChange={(e) => updateHazard(index, "who_affected", e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Existing Controls</Label>
                    <Textarea value={hazard.existing_controls} onChange={(e) => updateHazard(index, "existing_controls", e.target.value)} />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Likelihood</Label>
                      <Select value={String(hazard.likelihood)} onValueChange={(v) => updateHazard(index, "likelihood", parseInt(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Severity</Label>
                      <Select value={String(hazard.severity)} onValueChange={(v) => updateHazard(index, "severity", parseInt(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Risk Level</Label>
                      <Input value={hazard.risk_level} readOnly className="bg-muted" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Additional Controls</Label>
                    <Textarea value={hazard.additional_controls} onChange={(e) => updateHazard(index, "additional_controls", e.target.value)} />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Residual Likelihood</Label>
                      <Select value={String(hazard.residual_likelihood)} onValueChange={(v) => updateHazard(index, "residual_likelihood", parseInt(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Residual Severity</Label>
                      <Select value={String(hazard.residual_severity)} onValueChange={(v) => updateHazard(index, "residual_severity", parseInt(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
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
                <Plus className="h-4 w-4 mr-2" />Add Hazard
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
                    <Textarea value={step.description} onChange={(e) => updateMethodStep(index, "description", e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Responsible Person</Label>
                      <Input value={step.responsible_person} onChange={(e) => updateMethodStep(index, "responsible_person", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Equipment Required</Label>
                      <Input value={step.equipment_required} onChange={(e) => updateMethodStep(index, "equipment_required", e.target.value)} />
                    </div>
                  </div>
                </div>
              ))}
              <Button variant="outline" onClick={addMethodStep}>
                <Plus className="h-4 w-4 mr-2" />Add Step
              </Button>
            </TabsContent>

            <TabsContent value="ppe" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>PPE Requirements</Label>
                <div className="grid grid-cols-2 gap-2">
                  {DEFAULT_PPE_OPTIONS.map((item) => (
                    <div key={item} className="flex items-center space-x-2">
                      <Checkbox checked={ppeRequirements.includes(item)} onCheckedChange={() => togglePpe(item)} />
                      <label className="text-sm">{item}</label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Emergency Procedures</Label>
                <Textarea value={emergencyProcedures} onChange={(e) => setEmergencyProcedures(e.target.value)} rows={6} />
              </div>
            </TabsContent>

            <TabsContent value="signatures" className="space-y-6 mt-4">
              <div className="space-y-2">
                <Label>Preparer Signature</Label>
                <SignaturePad value={preparerSignature || ""} onChange={setPreparerSignature} />
                <Input value={preparerName} onChange={(e) => setPreparerName(e.target.value)} placeholder="Preparer name" className="mt-2" />
              </div>
              <div className="space-y-2">
                <Label>Reviewer Signature</Label>
                <SignaturePad value={reviewerSignature || ""} onChange={setReviewerSignature} />
                <Input value={reviewerName} onChange={(e) => setReviewerName(e.target.value)} placeholder="Reviewer name" className="mt-2" />
              </div>
              <div className="space-y-2">
                <Label>Client Signature</Label>
                <SignaturePad value={clientSignature || ""} onChange={setClientSignature} />
                <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client name" className="mt-2" />
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? "Saving..." : document ? "Update" : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
