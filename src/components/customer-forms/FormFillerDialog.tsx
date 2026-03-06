import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { SignaturePad } from "@/components/ui/signature-pad";
import { FormTemplate, FormFieldDefinition, createFormSubmission, updateFormSubmission } from "@/services/customerFormService";
import { downloadCustomerFormPdf } from "@/lib/customerFormPdfGenerator";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, CheckCircle, FileText, Download } from "lucide-react";

interface FormFillerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: FormTemplate;
  existingData?: {
    id: string;
    form_data: Record<string, unknown>;
    signatures: Record<string, string>;
    status: string;
  };
  siteId?: string;
  visitId?: string;
  customerId?: string;
  readOnly?: boolean;
  onSaved?: () => void;
}

export default function FormFillerDialog({
  open,
  onOpenChange,
  template,
  existingData,
  siteId: propSiteId,
  visitId: propVisitId,
  customerId: propCustomerId,
  readOnly = false,
  onSaved,
}: FormFillerDialogProps) {
  const { user } = useAuth();
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [signatures, setSignatures] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [activePage, setActivePage] = useState("1");

  // Site/Visit selectors (only when not pre-filled)
  const [selectedSiteId, setSelectedSiteId] = useState(propSiteId || "");
  const [selectedVisitId, setSelectedVisitId] = useState(propVisitId || "");
  const [selectedCustomerId, setSelectedCustomerId] = useState(propCustomerId || "");
  const [sites, setSites] = useState<{ id: string; name: string; customer_id: string | null }[]>([]);
  const [visits, setVisits] = useState<{ id: string; visit_type: string; scheduled_date: string }[]>([]);
  const showSelectors = !propSiteId;

  useEffect(() => {
    if (existingData) {
      setFormData(existingData.form_data || {});
      setSignatures(existingData.signatures || {});
    } else {
      setFormData({});
      setSignatures({});
    }
    setSelectedSiteId(propSiteId || "");
    setSelectedVisitId(propVisitId || "");
    setSelectedCustomerId(propCustomerId || "");
  }, [existingData, open, propSiteId, propVisitId, propCustomerId]);

  // Load sites for selector
  useEffect(() => {
    if (!showSelectors || !open) return;
    supabase.from("sites").select("id, name, customer_id").order("name").then(({ data }) => {
      setSites(data || []);
    });
  }, [showSelectors, open]);

  // Load visits when site is selected
  useEffect(() => {
    if (!selectedSiteId) { setVisits([]); return; }
    supabase.from("visits").select("id, visit_type, visit_date")
      .eq("site_id", selectedSiteId)
      .order("visit_date", { ascending: false })
      .limit(20)
      .then(({ data }) => setVisits((data || []).map(v => ({ id: v.id, visit_type: v.visit_type, scheduled_date: v.visit_date }))));

    // Auto-set customer from site
    const site = sites.find(s => s.id === selectedSiteId);
    if (site?.customer_id) setSelectedCustomerId(site.customer_id);
  }, [selectedSiteId]);

  const siteId = propSiteId || selectedSiteId;
  const visitId = propVisitId || selectedVisitId;
  const customerId = propCustomerId || selectedCustomerId;

  const updateField = (fieldId: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
  };

  const updateTableCell = (fieldId: string, row: number, col: number, value: string) => {
    const tableData = (formData[fieldId] as string[][] || []);
    const newTable = [...tableData];
    if (!newTable[row]) newTable[row] = [];
    newTable[row][col] = value;
    setFormData((prev) => ({ ...prev, [fieldId]: newTable }));
  };

  const handleSave = async (complete: boolean = false) => {
    if (!user) return;
    if (showSelectors && !siteId) {
      toast.error("Please select a site");
      return;
    }
    setSaving(true);
    try {
      if (existingData?.id) {
        await updateFormSubmission(existingData.id, {
          form_data: formData,
          signatures,
          status: complete ? "completed" : "draft",
          ...(complete ? { completed_at: new Date().toISOString(), completed_by: user.id } : {}),
        });
      } else {
        await createFormSubmission({
          template_id: template.id,
          site_id: siteId || undefined,
          visit_id: visitId || undefined,
          customer_id: customerId || undefined,
          form_data: formData,
          signatures,
          status: complete ? "completed" : "draft",
          created_by: user.id,
        });
      }
      toast.success(complete ? "Form completed and saved" : "Form saved as draft");
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      console.error("Save error:", err);
      toast.error("Failed to save form");
    } finally {
      setSaving(false);
    }
  };

  // Group fields by section within each page
  const pages = Array.from({ length: template.page_count }, (_, i) => i + 1);
  const fieldsByPage = (page: number) => {
    const fields = (template.field_schema || []).filter((f) => f.page === page);
    const sections: Record<string, FormFieldDefinition[]> = {};
    fields.forEach((f) => {
      const section = f.section || "General";
      if (!sections[section]) sections[section] = [];
      sections[section].push(f);
    });
    return sections;
  };

  const renderField = (field: FormFieldDefinition) => {
    switch (field.type) {
      case "text":
        return (
          <div key={field.id} className="space-y-1">
            <Label htmlFor={field.id} className="text-sm">
              {field.label} {field.required && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id={field.id}
              value={(formData[field.id] as string) || ""}
              onChange={(e) => updateField(field.id, e.target.value)}
              placeholder={field.label}
              disabled={readOnly}
            />
          </div>
        );
      case "number":
        return (
          <div key={field.id} className="space-y-1">
            <Label htmlFor={field.id} className="text-sm">
              {field.label} {field.required && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id={field.id}
              type="number"
              value={(formData[field.id] as string) || ""}
              onChange={(e) => updateField(field.id, e.target.value)}
              placeholder={field.label}
              disabled={readOnly}
            />
          </div>
        );
      case "date":
        return (
          <div key={field.id} className="space-y-1">
            <Label htmlFor={field.id} className="text-sm">
              {field.label} {field.required && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id={field.id}
              type="date"
              value={(formData[field.id] as string) || ""}
              onChange={(e) => updateField(field.id, e.target.value)}
              disabled={readOnly}
            />
          </div>
        );
      case "textarea":
        return (
          <div key={field.id} className="space-y-1 col-span-full">
            <Label htmlFor={field.id} className="text-sm">
              {field.label} {field.required && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              id={field.id}
              value={(formData[field.id] as string) || ""}
              onChange={(e) => updateField(field.id, e.target.value)}
              placeholder={field.label}
              rows={3}
              disabled={readOnly}
            />
          </div>
        );
      case "checkbox":
        return (
          <div key={field.id} className="flex items-center gap-2 py-1">
            <Checkbox
              id={field.id}
              checked={!!formData[field.id]}
              onCheckedChange={(checked) => updateField(field.id, checked)}
              disabled={readOnly}
            />
            <Label htmlFor={field.id} className="text-sm cursor-pointer">
              {field.label}
            </Label>
          </div>
        );
      case "select":
        return (
          <div key={field.id} className="space-y-1">
            <Label htmlFor={field.id} className="text-sm">{field.label}</Label>
            <Select
              value={(formData[field.id] as string) || ""}
              onValueChange={(val) => updateField(field.id, val)}
              disabled={readOnly}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {(field.options || []).map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      case "signature":
        return (
          <div key={field.id} className="space-y-1 col-span-full">
            <Label className="text-sm">
              {field.label} {field.required && <span className="text-destructive">*</span>}
            </Label>
            {readOnly && signatures[field.id] ? (
              <img src={signatures[field.id]} alt="Signature" className="border rounded h-20 bg-white" />
            ) : readOnly ? (
              <p className="text-sm text-muted-foreground">[Not signed]</p>
            ) : (
              <SignaturePad
                onChange={(sig) => setSignatures((prev) => ({ ...prev, [field.id]: sig }))}
                value={signatures[field.id]}
              />
            )}
          </div>
        );
      case "table":
        const tableData = (formData[field.id] as string[][]) || [];
        const cols = field.tableColumns || [];
        const rows = field.tableRows || 5;
        return (
          <div key={field.id} className="space-y-2 col-span-full">
            <Label className="text-sm font-medium">{field.label}</Label>
            <div className="overflow-x-auto border rounded-md">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="p-1 text-left font-medium w-8">#</th>
                    {cols.map((col, ci) => (
                      <th key={ci} className="p-1 text-left font-medium min-w-[80px]">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: rows }, (_, ri) => (
                    <tr key={ri} className="border-t">
                      <td className="p-1 text-muted-foreground">{ri + 1}</td>
                      {cols.map((_, ci) => (
                        <td key={ci} className="p-0">
                          <Input
                            className="h-7 text-xs border-0 rounded-none focus:ring-1 focus:ring-inset"
                            value={tableData[ri]?.[ci] || ""}
                            onChange={(e) => updateTableCell(field.id, ri, ci, e.target.value)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {template.name}
            <span className="text-sm text-muted-foreground font-normal">({template.form_code})</span>
          </DialogTitle>
        </DialogHeader>

        {/* Site/Visit Selectors */}
        {showSelectors && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-muted/30 rounded-lg border">
            <div className="space-y-1">
              <Label className="text-sm">Site <span className="text-destructive">*</span></Label>
              <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a site..." />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Visit (optional)</Label>
              <Select value={selectedVisitId} onValueChange={setSelectedVisitId} disabled={!selectedSiteId}>
                <SelectTrigger>
                  <SelectValue placeholder={selectedSiteId ? "Link to a visit..." : "Select site first"} />
                </SelectTrigger>
                <SelectContent>
                  {visits.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.visit_type} - {v.scheduled_date}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {template.page_count > 1 ? (
          <Tabs value={activePage} onValueChange={setActivePage}>
            <TabsList>
              {pages.map((p) => (
                <TabsTrigger key={p} value={String(p)}>Page {p}</TabsTrigger>
              ))}
            </TabsList>
            {pages.map((p) => (
              <TabsContent key={p} value={String(p)} className="space-y-4 mt-4">
                {Object.entries(fieldsByPage(p)).map(([section, fields]) => (
                  <CollapsibleSection key={section} title={section} defaultOpen>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {fields.map(renderField)}
                    </div>
                  </CollapsibleSection>
                ))}
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <div className="space-y-4">
            {Object.entries(fieldsByPage(1)).map(([section, fields]) => (
              <CollapsibleSection key={section} title={section} defaultOpen>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {fields.map(renderField)}
                </div>
              </CollapsibleSection>
            ))}
          </div>
        )}

        <div className="flex gap-2 justify-end pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}>
            <Save className="h-4 w-4 mr-1" />
            Save Draft
          </Button>
          <Button onClick={() => handleSave(true)} disabled={saving}>
            <CheckCircle className="h-4 w-4 mr-1" />
            Complete & Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
