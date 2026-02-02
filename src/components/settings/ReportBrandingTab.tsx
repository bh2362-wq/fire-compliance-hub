import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { FileText, Save, Loader2, Upload, Image } from "lucide-react";
import { CompanySettings } from "@/services/companySettingsService";

const formSchema = z.object({
  company_logo_url: z.string().optional(),
  report_logo_url: z.string().optional(),
  report_footer_text: z.string().optional(),
  default_engineer_signature: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface ReportBrandingTabProps {
  settings: CompanySettings | null;
  onSave: (data: Partial<CompanySettings>) => Promise<void>;
  isSaving: boolean;
}

export function ReportBrandingTab({ settings, onSave, isSaving }: ReportBrandingTabProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      company_logo_url: settings?.company_logo_url || "",
      report_logo_url: settings?.report_logo_url || "",
      report_footer_text: settings?.report_footer_text || "",
      default_engineer_signature: settings?.default_engineer_signature || "",
    },
  });

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
                      <FormLabel>Company Logo URL</FormLabel>
                      <FormControl>
                        <div className="space-y-2">
                          <Input placeholder="https://example.com/logo.png" {...field} />
                          {field.value && (
                            <div className="border rounded-lg p-4 bg-muted/50">
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
                        Used in the app header and general branding
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
                      <FormLabel>Report/PDF Logo URL</FormLabel>
                      <FormControl>
                        <div className="space-y-2">
                          <Input placeholder="https://example.com/report-logo.png" {...field} />
                          {field.value && (
                            <div className="border rounded-lg p-4 bg-muted/50">
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
                        Appears on PDF reports and service sheets
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
