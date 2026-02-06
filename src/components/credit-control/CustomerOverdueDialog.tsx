import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { Mail, Send, Loader2, FileText, Plus, X } from "lucide-react";
import { XeroOutstandingInvoice } from "@/services/xeroService";
import { supabase } from "@/integrations/supabase/client";

interface CustomerOverdueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerName: string;
  contactId: string;
  invoices: XeroOutstandingInvoice[];
  onInvoiceClick?: (invoice: XeroOutstandingInvoice) => void;
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

export function CustomerOverdueDialog({
  open,
  onOpenChange,
  customerName,
  contactId,
  invoices,
  onInvoiceClick,
  onEmailSent,
}: CustomerOverdueDialogProps) {
  const [sending, setSending] = useState(false);
  const [emailAddresses, setEmailAddresses] = useState<string[]>([""]);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [showEmailForm, setShowEmailForm] = useState(false);

  const totalDue = useMemo(
    () => invoices.reduce((sum, inv) => sum + inv.amountDue, 0),
    [invoices]
  );

  // Fetch stored email recipients
  useEffect(() => {
    const fetchEmails = async () => {
      if (!open || !contactId) return;

      const { data } = await supabase
        .from("customers")
        .select("email_recipients")
        .eq("xero_contact_id", contactId)
        .maybeSingle();

      if (data?.email_recipients) {
        const emails = data.email_recipients
          .split(",")
          .map((e: string) => e.trim())
          .filter(Boolean);
        if (emails.length > 0) {
          setEmailAddresses(emails);
        }
      }
    };
    fetchEmails();
  }, [open, contactId]);

  const addEmailField = () => {
    setEmailAddresses((prev) => [...prev, ""]);
  };

  const removeEmailField = (index: number) => {
    setEmailAddresses((prev) => prev.filter((_, i) => i !== index));
  };

  const updateEmailField = (index: number, value: string) => {
    setEmailAddresses((prev) => prev.map((email, i) => (i === index ? value : email)));
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
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Statement email sent successfully");
      onEmailSent?.();
      setShowEmailForm(false);
    } catch (error: any) {
      console.error("Failed to send statement:", error);
      toast.error(error.message || "Failed to send statement email");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {customerName}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-3">
            <span>{invoices.length} overdue invoice{invoices.length !== 1 ? "s" : ""}</span>
            <Badge variant="destructive" className="text-sm">
              Total: £{totalDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </Badge>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4">
            {/* Invoices Table */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Days Overdue</TableHead>
                  <TableHead className="text-right">Amount Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => {
                  const daysOverdue = differenceInDays(new Date(), new Date(invoice.dueDate));
                  return (
                    <TableRow
                      key={invoice.invoiceId}
                      className={onInvoiceClick ? "cursor-pointer hover:bg-muted/50" : ""}
                      onClick={() => onInvoiceClick?.(invoice)}
                    >
                      <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {invoice.reference || "—"}
                      </TableCell>
                      <TableCell>{format(new Date(invoice.dueDate), "dd MMM yyyy")}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            daysOverdue > 30
                              ? "destructive"
                              : daysOverdue > 14
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {daysOverdue} days
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        £{invoice.amountDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Email Form */}
            {showEmailForm && (
              <div className="space-y-4 border rounded-lg p-4">
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

                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowEmailForm(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSendStatement} disabled={sending}>
                    {sending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Send Statement
                  </Button>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer Actions */}
        {!showEmailForm && (
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button onClick={() => setShowEmailForm(true)}>
              <Mail className="mr-2 h-4 w-4" />
              Send Statement
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
