import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import {
  Mail, Send, Loader2, FileText, Plus, X, BarChart3,
  MoreHorizontal, Pencil, ShieldCheck, CheckCircle, Trash2, Eye,
} from "lucide-react";
import {
  XeroOutstandingInvoice,
  deleteXeroInvoice,
  approveInvoice,
  InvoiceLineItem,
} from "@/services/xeroService";
import { supabase } from "@/integrations/supabase/client";
import { CustomerPaymentInsights, computeInsights } from "./CustomerPaymentInsights";
import { ManualInvoiceDialog, EditInvoiceData } from "@/components/xero/ManualInvoiceDialog";

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

  // Invoice action states
  const [editingInvoice, setEditingInvoice] = useState<EditInvoiceData | null>(null);
  const [approvingInvoice, setApprovingInvoice] = useState<XeroOutstandingInvoice | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [deletingInvoice, setDeletingInvoice] = useState<XeroOutstandingInvoice | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [payingInvoice, setPayingInvoice] = useState<XeroOutstandingInvoice | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [paymentAmount, setPaymentAmount] = useState("");
  const [viewingInvoice, setViewingInvoice] = useState<XeroOutstandingInvoice | null>(null);

  const totalDue = useMemo(
    () => invoices.reduce((sum, inv) => sum + inv.amountDue, 0),
    [invoices]
  );

  const insights = useMemo(() => computeInsights(invoices), [invoices]);

  // Fetch stored email recipients
  useEffect(() => {
    const fetchEmails = async () => {
      if (!open || !contactId) return;

      const { data } = await supabase
        .from("customers")
        .select("email_recipients, contact_email")
        .eq("xero_contact_id", contactId)
        .maybeSingle();

      if (data?.email_recipients) {
        const emails = data.email_recipients
          .split(",")
          .map((e: string) => e.trim())
          .filter(Boolean);
        if (emails.length > 0) {
          setEmailAddresses(emails);
          return;
        }
      }
      if (data?.contact_email) {
        setEmailAddresses([data.contact_email.trim()]);
      }
    };
    fetchEmails();
  }, [open, contactId]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);

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
      setShowEmailForm(false);
    } catch (error: any) {
      console.error("Failed to send statement:", error);
      toast.error(error.message || "Failed to send statement email");
    } finally {
      setSending(false);
    }
  };

  // --- Invoice Actions ---
  const handleEditInvoice = (invoice: XeroOutstandingInvoice) => {
    setEditingInvoice({
      invoiceId: invoice.invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      contactId: invoice.contactId,
      contactName: invoice.contactName,
      reference: invoice.reference,
      dueDate: invoice.dueDate,
      total: invoice.total,
      lineItems: invoice.lineItems || [],
    });
  };

  const handleApproveInvoice = async () => {
    if (!approvingInvoice) return;
    setIsApproving(true);
    try {
      const result = await approveInvoice(approvingInvoice.invoiceId);
      toast.success(result.message || "Invoice approved and sent");
      setApprovingInvoice(null);
      onEmailSent?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve invoice");
    } finally {
      setIsApproving(false);
    }
  };

  const handleDeleteInvoice = async () => {
    if (!deletingInvoice) return;
    setIsDeleting(true);
    try {
      const result = await deleteXeroInvoice(deletingInvoice.invoiceId);
      toast.success(result.message || "Invoice deleted");
      setDeletingInvoice(null);
      onEmailSent?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete invoice");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMarkAsPaid = async () => {
    if (!payingInvoice) return;
    setIsPaying(true);
    try {
      const { data, error } = await supabase.functions.invoke("xero-apply-payment", {
        body: {
          invoiceId: payingInvoice.invoiceId,
          amount: parseFloat(paymentAmount) || payingInvoice.amountDue,
          date: paymentDate,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast.success(`Invoice ${payingInvoice.invoiceNumber} marked as paid`);
      setPayingInvoice(null);
      onEmailSent?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to apply payment");
    } finally {
      setIsPaying(false);
    }
  };

  const openPaymentDialog = (invoice: XeroOutstandingInvoice) => {
    setPayingInvoice(invoice);
    setPaymentAmount(invoice.amountDue.toString());
    setPaymentDate(format(new Date(), "yyyy-MM-dd"));
  };

  const canDeleteInvoice = (invoice: XeroOutstandingInvoice) =>
    (invoice.status === "DRAFT" || invoice.status === "AUTHORISED") && invoice.amountPaid === 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {customerName}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-3">
              <span>{invoices.length} outstanding invoice{invoices.length !== 1 ? "s" : ""}</span>
              <Badge variant="destructive" className="text-sm">
                Total: {formatCurrency(totalDue)}
              </Badge>
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="invoices" className="flex-1 min-h-0 flex flex-col">
            <TabsList className="shrink-0">
              <TabsTrigger value="invoices">
                <FileText className="mr-2 h-4 w-4" />
                Invoices
              </TabsTrigger>
              <TabsTrigger value="insights">
                <BarChart3 className="mr-2 h-4 w-4" />
                Payment Insights
              </TabsTrigger>
            </TabsList>

            <TabsContent value="invoices" className="flex-1 min-h-0 overflow-y-auto mt-4">
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky top-0 bg-background z-10">Invoice #</TableHead>
                      <TableHead className="sticky top-0 bg-background z-10">Reference</TableHead>
                      <TableHead className="sticky top-0 bg-background z-10">Due Date</TableHead>
                      <TableHead className="sticky top-0 bg-background z-10">Status</TableHead>
                      <TableHead className="sticky top-0 bg-background z-10 text-right">Amount Due</TableHead>
                      <TableHead className="sticky top-0 bg-background z-10 w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((invoice) => {
                      const daysOverdue = invoice.isOverdue
                        ? differenceInDays(new Date(), new Date(invoice.dueDate))
                        : 0;
                      return (
                        <TableRow key={invoice.invoiceId}>
                          <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {invoice.reference || "—"}
                          </TableCell>
                          <TableCell>{format(new Date(invoice.dueDate), "dd MMM yyyy")}</TableCell>
                          <TableCell>
                            {invoice.status === "DRAFT" ? (
                              <Badge variant="outline">Draft</Badge>
                            ) : invoice.isOverdue ? (
                              <Badge
                                variant={
                                  daysOverdue > 30
                                    ? "destructive"
                                    : daysOverdue > 14
                                    ? "secondary"
                                    : "outline"
                                }
                              >
                                {daysOverdue} days overdue
                              </Badge>
                            ) : (
                              <Badge variant="default">Current</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(invoice.amountDue)}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setViewingInvoice(invoice)}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  View Details
                                </DropdownMenuItem>

                                {invoice.status === "DRAFT" && (
                                  <>
                                    <DropdownMenuItem onClick={() => handleEditInvoice(invoice)}>
                                      <Pencil className="mr-2 h-4 w-4" />
                                      Edit Invoice
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setApprovingInvoice(invoice)}>
                                      <ShieldCheck className="mr-2 h-4 w-4" />
                                      Approve & Send
                                    </DropdownMenuItem>
                                  </>
                                )}

                                {invoice.status !== "DRAFT" && (
                                  <DropdownMenuItem onClick={() => openPaymentDialog(invoice)}>
                                    <CheckCircle className="mr-2 h-4 w-4" />
                                    Mark as Paid
                                  </DropdownMenuItem>
                                )}

                                {canDeleteInvoice(invoice) && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => setDeletingInvoice(invoice)}
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      {invoice.status === "AUTHORISED" ? "Void Invoice" : "Delete Invoice"}
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="insights" className="flex-1 min-h-0 overflow-y-auto mt-4">
              <CustomerPaymentInsights invoices={invoices} customerName={customerName} />
            </TabsContent>
          </Tabs>

          {/* Email Form */}
          {showEmailForm && (
            <div className="space-y-4 border rounded-lg p-4 shrink-0">
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
                  rows={6}
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

          {/* Footer Actions */}
          {!showEmailForm && (
            <div className="flex justify-end gap-2 pt-4 border-t shrink-0">
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

      {/* View Invoice Details Dialog */}
      <Dialog open={!!viewingInvoice} onOpenChange={(o) => !o && setViewingInvoice(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Invoice {viewingInvoice?.invoiceNumber}</DialogTitle>
            <DialogDescription>{viewingInvoice?.contactName}</DialogDescription>
          </DialogHeader>
          {viewingInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Reference</p>
                  <p className="font-medium">{viewingInvoice.reference || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge variant={viewingInvoice.status === "DRAFT" ? "outline" : "default"}>
                    {viewingInvoice.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Invoice Date</p>
                  <p className="font-medium">
                    {viewingInvoice.date ? format(new Date(viewingInvoice.date), "dd MMM yyyy") : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Due Date</p>
                  <p className={`font-medium ${viewingInvoice.isOverdue ? "text-destructive" : ""}`}>
                    {format(new Date(viewingInvoice.dueDate), "dd MMM yyyy")}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total</p>
                  <p className="font-medium">{formatCurrency(viewingInvoice.total)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Amount Due</p>
                  <p className="font-bold text-lg">{formatCurrency(viewingInvoice.amountDue)}</p>
                </div>
                {viewingInvoice.amountPaid > 0 && (
                  <div>
                    <p className="text-muted-foreground">Amount Paid</p>
                    <p className="font-medium text-primary">{formatCurrency(viewingInvoice.amountPaid)}</p>
                  </div>
                )}
              </div>

              {/* Line items for drafts */}
              {viewingInvoice.lineItems && viewingInvoice.lineItems.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Line Items</p>
                  <div className="border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right w-16">Qty</TableHead>
                          <TableHead className="text-right w-24">Price</TableHead>
                          <TableHead className="text-right w-24">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {viewingInvoice.lineItems!.map((li, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-sm">{li.description}</TableCell>
                            <TableCell className="text-right">{li.quantity}</TableCell>
                            <TableCell className="text-right">{formatCurrency(li.unitAmount)}</TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(li.quantity * li.unitAmount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingInvoice(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Invoice Confirmation */}
      <AlertDialog open={!!approvingInvoice} onOpenChange={(o) => !o && setApprovingInvoice(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Invoice</AlertDialogTitle>
            <AlertDialogDescription>
              Approve invoice <strong>{approvingInvoice?.invoiceNumber}</strong> for{" "}
              <strong>{approvingInvoice?.contactName}</strong> ({approvingInvoice && formatCurrency(approvingInvoice.total)})?
              <br /><br />
              This will authorise the invoice in Xero and automatically email it to the customer. Once approved, the invoice can no longer be edited.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isApproving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApproveInvoice} disabled={isApproving}>
              {isApproving ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Approving...</>
              ) : (
                <><ShieldCheck className="mr-2 h-4 w-4" />Approve & Send</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Invoice Confirmation */}
      <AlertDialog open={!!deletingInvoice} onOpenChange={(o) => !o && setDeletingInvoice(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete invoice <strong>{deletingInvoice?.invoiceNumber}</strong> for{" "}
              <strong>{deletingInvoice?.contactName}</strong>?
              <br /><br />
              {deletingInvoice?.status === "AUTHORISED"
                ? "This invoice will be voided in Xero as it has already been authorised."
                : "This invoice will be permanently deleted from Xero."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteInvoice}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting...</>
              ) : (
                deletingInvoice?.status === "AUTHORISED" ? "Void Invoice" : "Delete Invoice"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mark as Paid Dialog */}
      <Dialog open={!!payingInvoice} onOpenChange={(o) => !o && setPayingInvoice(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Invoice as Paid</DialogTitle>
            <DialogDescription>
              Record a payment for invoice <strong>{payingInvoice?.invoiceNumber}</strong>.
              This will create a payment record in Xero.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="custPaymentAmount">Payment Amount</Label>
              <Input
                id="custPaymentAmount"
                type="number"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder={payingInvoice?.amountDue.toString()}
              />
              <p className="text-xs text-muted-foreground">
                Invoice total: {payingInvoice && formatCurrency(payingInvoice.amountDue)}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="custPaymentDate">Payment Date</Label>
              <Input
                id="custPaymentDate"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayingInvoice(null)} disabled={isPaying}>
              Cancel
            </Button>
            <Button onClick={handleMarkAsPaid} disabled={isPaying}>
              {isPaying ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Applying...</>
              ) : (
                <><CheckCircle className="mr-2 h-4 w-4" />Apply Payment</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Draft Invoice Dialog */}
      <ManualInvoiceDialog
        open={!!editingInvoice}
        onOpenChange={(o) => !o && setEditingInvoice(null)}
        onSuccess={() => {
          setEditingInvoice(null);
          onEmailSent?.();
        }}
        editInvoice={editingInvoice}
      />
    </>
  );
}
