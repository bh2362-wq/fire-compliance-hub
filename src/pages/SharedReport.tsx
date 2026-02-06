import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Users,
  FileText,
  BarChart3,
  Calendar,
  TrendingUp,
  ArrowRight,
  Sparkles,
  Clock,
} from "lucide-react";
import { getSharedReport } from "@/services/customerIntelligenceService";
import { RISK_LEVEL_CONFIG } from "@/services/creditCheckService";

const SharedReport = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token) loadReport();
  }, [token]);

  const loadReport = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await getSharedReport(token);
      if (!data) {
        setError("Report not found or has expired");
      } else {
        setReport(data.report_data);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-4xl mx-auto space-y-4">
          <Skeleton className="h-12 w-64" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-bold mb-2">Report Unavailable</h2>
          <p className="text-muted-foreground">{error || "This report is no longer available"}</p>
        </div>
      </div>
    );
  }

  const { customerName, analysisData, xeroMetrics, aiAnalysis, generatedAt } = report;
  const riskConfig = RISK_LEVEL_CONFIG[analysisData?.risk_level || "unknown"];
  const acctAnalysis = analysisData?.full_analysis?.account_analysis;

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);

  const accountTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      "micro-entity": "Micro-Entity", small: "Small", medium: "Medium",
      full: "Full", dormant: "Dormant", "total-exemption": "Total Exemption", unknown: "Unknown",
    };
    return labels[type] || type;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="text-center border-b pb-6">
          <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <BarChart3 className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">{customerName}</h1>
          <p className="text-muted-foreground">Customer Intelligence Report</p>
          {generatedAt && (
            <p className="text-xs text-muted-foreground mt-1">
              Generated {new Date(generatedAt).toLocaleDateString("en-GB", {
                day: "numeric", month: "long", year: "numeric",
              })}
            </p>
          )}
        </div>

        {/* Overview Cards */}
        {analysisData && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Shield className="w-4 h-4" />
                    <span className="text-xs font-medium">Risk Level</span>
                  </div>
                  <Badge variant={riskConfig.variant}>{riskConfig.label}</Badge>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Building2 className="w-4 h-4" />
                    <span className="text-xs font-medium">Company Size</span>
                  </div>
                  <p className="text-lg font-bold">{accountTypeLabel(acctAnalysis?.sizeIndicator || "unknown")}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Calendar className="w-4 h-4" />
                    <span className="text-xs font-medium">Company Age</span>
                  </div>
                  <p className="text-lg font-bold">
                    {analysisData.date_of_creation
                      ? `${Math.floor((Date.now() - new Date(analysisData.date_of_creation).getTime()) / (365.25 * 24 * 60 * 60 * 1000))} years`
                      : "Unknown"}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <FileText className="w-4 h-4" />
                    <span className="text-xs font-medium">Total Filings</span>
                  </div>
                  <p className="text-lg font-bold">{analysisData.full_analysis?.total_filings || 0}</p>
                </CardContent>
              </Card>
            </div>

            {/* Risk + Positive Factors */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Risk Factors
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {analysisData.risk_factors?.length > 0 ? (
                    <ul className="space-y-1.5">
                      {analysisData.risk_factors.map((f: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <XCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No risk factors</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Positive Indicators
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {analysisData.positive_factors?.length > 0 ? (
                    <ul className="space-y-1.5">
                      {analysisData.positive_factors.map((f: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <CheckCircle className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No positive factors noted</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Filing History */}
            {acctAnalysis?.yearlyAccounts?.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    Account Filing History
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {acctAnalysis.yearlyAccounts.map((year: any) => (
                      <div key={year.year} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-sm w-12">{year.year}</span>
                          <Badge variant="secondary">{accountTypeLabel(year.accountType)}</Badge>
                        </div>
                        <Badge variant={year.isLate ? "destructive" : "outline"} className={year.isLate ? "" : "text-green-600"}>
                          {year.isLate ? "Late Filing" : "On Time"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Xero Data */}
        {xeroMetrics && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Payment Data
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">Outstanding</span>
                  <p className="font-bold">{formatCurrency(xeroMetrics.totalOutstanding)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Overdue</span>
                  <p className={`font-bold ${xeroMetrics.totalOverdue > 0 ? "text-destructive" : ""}`}>
                    {formatCurrency(xeroMetrics.totalOverdue)}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Avg Days to Pay</span>
                  <p className="font-bold">{xeroMetrics.averageDaysToPayEstimate} days</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Payment Trend</span>
                  <p className="font-bold capitalize">{xeroMetrics.paymentTrend}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* AI Analysis */}
        {aiAnalysis && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                AI Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{aiAnalysis}</div>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground border-t pt-4">
          <p>This report is confidential and intended for authorised recipients only.</p>
        </div>
      </div>
    </div>
  );
};

export default SharedReport;
