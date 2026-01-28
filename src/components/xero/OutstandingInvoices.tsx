import { useState, useEffect } from "react";
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
import { Loader2, RefreshCw, AlertTriangle, Banknote, FileText, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

export function OutstandingInvoices() {
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState<XeroInvoice[]>([]);
  const [contactBalances, setContactBalances] = useState<ContactBalance[]>([]);
  const [summary, setSummary] = useState<InvoiceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => {
    fetchOutstandingInvoices();
  }, []);

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
              <TabsList>
                <TabsTrigger value="invoices" className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Invoices ({invoices.length})
                </TabsTrigger>
                <TabsTrigger value="customers" className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Customer Balances ({contactBalances.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="invoices" className="mt-4">
                {invoices.length === 0 ? (
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
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoices.map((invoice) => (
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
    </div>
  );
}
