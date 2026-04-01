import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Mail, Send, Loader2, Plus, X, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { XeroOutstandingInvoice } from "@/services/xeroService";
import { generateStatementPDF } from "@/lib/statementPdfGenerator";
import { getCompanySettings } from "@/services/companySettingsService";
import { format } from "date-fns";

interface SendStatementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerName: string;
  invoices: XeroOutstandingInvoice[];
  emailAddresses: string[];
  onEmailAddressesChange: (emails: string[]) => void;
  totalDue: number;
  insights: {
    totalOutstanding: number;
    totalOverdue: number;
    overdueCount: number;
    currentCount: number;
    avgDaysOverdue: number;
    maxDaysOverdue: number;
    riskLevel: string;
    agingBuckets: any;
  };
  onEmailSent?: () => void;
}

const DEFAULT_MESSAGE = `Please confirm the following information:
 
  - That all the invoices have been received.
  - That there are no disputes.
  - If there is a dispute, has backup been supplied?
  - The payment date for the open invoices. 
 
 If there are no issues and a payment was already made please
 disregard this message.
 
 
 
 Kind Regards
 
 Credit Control
 
 accounts@bhofire.com`;

export function SendStatementDialog({
  open,
  onOpenChange,
  customerName,
  invoices,
  emailAddresses,
  onEmailAddressesChange,
  totalDue,
  insights,
  onEmailSent,
}: SendStatementDialogProps) {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);

  const addEmailField = () => {
    onEmailAddressesChange([...emailAddresses, ""]);
  };

  const removeEmailField = (index: number) => {
    onEmailAddressesChange(emailAddresses.filter((_, i) => i !== index));
  };

  const updateEmailField = (index: number, value: string) => {
    onEmailAddressesChange(emailAddresses.map((email, i) => (i === index ? value : email)));
  };

  const handleSendStatement = async () => {
    const validEmails = emailAddresses.filter((e) => e.trim());
    if (validEmails.length === 0) {
      toast.error("Please enter at least one email address");
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-statement-email", {
        body: {
          to: validEmails.join(", "),
          contactName: customerName,
          invoices: invoices.map((inv) => ({
            number: inv.invoiceNumber,
            reference: inv.reference,
            date: inv.date,
            dueDate: inv.dueDate,
            amount: inv.amountDue,
          })),
          totalDue,
          message,
          insights: {
            totalOutstanding: insights.totalOutstanding,
            totalOverdue: insights.totalOverdue,
            overdueCount: insights.overdueCount,
            currentCount: insights.currentCount,
            avgDaysOverdue: insights.avgDaysOverdue,
            maxDaysOverdue: insights.maxDaysOverdue,
            riskLevel: insights.riskLevel,
            agingBuckets: insights.agingBuckets,
          },
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Statement email sent successfully");
      onEmailSent?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Failed to send statement:", error);
      toast.error(error.message || "Failed to send statement email");
    } finally {
      setSending(false);
    }
  };

  const handleSaveAsPdf = async () => {
    try {
      toast.loading("Generating PDF...", { id: "stmt-pdf" });
      const settings = await getCompanySettings();
      const doc = await generateStatementPDF({
        customerName,
        invoices,
        companySettings: settings,
      });
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Statement - ${customerName} - ${format(new Date(), "dd-MM-yyyy")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Statement PDF downloaded", { id: "stmt-pdf" });
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate PDF", { id: "stmt-pdf" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Send Statement
          </DialogTitle>
          <DialogDescription>
            Send statement to {customerName} — {invoices.length} invoice{invoices.length !== 1 ? "s" : ""} totalling{" "}
            {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(totalDue)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Recipients</Label>
            {emailAddresses.map((email, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  type="email"
                  placeholder="email@company.com"
                  className="flex-1"
                  value={email}
                  onChange={(e) => updateEmailField(index, e.target.value)}
                />
                {emailAddresses.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => removeEmailField(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={addEmailField}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add another email
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Message (appears below invoice table)</Label>
            <Textarea
              rows={8}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleSaveAsPdf} className="sm:mr-auto">
            <Download className="mr-2 h-4 w-4" />
            Save as PDF
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSendStatement} disabled={sending}>
            {sending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Send Statement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
