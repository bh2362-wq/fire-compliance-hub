import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Banknote,
  TrendingUp,
  HelpCircle,
  Calendar,
  Loader2,
} from "lucide-react";
import {
  fetchBankTransactions,
  applyPaymentToInvoice,
  BankTransaction,
  BankReconciliationSummary,
} from "@/services/bankReconciliationService";
import { format, parseISO, isValid, subDays } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

export function BankReconciliation() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [matched, setMatched] = useState<BankTransaction[]>([]);
  const [unmatched, setUnmatched] = useState<BankTransaction[]>([]);
  const [summary, setSummary] = useState<BankReconciliationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(
    format(subDays(new Date(), 30), "yyyy-MM-dd")
  );
  const [toDate, setToDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const loadTransactions = async () => {
    // Don't fetch if user is not authenticated or session isn't ready
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await fetchBankTransactions({ fromDate, toDate });
      setTransactions(data.transactions);
      setMatched(data.matched);
      setUnmatched(data.unmatched);
      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load transactions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, [user]);

  const handleReconcile = async (tx: BankTransaction) => {
    if (!tx.matchedInvoice) return;

    setReconcilingId(tx.transactionId);
    try {
      await applyPaymentToInvoice({
        invoiceId: tx.matchedInvoice.invoiceId,
        bankTransactionId: tx.transactionId,
        amount: tx.amount,
        date: tx.date ? tx.date.split("T")[0] : undefined,
      });

      toast({
        title: "Payment Applied",
        description: `Invoice ${tx.matchedInvoice.invoiceNumber} marked as paid (£${tx.amount.toFixed(2)})`,
      });

      // Remove from matched list and refresh
      setMatched((prev) => prev.filter((t) => t.transactionId !== tx.transactionId));
      
      // Update summary
      if (summary) {
        setSummary({
          ...summary,
          matchedCount: summary.matchedCount - 1,
          totalMatched: summary.totalMatched - tx.amount,
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to apply payment",
        variant: "destructive",
      });
    } finally {
      setReconcilingId(null);
    }
  };

  const formatDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return "N/A";
    try {
      const date = parseISO(dateStr);
      return isValid(date) ? format(date, "dd MMM yyyy") : "N/A";
    } catch {
      return "N/A";
    }
  };

  const formatCurrency = (amount: number) =>
    `£${amount.toLocaleString("en-GB", { minimumFractionDigits: 2 })}`;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Banknote className="w-4 h-4" />
            Bank Reconciliation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-12 w-full" />
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
            <Banknote className="w-4 h-4" />
            Bank Reconciliation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={loadTransactions}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Banknote className="w-4 h-4" />
          Bank Reconciliation
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={loadTransactions}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Date Range Filter */}
        <div className="flex items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="fromDate" className="text-xs">
              From
            </Label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="fromDate"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="pl-9 w-40"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="toDate" className="text-xs">
              To
            </Label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="toDate"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="pl-9 w-40"
              />
            </div>
          </div>
          <Button onClick={loadTransactions} size="sm">
            Apply
          </Button>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-muted/50 border">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <TrendingUp className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">Total Received</span>
              </div>
              <p className="text-lg font-semibold text-foreground">
                {formatCurrency(summary.totalReceived)}
              </p>
              <p className="text-xs text-muted-foreground">
                {summary.totalTransactions} transactions
              </p>
            </div>
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="flex items-center gap-2 text-green-600 mb-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">Matched</span>
              </div>
              <p className="text-lg font-semibold text-green-600">
                {formatCurrency(summary.totalMatched)}
              </p>
              <p className="text-xs text-muted-foreground">
                {summary.matchedCount} invoices
              </p>
            </div>
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <div className="flex items-center gap-2 text-amber-600 mb-1">
                <HelpCircle className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">Unmatched</span>
              </div>
              <p className="text-lg font-semibold text-amber-600">
                {formatCurrency(summary.totalUnmatched)}
              </p>
              <p className="text-xs text-muted-foreground">
                {summary.unmatchedCount} to review
              </p>
            </div>
          </div>
        )}

        {transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No incoming payments found in this period
          </p>
        ) : (
          <div className="space-y-4">
            {/* Matched Transactions */}
            {matched.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-green-600 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Ready to Reconcile ({matched.length})
                </h4>
                <div className="space-y-2">
                  {matched.slice(0, 5).map((tx) => (
                    <div
                      key={tx.transactionId}
                      className="flex items-center justify-between p-3 rounded-lg border border-green-500/30 bg-green-500/5"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {tx.contactName || "Unknown"}
                          </span>
                          <Badge
                            variant="outline"
                            className="bg-green-500/10 text-green-600 border-green-500/30"
                          >
                            {tx.matchConfidence}% match
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(tx.date)} • Invoice{" "}
                          {tx.matchedInvoice?.invoiceNumber}
                          {tx.reference && ` • Ref: ${tx.reference}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="font-semibold text-green-600">
                          {formatCurrency(tx.amount)}
                        </p>
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleReconcile(tx)}
                          disabled={reconcilingId === tx.transactionId}
                        >
                          {reconcilingId === tx.transactionId ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            "Mark Paid"
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                  {matched.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center">
                      +{matched.length - 5} more matched payments
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Unmatched Transactions */}
            {unmatched.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-amber-600 flex items-center gap-2">
                  <HelpCircle className="w-4 h-4" />
                  Needs Review ({unmatched.length})
                </h4>
                <div className="space-y-2">
                  {unmatched.slice(0, 5).map((tx) => (
                    <div
                      key={tx.transactionId}
                      className="flex items-center justify-between p-3 rounded-lg border border-amber-500/30 bg-amber-500/5"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {tx.contactName || "Unknown Sender"}
                          </span>
                          <Badge variant="secondary">Unmatched</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(tx.date)}
                          {tx.reference && ` • Ref: ${tx.reference}`}
                          {tx.bankAccount && ` • ${tx.bankAccount}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{formatCurrency(tx.amount)}</p>
                      </div>
                    </div>
                  ))}
                  {unmatched.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center">
                      +{unmatched.length - 5} more to review
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
