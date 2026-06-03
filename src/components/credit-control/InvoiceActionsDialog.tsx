import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { Mail, MessageSquare, Phone, Send, Clock, CheckCircle, AlertTriangle, Eye, Loader2, Ban, CreditCard, Heart } from "lucide-react";
import { XeroOutstandingInvoice, markInvoicePaid, voidInvoice } from "@/services/xeroService";
import {
  createReminder,
  sendChaseEmail,
  sendSmsReminder,
  sendVoiceReminder,
  CreditControlReminder,
} from "@/services/creditControlService";
import { getEmailTemplates, EmailTemplate, applyTemplate } from "@/services/emailTemplateService";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface InvoiceActionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: XeroOutstandingInvoice | null;
  onReminderSent?: () => void;
  onInvoiceUpdated?: () => void;
}

export function InvoiceActionsDialog({
  open,
  onOpenChange,
  invoice,
  onReminderSent,
  onInvoiceUpdated,
}: InvoiceActionsDialogProps) {
  const [sending, setSending] = useState<string | null>(null);
  const [invoiceReminders, setInvoiceReminders] = useState<CreditControlReminder[]>([]);
  const [loadingReminders, setLoadingReminders] = useState(false);
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [showPaidConfirm, setShowPaidConfirm] = useState(false);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  
  // Thank you email states
  const [sendThankYou, setSendThankYou] = useState(true);
  const [thankYouTemplates, setThankYouTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [thankYouTo, setThankYouTo] = useState("");
  const [thankYouSubject, setThankYouSubject] = useState("");
  const [thankYouBody, setThankYouBody] = useState("");
  const [thankYouGreeting, setThankYouGreeting] = useState("");
  const [thankYouSignoff, setThankYouSignoff] = useState("");
  
  // Form states
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [smsTo, setSmsTo] = useState("");
  const [smsMessage, setSmsMessage] = useState("");
  const [phoneTo, setPhoneTo] = useState("");
  const [phoneMessage, setPhoneMessage] = useState("");

  const daysOverdue = invoice ? differenceInDays(new Date(), new Date(invoice.dueDate)) : 0;

  // Load thank you templates
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const templates = await getEmailTemplates();
        const tyTemplates = templates.filter((t) => t.template_type === "thank_you");
        setThankYouTemplates(tyTemplates);
        // Select default template
        const defaultTemplate = tyTemplates.find((t) => t.is_default) || tyTemplates[0];
        if (defaultTemplate) {
          setSelectedTemplateId(defaultTemplate.id);
        }
      } catch (error) {
        console.error("Failed to load thank you templates:", error);
      }
    };
    if (open) {
      loadTemplates();
    }
  }, [open]);

  // Apply template when selection changes
  useEffect(() => {
    if (!selectedTemplateId || !invoice) return;
    const template = thankYouTemplates.find((t) => t.id === selectedTemplateId);
    if (!template) return;

    const variables: Record<string, string> = {
      customer_name: invoice.contactName,
      invoice_number: invoice.invoiceNumber,
      amount_paid: invoice.amountDue.toFixed(2),
      payment_date: format(new Date(paymentDate), "dd MMMM yyyy"),
      company_name: "BHO Fire",
    };

    const applied = applyTemplate(template, variables);
    setThankYouSubject(applied.subject);
    setThankYouGreeting(applied.greeting);
    setThankYouBody(applied.body);
    setThankYouSignoff(applied.signoff);
  }, [selectedTemplateId, invoice, paymentDate, thankYouTemplates]);

  // Load reminders for this invoice when dialog opens
  const loadInvoiceReminders = async () => {
    if (!invoice) return;
    setLoadingReminders(true);
    try {
      const { data, error } = await supabase
        .from("credit_control_reminders")
        .select("*")
        .eq("xero_invoice_id", invoice.invoiceId)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      setInvoiceReminders(data || []);
    } catch (error) {
      console.error("Failed to load reminders:", error);
    } finally {
      setLoadingReminders(false);
    }
  };

  // Pre-populate fields when invoice changes
  const initializeFields = () => {
    if (!invoice) return;
    
    const defaultSubject = `Payment Reminder: Invoice ${invoice.invoiceNumber} - £${invoice.amountDue.toFixed(2)} overdue`;
    const defaultEmailMessage = `Dear ${invoice.contactName},

This is a friendly reminder that invoice ${invoice.invoiceNumber} for £${invoice.amountDue.toFixed(2)} was due on ${format(new Date(invoice.dueDate), "dd MMMM yyyy")} and is now ${daysOverdue} days overdue.

Please arrange payment at your earliest convenience. If you have already made this payment, please disregard this message.

If you have any questions regarding this invoice, please don't hesitate to contact us.

Kind regards`;

    const defaultSmsMessage = `Payment reminder: Invoice ${invoice.invoiceNumber} for £${invoice.amountDue.toFixed(2)} is ${daysOverdue} days overdue. Please arrange payment or contact us.`;
    
    const defaultPhoneMessage = `This is a courtesy call regarding invoice ${invoice.invoiceNumber} for ${invoice.amountDue} pounds which is ${daysOverdue} days overdue. Please arrange payment at your earliest convenience.`;

    setEmailSubject(defaultSubject);
    setEmailMessage(defaultEmailMessage);
    setSmsMessage(defaultSmsMessage);
    setPhoneMessage(defaultPhoneMessage);
    setPaymentDate(new Date().toISOString().split("T")[0]);
    
    loadInvoiceReminders();
  };

  // Reset when dialog opens
  if (open && invoice && !emailSubject) {
    initializeFields();
  }

  const handleSendEmail = async () => {
    if (!invoice || !emailTo) {
      toast.error("Please enter an email address");
      return;
    }

    setSending("email");
    try {
      const reminder = await createReminder({
        xero_invoice_id: invoice.invoiceId,
        xero_invoice_number: invoice.invoiceNumber,
        channel: "email",
        status: "pending",
        scheduled_at: new Date().toISOString(),
        contact_email: emailTo,
        contact_name: invoice.contactName,
        amount_due: invoice.amountDue,
        days_overdue: daysOverdue,
      });

      const result = await sendChaseEmail({
        reminder_id: reminder.id,
        to: emailTo,
        subject: emailSubject,
        message: emailMessage,
        invoice_number: invoice.invoiceNumber,
        amount_due: invoice.amountDue,
        days_overdue: daysOverdue,
      });

      if (result.success) {
        toast.success("Email sent successfully");
        loadInvoiceReminders();
        onReminderSent?.();
      } else {
        toast.error(result.error || "Failed to send email");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to send email");
    } finally {
      setSending(null);
    }
  };

  const handleSendSms = async () => {
    if (!invoice || !smsTo) {
      toast.error("Please enter a phone number");
      return;
    }

    setSending("sms");
    try {
      const reminder = await createReminder({
        xero_invoice_id: invoice.invoiceId,
        xero_invoice_number: invoice.invoiceNumber,
        channel: "sms",
        status: "pending",
        scheduled_at: new Date().toISOString(),
        contact_phone: smsTo,
        contact_name: invoice.contactName,
        amount_due: invoice.amountDue,
        days_overdue: daysOverdue,
      });

      const result = await sendSmsReminder({
        reminder_id: reminder.id,
        to: smsTo,
        message: smsMessage,
        invoice_number: invoice.invoiceNumber,
        amount_due: invoice.amountDue,
      });

      if (result.success) {
        toast.success("SMS sent successfully");
        loadInvoiceReminders();
        onReminderSent?.();
      } else {
        toast.error(result.error || "Failed to send SMS");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to send SMS");
    } finally {
      setSending(null);
    }
  };

  const handleSendVoice = async () => {
    if (!invoice || !phoneTo) {
      toast.error("Please enter a phone number");
      return;
    }

    setSending("voice");
    try {
      const reminder = await createReminder({
        xero_invoice_id: invoice.invoiceId,
        xero_invoice_number: invoice.invoiceNumber,
        channel: "call",
        status: "pending",
        scheduled_at: new Date().toISOString(),
        contact_phone: phoneTo,
        contact_name: invoice.contactName,
        amount_due: invoice.amountDue,
        days_overdue: daysOverdue,
      });

      const result = await sendVoiceReminder({
        reminder_id: reminder.id,
        to: phoneTo,
        message: phoneMessage,
        invoice_number: invoice.invoiceNumber,
        amount_due: invoice.amountDue,
      });

      if (result.success) {
        toast.success("Voice call initiated successfully");
        loadInvoiceReminders();
        onReminderSent?.();
      } else {
        toast.error(result.error || "Failed to make call");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to make call");
    } finally {
      setSending(null);
    }
  };

  const handleMarkPaid = async () => {
    if (!invoice) return;
    setProcessingAction("paid");
    try {
      // 1. Mark as paid in Xero
      const result = await markInvoicePaid(invoice.invoiceId, invoice.amountDue, paymentDate);
      
      // 2. Send thank you email if enabled
      if (sendThankYou && thankYouTo) {
        try {
          const { data, error } = await supabase.functions.invoke("send-thank-you-email", {
            body: {
              to: thankYouTo,
              subject: thankYouSubject,
              greeting: thankYouGreeting,
              body: thankYouBody,
              signoff: thankYouSignoff,
              invoice_number: invoice.invoiceNumber,
              amount_paid: invoice.amountDue,
              payment_date: format(new Date(paymentDate), "dd MMMM yyyy"),
              customer_name: invoice.contactName,
            },
          });

          if (error) {
            console.error("Thank you email error:", error);
            toast.error("Payment recorded but thank you email failed to send");
          } else if (data?.error) {
            console.error("Thank you email error:", data.error);
            toast.error("Payment recorded but thank you email failed to send");
          } else {
            toast.success("Payment recorded & thank you email sent");
          }
        } catch (emailError) {
          console.error("Thank you email error:", emailError);
          toast.error("Payment recorded but thank you email failed to send");
        }
      } else {
        toast.success(result.message);
      }
      
      onInvoiceUpdated?.();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to mark invoice as paid");
    } finally {
      setProcessingAction(null);
      setShowPaidConfirm(false);
    }
  };

  const handleVoidInvoice = async () => {
    if (!invoice) return;
    setProcessingAction("void");
    try {
      const result = await voidInvoice(invoice.invoiceId);
      toast.success(result.message);
      onInvoiceUpdated?.();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to void invoice");
    } finally {
      setProcessingAction(null);
      setShowVoidConfirm(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "delivered":
      case "sent":
        return <CheckCircle className="h-4 w-4 text-success" />;
      case "failed":
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case "opened":
      case "read":
        return <Eye className="h-4 w-4 text-primary" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "outline",
      sent: "secondary",
      delivered: "default",
      opened: "default",
      read: "default",
      failed: "destructive",
      no_answer: "outline",
    };
    const labels: Record<string, string> = {
      pending: "Pending",
      sent: "Sent",
      delivered: "Delivered",
      opened: "Opened",
      read: "Read",
      failed: "Failed",
      no_answer: "No Answer",
    };
    return <Badge variant={variants[status] || "outline"}>{labels[status] || status}</Badge>;
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case "email":
        return <Mail className="h-4 w-4" />;
      case "sms":
        return <MessageSquare className="h-4 w-4" />;
      case "call":
        return <Phone className="h-4 w-4" />;
      default:
        return null;
    }
  };

  if (!invoice) return null;

  return (
    <>
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) {
        setEmailTo("");
        setEmailSubject("");
        setEmailMessage("");
        setSmsTo("");
        setSmsMessage("");
        setPhoneTo("");
        setPhoneMessage("");
        setInvoiceReminders([]);
        setThankYouTo("");
        setSendThankYou(true);
      }
      onOpenChange(isOpen);
    }}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Invoice {invoice.invoiceNumber}
            <Badge variant={daysOverdue > 30 ? "destructive" : daysOverdue > 14 ? "secondary" : "outline"}>
              {daysOverdue} days overdue
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {invoice.contactName} • £{invoice.amountDue.toLocaleString(undefined, { minimumFractionDigits: 2 })} due
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="send" className="mt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="actions">Actions</TabsTrigger>
            <TabsTrigger value="send">Send Reminder</TabsTrigger>
            <TabsTrigger value="history">
              History
              {invoiceReminders.length > 0 && (
                <Badge variant="secondary" className="ml-2">{invoiceReminders.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

            <TabsContent value="actions" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Mark as Paid
                  </CardTitle>
                  <CardDescription>
                    Record payment for this invoice in Xero
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-sm text-muted-foreground">Amount to record</div>
                    <div className="text-2xl font-bold">£{invoice.amountDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payment-date">Payment Date</Label>
                    <Input
                      id="payment-date"
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                    />
                  </div>

                  {/* Thank You Email Section */}
                  <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="send-thank-you"
                        checked={sendThankYou}
                        onCheckedChange={(checked) => setSendThankYou(checked === true)}
                      />
                      <Label htmlFor="send-thank-you" className="flex items-center gap-2 cursor-pointer">
                        <Heart className="h-4 w-4 text-primary" />
                        Send Thank You Email
                      </Label>
                    </div>

                    {sendThankYou && (
                      <div className="space-y-3 pt-1">
                        <div className="space-y-2">
                          <Label htmlFor="thank-you-to">Recipient Email</Label>
                          <Input
                            id="thank-you-to"
                            type="email"
                            placeholder="accounts@company.com"
                            value={thankYouTo}
                            onChange={(e) => setThankYouTo(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="thank-you-template">Template</Label>
                          <Select
                            value={selectedTemplateId}
                            onValueChange={setSelectedTemplateId}
                          >
                            <SelectTrigger id="thank-you-template">
                              <SelectValue placeholder="Select a template" />
                            </SelectTrigger>
                            <SelectContent>
                              {thankYouTemplates.map((template) => (
                                <SelectItem key={template.id} value={template.id}>
                                  {template.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="thank-you-subject">Subject</Label>
                          <Input
                            id="thank-you-subject"
                            value={thankYouSubject}
                            onChange={(e) => setThankYouSubject(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="thank-you-body">Message</Label>
                          <Textarea
                            id="thank-you-body"
                            rows={5}
                            value={`${thankYouGreeting}\n\n${thankYouBody}\n\n${thankYouSignoff}`}
                            onChange={(e) => {
                              // Allow manual editing of the full message
                              const parts = e.target.value.split("\n\n");
                              if (parts.length >= 3) {
                                setThankYouGreeting(parts[0]);
                                setThankYouSignoff(parts[parts.length - 1]);
                                setThankYouBody(parts.slice(1, -1).join("\n\n"));
                              } else {
                                setThankYouBody(e.target.value);
                              }
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <Button
                    onClick={() => {
                      if (sendThankYou && !thankYouTo) {
                        toast.error("Please enter a recipient email for the thank you email, or uncheck the option");
                        return;
                      }
                      setShowPaidConfirm(true);
                    }}
                    disabled={processingAction !== null}
                    className="w-full"
                  >
                    {processingAction === "paid" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="mr-2 h-4 w-4" />
                    )}
                    {sendThankYou ? "Mark Complete & Send Thank You" : "Mark Complete"}
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-destructive/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2 text-destructive">
                    <Ban className="h-4 w-4" />
                    Void Invoice
                  </CardTitle>
                  <CardDescription>
                    Cancel this invoice - this action syncs with Xero
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-3">
                    Voiding an invoice will mark it as cancelled in Xero. This cannot be undone.
                    Only invoices without payments can be voided.
                  </p>
                  <Button
                    variant="destructive"
                    onClick={() => setShowVoidConfirm(true)}
                    disabled={processingAction !== null}
                    className="w-full"
                  >
                    {processingAction === "void" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Ban className="mr-2 h-4 w-4" />
                    )}
                    Void Invoice
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

          <TabsContent value="send" className="space-y-4 mt-4">
            {/* Email Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Send Email
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="email-to">To</Label>
                  <Input
                    id="email-to"
                    type="email"
                    placeholder="accounts@company.com"
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email-subject">Subject</Label>
                  <Input
                    id="email-subject"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email-message">Message</Label>
                  <Textarea
                    id="email-message"
                    rows={6}
                    value={emailMessage}
                    onChange={(e) => setEmailMessage(e.target.value)}
                  />
                </div>
                <Button
                  onClick={handleSendEmail}
                  disabled={sending === "email" || !emailTo}
                  className="w-full"
                >
                  {sending === "email" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Send Email
                </Button>
              </CardContent>
            </Card>

            {/* SMS Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Send SMS
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="sms-to">Phone Number</Label>
                  <Input
                    id="sms-to"
                    type="tel"
                    placeholder="+44 7700 900000"
                    value={smsTo}
                    onChange={(e) => setSmsTo(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sms-message">Message ({smsMessage.length}/160)</Label>
                  <Textarea
                    id="sms-message"
                    rows={3}
                    value={smsMessage}
                    onChange={(e) => setSmsMessage(e.target.value)}
                    maxLength={160}
                  />
                </div>
                <Button
                  onClick={handleSendSms}
                  disabled={sending === "sms" || !smsTo}
                  className="w-full"
                >
                  {sending === "sms" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Send SMS
                </Button>
              </CardContent>
            </Card>

            {/* Voice Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Voice Call
                </CardTitle>
                <CardDescription>Automated voice message via Twilio</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="phone-to">Phone Number</Label>
                  <Input
                    id="phone-to"
                    type="tel"
                    placeholder="+44 7700 900000"
                    value={phoneTo}
                    onChange={(e) => setPhoneTo(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone-message">Message (will be spoken)</Label>
                  <Textarea
                    id="phone-message"
                    rows={3}
                    value={phoneMessage}
                    onChange={(e) => setPhoneMessage(e.target.value)}
                  />
                </div>
                <Button
                  onClick={handleSendVoice}
                  disabled={sending === "voice" || !phoneTo}
                  className="w-full"
                >
                  {sending === "voice" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Phone className="mr-2 h-4 w-4" />
                  )}
                  Make Call
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Reminder History</CardTitle>
                <CardDescription>
                  All reminders sent for this invoice
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingReminders ? (
                  <div className="text-center py-4 text-muted-foreground">Loading...</div>
                ) : invoiceReminders.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No reminders sent for this invoice yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {invoiceReminders.map((reminder) => (
                      <div
                        key={reminder.id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-card"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-full bg-muted">
                            {getChannelIcon(reminder.channel)}
                          </div>
                          <div>
                            <div className="font-medium text-sm capitalize">
                              {reminder.channel === "call" ? "Voice Call" : reminder.channel}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {reminder.contact_email || reminder.contact_phone || "—"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(reminder.created_at), "dd MMM yyyy HH:mm")}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(reminder.status)}
                          {getStatusBadge(reminder.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>

    <AlertDialog open={showPaidConfirm} onOpenChange={setShowPaidConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark Invoice as Paid?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                This will record a payment of £{invoice?.amountDue.toLocaleString(undefined, { minimumFractionDigits: 2 })} for invoice {invoice?.invoiceNumber} on {format(new Date(paymentDate), "dd MMMM yyyy")}. This will update Xero.
              </p>
              {sendThankYou && thankYouTo && (
                <p className="flex items-center gap-2 text-primary">
                  <Heart className="h-4 w-4" />
                  A thank you email will be sent to {thankYouTo}
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={processingAction !== null}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleMarkPaid}
            disabled={processingAction !== null}
          >
            {processingAction === "paid" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm Payment
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={showVoidConfirm} onOpenChange={setShowVoidConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Void Invoice?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently void invoice {invoice?.invoiceNumber} for £{invoice?.amountDue.toLocaleString(undefined, { minimumFractionDigits: 2 })} in Xero. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={processingAction !== null}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleVoidInvoice}
            disabled={processingAction !== null}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {processingAction === "void" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Void Invoice
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  );
}
