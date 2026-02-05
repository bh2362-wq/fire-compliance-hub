import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Loader2, RefreshCw, AlertTriangle, Banknote, FileText, Users, Trash2, CheckCircle, Filter, Download, X, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { deleteXeroInvoice } from "@/services/xeroService";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface XeroInvoice {
  invoiceId: string;
  invoiceNumber: string;
  reference: string;
  contactId: string;
  contactName: string;
  date: string;
  dueDate: string;
  status: string;
  total: number;
  amountDue: number;
  amountPaid: number;
  currencyCode: string;
  isOverdue: boolean;
}

interface ContactBalance {
  contactId: string;
  name: string;
  email: string;
  outstanding: number;
  overdue: number;
}

interface InvoiceSummary {
  totalOutstanding: number;
  totalOverdue: number;
  invoiceCount: number;
  overdueCount: number;
}

interface InvoiceFilters {
  customer: string;
  status: string;
  search: string;
}

interface OutstandingInvoicesProps {
  searchQuery?: string;
}

export function OutstandingInvoices({ searchQuery = "" }: OutstandingInvoicesProps) {
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState<XeroInvoice[]>([]);
  const [contactBalances, setContactBalances] = useState<ContactBalance[]>([]);
  const [summary, setSummary] = useState<InvoiceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingInvoice, setDeletingInvoice] = useState<XeroInvoice | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [payingInvoice, setPayingInvoice] = useState<XeroInvoice | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [paymentAmount, setPaymentAmount] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<InvoiceFilters>({
    customer: "",
    status: "",
    search: "",
  });
  const { toast } = useToast();

  const fetchOutstandingInvoices = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("xero-invoices", {
        body: {},
      });

      if (fnError) throw new Error(fnError.message);
      if (data.error) throw new Error(data.error);

      setInvoices(data.invoices || []);
      setContactBalances(data.contactBalances || []);
      setSummary(data.summary || null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch invoices";
      setError(message);
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteInvoice = async () => {
    if (!deletingInvoice) return;
    
    setIsDeleting(true);
    try {
      const result = await deleteXeroInvoice(deletingInvoice.invoiceId);
      toast({
        title: "Success",
        description: result.message,
      });
      setDeletingInvoice(null);
      fetchOutstandingInvoices();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete invoice";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
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
      if (data.error) throw new Error(data.error);

      toast({
        title: "Payment Applied",
        description: `Invoice ${payingInvoice.invoiceNumber} marked as paid in Xero`,
      });
      setPayingInvoice(null);
      fetchOutstandingInvoices();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to apply payment";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsPaying(false);
    }
  };

  const openPaymentDialog = (invoice: XeroInvoice) => {
    setPayingInvoice(invoice);
    setPaymentAmount(invoice.amountDue.toString());
    setPaymentDate(format(new Date(), "yyyy-MM-dd"));
  };

  const canDeleteInvoice = (invoice: XeroInvoice) => {
    // Can only delete DRAFT or AUTHORISED invoices with no payments
    return (
      (invoice.status === "DRAFT" || invoice.status === "AUTHORISED") &&
      invoice.amountPaid === 0
    );
  };

  useEffect(() => {
    fetchOutstandingInvoices();
  }, []);

  // Get unique customers for filter dropdown
  const uniqueCustomers = useMemo(() => {
    const customers = new Set(invoices.map(inv => inv.contactName));
    return Array.from(customers).sort();
  }, [invoices]);

  // Combine external search query with internal filters
  const combinedSearch = searchQuery || filters.search;

  // Filter invoices based on current filters
  const filteredInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      const matchesSearch = !combinedSearch || 
        invoice.invoiceNumber.toLowerCase().includes(combinedSearch.toLowerCase()) ||
        invoice.contactName.toLowerCase().includes(combinedSearch.toLowerCase()) ||
        invoice.reference?.toLowerCase().includes(combinedSearch.toLowerCase());
      
      const matchesCustomer = !filters.customer || invoice.contactName === filters.customer;
      
      const matchesStatus = !filters.status || 
        (filters.status === "overdue" && invoice.isOverdue) ||
        (filters.status === "current" && !invoice.isOverdue) ||
        invoice.status === filters.status;

      return matchesSearch && matchesCustomer && matchesStatus;
    });
  }, [invoices, filters, combinedSearch]);

  const activeFilterCount = [filters.customer, filters.status, filters.search].filter(Boolean).length;

  const clearFilters = () => {
    setFilters({ customer: "", status: "", search: "" });
  };

  const handleExport = () => {
    if (filteredInvoices.length === 0) {
      toast({
        title: "No data to export",
        description: "Apply filters to select invoices to export",
        variant: "destructive",
      });
      return;
    }

    const headers = ["Invoice #", "Customer", "Reference", "Date", "Due Date", "Total", "Amount Due", "Amount Paid", "Status"];
    const rows = filteredInvoices.map((inv) => [
      inv.invoiceNumber,
      inv.contactName,
      inv.reference || "",
      formatDate(inv.date),
      formatDate(inv.dueDate),
      inv.total.toFixed(2),
      inv.amountDue.toFixed(2),
      inv.amountPaid.toFixed(2),
      inv.isOverdue ? "Overdue" : inv.status,
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `invoices-${format(new Date(), "yyyy-MM-dd")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Export Complete",
      description: `Exported ${filteredInvoices.length} invoices to CSV`,
    });
  };

  const formatCurrency = (amount: number, currency = "GBP") => {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
    }).format(amount);
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "-";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "-";
      return format(date, "dd MMM yyyy");
    } catch {
      return "-";
    }
  };

  if (error && !loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-warning" />
            <p>{error}</p>
            <Button variant="outline" className="mt-4" onClick={fetchOutstandingInvoices}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Outstanding</p>
                  <p className="text-2xl font-bold text-foreground">
                    {formatCurrency(summary.totalOutstanding)}
                  </p>
                </div>
                <Banknote className="w-8 h-8 text-primary opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Overdue</p>
                  <p className="text-2xl font-bold text-destructive">
                    {formatCurrency(summary.totalOverdue)}
                  </p>
                </div>
                <AlertTriangle className="w-8 h-8 text-destructive opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Open Invoices</p>
                  <p className="text-2xl font-bold text-foreground">{summary.invoiceCount}</p>
                </div>
                <FileText className="w-8 h-8 text-muted-foreground opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Overdue Invoices</p>
                  <p className="text-2xl font-bold text-destructive">{summary.overdueCount}</p>
                </div>
                <FileText className="w-8 h-8 text-destructive opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Banknote className="w-5 h-5" />
            Xero Outstanding Invoices
          </CardTitle>
          <Button variant="outline" size="sm" onClick={fetchOutstandingInvoices} disabled={loading}>
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            <span className="ml-2">Refresh</span>
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Tabs defaultValue="invoices">
              <div className="flex items-center justify-between mb-4">
                <TabsList>
                  <TabsTrigger value="invoices" className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Invoices ({filteredInvoices.length})
                  </TabsTrigger>
                  <TabsTrigger value="customers" className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Customer Balances ({contactBalances.length})
                  </TabsTrigger>
                </TabsList>

                <div className="flex items-center gap-2">
                  <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
                    <CollapsibleTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Filter className="h-4 w-4" />
                        Filters
                        {activeFilterCount > 0 && (
                          <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center">
                            {activeFilterCount}
                          </Badge>
                        )}
                        <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
                      </Button>
                    </CollapsibleTrigger>
                  </Collapsible>
                  <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
                    <Download className="h-4 w-4" />
                    Export
                  </Button>
                </div>
              </div>

              {/* Filter Panel */}
              <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
                <CollapsibleContent>
                  <div className="p-4 mb-4 border rounded-lg bg-muted/30 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Search</Label>
                        <Input
                          placeholder="Invoice #, customer, reference..."
                          value={filters.search}
                          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Customer</Label>
                        <Select
                          value={filters.customer}
                          onValueChange={(value) => setFilters({ ...filters, customer: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="All customers" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">All customers</SelectItem>
                            {uniqueCustomers.map((customer) => (
                              <SelectItem key={customer} value={customer}>
                                {customer}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select
                          value={filters.status}
                          onValueChange={(value) => setFilters({ ...filters, status: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="All statuses" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">All statuses</SelectItem>
                            <SelectItem value="overdue">Overdue</SelectItem>
                            <SelectItem value="current">Current</SelectItem>
                            <SelectItem value="AUTHORISED">Authorised</SelectItem>
                            <SelectItem value="DRAFT">Draft</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {activeFilterCount > 0 && (
                      <div className="flex justify-end">
                        <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-2">
                          <X className="h-4 w-4" />
                          Clear filters
                        </Button>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <TabsContent value="invoices" className="mt-4">
                {filteredInvoices.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No outstanding invoices found</p>
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice #</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Reference</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-right">Amount Due</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="w-[100px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredInvoices.map((invoice) => (
                          <TableRow key={invoice.invoiceId}>
                            <TableCell className="font-medium">
                              {invoice.invoiceNumber}
                            </TableCell>
                            <TableCell>{invoice.contactName}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {invoice.reference || "-"}
                            </TableCell>
                            <TableCell>
                              <span className={invoice.isOverdue ? "text-destructive font-medium" : ""}>
                                {formatDate(invoice.dueDate)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(invoice.total, invoice.currencyCode)}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(invoice.amountDue, invoice.currencyCode)}
                            </TableCell>
                            <TableCell>
                              {invoice.isOverdue ? (
                                <Badge variant="destructive">Overdue</Badge>
                              ) : (
                                <Badge variant="secondary">{invoice.status}</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-green-600"
                                  onClick={() => openPaymentDialog(invoice)}
                                  title="Mark as Paid"
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                                {canDeleteInvoice(invoice) && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    onClick={() => setDeletingInvoice(invoice)}
                                    title="Delete Invoice"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="customers" className="mt-4">
                {contactBalances.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No customers with outstanding balances</p>
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead className="text-right">Outstanding</TableHead>
                          <TableHead className="text-right">Overdue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {contactBalances.map((contact) => (
                          <TableRow key={contact.contactId}>
                            <TableCell className="font-medium">{contact.name}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {contact.email || "-"}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(contact.outstanding)}
                            </TableCell>
                            <TableCell className="text-right">
                              {contact.overdue > 0 ? (
                                <span className="text-destructive font-medium">
                                  {formatCurrency(contact.overdue)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingInvoice} onOpenChange={(open) => !open && setDeletingInvoice(null)}>
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
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                deletingInvoice?.status === "AUTHORISED" ? "Void Invoice" : "Delete Invoice"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mark as Paid Dialog */}
      <Dialog open={!!payingInvoice} onOpenChange={(open) => !open && setPayingInvoice(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Invoice as Paid</DialogTitle>
            <DialogDescription>
              Record a payment for invoice <strong>{payingInvoice?.invoiceNumber}</strong> ({payingInvoice?.contactName}).
              This will create a payment record in Xero and reconcile the invoice.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="paymentAmount">Payment Amount</Label>
              <Input
                id="paymentAmount"
                type="number"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder={payingInvoice?.amountDue.toString()}
              />
              <p className="text-xs text-muted-foreground">
                Invoice total: {payingInvoice && formatCurrency(payingInvoice.amountDue, payingInvoice.currencyCode)}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentDate">Payment Date</Label>
              <Input
                id="paymentDate"
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
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Applying...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Apply Payment
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
