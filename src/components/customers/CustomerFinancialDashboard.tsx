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
   PoundSterling,
   TrendingUp,
   TrendingDown,
   AlertTriangle,
   Clock,
   CheckCircle2,
   BarChart3,
   Calendar,
   ArrowRight,
   ShieldCheck,
   ShieldAlert,
   ShieldX,
   Percent,
   FileText,
   X,
 } from "lucide-react";
 import {
   fetchOutstandingInvoices,
   XeroOutstandingInvoice,
 } from "@/services/xeroService";
 import { format, parseISO, isValid, differenceInDays, differenceInMonths } from "date-fns";
 import { InvoiceInsightsDialog } from "./InvoiceInsightsDialog";
 import { InvoiceActionsDrawer } from "@/components/xero/InvoiceActionsDrawer";
 
 interface CustomerFinancialDashboardProps {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   customerId: string;
   customerName: string;
   xeroContactId: string | null;
 }
 
 interface FinancialMetrics {
   totalOutstanding: number;
   totalOverdue: number;
   invoiceCount: number;
   overdueCount: number;
   averageDaysToPayEstimate: number;
   oldestInvoiceAge: number;
   creditUtilization: number;
   riskScore: "low" | "medium" | "high";
   riskFactors: string[];
   paymentTrend: "improving" | "stable" | "declining";
   revenueThisMonth: number;
   revenueLastMonth: number;
   revenueGrowth: number;
 }
 
 export function CustomerFinancialDashboard({
   open,
   onOpenChange,
   customerId,
   customerName,
   xeroContactId,
 }: CustomerFinancialDashboardProps) {
   const [loading, setLoading] = useState(true);
   const [invoices, setInvoices] = useState<XeroOutstandingInvoice[]>([]);
   const [selectedInvoice, setSelectedInvoice] = useState<XeroOutstandingInvoice | null>(null);
   // Action drawer (Mark as paid + record to bank account, Void,
   // Download PDF, View in Xero). Set by tapping an invoice row.
   const [actionInvoice, setActionInvoice] = useState<XeroOutstandingInvoice | null>(null);
   const [error, setError] = useState<string | null>(null);
 
   useEffect(() => {
     if (open && xeroContactId) {
       loadFinancialData();
     }
   }, [open, xeroContactId]);
 
   const loadFinancialData = async () => {
     if (!xeroContactId) return;
     setLoading(true);
     setError(null);
     try {
       const data = await fetchOutstandingInvoices(xeroContactId);
       setInvoices(data.invoices);
     } catch (err) {
       setError(err instanceof Error ? err.message : "Failed to load financial data");
     } finally {
       setLoading(false);
     }
   };
 
   const metrics = useMemo<FinancialMetrics>(() => {
     if (invoices.length === 0) {
       return {
         totalOutstanding: 0,
         totalOverdue: 0,
         invoiceCount: 0,
         overdueCount: 0,
         averageDaysToPayEstimate: 0,
         oldestInvoiceAge: 0,
         creditUtilization: 0,
         riskScore: "low",
         riskFactors: [],
         paymentTrend: "stable",
         revenueThisMonth: 0,
         revenueLastMonth: 0,
         revenueGrowth: 0,
       };
     }
 
     const now = new Date();
     const totalOutstanding = invoices.reduce((sum, inv) => sum + inv.amountDue, 0);
     const overdueInvoices = invoices.filter((inv) => inv.isOverdue);
     const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + inv.amountDue, 0);
 
     // Calculate oldest invoice age
     let oldestAge = 0;
     invoices.forEach((inv) => {
       try {
         const date = parseISO(inv.date);
         if (isValid(date)) {
           const age = differenceInDays(now, date);
           if (age > oldestAge) oldestAge = age;
         }
       } catch {}
     });
 
     // Estimate average days to pay based on overdue patterns
     let avgDaysOverdue = 0;
     if (overdueInvoices.length > 0) {
       const totalDaysOverdue = overdueInvoices.reduce((sum, inv) => {
         try {
           const dueDate = parseISO(inv.dueDate);
           if (isValid(dueDate)) {
             return sum + differenceInDays(now, dueDate);
           }
         } catch {}
         return sum;
       }, 0);
       avgDaysOverdue = Math.round(totalDaysOverdue / overdueInvoices.length);
     }
 
     // Risk scoring
     const riskFactors: string[] = [];
     let riskPoints = 0;
 
     // High overdue ratio
     const overdueRatio = totalOutstanding > 0 ? totalOverdue / totalOutstanding : 0;
     if (overdueRatio > 0.5) {
       riskPoints += 3;
       riskFactors.push("Over 50% of balance is overdue");
     } else if (overdueRatio > 0.25) {
       riskPoints += 2;
       riskFactors.push("Over 25% of balance is overdue");
     }
 
     // Long overdue invoices (>30 days)
     const longOverdue = overdueInvoices.filter((inv) => {
       try {
         const dueDate = parseISO(inv.dueDate);
         if (isValid(dueDate)) {
           return differenceInDays(now, dueDate) > 30;
         }
       } catch {}
       return false;
     });
     if (longOverdue.length > 0) {
       riskPoints += 2;
       riskFactors.push(`${longOverdue.length} invoice(s) overdue by 30+ days`);
     }
 
     // Large outstanding balance
     if (totalOutstanding > 10000) {
       riskPoints += 1;
       riskFactors.push("Large outstanding balance (>£10k)");
     }
 
     // Multiple overdue invoices
     if (overdueInvoices.length >= 3) {
       riskPoints += 2;
       riskFactors.push("Multiple overdue invoices");
     }
 
     const riskScore: "low" | "medium" | "high" =
       riskPoints >= 5 ? "high" : riskPoints >= 2 ? "medium" : "low";
 
     // Determine payment trend based on invoice ages
     const recentInvoices = invoices.filter((inv) => {
       try {
         const date = parseISO(inv.date);
         if (isValid(date)) {
           return differenceInDays(now, date) <= 30;
         }
       } catch {}
       return false;
     });
     const olderInvoices = invoices.filter((inv) => {
       try {
         const date = parseISO(inv.date);
         if (isValid(date)) {
           const days = differenceInDays(now, date);
           return days > 30 && days <= 60;
         }
       } catch {}
       return false;
     });
 
     const recentOverdueRate = recentInvoices.length > 0 
       ? recentInvoices.filter(i => i.isOverdue).length / recentInvoices.length 
       : 0;
     const olderOverdueRate = olderInvoices.length > 0 
       ? olderInvoices.filter(i => i.isOverdue).length / olderInvoices.length 
       : 0;
 
     let paymentTrend: "improving" | "stable" | "declining" = "stable";
     if (recentOverdueRate < olderOverdueRate - 0.2) {
       paymentTrend = "improving";
     } else if (recentOverdueRate > olderOverdueRate + 0.2) {
       paymentTrend = "declining";
     }
 
     // Revenue calculation from invoices this month vs last month
     const thisMonth = now.getMonth();
     const thisYear = now.getFullYear();
     const revenueThisMonth = invoices
       .filter((inv) => {
         try {
           const date = parseISO(inv.date);
           return isValid(date) && date.getMonth() === thisMonth && date.getFullYear() === thisYear;
         } catch {}
         return false;
       })
       .reduce((sum, inv) => sum + inv.total, 0);
 
     const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
     const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;
     const revenueLastMonth = invoices
       .filter((inv) => {
         try {
           const date = parseISO(inv.date);
           return isValid(date) && date.getMonth() === lastMonth && date.getFullYear() === lastMonthYear;
         } catch {}
         return false;
       })
       .reduce((sum, inv) => sum + inv.total, 0);
 
     const revenueGrowth = revenueLastMonth > 0 
       ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100 
       : 0;
 
     return {
       totalOutstanding,
       totalOverdue,
       invoiceCount: invoices.length,
       overdueCount: overdueInvoices.length,
       averageDaysToPayEstimate: avgDaysOverdue > 0 ? 30 + avgDaysOverdue : 30,
       oldestInvoiceAge: oldestAge,
       creditUtilization: overdueRatio * 100,
       riskScore,
       riskFactors,
       paymentTrend,
       revenueThisMonth,
       revenueLastMonth,
       revenueGrowth,
     };
   }, [invoices]);
 
   const formatCurrency = (amount: number) =>
     new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);
 
   const formatDate = (dateStr: string) => {
     try {
       const date = parseISO(dateStr);
       return isValid(date) ? format(date, "dd MMM yyyy") : "N/A";
     } catch {
       return "N/A";
     }
   };
 
   const getDaysOverdue = (dueDate: string) => {
     try {
       const date = parseISO(dueDate);
       if (!isValid(date)) return 0;
       const days = differenceInDays(new Date(), date);
       return days > 0 ? days : 0;
     } catch {
       return 0;
     }
   };
 
   const RiskBadge = ({ score }: { score: "low" | "medium" | "high" }) => {
     const config = {
       low: { icon: ShieldCheck, color: "text-green-600", bg: "bg-green-100", label: "Low Risk" },
       medium: { icon: ShieldAlert, color: "text-amber-600", bg: "bg-amber-100", label: "Medium Risk" },
       high: { icon: ShieldX, color: "text-destructive", bg: "bg-destructive/10", label: "High Risk" },
     };
     const { icon: Icon, color, bg, label } = config[score];
     return (
       <Badge variant="outline" className={`${bg} ${color} border-0 gap-1`}>
         <Icon className="w-3.5 h-3.5" />
         {label}
       </Badge>
     );
   };
 
   const TrendBadge = ({ trend }: { trend: "improving" | "stable" | "declining" }) => {
     const config = {
       improving: { icon: TrendingUp, color: "text-green-600", bg: "bg-green-100", label: "Improving" },
       stable: { icon: ArrowRight, color: "text-blue-600", bg: "bg-blue-100", label: "Stable" },
       declining: { icon: TrendingDown, color: "text-destructive", bg: "bg-destructive/10", label: "Declining" },
     };
     const { icon: Icon, color, bg, label } = config[trend];
     return (
       <Badge variant="outline" className={`${bg} ${color} border-0 gap-1`}>
         <Icon className="w-3.5 h-3.5" />
         {label}
       </Badge>
     );
   };
 
   return (
     <>
       <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent className="max-w-4xl max-h-[90dvh] overflow-hidden flex flex-col">
           <DialogHeader>
             <DialogTitle className="flex items-center gap-3">
               <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                 <BarChart3 className="w-5 h-5 text-primary" />
               </div>
               <div>
                 <span className="text-xl">{customerName}</span>
                 <p className="text-sm font-normal text-muted-foreground">Financial Overview</p>
               </div>
             </DialogTitle>
           </DialogHeader>
 
           {!xeroContactId ? (
             <div className="flex-1 flex items-center justify-center py-12">
               <div className="text-center">
                 <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                 <p className="text-muted-foreground">No Xero account linked</p>
                 <p className="text-sm text-muted-foreground">Link this customer to Xero to view financial insights</p>
               </div>
             </div>
           ) : loading ? (
             <div className="flex-1 space-y-4 py-4">
               <div className="grid grid-cols-4 gap-4">
                 {[1, 2, 3, 4].map((i) => (
                   <Skeleton key={i} className="h-24" />
                 ))}
               </div>
               <Skeleton className="h-48" />
             </div>
           ) : error ? (
             <div className="flex-1 flex items-center justify-center py-12">
               <div className="text-center">
                 <AlertTriangle className="w-12 h-12 mx-auto text-destructive/50 mb-3" />
                 <p className="text-destructive">{error}</p>
                 <Button variant="outline" size="sm" className="mt-3" onClick={loadFinancialData}>
                   Retry
                 </Button>
               </div>
             </div>
           ) : (
             <ScrollArea className="flex-1">
               <Tabs defaultValue="overview" className="w-full">
                 <TabsList className="mb-4">
                   <TabsTrigger value="overview">Overview</TabsTrigger>
                   <TabsTrigger value="invoices">Invoices</TabsTrigger>
                   <TabsTrigger value="risk">Risk Analysis</TabsTrigger>
                 </TabsList>
 
                 <TabsContent value="overview" className="space-y-6">
                   {/* Key Metrics */}
                   <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                     <Card>
                       <CardContent className="pt-4">
                         <div className="flex items-center gap-2 text-muted-foreground mb-1">
                           <PoundSterling className="w-4 h-4" />
                           <span className="text-xs font-medium">Outstanding</span>
                         </div>
                         <p className="text-2xl font-bold">{formatCurrency(metrics.totalOutstanding)}</p>
                         <p className="text-xs text-muted-foreground">{metrics.invoiceCount} invoices</p>
                       </CardContent>
                     </Card>
 
                     <Card className={metrics.totalOverdue > 0 ? "border-destructive/30" : ""}>
                       <CardContent className="pt-4">
                         <div className="flex items-center gap-2 text-muted-foreground mb-1">
                           <AlertTriangle className={`w-4 h-4 ${metrics.totalOverdue > 0 ? "text-destructive" : ""}`} />
                           <span className="text-xs font-medium">Overdue</span>
                         </div>
                         <p className={`text-2xl font-bold ${metrics.totalOverdue > 0 ? "text-destructive" : ""}`}>
                           {formatCurrency(metrics.totalOverdue)}
                         </p>
                         <p className="text-xs text-muted-foreground">{metrics.overdueCount} invoices</p>
                       </CardContent>
                     </Card>
 
                     <Card>
                       <CardContent className="pt-4">
                         <div className="flex items-center gap-2 text-muted-foreground mb-1">
                           <Clock className="w-4 h-4" />
                           <span className="text-xs font-medium">Avg. Days to Pay</span>
                         </div>
                         <p className="text-2xl font-bold">{metrics.averageDaysToPayEstimate}</p>
                         <p className="text-xs text-muted-foreground">Estimated</p>
                       </CardContent>
                     </Card>
 
                     <Card>
                       <CardContent className="pt-4">
                         <div className="flex items-center gap-2 text-muted-foreground mb-1">
                           <Calendar className="w-4 h-4" />
                           <span className="text-xs font-medium">Oldest Invoice</span>
                         </div>
                         <p className="text-2xl font-bold">{metrics.oldestInvoiceAge}</p>
                         <p className="text-xs text-muted-foreground">Days old</p>
                       </CardContent>
                     </Card>
                   </div>
 
                   {/* Insights Row */}
                   <div className="grid md:grid-cols-3 gap-4">
                     <Card>
                       <CardHeader className="pb-2">
                         <CardTitle className="text-sm font-medium flex items-center gap-2">
                           Credit Risk
                           <RiskBadge score={metrics.riskScore} />
                         </CardTitle>
                       </CardHeader>
                       <CardContent>
                         {metrics.riskFactors.length > 0 ? (
                           <ul className="text-xs text-muted-foreground space-y-1">
                             {metrics.riskFactors.map((factor, i) => (
                               <li key={i} className="flex items-start gap-2">
                                 <span className="text-amber-500 mt-0.5">•</span>
                                 {factor}
                               </li>
                             ))}
                           </ul>
                         ) : (
                           <p className="text-xs text-muted-foreground flex items-center gap-2">
                             <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                             No significant risk factors identified
                           </p>
                         )}
                       </CardContent>
                     </Card>
 
                     <Card>
                       <CardHeader className="pb-2">
                         <CardTitle className="text-sm font-medium flex items-center gap-2">
                           Payment Trend
                           <TrendBadge trend={metrics.paymentTrend} />
                         </CardTitle>
                       </CardHeader>
                       <CardContent>
                         <div className="flex items-center gap-2">
                           <Percent className="w-4 h-4 text-muted-foreground" />
                           <span className="text-xs text-muted-foreground">
                             {metrics.creditUtilization.toFixed(0)}% of balance is overdue
                           </span>
                         </div>
                         <p className="text-xs text-muted-foreground mt-2">
                           {metrics.paymentTrend === "improving"
                             ? "Payment behavior has improved recently"
                             : metrics.paymentTrend === "declining"
                             ? "Payment delays are increasing"
                             : "Payment pattern is consistent"}
                         </p>
                       </CardContent>
                     </Card>
 
                     <Card>
                       <CardHeader className="pb-2">
                         <CardTitle className="text-sm font-medium">Revenue This Month</CardTitle>
                       </CardHeader>
                       <CardContent>
                         <p className="text-xl font-bold">{formatCurrency(metrics.revenueThisMonth)}</p>
                         <div className="flex items-center gap-2 mt-1">
                           {metrics.revenueGrowth > 0 ? (
                             <Badge variant="outline" className="bg-green-100 text-green-600 border-0 text-xs">
                               <TrendingUp className="w-3 h-3 mr-1" />
                               +{metrics.revenueGrowth.toFixed(0)}%
                             </Badge>
                           ) : metrics.revenueGrowth < 0 ? (
                             <Badge variant="outline" className="bg-destructive/10 text-destructive border-0 text-xs">
                               <TrendingDown className="w-3 h-3 mr-1" />
                               {metrics.revenueGrowth.toFixed(0)}%
                             </Badge>
                           ) : null}
                           <span className="text-xs text-muted-foreground">vs last month</span>
                         </div>
                       </CardContent>
                     </Card>
                   </div>
                 </TabsContent>
 
                 <TabsContent value="invoices" className="space-y-4">
                   {invoices.length === 0 ? (
                     <div className="text-center py-12">
                       <FileText className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
                       <p className="text-muted-foreground">No outstanding invoices</p>
                     </div>
                   ) : (
                     <div className="space-y-2">
                       {invoices.map((invoice) => {
                         const daysOverdue = invoice.isOverdue ? getDaysOverdue(invoice.dueDate) : 0;
                         return (
                           <div
                             key={invoice.invoiceId}
                             onClick={() => setActionInvoice(invoice)}
                             className={`flex items-center justify-between p-4 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50 ${
                               invoice.isOverdue ? "border-destructive/30 bg-destructive/5" : "bg-card"
                             }`}
                           >
                             <div className="space-y-1">
                               <div className="flex items-center gap-2">
                                 <span className="font-medium">{invoice.invoiceNumber}</span>
                                 {invoice.isOverdue && (
                                   <Badge variant="destructive" className="text-xs">
                                     {daysOverdue}d overdue
                                   </Badge>
                                 )}
                                 <Badge variant="outline" className="text-xs">
                                   {invoice.status}
                                 </Badge>
                               </div>
                               <p className="text-sm text-muted-foreground">
                                 Due: {formatDate(invoice.dueDate)}
                                 {invoice.reference && ` • Ref: ${invoice.reference}`}
                               </p>
                             </div>
                             <div className="text-right">
                               <p className={`font-semibold ${invoice.isOverdue ? "text-destructive" : ""}`}>
                                 {formatCurrency(invoice.amountDue)}
                               </p>
                               <p className="text-xs text-muted-foreground">
                                 Total: {formatCurrency(invoice.total)}
                               </p>
                             </div>
                           </div>
                         );
                       })}
                     </div>
                   )}
                 </TabsContent>
 
                 <TabsContent value="risk" className="space-y-6">
                   <Card>
                     <CardHeader>
                       <CardTitle className="flex items-center justify-between">
                         <span>Credit Risk Assessment</span>
                         <RiskBadge score={metrics.riskScore} />
                       </CardTitle>
                     </CardHeader>
                     <CardContent className="space-y-4">
                       <div className="grid grid-cols-2 gap-4">
                         <div className="p-4 rounded-lg bg-muted/50">
                           <p className="text-sm text-muted-foreground mb-1">Overdue Ratio</p>
                           <p className="text-2xl font-bold">{metrics.creditUtilization.toFixed(1)}%</p>
                           <p className="text-xs text-muted-foreground">of outstanding balance</p>
                         </div>
                         <div className="p-4 rounded-lg bg-muted/50">
                           <p className="text-sm text-muted-foreground mb-1">Payment Speed</p>
                           <p className="text-2xl font-bold">{metrics.averageDaysToPayEstimate} days</p>
                           <p className="text-xs text-muted-foreground">estimated avg.</p>
                         </div>
                       </div>
 
                       {metrics.riskFactors.length > 0 && (
                         <div className="space-y-2">
                           <p className="text-sm font-medium">Risk Factors</p>
                           <div className="space-y-2">
                             {metrics.riskFactors.map((factor, i) => (
                               <div key={i} className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                                 <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                                 <span className="text-sm">{factor}</span>
                               </div>
                             ))}
                           </div>
                         </div>
                       )}
 
                       <div className="pt-4 border-t">
                         <p className="text-sm font-medium mb-2">Recommendations</p>
                         <ul className="text-sm text-muted-foreground space-y-1">
                           {metrics.riskScore === "high" && (
                             <>
                               <li>• Consider requiring upfront payment for new work</li>
                               <li>• Follow up on overdue invoices immediately</li>
                               <li>• Review credit terms for this customer</li>
                             </>
                           )}
                           {metrics.riskScore === "medium" && (
                             <>
                               <li>• Send payment reminders for overdue invoices</li>
                               <li>• Monitor payment patterns closely</li>
                             </>
                           )}
                           {metrics.riskScore === "low" && (
                             <li>• Continue current payment terms</li>
                           )}
                         </ul>
                       </div>
                     </CardContent>
                   </Card>
 
                   <Card>
                     <CardHeader>
                       <CardTitle className="text-base">Cashflow Impact</CardTitle>
                     </CardHeader>
                     <CardContent>
                       <div className="space-y-4">
                         <div className="flex justify-between items-center p-3 rounded-lg border">
                           <span className="text-sm">Expected this week</span>
                           <span className="font-medium">
                             {formatCurrency(
                               invoices
                                 .filter((inv) => {
                                   try {
                                     const due = parseISO(inv.dueDate);
                                     return isValid(due) && differenceInDays(due, new Date()) <= 7 && differenceInDays(due, new Date()) >= 0;
                                   } catch {
                                     return false;
                                   }
                                 })
                                 .reduce((sum, inv) => sum + inv.amountDue, 0)
                             )}
                           </span>
                         </div>
                         <div className="flex justify-between items-center p-3 rounded-lg border">
                           <span className="text-sm">Expected this month</span>
                           <span className="font-medium">
                             {formatCurrency(
                               invoices
                                 .filter((inv) => {
                                   try {
                                     const due = parseISO(inv.dueDate);
                                     return isValid(due) && differenceInDays(due, new Date()) <= 30 && differenceInDays(due, new Date()) >= 0;
                                   } catch {
                                     return false;
                                   }
                                 })
                                 .reduce((sum, inv) => sum + inv.amountDue, 0)
                             )}
                           </span>
                         </div>
                         <div className="flex justify-between items-center p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                           <span className="text-sm text-destructive">Already overdue</span>
                           <span className="font-medium text-destructive">{formatCurrency(metrics.totalOverdue)}</span>
                         </div>
                       </div>
                     </CardContent>
                   </Card>
                 </TabsContent>
               </Tabs>
             </ScrollArea>
           )}
         </DialogContent>
       </Dialog>
 
       <InvoiceInsightsDialog
         open={!!selectedInvoice}
         onOpenChange={(open) => !open && setSelectedInvoice(null)}
         invoice={selectedInvoice}
         customerName={customerName}
         allInvoices={invoices}
       />

       <InvoiceActionsDrawer
         invoice={actionInvoice}
         open={!!actionInvoice}
         onOpenChange={(open) => !open && setActionInvoice(null)}
         onActionTaken={() => {
           // Refetch the customer's outstanding invoices so the row
           // either updates its status (mark as paid → PAID badge,
           // amountDue=0) or disappears (void) without a full page
           // reload.
           setActionInvoice(null);
           loadFinancialData();
         }}
       />
     </>
   );
 }