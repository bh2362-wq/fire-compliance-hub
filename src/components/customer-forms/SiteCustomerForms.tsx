import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Plus, Edit, Trash2, ClipboardCheck, Download, Eye } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import {
  FormTemplate,
  FormSubmission,
  getFormTemplates,
  getFormSubmissions,
  seedChurchesFireTemplates,
  deleteFormSubmission,
} from "@/services/customerFormService";
import FormFillerDialog from "@/components/customer-forms/FormFillerDialog";
import { downloadCustomerFormPdf } from "@/lib/customerFormPdfGenerator";
import { toast } from "sonner";
import { format } from "date-fns";

interface SiteCustomerFormsProps {
  siteId: string;
  customerId?: string;
}

export default function SiteCustomerForms({ siteId, customerId }: SiteCustomerFormsProps) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<FormTemplate | null>(null);
  const [editSubmission, setEditSubmission] = useState<FormSubmission | null>(null);
  const [fillerOpen, setFillerOpen] = useState(false);
  const [viewMode, setViewMode] = useState(false);
  const [newFormTemplate, setNewFormTemplate] = useState("");

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const tmpl = await seedChurchesFireTemplates(user.id);
      setTemplates(tmpl);

      const allSubs = await getFormSubmissions();
      // Filter to this site
      setSubmissions(allSubs.filter((s) => s.site_id === siteId));
    } catch (err) {
      console.error("Error loading forms:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user, siteId]);

  const handleNewForm = () => {
    const template = templates.find((t) => t.id === newFormTemplate);
    if (!template) {
      toast.error("Please select a form template");
      return;
    }
    setSelectedTemplate(template);
    setEditSubmission(null);
    setViewMode(false);
    setFillerOpen(true);
  };

  const handleEdit = (sub: FormSubmission) => {
    const template = templates.find((t) => t.id === sub.template_id);
    if (!template) return;
    setSelectedTemplate(template);
    setEditSubmission(sub);
    setFillerOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteFormSubmission(id);
      toast.success("Form deleted");
      loadData();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleDownload = (sub: FormSubmission) => {
    const template = templates.find((t) => t.id === sub.template_id);
    if (!template) return;
    downloadCustomerFormPdf({
      template,
      formData: sub.form_data as Record<string, unknown>,
      signatures: sub.signatures as Record<string, string>,
      completedDate: sub.completed_at ? format(new Date(sub.completed_at), "dd-MM-yyyy") : undefined,
    });
    toast.success("PDF downloaded");
  };

  const handleView = (sub: FormSubmission) => {
    const template = templates.find((t) => t.id === sub.template_id);
    if (!template) return;
    setSelectedTemplate(template);
    setEditSubmission(sub);
    setViewMode(true);
    setFillerOpen(true);
  };

  if (loading) return <div className="text-sm text-muted-foreground py-4">Loading forms...</div>;

  return (
    <div className="space-y-4">
      {/* New form selector */}
      <div className="flex items-center gap-2">
        <Select value={newFormTemplate} onValueChange={setNewFormTemplate}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select a form template..." />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name} ({t.form_code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={handleNewForm} disabled={!newFormTemplate}>
          <Plus className="h-4 w-4 mr-1" />
          Fill In Form
        </Button>
      </div>

      {/* Submissions list */}
      {submissions.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <ClipboardCheck className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No forms filled in for this site yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {submissions.map((sub) => {
            const template = templates.find((t) => t.id === sub.template_id);
            return (
              <Card key={sub.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">{template?.name || "Unknown Form"}</p>
                      <p className="text-xs text-muted-foreground">
                        {template?.form_code} &middot; {format(new Date(sub.created_at), "dd MMM yyyy HH:mm")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={sub.status === "completed" ? "default" : "secondary"}>
                      {sub.status === "completed" ? "Completed" : "Draft"}
                    </Badge>
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(sub)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(sub.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selectedTemplate && (
        <FormFillerDialog
          open={fillerOpen}
          onOpenChange={setFillerOpen}
          template={selectedTemplate}
          existingData={editSubmission ? {
            id: editSubmission.id,
            form_data: editSubmission.form_data,
            signatures: editSubmission.signatures,
            status: editSubmission.status,
          } : undefined}
          siteId={siteId}
          customerId={customerId}
          onSaved={loadData}
        />
      )}
    </div>
  );
}
