import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
 import { Textarea } from "@/components/ui/textarea";
 import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
 } from "@/components/ui/select";
 import { Loader2, Mail, Send, X, Plus, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createEmailLog } from "@/services/emailLogService";
import { useAuth } from "@/contexts/AuthContext";
 import {
   EmailTemplate,
   getEmailTemplates,
   getDefaultTemplate,
   applyTemplate,
 } from "@/services/emailTemplateService";
import { rememberLastRecipients } from "@/services/emailMemoryService";
 import { getCompanySettings } from "@/services/companySettingsService";

interface EmailReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultEmail: string;
  defaultRecipients?: string; // Comma-separated list from customer.email_recipients
  customerName?: string;
  customerId?: string;
  siteId?: string;
  visitId?: string;
  reportId?: string;
  siteName: string;
  reportNumber: string;
  reportDate: string;
  companyName?: string;
  logoUrl?: string;
  // Human label for what's being sent. Defaults to "Service Report" but
  // smart-form callers pass e.g. "Installation Certificate" so the
  // subject/template fallbacks and edge-function payload match the
  // document. Lets the smart-forms callers reuse this dialog instead
  // of maintaining a parallel EmailSmartFormDialog.
  documentType?: string;
  generatePdfBase64: () => Promise<string>;
}

export function EmailReportDialog({
  open,
  onOpenChange,
  defaultEmail,
  defaultRecipients,
  customerName,
  customerId,
  siteId,
  visitId,
  reportId,
  siteName,
  reportNumber,
  reportDate,
  companyName,
  logoUrl,
  documentType = "Service Report",
  generatePdfBase64,
}: EmailReportDialogProps) {
  const { user } = useAuth();
  const [sending, setSending] = useState(false);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
   const [subject, setSubject] = useState("");
   const [emailBody, setEmailBody] = useState("");
   const [templates, setTemplates] = useState<EmailTemplate[]>([]);
   const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
   const [loadingTemplates, setLoadingTemplates] = useState(false);
   const [companyNameVal, setCompanyNameVal] = useState(companyName || "");

  // Parse recipients from defaultRecipients and defaultEmail
  const parseRecipients = () => {
    const emails: string[] = [];
    
    // Add default email if provided
    if (defaultEmail?.trim()) {
      emails.push(defaultEmail.trim());
    }
    
    // Add recipients from customer settings
    if (defaultRecipients?.trim()) {
      const additional = defaultRecipients
        .split(",")
        .map((e) => e.trim())
        .filter((e) => e && !emails.includes(e));
      emails.push(...additional);
    }
    
    return emails;
  };

  // Initialize recipients when dialog opens
  useEffect(() => {
    if (open) {
      setRecipients(parseRecipients());
      setNewEmail("");
       loadTemplatesAndDefaults();
    }
  }, [open, defaultEmail, defaultRecipients, reportNumber, siteName]);
 
   const loadTemplatesAndDefaults = async () => {
     setLoadingTemplates(true);
     try {
      const [templatesList, defaultTemplate, settings] = await Promise.all([
          getEmailTemplates("report"),
          getDefaultTemplate("report"),
          getCompanySettings().catch(() => null),
        ]);
       
       setTemplates(templatesList);
       const compName = settings?.company_name || companyName || "The Service Team";
       if (settings?.company_name) {
         setCompanyNameVal(settings.company_name);
       }
 
       // Apply default template if available, otherwise use fallback
       if (defaultTemplate) {
         setSelectedTemplateId(defaultTemplate.id);
         applySelectedTemplate(defaultTemplate, compName);
       } else if (templatesList.length > 0) {
         setSelectedTemplateId(templatesList[0].id);
         applySelectedTemplate(templatesList[0], compName);
       } else {
         // Fallback to hardcoded values
         setSubject(`${documentType} ${reportNumber} - ${siteName}`);
         setEmailBody(
           `Dear ${customerName || "Customer"},\n\nPlease find attached the service report for your records.\n\nIf you have any questions regarding this report, please don't hesitate to contact us.\n\nKind regards,\n${compName}`
         );
       }
     } catch (error) {
       console.error("Failed to load templates:", error);
       setSubject(`${documentType} ${reportNumber} - ${siteName}`);
       setEmailBody(
         `Dear ${customerName || "Customer"},\n\nPlease find attached the ${documentType.toLowerCase()} for your records.\n\nIf you have any questions regarding this document, please don't hesitate to contact us.\n\nKind regards,\n${companyName || "The Service Team"}`
       );
     } finally {
       setLoadingTemplates(false);
     }
   };
 
   const applySelectedTemplate = (template: EmailTemplate, compNameOverride?: string) => {
     const variables = {
       customer_name: customerName || "Customer",
       site_name: siteName,
       // Falls back to "Draft" rather than "" — applyTemplate leaves
       // {{key}} placeholders untouched when the value is falsy, so an
       // empty report_number on a draft report otherwise leaks the
       // literal "{{report_number}}" into the customer-facing subject.
       report_number: reportNumber || "Draft",
       report_date: reportDate,
       company_name: compNameOverride || companyNameVal || companyName || "The Service Team",
     };
 
     const applied = applyTemplate(template, variables);
     setSubject(applied.subject);
     setEmailBody(`${applied.greeting}\n\n${applied.body}\n\n${applied.signoff}`);
   };
 
   const handleTemplateChange = (templateId: string) => {
     setSelectedTemplateId(templateId);
     const template = templates.find((t) => t.id === templateId);
     if (template) {
       applySelectedTemplate(template);
     }
   };

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
  };

  const addRecipient = () => {
    const email = newEmail.trim();
    if (!email) return;
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error("Please enter a valid email address");
      return;
    }
    
    if (recipients.includes(email)) {
      toast.error("This email is already added");
      return;
    }
    
    setRecipients([...recipients, email]);
    setNewEmail("");
  };

  const removeRecipient = (email: string) => {
    setRecipients(recipients.filter((r) => r !== email));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addRecipient();
    }
  };

  const handleSend = async () => {
    if (recipients.length === 0) {
      toast.error("Please add at least one recipient");
      return;
    }

    setSending(true);
    let emailLogId: string | null = null;

    try {
      // Create email log entry first
      const { log } = await createEmailLog({
        customer_id: customerId || null,
        site_id: siteId || null,
        visit_id: visitId || null,
        report_id: reportId || null,
        recipients,
        subject: subject.trim(),
        email_type: "report",
        status: "sending",
        created_by: user?.id || null,
      });
      emailLogId = log?.id || null;

      // Generate PDF as base64
      const pdfBase64 = await generatePdfBase64();

      // Send all recipients in a single request (edge function handles rate limiting)
      const { data, error } = await supabase.functions.invoke("send-report-email", {
        body: {
          to: recipients, // Pass array of recipients
          subject: subject.trim(),
          siteName,
          reportNumber,
          reportDate,
          pdfBase64,
          customerName,
           companyName: companyNameVal || companyName,
          logoUrl,
           emailBody: emailBody.trim(),
           documentType,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const summary = data?.summary || { sent: 0, failed: 0 };
      const results = data?.results || [];
      const successful = results.filter((r: { success: boolean }) => r.success);
      const failed = results.filter((r: { success: boolean }) => !r.success);

      // Update email log with status
      if (emailLogId) {
        const status = failed.length === 0 ? "sent" : failed.length === recipients.length ? "failed" : "partial";
        const resendId = successful[0]?.id || null;
        const errorMessage = failed.length > 0 
          ? `Failed: ${failed.map((f: { email: string }) => f.email).join(", ")}` 
          : null;

        await supabase
          .from("email_logs")
          .update({
            status,
            resend_id: resendId,
            error_message: errorMessage,
          })
          .eq("id", emailLogId);
      }

      if (summary.sent > 0) {
        toast.success(
          `Report sent to ${summary.sent} recipient${summary.sent > 1 ? "s" : ""}`
        );

        // Cross-document recipient memory — overwrite customers.last_email_recipients
        // so every other email dialog (quote, RAMS, PO) prefills with
        // this list next time.
        void rememberLastRecipients(customerId, recipients);

        // Save any new emails back to customer for future use
        if (customerId) {
          try {
            const { data: custData } = await supabase
              .from("customers")
              .select("report_email_recipients, email_recipients")
              .eq("id", customerId)
              .single();

            if (custData) {
              const existingEmails = (custData.report_email_recipients || custData.email_recipients || "")
                .split(",")
                .map((e: string) => e.trim().toLowerCase())
                .filter(Boolean);

              const newEmails = recipients
                .map(e => e.trim().toLowerCase())
                .filter(e => e && !existingEmails.includes(e));

              if (newEmails.length > 0) {
                const updatedList = [...existingEmails, ...newEmails].join(", ");
                await supabase
                  .from("customers")
                  .update({ report_email_recipients: updatedList })
                  .eq("id", customerId);
                console.log("Saved new email recipients to customer:", newEmails);
              }
            }
          } catch (saveErr) {
            console.log("Could not save new emails to customer:", saveErr);
          }
        }
      }
      if (summary.failed > 0) {
        toast.error(
          `Failed to send to: ${failed.map((f: { email: string }) => f.email).join(", ")}`
        );
      }

      if (summary.sent > 0) {
        onOpenChange(false);
      }
    } catch (error) {
      console.error("Failed to send email:", error);
      const message = error instanceof Error ? error.message : "Failed to send email";
      toast.error(message);

      // Update log as failed
      if (emailLogId) {
        await supabase
          .from("email_logs")
          .update({
            status: "failed",
            error_message: message,
          })
          .eq("id", emailLogId);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email {documentType}
          </DialogTitle>
          <DialogDescription>
            Send {reportNumber} as a PDF attachment
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
           {/* Template Selection */}
           {templates.length > 0 && (
             <div className="space-y-2">
               <Label className="flex items-center gap-2">
                 <FileText className="h-4 w-4" />
                 Email Template
               </Label>
               <Select value={selectedTemplateId} onValueChange={handleTemplateChange}>
                 <SelectTrigger>
                   <SelectValue placeholder="Select a template" />
                 </SelectTrigger>
                 <SelectContent className="z-[200]">
                   {templates.map((template) => (
                     <SelectItem key={template.id} value={template.id}>
                       {template.name}
                     </SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             </div>
           )}
 
          {/* Recipients List */}
          <div className="space-y-2">
            <Label>Recipients</Label>
            <div className="flex flex-wrap gap-2 min-h-[36px] p-2 border rounded-md bg-muted/30">
              {recipients.length === 0 ? (
                <span className="text-sm text-muted-foreground">No recipients added</span>
              ) : (
                recipients.map((email) => (
                  <Badge
                    key={email}
                    variant="secondary"
                    className="flex items-center gap-1 pl-2 pr-1"
                  >
                    {email}
                    <button
                      type="button"
                      onClick={() => removeRecipient(email)}
                      className="ml-1 hover:bg-muted rounded-full p-0.5"
                      disabled={sending}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))
              )}
            </div>
          </div>

          {/* Add Recipient */}
          <div className="flex gap-2">
            <Input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add email address..."
              disabled={sending}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={addRecipient}
              disabled={sending || !newEmail.trim()}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
              disabled={sending}
            />
          </div>

           <div className="space-y-2">
             <Label htmlFor="emailBody">Email Message</Label>
             <Textarea
               id="emailBody"
               value={emailBody}
               onChange={(e) => setEmailBody(e.target.value)}
               placeholder="Email message..."
               rows={6}
               disabled={sending}
             />
           </div>
 
          <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
            <p className="font-medium text-foreground mb-1">Attachment:</p>
            <p>{reportNumber}-{reportDate}.pdf</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || recipients.length === 0}>
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send to {recipients.length} recipient{recipients.length !== 1 ? "s" : ""}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
