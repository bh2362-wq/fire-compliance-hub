import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, MoreHorizontal, Trash2, Eye, Edit, FileCheck, BookOpen, Shield, Flame, Lightbulb, Camera, AlertTriangle, Unlock } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  getRamsTemplates,
  getRamsDocuments,
  deleteRamsTemplate,
  deleteRamsDocument,
  unlockRamsDocument,
  RamsTemplate,
  RamsDocument,
} from "@/services/ramsService";
import { getRamsActivities, RamsActivity } from "@/services/ramsActivityService";
import { RamsTemplateDialog } from "@/components/rams/RamsTemplateDialog";
import { RamsDocumentDialog } from "@/components/rams/RamsDocumentDialog";
import { RamsPreviewDialog } from "@/components/rams/RamsPreviewDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

const statusColors: Record<string, string> = {
  draft: "bg-gray-500",
  pending_approval: "bg-yellow-500",
  approved: "bg-green-500",
  sent: "bg-blue-500",
  accepted: "bg-emerald-600",
  superseded: "bg-orange-500",
  archived: "bg-slate-400",
};

export default function RAMS() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("documents");
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<RamsTemplate | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<RamsDocument | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ type: "template" | "document"; id: string } | null>(null);
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [docToUnlock, setDocToUnlock] = useState<RamsDocument | null>(null);

  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ["rams-templates"],
    queryFn: getRamsTemplates,
  });

  const { data: documents = [], isLoading: documentsLoading } = useQuery({
    queryKey: ["rams-documents"],
    queryFn: getRamsDocuments,
  });

  const { data: activities = [] } = useQuery({
    queryKey: ["rams-activities"],
    queryFn: getRamsActivities,
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: deleteRamsTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rams-templates"] });
      toast.success("Template deleted");
    },
    onError: () => toast.error("Failed to delete template"),
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: deleteRamsDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rams-documents"] });
      toast.success("RAMS document deleted");
    },
    onError: () => toast.error("Failed to delete document"),
  });

  const unlockDocumentMutation = useMutation({
    mutationFn: unlockRamsDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rams-documents"] });
      toast.success("RAMS unlocked and reverted to draft. Previous acceptance link is now invalid.");
      setUnlockDialogOpen(false);
      setDocToUnlock(null);
    },
    onError: (e: Error) => toast.error(e.message || "Failed to unlock RAMS"),
  });

  const handleDelete = () => {
    if (!itemToDelete) return;
    if (itemToDelete.type === "template") {
      deleteTemplateMutation.mutate(itemToDelete.id);
    } else {
      deleteDocumentMutation.mutate(itemToDelete.id);
    }
    setDeleteDialogOpen(false);
    setItemToDelete(null);
  };

  const handleCreateFromTemplate = (template: RamsTemplate) => {
    setSelectedTemplate(template);
    setSelectedDocument(null);
    setDocumentDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">RAMS</h1>
            <p className="text-muted-foreground">
              Risk Assessments and Method Statements
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="library">Activity Library</TabsTrigger>
          </TabsList>

          <TabsContent value="documents" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => { setSelectedDocument(null); setSelectedTemplate(null); setDocumentDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                New RAMS
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>RAMS Documents</CardTitle>
              </CardHeader>
              <CardContent>
                {documentsLoading ? (
                  <p className="text-muted-foreground">Loading...</p>
                ) : documents.length === 0 ? (
                  <p className="text-muted-foreground">No RAMS documents yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Number</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Site</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>Review Date</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {documents.map((doc) => (
                        <TableRow key={doc.id}>
                          <TableCell className="font-mono">{doc.rams_number}</TableCell>
                          <TableCell className="font-medium">{doc.title}</TableCell>
                          <TableCell>{doc.site?.name || "-"}</TableCell>
                          <TableCell>
                            <Badge className={statusColors[doc.status] || "bg-gray-500"}>
                              {doc.status.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell>v{doc.version}</TableCell>
                          <TableCell>
                            {doc.review_date ? format(new Date(doc.review_date), "dd/MM/yyyy") : "-"}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => { setSelectedDocument(doc); setPreviewDialogOpen(true); }}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  View / PDF
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setSelectedDocument(doc); setSelectedTemplate(null); setDocumentDialogOpen(true); }}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                {(doc.status === "sent" || doc.status === "accepted") && (
                                  <DropdownMenuItem onClick={() => { setDocToUnlock(doc); setUnlockDialogOpen(true); }}>
                                    <Unlock className="h-4 w-4 mr-2" />
                                    Unlock & Revert to Draft
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => { setItemToDelete({ type: "document", id: doc.id }); setDeleteDialogOpen(true); }}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="templates" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => { setSelectedTemplate(null); setTemplateDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                New Template
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>RAMS Templates</CardTitle>
              </CardHeader>
              <CardContent>
                {templatesLoading ? (
                  <p className="text-muted-foreground">Loading...</p>
                ) : templates.length === 0 ? (
                  <p className="text-muted-foreground">No templates yet. Create one to get started.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Service Type</TableHead>
                        <TableHead>Hazards</TableHead>
                        <TableHead>Method Steps</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {templates.map((template) => (
                        <TableRow key={template.id}>
                          <TableCell className="font-medium">{template.name}</TableCell>
                          <TableCell>{template.service_type || "-"}</TableCell>
                          <TableCell>{(Array.isArray(template.hazards) ? template.hazards : []).length}</TableCell>
                          <TableCell>{(Array.isArray(template.method_statements) ? template.method_statements : []).length}</TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleCreateFromTemplate(template)}>
                                  <FileCheck className="h-4 w-4 mr-2" />
                                  Create RAMS from Template
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setSelectedTemplate(template); setTemplateDialogOpen(true); }}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => { setItemToDelete({ type: "template", id: template.id }); setDeleteDialogOpen(true); }}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="library" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Pre-Built Activity Library
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Industry-standard hazard assessments and method statements for fire &amp; security activities. These auto-populate when creating new RAMS documents.
                </p>
              </CardHeader>
              <CardContent>
                {activities.length === 0 ? (
                  <p className="text-muted-foreground">No activities in library</p>
                ) : (
                  <div className="space-y-3">
                    {activities.map((activity) => {
                      const categoryIcon = activity.category === "Fire Detection" ? <Flame className="w-4 h-4 text-destructive" />
                        : activity.category === "Emergency Lighting" ? <Lightbulb className="w-4 h-4 text-yellow-500" />
                        : activity.category === "Fire Suppression" ? <AlertTriangle className="w-4 h-4 text-orange-500" />
                        : <Camera className="w-4 h-4 text-primary" />;
                      return (
                        <div key={activity.id} className="border rounded-lg p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              {categoryIcon}
                              <div>
                                <h4 className="font-medium text-sm">{activity.activity_name}</h4>
                                <div className="flex items-center gap-2 mt-1">
                                  {activity.british_standard && (
                                    <Badge variant="outline" className="text-xs">{activity.british_standard}</Badge>
                                  )}
                                  <Badge variant="secondary" className="text-xs">{activity.category}</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">{activity.description}</p>
                              </div>
                            </div>
                            <div className="text-right text-xs text-muted-foreground flex-shrink-0">
                              <p>{activity.hazards.length} hazards</p>
                              <p>{activity.method_statements.length} method steps</p>
                              <p>{activity.ppe_requirements.length} PPE items</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <RamsTemplateDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        template={selectedTemplate}
      />

      <RamsDocumentDialog
        open={documentDialogOpen}
        onOpenChange={setDocumentDialogOpen}
        document={selectedDocument}
        templateToUse={selectedTemplate}
      />

      <RamsPreviewDialog
        open={previewDialogOpen}
        onOpenChange={setPreviewDialogOpen}
        document={selectedDocument}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Delete</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this {itemToDelete?.type}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
