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
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Save, CheckCircle, FileText } from "lucide-react";

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
  onSaved?: () => void;
}

export default function FormFillerDialog({
  open,
  onOpenChange,
  template,
  existingData,
  siteId,
  visitId,
  customerId,
  onSaved,
}: FormFillerDialogProps) {
  const { user } = useAuth();
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [signatures, setSignatures] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [activePage, setActivePage] = useState("1");

  useEffect(() => {
    if (existingData) {
      setFormData(existingData.form_data || {});
      setSignatures(existingData.signatures || {});
    } else {
      setFormData({});
      setSignatures({});
    }
  }, [existingData, open]);

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
          site_id: siteId,
          visit_id: visitId,
          customer_id: customerId,
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
            <SignaturePad
              onSave={(sig) => setSignatures((prev) => ({ ...prev, [field.id]: sig }))}
              initialValue={signatures[field.id]}
            />
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
