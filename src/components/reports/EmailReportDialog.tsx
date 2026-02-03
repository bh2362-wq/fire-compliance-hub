import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface EmailReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultEmail: string;
  customerName?: string;
  siteName: string;
  reportNumber: string;
  reportDate: string;
  companyName?: string;
  logoUrl?: string;
  generatePdfBase64: () => Promise<string>;
}

export function EmailReportDialog({
  open,
  onOpenChange,
  defaultEmail,
  customerName,
  siteName,
  reportNumber,
  reportDate,
  companyName,
  logoUrl,
  generatePdfBase64,
}: EmailReportDialogProps) {
  const [sending, setSending] = useState(false);
  const [email, setEmail] = useState(defaultEmail);
  const [subject, setSubject] = useState(
    `Service Report ${reportNumber} - ${siteName}`
  );

  // Reset email when dialog opens
  const handleOpenChange = (open: boolean) => {
    if (open) {
      setEmail(defaultEmail);
      setSubject(`Service Report ${reportNumber} - ${siteName}`);
    }
    onOpenChange(open);
  };

  const handleSend = async () => {
    if (!email.trim()) {
      toast.error("Please enter an email address");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      toast.error("Please enter a valid email address");
      return;
    }

    setSending(true);
    try {
      // Generate PDF as base64
      const pdfBase64 = await generatePdfBase64();

      // Send via edge function
      const { data, error } = await supabase.functions.invoke("send-report-email", {
        body: {
          to: email.trim(),
          subject: subject.trim(),
          siteName,
          reportNumber,
          reportDate,
          pdfBase64,
          customerName,
          companyName,
          logoUrl,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Report sent to ${email}`);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to send email:", error);
      const message = error instanceof Error ? error.message : "Failed to send email";
      toast.error(message);
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
            Email Report
          </DialogTitle>
          <DialogDescription>
            Send report {reportNumber} as a PDF attachment
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="email">Recipient Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="customer@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
            />
          </div>

          <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
            <p className="font-medium text-foreground mb-1">Attachment:</p>
            <p>{reportNumber}-{reportDate}.pdf</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
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
                <Send className="h-4 w-4 mr-2" />
                Send Email
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
