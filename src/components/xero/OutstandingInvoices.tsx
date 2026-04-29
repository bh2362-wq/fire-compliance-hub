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
import { Loader2, RefreshCw, AlertTriangle, Banknote, FileText, Users, Trash2, CheckCircle, Filter, Download, X, ChevronDown, ShieldCheck, Pencil, ExternalLink, MoreHorizontal, FileSpreadsheet, Upload } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { deleteXeroInvoice, approveInvoice, XeroOutstandingInvoice, InvoiceLineItem, fetchInvoiceDetail, downloadInvoicePdf } from "@/services/xeroService";
import { ManualInvoiceDialog, EditInvoiceData } from "@/components/xero/ManualInvoiceDialog";
import { CustomerOverdueDialog } from "@/components/credit-control/CustomerOverdueDialog";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  lineItems?: InvoiceLineItem[];
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
  const [selectedCustomer, setSelectedCustomer] = useState<{ name: string; contactId: string } | null>(null);
  const [approvingInvoice, setApprovingInvoice] = useState<XeroInvoice | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<EditInvoiceData | null>(null);
  const [fetchingEditInvoice, setFetchingEditInvoice] = useState<string | null>(null);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
  const [isBulkApproving, setIsBulkApproving] = useState(false);
  const [showBulkApproveConfirm, setShowBulkApproveConfirm] = useState(false);
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null);
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

  const handleApproveInvoice = async () => {
    if (!approvingInvoice) return;
    
    setIsApproving(true);
    try {
      const result = await approveInvoice(approvingInvoice.invoiceId);
      toast({
        title: "Invoice Approved",
        description: result.message,
      });
      setApprovingInvoice(null);
      fetchOutstandingInvoices();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to approve invoice";
      // If the invoice is already authorised, treat as success
      if (message.includes("already AUTHORISED") || message.includes("already SUBMITTED")) {
        toast({
          title: "Invoice Already Approved",
          description: "This invoice was already approved — refreshing list.",
        });
        setApprovingInvoice(null);
        fetchOutstandingInvoices();
      } else {
        toast({
          title: "Error",
          description: message,
          variant: "destructive",
        });
      }
    } finally {
      setIsApproving(false);
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
    return (
      (invoice.status === "DRAFT" || invoice.status === "AUTHORISED") &&
      invoice.amountPaid === 0
    );
  };

  const handleEditInvoice = async (invoice: XeroInvoice) => {
    setFetchingEditInvoice(invoice.invoiceId);
    try {
      const detail = await fetchInvoiceDetail(invoice.invoiceId);
      setEditingInvoice({
        invoiceId: invoice.invoiceId,
        invoiceNumber: detail.invoiceNumber || invoice.invoiceNumber,
        contactId: detail.contactId || invoice.contactId,
        contactName: detail.contactName || invoice.contactName,
        reference: detail.reference || invoice.reference,
        dueDate: detail.dueDate || invoice.dueDate,
        total: detail.total || invoice.total,
        lineItems: detail.lineItems || [],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch invoice details";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setFetchingEditInvoice(null);
    }
  };

  const openInXero = (invoiceId: string) => {
    window.open(`https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${invoiceId}`, "_blank", "noopener,noreferrer");
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

  // Bulk selection helpers
  const draftInvoices = useMemo(() => filteredInvoices.filter(inv => inv.status === "DRAFT"), [filteredInvoices]);

  const toggleSelectInvoice = (invoiceId: string) => {
    setSelectedInvoiceIds(prev => {
      const next = new Set(prev);
      if (next.has(invoiceId)) next.delete(invoiceId);
      else next.add(invoiceId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedInvoiceIds.size === draftInvoices.length && draftInvoices.length > 0) {
      setSelectedInvoiceIds(new Set());
    } else {
      setSelectedInvoiceIds(new Set(draftInvoices.map(inv => inv.invoiceId)));
    }
  };

  const handleBulkApprove = async () => {
    setIsBulkApproving(true);
    let successCount = 0;
    let failCount = 0;

    for (const invoiceId of selectedInvoiceIds) {
      try {
        await approveInvoice(invoiceId);
        successCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        // Already authorised = success
        if (msg.includes("already AUTHORISED")) {
          successCount++;
        } else {
          failCount++;
        }
      }
    }

    toast({
      title: "Bulk Approve Complete",
      description: `${successCount} approved${failCount > 0 ? `, ${failCount} failed` : ""}`,
      variant: failCount > 0 ? "destructive" : "default",
    });

    setSelectedInvoiceIds(new Set());
    setShowBulkApproveConfirm(false);
    setIsBulkApproving(false);
    fetchOutstandingInvoices();
  };

  const handleExportBibby = () => {
    const invoicesToExport = selectedInvoiceIds.size > 0
      ? filteredInvoices.filter(inv => selectedInvoiceIds.has(inv.invoiceId))
      : filteredInvoices;

    if (invoicesToExport.length === 0) {
      toast({ title: "No invoices selected", description: "Select invoices or apply filters to export", variant: "destructive" });
      return;
    }

    const rows = invoicesToExport.map((inv) => ({
      "Customer ID": inv.contactName,
      "Reference": inv.invoiceNumber,
      "Date": inv.date ? format(new Date(inv.date), "dd/MM/yyyy") : "",
      "Document type": "Invoice",
      "Total amount": inv.total.toFixed(2),
      "Order number": inv.reference || "",
      "Currency Code": inv.currencyCode || "GBP",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Schedules");
    XLSX.writeFile(wb, `bibby-schedule-${format(new Date(), "yyyy-MM-dd")}.csv`, { bookType: "csv" });

    toast({ title: "Bibby Export Complete", description: `Exported ${invoicesToExport.length} invoices for factoring` });
  };

  const handleExportExcel = () => {
    if (filteredInvoices.length === 0) {
      toast({ title: "No data to export", variant: "destructive" });
      return;
    }

    const rows = filteredInvoices.map((inv) => ({
      "Invoice #": inv.invoiceNumber,
      "Customer": inv.contactName,
      "Reference": inv.reference || "",
      "Date": formatDate(inv.date),
      "Due Date": formatDate(inv.dueDate),
      "Total": inv.total,
      "Amount Due": inv.amountDue,
      "Amount Paid": inv.amountPaid,
      "Status": inv.isOverdue ? "Overdue" : inv.status,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Invoices");
    XLSX.writeFile(wb, `invoices-${format(new Date(), "yyyy-MM-dd")}.xlsx`);

    toast({ title: "Export Complete", description: `Exported ${filteredInvoices.length} invoices to Excel` });
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

          <Card
            className="cursor-pointer hover:border-destructive/50 transition-colors"
            onClick={() => {
              setFilters({ customer: "", status: "overdue", search: "" });
              setFiltersOpen(true);
            }}
          >
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

          <Card
            className="cursor-pointer hover:border-destructive/50 transition-colors"
            onClick={() => {
              setFilters({ customer: "", status: "overdue", search: "" });
              setFiltersOpen(true);
            }}
          >
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
                  {selectedInvoiceIds.size > 0 && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => setShowBulkApproveConfirm(true)}
                      className="gap-2"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      Approve Selected ({selectedInvoiceIds.size})
                    </Button>
                  )}
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
                  <Button variant="outline" size="sm" onClick={handleExportBibby} className="gap-2 border-primary/30 text-primary hover:bg-primary/10">
                    <Upload className="h-4 w-4" />
                    Bibby Export
                    {selectedInvoiceIds.size > 0 && (
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5">{selectedInvoiceIds.size}</Badge>
                    )}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportExcel} className="gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    Excel
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
                    <Download className="h-4 w-4" />
                    CSV
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
                          value={filters.customer || "all"}
                          onValueChange={(value) => setFilters({ ...filters, customer: value === "all" ? "" : value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="All customers" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All customers</SelectItem>
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
                          value={filters.status || "all"}
                          onValueChange={(value) => setFilters({ ...filters, status: value === "all" ? "" : value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="All statuses" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All statuses</SelectItem>
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
                          <TableHead className="w-[40px]">
                            <Checkbox
                              checked={draftInvoices.length > 0 && selectedInvoiceIds.size === draftInvoices.length}
                              onCheckedChange={toggleSelectAll}
                              aria-label="Select all draft invoices"
                            />
                          </TableHead>
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
                            <TableCell>
                              {invoice.status === "DRAFT" ? (
                                <Checkbox
                                  checked={selectedInvoiceIds.has(invoice.invoiceId)}
                                  onCheckedChange={() => toggleSelectInvoice(invoice.invoiceId)}
                                  aria-label={`Select invoice ${invoice.invoiceNumber}`}
                                />
                              ) : null}
                            </TableCell>
                            <TableCell className="font-medium">
                              {invoice.invoiceNumber}
                            </TableCell>
                            <TableCell>
                              <button
                                className="text-left font-medium text-primary hover:underline cursor-pointer"
                                onClick={() => setSelectedCustomer({ name: invoice.contactName, contactId: invoice.contactId })}
                              >
                                {invoice.contactName}
                              </button>
                            </TableCell>
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
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                  >
                                    {fetchingEditInvoice === invoice.invoiceId ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <MoreHorizontal className="h-4 w-4" />
                                    )}
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  {invoice.status === "DRAFT" && (
                                    <DropdownMenuItem
                                      onClick={() => handleEditInvoice(invoice)}
                                      disabled={!!fetchingEditInvoice}
                                    >
                                      <Pencil className="h-4 w-4 mr-2" />
                                      Edit Draft
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem
                                    onClick={() => openInXero(invoice.invoiceId)}
                                  >
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    Open in Xero
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  {invoice.status === "DRAFT" && (
                                    <DropdownMenuItem
                                      onClick={() => setApprovingInvoice(invoice)}
                                    >
                                      <ShieldCheck className="h-4 w-4 mr-2" />
                                      Approve & Send
                                    </DropdownMenuItem>
                                  )}
                                  {invoice.status !== "DRAFT" && (
                                    <DropdownMenuItem
                                      onClick={() => openPaymentDialog(invoice)}
                                    >
                                      <CheckCircle className="h-4 w-4 mr-2" />
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
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        {invoice.status === "AUTHORISED" ? "Void Invoice" : "Delete Invoice"}
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
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
                            <TableCell>
                              <button
                                className="text-left font-medium text-primary hover:underline cursor-pointer"
                                onClick={() => setSelectedCustomer({ name: contact.name, contactId: contact.contactId })}
                              >
                                {contact.name}
                              </button>
                            </TableCell>
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

      {/* Customer Outstanding Invoices Dialog */}
      {selectedCustomer && (
        <CustomerOverdueDialog
          open={!!selectedCustomer}
          onOpenChange={(open) => !open && setSelectedCustomer(null)}
          customerName={selectedCustomer.name}
          contactId={selectedCustomer.contactId}
          invoices={invoices.filter((inv) => inv.contactId === selectedCustomer.contactId) as XeroOutstandingInvoice[]}
          onEmailSent={() => fetchOutstandingInvoices()}
        />
      )}

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

      {/* Approve Invoice Confirmation Dialog */}
      <AlertDialog open={!!approvingInvoice} onOpenChange={(open) => !open && setApprovingInvoice(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Invoice</AlertDialogTitle>
            <AlertDialogDescription>
              Approve invoice <strong>{approvingInvoice?.invoiceNumber}</strong> for{" "}
              <strong>{approvingInvoice?.contactName}</strong> ({approvingInvoice && new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(approvingInvoice.total)})?
              <br /><br />
              This will authorise the invoice in Xero and automatically email it to the customer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isApproving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApproveInvoice}
              disabled={isApproving}
            >
              {isApproving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Approving...
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Approve & Send
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Approve Confirmation Dialog */}
      <AlertDialog open={showBulkApproveConfirm} onOpenChange={setShowBulkApproveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bulk Approve Invoices</AlertDialogTitle>
            <AlertDialogDescription>
              Approve and send <strong>{selectedInvoiceIds.size}</strong> draft invoice{selectedInvoiceIds.size !== 1 ? "s" : ""}?
              <br /><br />
              Each invoice will be authorised in Xero and automatically emailed to the customer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkApproving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkApprove}
              disabled={isBulkApproving}
            >
              {isBulkApproving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Approving...
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Approve All ({selectedInvoiceIds.size})
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Draft Invoice Dialog */}
      <ManualInvoiceDialog
        open={!!editingInvoice}
        onOpenChange={(open) => !open && setEditingInvoice(null)}
        onSuccess={() => {
          setEditingInvoice(null);
          fetchOutstandingInvoices();
        }}
        editInvoice={editingInvoice}
      />
    </div>
  );
}
