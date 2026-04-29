import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { QMSDocument } from "@/services/qmsService";
import {
  generateQMSDocumentPDFBase64,
  getQMSDocumentFileName,
} from "@/lib/qmsDocumentPdfGenerator";
import { getCompanySettings } from "@/services/companySettingsService";
import { format } from "date-fns";

interface EmailDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: QMSDocument | null;
}

export const EmailDocumentDialog = ({
  open,
  onOpenChange,
  document,
}: EmailDocumentDialogProps) => {
  const [recipients, setRecipients] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  // Initialise defaults when a document is loaded
  if (document && !subject) {
    setSubject(`${document.document_number} - ${document.title}`);
    setMessage(
      `Please find attached our controlled document:\n\n${document.document_number} - ${document.title}\nVersion: ${document.current_version}\n\nIf you have any questions, please get in touch.`
    );
  }

  const handleSend = async () => {
    if (!document) return;

    const emails = recipients
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter(Boolean);

    if (!emails.length) {
      toast.error("Please enter at least one recipient email");
      return;
    }

    setSending(true);
    try {
      const [pdfBase64, company] = await Promise.all([
        generateQMSDocumentPDFBase64(document),
        getCompanySettings(),
      ]);

      const { error } = await supabase.functions.invoke("send-report-email", {
        body: {
          to: emails,
          subject,
          siteName: company?.company_name || "",
          reportNumber: document.document_number,
          reportDate: format(new Date(), "dd/MM/yyyy"),
          pdfBase64,
          companyName: company?.company_name,
          logoUrl: company?.report_logo_url || company?.company_logo_url,
          emailBody: message,
          documentType: "QMS Document",
        },
      });

      if (error) throw error;

      toast.success(`Document emailed to ${emails.length} recipient(s)`);
      onOpenChange(false);
      setRecipients("");
      setSubject("");
      setMessage("");
    } catch (err) {
      console.error("Email send error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to send email");
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
            Email Document
          </DialogTitle>
          <DialogDescription>
            {document
              ? `Send "${document.title}" (${getQMSDocumentFileName(document)}) as a branded PDF.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label htmlFor="email-recipients">Recipients</Label>
            <Input
              id="email-recipients"
              placeholder="name@example.com, another@example.com"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Separate multiple addresses with commas.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="email-subject">Subject</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="email-message">Message</Label>
            <Textarea
              id="email-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Mail className="h-4 w-4 mr-2" />
                Send Email
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
