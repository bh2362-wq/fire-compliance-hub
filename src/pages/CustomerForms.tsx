import { useState, useEffect } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Plus, ClipboardCheck, Trash2, Edit, Download } from "lucide-react";
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
import { toast } from "sonner";
import { format } from "date-fns";

export default function CustomerForms() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<FormTemplate | null>(null);
  const [editSubmission, setEditSubmission] = useState<FormSubmission | null>(null);
  const [fillerOpen, setFillerOpen] = useState(false);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Seed Churches Fire templates if not already present
      const tmpl = await seedChurchesFireTemplates(user.id);
      setTemplates(tmpl);
      const subs = await getFormSubmissions();
      setSubmissions(subs);
    } catch (err) {
      console.error("Error loading forms:", err);
      toast.error("Failed to load forms");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const handleNewSubmission = (template: FormTemplate) => {
    setSelectedTemplate(template);
    setEditSubmission(null);
    setFillerOpen(true);
  };

  const handleEditSubmission = (submission: FormSubmission) => {
    const template = templates.find((t) => t.id === submission.template_id);
    if (!template) return;
    setSelectedTemplate(template);
    setEditSubmission(submission);
    setFillerOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteFormSubmission(id);
      toast.success("Submission deleted");
      loadData();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Completed</Badge>;
      case "draft":
        return <Badge variant="secondary">Draft</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Customer Forms</h1>
            <p className="text-muted-foreground">Fill in official customer template forms</p>
          </div>
        </div>

        <Tabs defaultValue="templates">
          <TabsList>
            <TabsTrigger value="templates">
              <FileText className="h-4 w-4 mr-1" />
              Form Templates
            </TabsTrigger>
            <TabsTrigger value="submissions">
              <ClipboardCheck className="h-4 w-4 mr-1" />
              Filled Forms ({submissions.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="templates" className="mt-4">
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">Loading templates...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map((template) => (
                  <Card key={template.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">{template.name}</CardTitle>
                          <p className="text-xs text-muted-foreground mt-1">{template.form_code}</p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {template.page_count} {template.page_count === 1 ? "page" : "pages"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-4">{template.description}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {(template.field_schema || []).length} fields
                        </span>
                        <div className="flex gap-2">
                          {template.template_pdf_path && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(template.template_pdf_path!, "_blank")}
                            >
                              <Download className="h-3.5 w-3.5 mr-1" />
                              View PDF
                            </Button>
                          )}
                          <Button size="sm" onClick={() => handleNewSubmission(template)}>
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Fill In
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="submissions" className="mt-4">
            {submissions.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <ClipboardCheck className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No forms filled in yet. Select a template to get started.</p>
                </CardContent>
              </Card>
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
                              {sub.form_data?.address && ` · ${sub.form_data.address}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(sub.status)}
                          <Button variant="ghost" size="icon" onClick={() => handleEditSubmission(sub)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => handleDelete(sub.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

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
          onSaved={loadData}
        />
      )}
    </DashboardLayout>
  );
}
