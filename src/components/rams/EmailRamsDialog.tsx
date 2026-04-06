import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Mail, Send, X, Plus, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createEmailLog } from "@/services/emailLogService";
import { useAuth } from "@/contexts/AuthContext";
import {
  EmailTemplate, getEmailTemplates, getDefaultTemplate, applyTemplate,
} from "@/services/emailTemplateService";
import { getCompanySettings } from "@/services/companySettingsService";
import { RamsDocument } from "@/services/ramsService";
import { generateMergedRamsPDFBase64 } from "@/lib/ramsPdfGenerator";

interface EmailRamsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: RamsDocument;
}

export function EmailRamsDialog({ open, onOpenChange, document }: EmailRamsDialogProps) {
  const { user } = useAuth();
  const [sending, setSending] = useState(false);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [companyNameVal, setCompanyNameVal] = useState("");

  const siteName = document.site?.name || "Site";
  const customerName = (document as any).customerName || "";
  const contactName = (document as any).contactName || "";

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  const loadData = async () => {
    setLoadingTemplates(true);
    try {
      // Load customer/contact info from site
      let custName = "";
      let contName = "";
      let defaultEmails: string[] = [];

      if (document.site_id) {
        const { data: site } = await supabase
          .from("sites")
          .select("customer_id, customers(name, contact_name, contact_email, report_email_recipients, email_recipients)")
          .eq("id", document.site_id)
          .maybeSingle();

        const customer = site?.customers as any;
        if (customer) {
          custName = customer.name || "";
          contName = customer.contact_name || "";
          const recipientList = customer.report_email_recipients || customer.email_recipients || "";
          const emails = [customer.contact_email, recipientList]
            .filter(Boolean)
            .join(",")
            .split(",")
            .map((e: string) => e.trim())
            .filter(Boolean);
          defaultEmails = [...new Set(emails)];
        }
      }

      setRecipients(defaultEmails);

      const [templatesList, defaultTemplate, settings] = await Promise.all([
        getEmailTemplates("rams"),
        getDefaultTemplate("rams"),
        getCompanySettings().catch(() => null),
      ]);

      setTemplates(templatesList);
      const compName = settings?.company_name || "The Service Team";
      setCompanyNameVal(compName);

      const variables = {
        customer_name: custName || "Customer",
        contact_name: contName || custName || "Sir/Madam",
        site_name: siteName,
        rams_number: document.rams_number,
        rams_title: document.title,
        company_name: compName,
      };

      if (defaultTemplate) {
        setSelectedTemplateId(defaultTemplate.id);
        const applied = applyTemplate(defaultTemplate, variables);
        setSubject(applied.subject);
        setEmailBody(`${applied.greeting}\n\n${applied.body}\n\n${applied.signoff}`);
      } else if (templatesList.length > 0) {
        setSelectedTemplateId(templatesList[0].id);
        const applied = applyTemplate(templatesList[0], variables);
        setSubject(applied.subject);
        setEmailBody(`${applied.greeting}\n\n${applied.body}\n\n${applied.signoff}`);
      } else {
        setSubject(`RAMS Document ${document.rams_number} - ${siteName}`);
        setEmailBody(
          `Dear ${contName || custName || "Sir/Madam"},\n\nPlease find attached the Risk Assessment and Method Statement (RAMS) for the following works:\n\nDocument: ${document.rams_number}\nTitle: ${document.title}\nSite: ${siteName}\n\nPlease review and acknowledge receipt of this document. If you have any questions or require further information, please do not hesitate to contact us.\n\nKind regards,\n${compName}`
        );
      }
    } catch (error) {
      console.error("Failed to load data:", error);
      setSubject(`RAMS Document ${document.rams_number} - ${siteName}`);
      setEmailBody(
        `Dear Sir/Madam,\n\nPlease find attached the Risk Assessment and Method Statement (RAMS) for the works at ${siteName}.\n\nKind regards,\nThe Service Team`
      );
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      const variables = {
        customer_name: "",
        contact_name: "",
        site_name: siteName,
        rams_number: document.rams_number,
        rams_title: document.title,
        company_name: companyNameVal,
      };
      const applied = applyTemplate(template, variables);
      setSubject(applied.subject);
      setEmailBody(`${applied.greeting}\n\n${applied.body}\n\n${applied.signoff}`);
    }
  };

  const addRecipient = () => {
    const email = newEmail.trim();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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
      // Get customer_id from site
      let customerId: string | null = null;
      if (document.site_id) {
        const { data: site } = await supabase
          .from("sites")
          .select("customer_id")
          .eq("id", document.site_id)
          .maybeSingle();
        customerId = site?.customer_id || null;
      }

      const { log } = await createEmailLog({
        customer_id: customerId,
        site_id: document.site_id || null,
        visit_id: document.visit_id || null,
        report_id: null,
        recipients,
        subject: subject.trim(),
        email_type: "rams",
        status: "sending",
        created_by: user?.id || null,
      });
      emailLogId = log?.id || null;

      const mergedPdfBase64 = await generateMergedRamsPDFBase64(document);

      const settings = await getCompanySettings().catch(() => null);
      const reportDate = new Date().toISOString().split("T")[0];

      const { data, error } = await supabase.functions.invoke("send-report-email", {
        body: {
          to: recipients,
          subject: subject.trim(),
          siteName,
          reportNumber: document.rams_number,
          reportDate,
          pdfBase64: mergedPdfBase64,
          additionalAttachments: [],
          customerName: "",
          companyName: companyNameVal,
          logoUrl: settings?.report_logo_url || settings?.company_logo_url || "",
          emailBody: emailBody.trim(),
          documentType: "Risk Assessment & Method Statement",
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const summary = data?.summary || { sent: 0, failed: 0 };
      const results = data?.results || [];
      const failed = results.filter((r: { success: boolean }) => !r.success);

      if (emailLogId) {
        const status = failed.length === 0 ? "sent" : failed.length === recipients.length ? "failed" : "partial";
        await supabase
          .from("email_logs")
          .update({
            status,
            resend_id: results.find((r: any) => r.success)?.id || null,
            error_message: failed.length > 0 ? `Failed: ${failed.map((f: any) => f.email).join(", ")}` : null,
          })
          .eq("id", emailLogId);
      }

      if (summary.sent > 0) {
        toast.success(`RAMS sent to ${summary.sent} recipient${summary.sent > 1 ? "s" : ""}`);
      }
      if (summary.failed > 0) {
        toast.error(`Failed to send to: ${failed.map((f: any) => f.email).join(", ")}`);
      }
      if (summary.sent > 0) {
        onOpenChange(false);
      }
    } catch (error) {
      console.error("Failed to send RAMS email:", error);
      const message = error instanceof Error ? error.message : "Failed to send email";
      toast.error(message);
      if (emailLogId) {
        await supabase.from("email_logs").update({ status: "failed", error_message: message }).eq("id", emailLogId);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email RAMS
          </DialogTitle>
          <DialogDescription>
            Send {document.rams_number} as a PDF attachment
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
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

          <div className="space-y-2">
            <Label>Recipients</Label>
            <div className="flex flex-wrap gap-2 min-h-[36px] p-2 border rounded-md bg-muted/30">
              {recipients.length === 0 ? (
                <span className="text-sm text-muted-foreground">No recipients added</span>
              ) : (
                recipients.map((email) => (
                  <Badge key={email} variant="secondary" className="flex items-center gap-1 pl-2 pr-1">
                    {email}
                    <button type="button" onClick={() => removeRecipient(email)} className="ml-1 hover:bg-muted rounded-full p-0.5" disabled={sending}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} onKeyDown={handleKeyDown} placeholder="Add email address..." disabled={sending} />
            <Button type="button" variant="outline" size="icon" onClick={addRecipient} disabled={sending || !newEmail.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rams-subject">Subject</Label>
            <Input id="rams-subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={sending} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rams-body">Email Message</Label>
            <Textarea id="rams-body" value={emailBody} onChange={(e) => setEmailBody(e.target.value)} rows={8} disabled={sending} />
          </div>

          <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
            <p className="font-medium text-foreground mb-1">Attachment:</p>
            <p>{document.rams_number}.pdf</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending || recipients.length === 0}>
            {sending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</>
            ) : (
              <><Send className="h-4 w-4 mr-2" />Send to {recipients.length} recipient{recipients.length !== 1 ? "s" : ""}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
