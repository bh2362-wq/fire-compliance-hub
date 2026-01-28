import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Clock, FileText, PoundSterling } from "lucide-react";
import { fetchOutstandingInvoices, XeroOutstandingInvoice } from "@/services/xeroService";
import { format, parseISO, isValid, differenceInDays } from "date-fns";

interface CustomerInvoicesProps {
  xeroContactId: string | null;
  customerName: string;
}

export function CustomerInvoices({ xeroContactId, customerName }: CustomerInvoicesProps) {
  const [invoices, setInvoices] = useState<XeroOutstandingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totals, setTotals] = useState({ outstanding: 0, overdue: 0 });

  useEffect(() => {
    if (!xeroContactId) {
      setLoading(false);
      return;
    }

    const loadInvoices = async () => {
      try {
        setLoading(true);
        const data = await fetchOutstandingInvoices(xeroContactId);
        setInvoices(data.invoices);
        
        // Calculate totals for this customer
        const outstanding = data.invoices.reduce((sum, inv) => sum + inv.amountDue, 0);
        const overdue = data.invoices
          .filter((inv) => inv.isOverdue)
          .reduce((sum, inv) => sum + inv.amountDue, 0);
        setTotals({ outstanding, overdue });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load invoices");
      } finally {
        setLoading(false);
      }
    };

    loadInvoices();
  }, [xeroContactId]);

  const formatDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return "N/A";
    try {
      const date = parseISO(dateStr);
      return isValid(date) ? format(date, "dd MMM yyyy") : "N/A";
    } catch {
      return "N/A";
    }
  };

  const getDaysOverdue = (dueDateStr: string): number => {
    try {
      const dueDate = parseISO(dueDateStr);
      if (!isValid(dueDate)) return 0;
      const days = differenceInDays(new Date(), dueDate);
      return days > 0 ? days : 0;
    } catch {
      return 0;
    }
  };

  const getOverdueBadgeVariant = (days: number): "destructive" | "secondary" | "outline" => {
    if (days > 30) return "destructive";
    if (days > 14) return "secondary";
    return "outline";
  };

  if (!xeroContactId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Invoices
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No Xero account linked. Link this customer to Xero to view invoice details.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Invoices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Invoices
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const overdueInvoices = invoices.filter((inv) => inv.isOverdue);
  const dueInvoices = invoices.filter((inv) => !inv.isOverdue);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Invoices
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-muted/50 border">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <PoundSterling className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">Outstanding</span>
            </div>
            <p className="text-lg font-semibold text-foreground">
              £{totals.outstanding.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <div className="flex items-center gap-2 text-destructive mb-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">Overdue</span>
            </div>
            <p className="text-lg font-semibold text-destructive">
              £{totals.overdue.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No outstanding invoices
          </p>
        ) : (
          <div className="space-y-4">
            {/* Overdue Invoices */}
            {overdueInvoices.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-destructive flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Overdue ({overdueInvoices.length})
                </h4>
                <div className="space-y-2">
                  {overdueInvoices.map((invoice) => {
                    const daysOverdue = getDaysOverdue(invoice.dueDate);
                    return (
                      <div
                        key={invoice.invoiceId}
                        className="flex items-center justify-between p-3 rounded-lg border border-destructive/30 bg-destructive/5"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">
                              {invoice.invoiceNumber}
                            </span>
                            <Badge variant={getOverdueBadgeVariant(daysOverdue)}>
                              {daysOverdue} days overdue
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Due: {formatDate(invoice.dueDate)}
                            {invoice.reference && ` • Ref: ${invoice.reference}`}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-destructive">
                            £{invoice.amountDue.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Due Invoices */}
            {dueInvoices.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Due ({dueInvoices.length})
                </h4>
                <div className="space-y-2">
                  {dueInvoices.map((invoice) => (
                    <div
                      key={invoice.invoiceId}
                      className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {invoice.invoiceNumber}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Due: {formatDate(invoice.dueDate)}
                          {invoice.reference && ` • Ref: ${invoice.reference}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">
                          £{invoice.amountDue.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
