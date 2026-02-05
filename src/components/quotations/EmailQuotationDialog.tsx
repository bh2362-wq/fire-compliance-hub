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
import { Loader2, Send, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateQuotationPDF, QuotationData, PDFColumnOptions } from "@/lib/quotationPdfGenerator";
import { getCompanySettings } from "@/services/companySettingsService";

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
  };
  customerEmail: string;
  pdfData: QuotationData;
  columnOptions: PDFColumnOptions;
  onSuccess?: () => void;
}

export function EmailQuotationDialog({
  open,
  onOpenChange,
  quotation,
  customerEmail,
  pdfData,
  columnOptions,
  onSuccess,
}: EmailQuotationDialogProps) {
  const [sending, setSending] = useState(false);
  const [recipients, setRecipients] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (open) {
      setRecipients(customerEmail);
      setSubject(`Quotation ${quotation.quotation_number} - ${quotation.title || quotation.sites?.name || "Fire Safety Works"}`);
      setBody(`Dear Customer,

Please find attached our quotation ${quotation.quotation_number} for fire safety works at ${quotation.sites?.name || "your site"}.

This quotation is valid for 30 days from the date of issue. Please review the attached document and contact us if you have any questions.

To accept this quotation, please sign and return the acceptance section at the bottom of the document.

Kind regards,
BHO Fire Ltd`);
    }
  }, [open, customerEmail, quotation]);

  const handleSend = async () => {
    if (!recipients.trim()) {
      toast.error("Please enter at least one recipient");
      return;
    }

    setSending(true);
    try {
      // Generate PDF as base64
      const companySettings = await getCompanySettings();
      const pdfBase64 = await generateQuotationPDF(pdfData, companySettings || undefined, true, columnOptions);

      if (!pdfBase64) {
        throw new Error("Failed to generate PDF");
      }

      // Parse recipients
      const recipientList = recipients
        .split(/[,;\s]+/)
        .map((email) => email.trim())
        .filter((email) => email.length > 0);

      // Send email via edge function
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

      // Log email
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

      // Update quotation status to sent if draft
      await supabase
        .from("quotations")
        .update({ status: "sent" })
        .eq("id", quotation.id)
        .eq("status", "draft");

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
