import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { 
  PoundSterling, 
  AlertTriangle, 
  TrendingUp, 
  FileText, 
  RefreshCw,
  ExternalLink 
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchOutstandingInvoices, 
  getXeroConnection,
  XeroOutstandingInvoice,
  XeroInvoiceSummary 
} from "@/services/xeroService";
import { format, differenceInDays, isValid, parseISO } from "date-fns";

export function FinancialSummary() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [hasXero, setHasXero] = useState(false);
  const [summary, setSummary] = useState<XeroInvoiceSummary | null>(null);
  const [invoices, setInvoices] = useState<XeroOutstandingInvoice[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadFinancials = async () => {
    if (!user) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const conn = await getXeroConnection(user.id);
      setHasXero(!!conn);
      
      if (conn) {
        const data = await fetchOutstandingInvoices();
        setSummary(data.summary);
        // Get top 5 overdue or most recent invoices
        const sortedInvoices = data.invoices
          .sort((a, b) => {
            // Overdue first
            if (a.isOverdue && !b.isOverdue) return -1;
            if (!a.isOverdue && b.isOverdue) return 1;
            // Then by amount due
            return b.amountDue - a.amountDue;
          })
          .slice(0, 5);
        setInvoices(sortedInvoices);
      }
    } catch (err) {
      console.error("Error loading financials:", err);
      setError("Failed to load financial data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFinancials();
  }, [user]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PoundSterling className="w-5 h-5" />
            Financial Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
            <Skeleton className="h-32" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!hasXero) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PoundSterling className="w-5 h-5" />
            Financial Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground mb-2">
              Connect to Xero to view outstanding invoices and financial data
            </p>
            <Button variant="outline" size="sm" asChild>
              <a href="/dashboard/settings">
                Connect Xero
                <ExternalLink className="w-3 h-3 ml-1" />
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PoundSterling className="w-5 h-5" />
            Financial Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <AlertTriangle className="w-10 h-10 mx-auto text-destructive/50 mb-3" />
            <p className="text-sm text-muted-foreground mb-2">{error}</p>
            <Button variant="outline" size="sm" onClick={loadFinancials}>
              <RefreshCw className="w-3 h-3 mr-1" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
    }).format(amount);
  };

  const formatDueDate = (dateStr: string | undefined | null): string => {
    if (!dateStr) return "N/A";
    try {
      const date = parseISO(dateStr);
      return isValid(date) ? format(date, "d MMM") : "N/A";
    } catch {
      return "N/A";
    }
  };

  const calculateDaysOverdue = (dateStr: string | undefined | null): number => {
    if (!dateStr) return 0;
    try {
      const date = parseISO(dateStr);
      return isValid(date) ? differenceInDays(new Date(), date) : 0;
    } catch {
      return 0;
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2">
          <PoundSterling className="w-5 h-5" />
          Financial Summary
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={loadFinancials}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {/* Summary stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-4 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <TrendingUp className="w-4 h-4" />
              Outstanding
            </div>
            <div className="text-2xl font-bold">
              {formatCurrency(summary?.totalOutstanding || 0)}
            </div>
            <div className="text-xs text-muted-foreground">
              {summary?.invoiceCount || 0} invoices
            </div>
          </div>
          <div className={`p-4 rounded-lg ${(summary?.totalOverdue || 0) > 0 ? "bg-destructive/10" : "bg-muted/50"}`}>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <AlertTriangle className={`w-4 h-4 ${(summary?.totalOverdue || 0) > 0 ? "text-destructive" : ""}`} />
              Overdue
            </div>
            <div className={`text-2xl font-bold ${(summary?.totalOverdue || 0) > 0 ? "text-destructive" : ""}`}>
              {formatCurrency(summary?.totalOverdue || 0)}
            </div>
            <div className="text-xs text-muted-foreground">
              {summary?.overdueCount || 0} invoices
            </div>
          </div>
        </div>

        {/* Recent/Overdue invoices */}
        {invoices.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground mb-3">
              {invoices.some((i) => i.isOverdue) ? "Overdue & Outstanding" : "Outstanding Invoices"}
            </h4>
            {invoices.map((invoice) => {
              const daysOverdue = invoice.isOverdue 
                ? calculateDaysOverdue(invoice.dueDate)
                : 0;

              return (
                <div
                  key={invoice.invoiceId}
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{invoice.contactName}</span>
                      {invoice.isOverdue && (
                        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-xs">
                          {daysOverdue}d overdue
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {invoice.invoiceNumber} • Due {formatDueDate(invoice.dueDate)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-semibold ${invoice.isOverdue ? "text-destructive" : ""}`}>
                      {formatCurrency(invoice.amountDue)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-4 text-sm text-muted-foreground">
            No outstanding invoices 🎉
          </div>
        )}
      </CardContent>
    </Card>
  );
}
