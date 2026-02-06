import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Building2,
  Shield,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Users,
  FileText,
  Loader2,
  Download,
  Link2,
  Mail,
  Sparkles,
  BarChart3,
  Calendar,
  ArrowRight,
  RefreshCw,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  FullAnalysisResult,
  runFullAnalysis,
  generateAIAnalysis,
  saveSharedReport,
} from "@/services/customerIntelligenceService";
import { fetchOutstandingInvoices } from "@/services/xeroService";
import { RISK_LEVEL_CONFIG } from "@/services/creditCheckService";
import { useAuth } from "@/contexts/AuthContext";

interface CustomerIntelligenceDashboardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
  companyNumber?: string | null;
  xeroContactId?: string | null;
}

export function CustomerIntelligenceDashboard({
  open,
  onOpenChange,
  customerId,
  customerName,
  companyNumber,
  xeroContactId,
}: CustomerIntelligenceDashboardProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [analysisData, setAnalysisData] = useState<FullAnalysisResult | null>(null);
  const [xeroMetrics, setXeroMetrics] = useState<any>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && companyNumber) {
      loadFullAnalysis();
    }
  }, [open, companyNumber]);

  const loadFullAnalysis = async () => {
    if (!companyNumber) return;
    setLoading(true);
    setError(null);

    try {
      const [chResult, xeroResult] = await Promise.all([
        runFullAnalysis(companyNumber, customerId),
        xeroContactId
          ? fetchOutstandingInvoices(xeroContactId).catch(() => null)
          : Promise.resolve(null),
      ]);

      setAnalysisData(chResult);

      if (xeroResult?.invoices) {
        const invoices = xeroResult.invoices;
        const totalOutstanding = invoices.reduce((s: number, i: any) => s + i.amountDue, 0);
        const overdueInvoices = invoices.filter((i: any) => i.isOverdue);
        const totalOverdue = overdueInvoices.reduce((s: number, i: any) => s + i.amountDue, 0);

        setXeroMetrics({
          invoiceCount: invoices.length,
          totalOutstanding,
          totalOverdue,
          overdueCount: overdueInvoices.length,
          averageDaysToPayEstimate: 30,
          paymentTrend: "stable",
        });
      }
    } catch (err: any) {
      setError(err.message);
      toast.error("Failed to load analysis");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateAI = async () => {
    if (!analysisData) return;
    setAiLoading(true);
    try {
      const analysis = await generateAIAnalysis(analysisData, xeroMetrics, customerName);
      setAiAnalysis(analysis);
    } catch (err: any) {
      toast.error(`AI analysis failed: ${err.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  const handleShare = async () => {
    if (!analysisData || !user) return;
    setSharing(true);
    try {
      const reportData = {
        customerName,
        analysisData,
        xeroMetrics,
        aiAnalysis,
        generatedAt: new Date().toISOString(),
      };
      const { shareToken } = await saveSharedReport(customerId, reportData, user.id);
      const shareUrl = `${window.location.origin}/shared-report/${shareToken}`;
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Shareable link copied to clipboard!");
      setTimeout(() => setCopied(false), 3000);
    } catch (err: any) {
      toast.error(`Failed to create share link: ${err.message}`);
    } finally {
      setSharing(false);
    }
  };

  const handleDownloadPDF = () => {
    toast.info("Generating PDF...");
    // Use dynamic import to keep bundle small
    import("@/lib/intelligenceReportPdfGenerator").then(({ generateIntelligenceReportPdf }) => {
      generateIntelligenceReportPdf({
        customerName,
        analysisData,
        xeroMetrics,
        aiAnalysis,
      });
      toast.success("PDF downloaded");
    });
  };

  const riskConfig = RISK_LEVEL_CONFIG[analysisData?.risk_level || "unknown"];
  const acctAnalysis = analysisData?.full_analysis?.account_analysis;

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);

  const accountTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      "micro-entity": "Micro-Entity",
      small: "Small",
      medium: "Medium",
      full: "Full",
      dormant: "Dormant",
      "total-exemption": "Total Exemption",
      unknown: "Unknown",
    };
    return labels[type] || type;
  };

  const accountTypeBadgeVariant = (type: string): "default" | "secondary" | "destructive" | "outline" => {
    if (type === "full" || type === "medium") return "default";
    if (type === "small" || type === "micro-entity") return "secondary";
    if (type === "dormant") return "destructive";
    return "outline";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <span className="text-xl">{customerName}</span>
                <p className="text-sm font-normal text-muted-foreground">
                  Financial Intelligence Dashboard
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {analysisData && (
                <>
                  <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
                    <Download className="w-4 h-4 mr-1" />
                    PDF
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleShare} disabled={sharing}>
                    {sharing ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-1" />
                    ) : copied ? (
                      <Check className="w-4 h-4 mr-1" />
                    ) : (
                      <Link2 className="w-4 h-4 mr-1" />
                    )}
                    {copied ? "Copied!" : "Share"}
                  </Button>
                </>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        {!companyNumber ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="text-center">
              <Building2 className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">No company linked yet</p>
              <p className="text-sm text-muted-foreground">
                Run a credit check first to link a Companies House record
              </p>
            </div>
          </div>
        ) : loading ? (
          <div className="flex-1 space-y-4 py-4">
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
            <Skeleton className="h-64" />
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="text-center">
              <AlertTriangle className="w-12 h-12 mx-auto text-destructive/50 mb-3" />
              <p className="text-destructive">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={loadFullAnalysis}>
                Retry
              </Button>
            </div>
          </div>
        ) : analysisData ? (
          <ScrollArea className="flex-1">
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="accounts">Filing History</TabsTrigger>
                <TabsTrigger value="officers">Officers & Charges</TabsTrigger>
                <TabsTrigger value="xero">Payment Data</TabsTrigger>
                <TabsTrigger value="ai">AI Analysis</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-4 pb-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MetricCard
                    icon={<Shield className="w-4 h-4" />}
                    label="Risk Level"
                    value={riskConfig.label}
                    badge={<Badge variant={riskConfig.variant}>{riskConfig.label}</Badge>}
                  />
                  <MetricCard
                    icon={<Building2 className="w-4 h-4" />}
                    label="Company Size"
                    value={accountTypeLabel(acctAnalysis?.sizeIndicator || "unknown")}
                    subtitle={`Files ${accountTypeLabel(acctAnalysis?.latestAccountType || "unknown")} accounts`}
                  />
                  <MetricCard
                    icon={<Calendar className="w-4 h-4" />}
                    label="Company Age"
                    value={analysisData.date_of_creation
                      ? `${Math.floor((Date.now() - new Date(analysisData.date_of_creation).getTime()) / (365.25 * 24 * 60 * 60 * 1000))} years`
                      : "Unknown"}
                    subtitle={analysisData.date_of_creation
                      ? `Since ${format(new Date(analysisData.date_of_creation), "MMM yyyy")}`
                      : undefined}
                  />
                  <MetricCard
                    icon={<FileText className="w-4 h-4" />}
                    label="Total Filings"
                    value={String(analysisData.full_analysis?.total_filings || 0)}
                    subtitle={`${acctAnalysis?.totalAccountFilings || 0} account filings`}
                  />
                </div>

                {/* Risk & Positive Factors */}
                <div className="grid md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        Risk Factors
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {analysisData.risk_factors.length > 0 ? (
                        <ul className="space-y-1.5">
                          {analysisData.risk_factors.map((f, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm">
                              <XCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                              <span>{f}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground">No risk factors identified</p>
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
                      {analysisData.positive_factors && analysisData.positive_factors.length > 0 ? (
                        <ul className="space-y-1.5">
                          {analysisData.positive_factors.map((f, i) => (
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

                {/* Company Details */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Company Details</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground text-xs">Status</span>
                        <p className="font-medium capitalize">{analysisData.company_status}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">Company No.</span>
                        <p className="font-medium">{analysisData.company_number}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">Type</span>
                        <p className="font-medium capitalize">{analysisData.company_type?.replace(/-/g, " ") || "—"}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">SIC Codes</span>
                        <p className="font-medium">{(analysisData.sic_codes || []).join(", ") || "—"}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Filing History Tab */}
              <TabsContent value="accounts" className="space-y-4 pb-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      Account Filings by Year
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {acctAnalysis?.yearlyAccounts && acctAnalysis.yearlyAccounts.length > 0 ? (
                      <div className="space-y-2">
                        {acctAnalysis.yearlyAccounts.map((year: any) => (
                          <div
                            key={year.year}
                            className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                          >
                            <div className="flex items-center gap-3">
                              <span className="font-mono font-bold text-sm w-12">{year.year}</span>
                              <Badge variant={accountTypeBadgeVariant(year.accountType)}>
                                {accountTypeLabel(year.accountType)}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              {year.isLate ? (
                                <Badge variant="destructive" className="text-xs">
                                  <AlertTriangle className="w-3 h-3 mr-1" />
                                  Late Filing
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs text-green-600">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  On Time
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No account filing history available
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Growth indicator */}
                {acctAnalysis && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        Filing Analysis
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground text-xs">Latest Account Type</span>
                          <p className="font-medium">{accountTypeLabel(acctAnalysis.latestAccountType)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Size Indicator</span>
                          <p className="font-medium capitalize">{acctAnalysis.sizeIndicator}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Growth Detected</span>
                          <p className="font-medium flex items-center gap-1">
                            {acctAnalysis.hasGrown ? (
                              <>
                                <TrendingUp className="w-4 h-4 text-green-500" /> Yes
                              </>
                            ) : (
                              <>
                                <ArrowRight className="w-4 h-4 text-muted-foreground" /> Stable
                              </>
                            )}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Total Account Filings</span>
                          <p className="font-medium">{acctAnalysis.totalAccountFilings}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Late Filings</span>
                          <p className={`font-medium ${acctAnalysis.lateFilingYears.length > 0 ? "text-destructive" : ""}`}>
                            {acctAnalysis.lateFilingYears.length} year(s)
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Officers & Charges Tab */}
              <TabsContent value="officers" className="space-y-4 pb-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Officers ({analysisData.full_analysis?.officer_count?.active || 0} Active)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {analysisData.officers
                          .filter((o) => !o.resigned_on)
                          .map((officer, i) => (
                            <div key={i} className="flex items-center justify-between p-2 rounded border text-sm">
                              <div>
                                <p className="font-medium">{officer.name}</p>
                                {officer.occupation && (
                                  <p className="text-xs text-muted-foreground">{officer.occupation}</p>
                                )}
                              </div>
                              <div className="text-right">
                                <Badge variant="outline" className="text-xs">
                                  {officer.role?.replace(/-/g, " ")}
                                </Badge>
                                {officer.appointed_on && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Since {officer.appointed_on}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        {analysisData.officers.filter((o) => !o.resigned_on).length === 0 && (
                          <p className="text-sm text-muted-foreground">No active officers found</p>
                        )}
                      </div>

                      {/* Resigned officers */}
                      {analysisData.officers.filter((o) => o.resigned_on).length > 0 && (
                        <div className="mt-4">
                          <p className="text-xs font-medium text-muted-foreground mb-2">
                            Resigned ({analysisData.full_analysis?.officer_count?.resigned || 0})
                          </p>
                          <div className="space-y-1">
                            {analysisData.officers
                              .filter((o) => o.resigned_on)
                              .slice(0, 5)
                              .map((officer, i) => (
                                <div key={i} className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span>{officer.name}</span>
                                  <span>Resigned {officer.resigned_on}</span>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Shield className="w-4 h-4" />
                        Charges & Mortgages
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {analysisData.full_analysis?.charges && analysisData.full_analysis.charges.length > 0 ? (
                        <div className="space-y-2">
                          {analysisData.full_analysis.charges.map((charge, i) => (
                            <div key={i} className="p-2 rounded border text-sm">
                              <div className="flex items-center justify-between mb-1">
                                <Badge
                                  variant={
                                    charge.status === "satisfied" || charge.status === "fully-satisfied"
                                      ? "outline"
                                      : "destructive"
                                  }
                                  className="text-xs"
                                >
                                  {charge.status}
                                </Badge>
                                {charge.created_on && (
                                  <span className="text-xs text-muted-foreground">
                                    Created {charge.created_on}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">{charge.description}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-4">
                          <CheckCircle className="w-8 h-8 mx-auto text-green-500 mb-2" />
                          <p className="text-sm text-muted-foreground">No charges registered</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Xero Payment Data Tab */}
              <TabsContent value="xero" className="space-y-4 pb-4">
                {xeroMetrics ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <MetricCard
                        icon={<FileText className="w-4 h-4" />}
                        label="Outstanding"
                        value={formatCurrency(xeroMetrics.totalOutstanding)}
                        subtitle={`${xeroMetrics.invoiceCount} invoices`}
                      />
                      <MetricCard
                        icon={<AlertTriangle className="w-4 h-4" />}
                        label="Overdue"
                        value={formatCurrency(xeroMetrics.totalOverdue)}
                        subtitle={`${xeroMetrics.overdueCount} invoices`}
                        alert={xeroMetrics.totalOverdue > 0}
                      />
                      <MetricCard
                        icon={<Clock className="w-4 h-4" />}
                        label="Avg Days to Pay"
                        value={String(xeroMetrics.averageDaysToPayEstimate)}
                        subtitle="days estimated"
                      />
                      <MetricCard
                        icon={<TrendingUp className="w-4 h-4" />}
                        label="Payment Trend"
                        value={xeroMetrics.paymentTrend}
                        badge={
                          <Badge
                            variant="outline"
                            className={
                              xeroMetrics.paymentTrend === "improving"
                                ? "text-green-600"
                                : xeroMetrics.paymentTrend === "declining"
                                ? "text-destructive"
                                : ""
                            }
                          >
                            {xeroMetrics.paymentTrend}
                          </Badge>
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground">No Xero account linked</p>
                    <p className="text-sm text-muted-foreground">
                      Link this customer to Xero to see payment data
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* AI Analysis Tab */}
              <TabsContent value="ai" className="space-y-4 pb-4">
                {!aiAnalysis ? (
                  <Card>
                    <CardContent className="py-8">
                      <div className="text-center">
                        <Sparkles className="w-12 h-12 mx-auto text-primary/50 mb-3" />
                        <h3 className="font-medium mb-1">AI Financial Analysis</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Generate an AI-powered analysis combining Companies House data
                          {xeroMetrics ? " and your payment history" : ""} to assess creditworthiness.
                        </p>
                        <Button onClick={handleGenerateAI} disabled={aiLoading}>
                          {aiLoading ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin mr-2" />
                              Analysing...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4 mr-2" />
                              Generate Analysis
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-primary" />
                          AI Analysis
                        </div>
                        <Button variant="outline" size="sm" onClick={handleGenerateAI} disabled={aiLoading}>
                          {aiLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">
                        {aiAnalysis}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </ScrollArea>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function MetricCard({
  icon,
  label,
  value,
  subtitle,
  badge,
  alert,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  badge?: React.ReactNode;
  alert?: boolean;
}) {
  return (
    <Card className={alert ? "border-destructive/30" : ""}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          {icon}
          <span className="text-xs font-medium">{label}</span>
        </div>
        {badge || (
          <p className={`text-lg font-bold ${alert ? "text-destructive" : ""}`}>{value}</p>
        )}
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
