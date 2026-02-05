 import { useState, useEffect } from "react";
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
 import { Textarea } from "@/components/ui/textarea";
 import { Switch } from "@/components/ui/switch";
 import { Badge } from "@/components/ui/badge";
 import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
 } from "@/components/ui/dialog";
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
 import { Plus, Edit2, Trash2, Mail, Star, Loader2 } from "lucide-react";
 import { toast } from "sonner";
 import { useAuth } from "@/contexts/AuthContext";
 import {
   EmailTemplate,
   EmailTemplateInput,
   getAllEmailTemplates,
   createEmailTemplate,
   updateEmailTemplate,
   deleteEmailTemplate,
 } from "@/services/emailTemplateService";
 
 const PLACEHOLDERS = [
   { key: "customer_name", description: "Customer/contact name" },
   { key: "site_name", description: "Site name" },
   { key: "report_number", description: "Report number (e.g., CERT-00123)" },
   { key: "report_date", description: "Date of the report" },
   { key: "company_name", description: "Your company name" },
 ];
 
 const DEFAULT_TEMPLATE: EmailTemplateInput = {
   name: "",
   subject_template: "Service Report {{report_number}} - {{site_name}}",
   greeting_template: "Dear {{customer_name}},",
   body_template: "Please find attached the service report for your records.\n\nIf you have any questions regarding this report, please don't hesitate to contact us.",
   signoff_template: "Kind regards,\n{{company_name}}",
   is_default: false,
   is_active: true,
 };
 
 export function EmailTemplatesTab() {
   const { user } = useAuth();
   const [templates, setTemplates] = useState<EmailTemplate[]>([]);
   const [loading, setLoading] = useState(true);
   const [dialogOpen, setDialogOpen] = useState(false);
   const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
   const [saving, setSaving] = useState(false);
   const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
   const [templateToDelete, setTemplateToDelete] = useState<EmailTemplate | null>(null);
   const [formData, setFormData] = useState<EmailTemplateInput>(DEFAULT_TEMPLATE);
 
   useEffect(() => {
     loadTemplates();
   }, []);
 
   const loadTemplates = async () => {
     try {
       const data = await getAllEmailTemplates();
       setTemplates(data);
     } catch (error) {
       console.error("Failed to load templates:", error);
       toast.error("Failed to load email templates");
     } finally {
       setLoading(false);
     }
   };
 
   const openCreateDialog = () => {
     setEditingTemplate(null);
     setFormData(DEFAULT_TEMPLATE);
     setDialogOpen(true);
   };
 
   const openEditDialog = (template: EmailTemplate) => {
     setEditingTemplate(template);
     setFormData({
       name: template.name,
       subject_template: template.subject_template,
       greeting_template: template.greeting_template,
       body_template: template.body_template,
       signoff_template: template.signoff_template,
       is_default: template.is_default,
       is_active: template.is_active,
     });
     setDialogOpen(true);
   };
 
   const handleSave = async () => {
     if (!user) return;
     if (!formData.name.trim()) {
       toast.error("Template name is required");
       return;
     }
 
     setSaving(true);
     try {
       if (editingTemplate) {
         await updateEmailTemplate(editingTemplate.id, formData);
         toast.success("Template updated");
       } else {
         await createEmailTemplate(formData, user.id);
         toast.success("Template created");
       }
       setDialogOpen(false);
       loadTemplates();
     } catch (error) {
       console.error("Failed to save template:", error);
       toast.error("Failed to save template");
     } finally {
       setSaving(false);
     }
   };
 
   const handleDelete = async () => {
     if (!templateToDelete) return;
 
     try {
       await deleteEmailTemplate(templateToDelete.id);
       toast.success("Template deleted");
       setDeleteDialogOpen(false);
       setTemplateToDelete(null);
       loadTemplates();
     } catch (error) {
       console.error("Failed to delete template:", error);
       toast.error("Failed to delete template");
     }
   };
 
   const confirmDelete = (template: EmailTemplate) => {
     setTemplateToDelete(template);
     setDeleteDialogOpen(true);
   };
 
   if (loading) {
     return (
       <Card>
         <CardHeader>
           <CardTitle>Email Templates</CardTitle>
         </CardHeader>
         <CardContent className="flex items-center justify-center py-8">
           <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
         </CardContent>
       </Card>
     );
   }
 
   return (
     <>
       <Card>
         <CardHeader className="flex flex-row items-center justify-between">
           <div>
             <CardTitle>Email Templates</CardTitle>
             <CardDescription>
               Create and manage templates for report emails
             </CardDescription>
           </div>
           <Button onClick={openCreateDialog}>
             <Plus className="h-4 w-4 mr-2" />
             New Template
           </Button>
         </CardHeader>
         <CardContent>
           {templates.length === 0 ? (
             <div className="text-center py-8 text-muted-foreground">
               <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
               <p>No email templates yet</p>
               <p className="text-sm">Create your first template to get started</p>
             </div>
           ) : (
             <div className="space-y-3">
               {templates.map((template) => (
                 <div
                   key={template.id}
                   className="flex items-center justify-between p-4 border rounded-lg"
                 >
                   <div className="flex-1 min-w-0">
                     <div className="flex items-center gap-2">
                       <span className="font-medium truncate">{template.name}</span>
                       {template.is_default && (
                         <Badge variant="secondary" className="flex items-center gap-1">
                           <Star className="h-3 w-3" />
                           Default
                         </Badge>
                       )}
                       {!template.is_active && (
                         <Badge variant="outline">Inactive</Badge>
                       )}
                     </div>
                     <p className="text-sm text-muted-foreground truncate mt-1">
                       Subject: {template.subject_template}
                     </p>
                   </div>
                   <div className="flex items-center gap-2 ml-4">
                     <Button
                       variant="ghost"
                       size="icon"
                       onClick={() => openEditDialog(template)}
                     >
                       <Edit2 className="h-4 w-4" />
                     </Button>
                     <Button
                       variant="ghost"
                       size="icon"
                       onClick={() => confirmDelete(template)}
                     >
                       <Trash2 className="h-4 w-4 text-destructive" />
                     </Button>
                   </div>
                 </div>
               ))}
             </div>
           )}
         </CardContent>
       </Card>
 
       {/* Create/Edit Dialog */}
       <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
         <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
           <DialogHeader>
             <DialogTitle>
               {editingTemplate ? "Edit Template" : "Create Template"}
             </DialogTitle>
             <DialogDescription>
               Use placeholders like {"{{customer_name}}"} to personalize emails
             </DialogDescription>
           </DialogHeader>
 
           <div className="space-y-4 py-4">
             {/* Placeholders reference */}
             <div className="bg-muted/50 rounded-lg p-3">
               <p className="text-sm font-medium mb-2">Available Placeholders:</p>
               <div className="flex flex-wrap gap-2">
                 {PLACEHOLDERS.map((p) => (
                   <Badge key={p.key} variant="outline" className="text-xs">
                     {`{{${p.key}}}`}
                   </Badge>
                 ))}
               </div>
             </div>
 
             <div className="space-y-2">
               <Label htmlFor="name">Template Name *</Label>
               <Input
                 id="name"
                 value={formData.name}
                 onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                 placeholder="e.g., Standard Report Email"
               />
             </div>
 
             <div className="space-y-2">
               <Label htmlFor="subject">Subject Line</Label>
               <Input
                 id="subject"
                 value={formData.subject_template}
                 onChange={(e) => setFormData({ ...formData, subject_template: e.target.value })}
                 placeholder="Service Report {{report_number}} - {{site_name}}"
               />
             </div>
 
             <div className="space-y-2">
               <Label htmlFor="greeting">Greeting</Label>
               <Input
                 id="greeting"
                 value={formData.greeting_template}
                 onChange={(e) => setFormData({ ...formData, greeting_template: e.target.value })}
                 placeholder="Dear {{customer_name}},"
               />
             </div>
 
             <div className="space-y-2">
               <Label htmlFor="body">Email Body</Label>
               <Textarea
                 id="body"
                 value={formData.body_template}
                 onChange={(e) => setFormData({ ...formData, body_template: e.target.value })}
                 placeholder="Please find attached..."
                 rows={5}
               />
             </div>
 
             <div className="space-y-2">
               <Label htmlFor="signoff">Sign-off</Label>
               <Textarea
                 id="signoff"
                 value={formData.signoff_template}
                 onChange={(e) => setFormData({ ...formData, signoff_template: e.target.value })}
                 placeholder="Kind regards,&#10;{{company_name}}"
                 rows={2}
               />
             </div>
 
             <div className="flex items-center justify-between pt-2">
               <div className="flex items-center gap-2">
                 <Switch
                   id="is_default"
                   checked={formData.is_default}
                   onCheckedChange={(checked) =>
                     setFormData({ ...formData, is_default: checked })
                   }
                 />
                 <Label htmlFor="is_default">Set as default template</Label>
               </div>
               <div className="flex items-center gap-2">
                 <Switch
                   id="is_active"
                   checked={formData.is_active}
                   onCheckedChange={(checked) =>
                     setFormData({ ...formData, is_active: checked })
                   }
                 />
                 <Label htmlFor="is_active">Active</Label>
               </div>
             </div>
           </div>
 
           <DialogFooter>
             <Button variant="outline" onClick={() => setDialogOpen(false)}>
               Cancel
             </Button>
             <Button onClick={handleSave} disabled={saving}>
               {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
               {editingTemplate ? "Update" : "Create"}
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>
 
       {/* Delete Confirmation */}
       <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
         <AlertDialogContent>
           <AlertDialogHeader>
             <AlertDialogTitle>Delete Template</AlertDialogTitle>
             <AlertDialogDescription>
               Are you sure you want to delete "{templateToDelete?.name}"? This action
               cannot be undone.
             </AlertDialogDescription>
           </AlertDialogHeader>
           <AlertDialogFooter>
             <AlertDialogCancel>Cancel</AlertDialogCancel>
             <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
               Delete
             </AlertDialogAction>
           </AlertDialogFooter>
         </AlertDialogContent>
       </AlertDialog>
     </>
   );
 }