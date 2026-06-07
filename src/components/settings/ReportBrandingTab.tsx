 import { useState, useRef } from "react";
 import { useForm } from "react-hook-form";
 import { zodResolver } from "@hookform/resolvers/zod";
 import * as z from "zod";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Textarea } from "@/components/ui/textarea";
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
 import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
 import { FileText, Save, Loader2, Upload, X } from "lucide-react";
 import { CompanySettings } from "@/services/companySettingsService";
 import { supabase } from "@/integrations/supabase/client";
 import { toast } from "sonner";
 
 const formSchema = z.object({
   company_logo_url: z.string().optional(),
   report_logo_url: z.string().optional(),
   report_footer_text: z.string().optional(),
   default_engineer_signature: z.string().optional(),
   // Director signing fields — pre-fill the AUTHORISATION block on
   // every QMS document PDF (qmsDocumentPdfGenerator.ts).
   director_name: z.string().optional(),
   director_role: z.string().optional(),
   director_signature_url: z.string().optional(),
 });
 
 type FormValues = z.infer<typeof formSchema>;
 
 interface ReportBrandingTabProps {
   settings: CompanySettings | null;
   onSave: (data: Partial<CompanySettings>) => Promise<void>;
   isSaving: boolean;
 }
 
 export function ReportBrandingTab({ settings, onSave, isSaving }: ReportBrandingTabProps) {
   const [uploadingCompanyLogo, setUploadingCompanyLogo] = useState(false);
   const [uploadingReportLogo, setUploadingReportLogo] = useState(false);
   const companyLogoInputRef = useRef<HTMLInputElement>(null);
   const reportLogoInputRef = useRef<HTMLInputElement>(null);
 
   const form = useForm<FormValues>({
     resolver: zodResolver(formSchema),
     defaultValues: {
       company_logo_url: settings?.company_logo_url || "",
       report_logo_url: settings?.report_logo_url || "",
       report_footer_text: settings?.report_footer_text || "",
       default_engineer_signature: settings?.default_engineer_signature || "",
       director_name: settings?.director_name || "",
       director_role: settings?.director_role || "",
       director_signature_url: settings?.director_signature_url || "",
     },
   });
 
   const uploadLogo = async (
     file: File,
     type: "company" | "report",
     setUploading: (v: boolean) => void
   ) => {
     setUploading(true);
     try {
       const fileExt = file.name.split(".").pop();
       const fileName = `${type}-logo-${Date.now()}.${fileExt}`;
       const filePath = `logos/${fileName}`;
 
       const { error: uploadError } = await supabase.storage
         .from("company-assets")
         .upload(filePath, file, { upsert: true });
 
       if (uploadError) throw uploadError;
 
       const { data: { publicUrl } } = supabase.storage
         .from("company-assets")
         .getPublicUrl(filePath);
 
       const fieldName = type === "company" ? "company_logo_url" : "report_logo_url";
       form.setValue(fieldName, publicUrl);
       toast.success("Logo uploaded successfully");
     } catch (error: any) {
       console.error("Upload error:", error);
       toast.error("Failed to upload logo: " + error.message);
     } finally {
       setUploading(false);
     }
   };
 
   const handleFileChange = (
     e: React.ChangeEvent<HTMLInputElement>,
     type: "company" | "report",
     setUploading: (v: boolean) => void
   ) => {
     const file = e.target.files?.[0];
     if (file) {
       if (!file.type.startsWith("image/")) {
         toast.error("Please upload an image file");
         return;
       }
       if (file.size > 5 * 1024 * 1024) {
         toast.error("File size must be less than 5MB");
         return;
       }
       uploadLogo(file, type, setUploading);
     }
   };
 
   const clearLogo = (type: "company" | "report") => {
     const fieldName = type === "company" ? "company_logo_url" : "report_logo_url";
     form.setValue(fieldName, "");
   };
 
   const handleSubmit = async (data: FormValues) => {
     await onSave(data);
   };
 
   return (
     <Card>
       <CardHeader>
         <CardTitle className="flex items-center gap-2">
           <FileText className="h-5 w-5" />
           Report Branding
         </CardTitle>
         <CardDescription>
           Customize how your reports and PDFs look with your company branding
         </CardDescription>
       </CardHeader>
       <CardContent>
         <Form {...form}>
           <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
             <div className="grid gap-6 md:grid-cols-2">
               {/* Company Logo */}
               <div className="space-y-4">
                 <FormField
                   control={form.control}
                   name="company_logo_url"
                   render={({ field }) => (
                     <FormItem>
                       <FormLabel>Company Logo</FormLabel>
                       <FormControl>
                         <div className="space-y-3">
                           <div className="flex gap-2">
                             <Input 
                               placeholder="https://example.com/logo.png" 
                               {...field} 
                               className="flex-1"
                             />
                             <input
                               type="file"
                               ref={companyLogoInputRef}
                               className="hidden"
                               accept="image/*"
                               onChange={(e) => handleFileChange(e, "company", setUploadingCompanyLogo)}
                             />
                             <Button
                               type="button"
                               variant="outline"
                               size="icon"
                               disabled={uploadingCompanyLogo}
                               onClick={() => companyLogoInputRef.current?.click()}
                               title="Upload logo"
                             >
                               {uploadingCompanyLogo ? (
                                 <Loader2 className="h-4 w-4 animate-spin" />
                               ) : (
                                 <Upload className="h-4 w-4" />
                               )}
                             </Button>
                           </div>
                           {field.value && (
                             <div className="border rounded-lg p-4 bg-muted/50 relative">
                               <Button
                                 type="button"
                                 variant="ghost"
                                 size="icon"
                                 className="absolute top-1 right-1 h-6 w-6"
                                 onClick={() => clearLogo("company")}
                               >
                                 <X className="h-4 w-4" />
                               </Button>
                               <img 
                                 src={field.value} 
                                 alt="Company logo preview" 
                                 className="max-h-20 object-contain"
                                 onError={(e) => {
                                   (e.target as HTMLImageElement).style.display = 'none';
                                 }}
                               />
                             </div>
                           )}
                         </div>
                       </FormControl>
                       <FormDescription>
                         Upload or paste URL for app header branding
                       </FormDescription>
                       <FormMessage />
                     </FormItem>
                   )}
                 />
               </div>
 
               {/* Report Logo */}
               <div className="space-y-4">
                 <FormField
                   control={form.control}
                   name="report_logo_url"
                   render={({ field }) => (
                     <FormItem>
                       <FormLabel>Report/PDF Logo</FormLabel>
                       <FormControl>
                         <div className="space-y-3">
                           <div className="flex gap-2">
                             <Input 
                               placeholder="https://example.com/report-logo.png" 
                               {...field}
                               className="flex-1"
                             />
                             <input
                               type="file"
                               ref={reportLogoInputRef}
                               className="hidden"
                               accept="image/*"
                               onChange={(e) => handleFileChange(e, "report", setUploadingReportLogo)}
                             />
                             <Button
                               type="button"
                               variant="outline"
                               size="icon"
                               disabled={uploadingReportLogo}
                               onClick={() => reportLogoInputRef.current?.click()}
                               title="Upload logo"
                             >
                               {uploadingReportLogo ? (
                                 <Loader2 className="h-4 w-4 animate-spin" />
                               ) : (
                                 <Upload className="h-4 w-4" />
                               )}
                             </Button>
                           </div>
                           {field.value && (
                             <div className="border rounded-lg p-4 bg-muted/50 relative">
                               <Button
                                 type="button"
                                 variant="ghost"
                                 size="icon"
                                 className="absolute top-1 right-1 h-6 w-6"
                                 onClick={() => clearLogo("report")}
                               >
                                 <X className="h-4 w-4" />
                               </Button>
                               <img 
                                 src={field.value} 
                                 alt="Report logo preview" 
                                 className="max-h-20 object-contain"
                                 onError={(e) => {
                                   (e.target as HTMLImageElement).style.display = 'none';
                                 }}
                               />
                             </div>
                           )}
                         </div>
                       </FormControl>
                       <FormDescription>
                         Upload or paste URL for PDFs, reports, and emails
                       </FormDescription>
                       <FormMessage />
                     </FormItem>
                   )}
                 />
               </div>
             </div>
 
             <FormField
               control={form.control}
               name="report_footer_text"
               render={({ field }) => (
                 <FormItem>
                   <FormLabel>Report Footer Text</FormLabel>
                   <FormControl>
                     <Textarea 
                       placeholder="Company registered in England & Wales. Reg No: 12345678. VAT No: GB123456789"
                       className="min-h-[80px]"
                       {...field} 
                     />
                   </FormControl>
                   <FormDescription>
                     Text that appears at the bottom of every PDF report
                   </FormDescription>
                   <FormMessage />
                 </FormItem>
               )}
             />
 
             <FormField
               control={form.control}
               name="default_engineer_signature"
               render={({ field }) => (
                 <FormItem>
                   <FormLabel>Default Engineer Signature Name</FormLabel>
                   <FormControl>
                     <Input placeholder="John Smith - Lead Engineer" {...field} />
                   </FormControl>
                   <FormDescription>
                     Default name to use for engineer signatures on reports
                   </FormDescription>
                   <FormMessage />
                 </FormItem>
               )}
             />
 
             {/* Director signing details — pre-filled into the
                 AUTHORISATION block on every QMS document PDF. Without
                 these the block renders blank lines and auditors see
                 unsigned policies / procedures. */}
             <div className="rounded-md border border-border p-4 space-y-3 bg-muted/30">
               <div>
                 <h4 className="text-sm font-semibold">Director signing (QMS documents)</h4>
                 <p className="text-xs text-muted-foreground">
                   Populates the AUTHORISATION block at the bottom of every generated
                   QMS PDF, so every policy / procedure / work instruction is signed
                   off consistently.
                 </p>
               </div>

               <FormField
                 control={form.control}
                 name="director_name"
                 render={({ field }) => (
                   <FormItem>
                     <FormLabel>Director name</FormLabel>
                     <FormControl>
                       <Input placeholder="Ben Holden" {...field} />
                     </FormControl>
                     <FormMessage />
                   </FormItem>
                 )}
               />

               <FormField
                 control={form.control}
                 name="director_role"
                 render={({ field }) => (
                   <FormItem>
                     <FormLabel>Director role</FormLabel>
                     <FormControl>
                       <Input placeholder="Managing Director" {...field} />
                     </FormControl>
                     <FormMessage />
                   </FormItem>
                 )}
               />

               <FormField
                 control={form.control}
                 name="director_signature_url"
                 render={({ field }) => (
                   <FormItem>
                     <FormLabel>Director signature image URL or data URL</FormLabel>
                     <FormControl>
                       <Input
                         placeholder="data:image/png;base64,…  or  https://…/signature.png"
                         {...field}
                       />
                     </FormControl>
                     <FormDescription>
                       Paste a base64 data URL (PNG / JPEG) or a hosted image URL.
                       Embedded at the top of the AUTHORISATION block. Cap is
                       50×18 mm — a tightly-cropped image looks best.
                     </FormDescription>
                     <FormMessage />
                   </FormItem>
                 )}
               />
             </div>

             <div className="flex justify-end">
               <Button type="submit" disabled={isSaving}>
                 {isSaving ? (
                   <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                 ) : (
                   <Save className="mr-2 h-4 w-4" />
                 )}
                 Save Changes
               </Button>
             </div>
           </form>
         </Form>
       </CardContent>
     </Card>
   );
 }
