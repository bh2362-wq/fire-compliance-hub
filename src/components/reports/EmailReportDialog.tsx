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
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, Send, X, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createEmailLog } from "@/services/emailLogService";
import { useAuth } from "@/contexts/AuthContext";

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
  generatePdfBase64,
}: EmailReportDialogProps) {
  const { user } = useAuth();
  const [sending, setSending] = useState(false);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [subject, setSubject] = useState(
    `Service Report ${reportNumber} - ${siteName}`
  );

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

  // Reset form when dialog opens
  const handleOpenChange = (open: boolean) => {
    if (open) {
      setRecipients(parseRecipients());
      setSubject(`Service Report ${reportNumber} - ${siteName}`);
      setNewEmail("");
    }
    onOpenChange(open);
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

      // Send to each recipient
      const results = await Promise.all(
        recipients.map(async (email) => {
          try {
            const { data, error } = await supabase.functions.invoke("send-report-email", {
              body: {
                to: email,
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
            
            return { email, success: true, resendId: data?.data?.id };
          } catch (err) {
            return { email, success: false, error: err };
          }
        })
      );

      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      // Update email log with status
      if (emailLogId) {
        const status = failed.length === 0 ? "sent" : failed.length === recipients.length ? "failed" : "partial";
        const resendId = successful[0]?.resendId || null;
        const errorMessage = failed.length > 0 
          ? `Failed: ${failed.map((f) => f.email).join(", ")}` 
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

      if (successful.length > 0) {
        toast.success(
          `Report sent to ${successful.length} recipient${successful.length > 1 ? "s" : ""}`
        );
      }
      if (failed.length > 0) {
        toast.error(
          `Failed to send to: ${failed.map((f) => f.email).join(", ")}`
        );
      }

      if (successful.length > 0) {
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
            Email Report
          </DialogTitle>
          <DialogDescription>
            Send report {reportNumber} as a PDF attachment
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
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
