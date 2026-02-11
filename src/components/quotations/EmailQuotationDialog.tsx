import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Send, Mail, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateQuotationPDF, QuotationData, PDFColumnOptions } from "@/lib/quotationPdfGenerator";
import { getCompanySettings } from "@/services/companySettingsService";
import {
  EmailTemplate,
  getEmailTemplates,
  getDefaultTemplate,
  applyTemplate,
} from "@/services/emailTemplateService";

interface EmailQuotationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quotation: {
    id: string;
    quotation_number: string;
    title: string;
    site_id: string;
    customer_id: string | null;
    sites: { name: string } | null;
    acceptance_token?: string | null;
  };
  customerEmail: string;
  customerName?: string;
  pdfData: QuotationData;
  columnOptions: PDFColumnOptions;
  onSuccess?: () => void;
}

export function EmailQuotationDialog({
  open,
  onOpenChange,
  quotation,
  customerEmail,
  customerName,
  pdfData,
  columnOptions,
  onSuccess,
}: EmailQuotationDialogProps) {
  const [sending, setSending] = useState(false);
  const [recipients, setRecipients] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [companyNameVal, setCompanyNameVal] = useState("");

  useEffect(() => {
    if (open) {
      setRecipients(customerEmail);
      loadTemplatesAndDefaults();
    }
  }, [open, customerEmail, quotation]);

  const loadTemplatesAndDefaults = async () => {
    setLoadingTemplates(true);
    try {
      const [templatesList, defaultTemplate, settings] = await Promise.all([
        getEmailTemplates("quotation"),
        getDefaultTemplate("quotation"),
        getCompanySettings().catch(() => null),
      ]);

      setTemplates(templatesList);
      const compName = settings?.company_name || "The Service Team";
      setCompanyNameVal(compName);

      const variables = {
        customer_name: customerName || pdfData.customer?.name || "Customer",
        site_name: quotation.sites?.name || "Site",
        report_number: quotation.quotation_number,
        report_date: new Date().toISOString().split("T")[0],
        company_name: compName,
      };

      const acceptUrl = quotation.acceptance_token
        ? `${window.location.origin}/accept-quote/${quotation.acceptance_token}`
        : null;
      const acceptBlock = acceptUrl
        ? `\n\nTo accept this quotation online, click here:\n${acceptUrl}`
        : "";

      if (defaultTemplate) {
        setSelectedTemplateId(defaultTemplate.id);
        const applied = applyTemplate(defaultTemplate, variables);
        setSubject(applied.subject);
        setBody(`${applied.greeting}\n\n${applied.body}${acceptBlock}\n\n${applied.signoff}`);
      } else if (templatesList.length > 0) {
        setSelectedTemplateId(templatesList[0].id);
        const applied = applyTemplate(templatesList[0], variables);
        setSubject(applied.subject);
        setBody(`${applied.greeting}\n\n${applied.body}${acceptBlock}\n\n${applied.signoff}`);
      } else {
        // Fallback
        setSubject(`Quotation ${quotation.quotation_number} - ${quotation.title || quotation.sites?.name || "Fire Safety Works"}`);
        const acceptUrl = quotation.acceptance_token
          ? `${window.location.origin}/accept-quote/${quotation.acceptance_token}`
          : null;
        const acceptLine = acceptUrl
          ? `\n\nTo accept this quotation online, please click the link below:\n${acceptUrl}`
          : "\n\nTo accept this quotation, please sign and return the acceptance section at the bottom of the document.";
        setBody(`Dear ${customerName || "Customer"},\n\nPlease find attached our quotation ${quotation.quotation_number} for fire safety works at ${quotation.sites?.name || "your site"}.\n\nThis quotation is valid for 30 days from the date of issue. Please review the attached document and contact us if you have any questions.${acceptLine}\n\nKind regards,\n${compName}`);
      }
    } catch (error) {
      console.error("Failed to load templates:", error);
      setSubject(`Quotation ${quotation.quotation_number} - ${quotation.title || quotation.sites?.name || "Fire Safety Works"}`);
      setBody(`Dear ${customerName || "Customer"},\n\nPlease find attached our quotation ${quotation.quotation_number}.\n\nKind regards,\nBHO Fire Ltd`);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      const variables = {
        customer_name: customerName || pdfData.customer?.name || "Customer",
        site_name: quotation.sites?.name || "Site",
        report_number: quotation.quotation_number,
        report_date: new Date().toISOString().split("T")[0],
        company_name: companyNameVal || "The Service Team",
      };
      const applied = applyTemplate(template, variables);
      setSubject(applied.subject);
      setBody(`${applied.greeting}\n\n${applied.body}\n\n${applied.signoff}`);
    }
  };

  const handleSend = async () => {
    if (!recipients.trim()) {
      toast.error("Please enter at least one recipient");
      return;
    }

    setSending(true);
    try {
      const companySettings = await getCompanySettings();
      const pdfBase64 = await generateQuotationPDF(pdfData, companySettings || undefined, true, columnOptions);

      if (!pdfBase64) {
        throw new Error("Failed to generate PDF");
      }

      const recipientList = recipients
        .split(/[,;\s]+/)
        .map((email) => email.trim())
        .filter((email) => email.length > 0);

      const { data, error } = await supabase.functions.invoke("send-report-email", {
        body: {
          to: recipientList,
          subject,
          emailBody: body,
          pdfBase64,
          siteName: quotation.sites?.name || "Site",
          reportNumber: quotation.quotation_number,
          reportDate: new Date().toISOString().split("T")[0],
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("email_logs").insert({
        email_type: "quotation",
        recipients: recipientList,
        subject,
        status: "sent",
        site_id: quotation.site_id,
        customer_id: quotation.customer_id,
        created_by: user?.id,
      });

      await supabase
        .from("quotations")
        .update({ 
          status: "sent",
          locked_at: new Date().toISOString(),
          locked_by: user?.id
        })
        .eq("id", quotation.id);

      toast.success(`Quotation sent to ${recipientList.length} recipient(s)`);
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Error sending quotation:", error);
      toast.error(error instanceof Error ? error.message : "Failed to send quotation");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Quotation
          </DialogTitle>
          <DialogDescription>
            Send {quotation.quotation_number} to the customer
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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

          <div>
            <Label>Recipients</Label>
            <Input
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder="email@company.com, email2@company.com"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Separate multiple emails with commas
            </p>
          </div>

          <div>
            <Label>Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
            />
          </div>

          <div>
            <Label>Message</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Email message..."
              className="min-h-[200px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send Quotation
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
