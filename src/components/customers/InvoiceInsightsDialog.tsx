 import { useMemo } from "react";
 import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
 } from "@/components/ui/dialog";
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 import { Badge } from "@/components/ui/badge";
 import { ScrollArea } from "@/components/ui/scroll-area";
 import { Separator } from "@/components/ui/separator";
 import {
   Clock,
   Calendar,
   FileText,
   TrendingUp,
   TrendingDown,
   AlertTriangle,
   CheckCircle2,
   ArrowRight,
   PoundSterling,
   BarChart3,
   Timer,
 } from "lucide-react";
 import { XeroOutstandingInvoice } from "@/services/xeroService";
 import { format, parseISO, isValid, differenceInDays, addDays } from "date-fns";
 
 interface InvoiceInsightsDialogProps {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   invoice: XeroOutstandingInvoice | null;
   customerName: string;
   allInvoices: XeroOutstandingInvoice[];
 }
 
 interface InvoiceMetrics {
   daysOutstanding: number;
   daysOverdue: number;
   expectedPaymentDate: Date | null;
   paymentTermsDays: number;
   percentPaid: number;
   isLargerThanAverage: boolean;
   comparisonToAverage: number;
   customerAverageInvoiceAmount: number;
   invoiceAgeBucket: "current" | "30days" | "60days" | "90days" | "older";
   urgencyLevel: "low" | "medium" | "high" | "critical";
 }
 
 export function InvoiceInsightsDialog({
   open,
   onOpenChange,
   invoice,
   customerName,
   allInvoices,
 }: InvoiceInsightsDialogProps) {
   const metrics = useMemo<InvoiceMetrics | null>(() => {
     if (!invoice) return null;
 
     const now = new Date();
     let invoiceDate: Date | null = null;
     let dueDate: Date | null = null;
 
     try {
       invoiceDate = parseISO(invoice.date);
       if (!isValid(invoiceDate)) invoiceDate = null;
     } catch {}
 
     try {
       dueDate = parseISO(invoice.dueDate);
       if (!isValid(dueDate)) dueDate = null;
     } catch {}
 
     const daysOutstanding = invoiceDate ? differenceInDays(now, invoiceDate) : 0;
     const daysOverdue = dueDate && now > dueDate ? differenceInDays(now, dueDate) : 0;
     const paymentTermsDays = invoiceDate && dueDate ? differenceInDays(dueDate, invoiceDate) : 30;
 
     // Estimate expected payment date based on customer behavior
     // If invoice is overdue, add average delay to due date
     const overdueInvoices = allInvoices.filter((i) => i.isOverdue);
     let avgOverdueDays = 0;
     if (overdueInvoices.length > 0) {
       const totalOverdueDays = overdueInvoices.reduce((sum, inv) => {
         try {
           const due = parseISO(inv.dueDate);
           if (isValid(due)) {
             return sum + differenceInDays(now, due);
           }
         } catch {}
         return sum;
       }, 0);
       avgOverdueDays = Math.round(totalOverdueDays / overdueInvoices.length);
     }
 
     let expectedPaymentDate: Date | null = null;
     if (dueDate) {
       if (invoice.isOverdue) {
         // For overdue invoices, estimate based on average overdue days
         expectedPaymentDate = addDays(now, Math.max(7, avgOverdueDays));
       } else {
         expectedPaymentDate = dueDate;
       }
     }
 
     // Calculate percentage paid
     const percentPaid = invoice.total > 0 
       ? ((invoice.total - invoice.amountDue) / invoice.total) * 100 
       : 0;
 
     // Compare to customer average
     const customerAverageInvoiceAmount = allInvoices.length > 0
       ? allInvoices.reduce((sum, inv) => sum + inv.total, 0) / allInvoices.length
       : 0;
     const comparisonToAverage = customerAverageInvoiceAmount > 0
       ? ((invoice.total - customerAverageInvoiceAmount) / customerAverageInvoiceAmount) * 100
       : 0;
     const isLargerThanAverage = invoice.total > customerAverageInvoiceAmount;
 
     // Determine age bucket
     let invoiceAgeBucket: "current" | "30days" | "60days" | "90days" | "older" = "current";
     if (daysOutstanding > 90) invoiceAgeBucket = "older";
     else if (daysOutstanding > 60) invoiceAgeBucket = "90days";
     else if (daysOutstanding > 30) invoiceAgeBucket = "60days";
     else if (daysOutstanding > 0) invoiceAgeBucket = "30days";
 
     // Determine urgency level
     let urgencyLevel: "low" | "medium" | "high" | "critical" = "low";
     if (daysOverdue > 60) urgencyLevel = "critical";
     else if (daysOverdue > 30) urgencyLevel = "high";
     else if (daysOverdue > 0) urgencyLevel = "medium";
 
     return {
       daysOutstanding,
       daysOverdue,
       expectedPaymentDate,
       paymentTermsDays,
       percentPaid,
       isLargerThanAverage,
       comparisonToAverage,
       customerAverageInvoiceAmount,
       invoiceAgeBucket,
       urgencyLevel,
     };
   }, [invoice, allInvoices]);
 
   const formatCurrency = (amount: number) =>
     new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);
 
   const formatDate = (dateStr: string | undefined | null) => {
     if (!dateStr) return "N/A";
     try {
       const date = parseISO(dateStr);
       return isValid(date) ? format(date, "dd MMM yyyy") : "N/A";
     } catch {
       return "N/A";
     }
   };
 
   if (!invoice || !metrics) return null;
 
   const UrgencyBadge = () => {
     const config = {
       low: { color: "bg-green-100 text-green-700", label: "Low Priority" },
       medium: { color: "bg-amber-100 text-amber-700", label: "Medium Priority" },
       high: { color: "bg-orange-100 text-orange-700", label: "High Priority" },
       critical: { color: "bg-destructive/10 text-destructive", label: "Critical" },
     };
     const { color, label } = config[metrics.urgencyLevel];
     return <Badge variant="outline" className={`${color} border-0`}>{label}</Badge>;
   };
 
   return (
     <Dialog open={open} onOpenChange={onOpenChange}>
       <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
         <DialogHeader>
           <DialogTitle className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
               <FileText className="w-5 h-5 text-primary" />
             </div>
             <div>
               <span className="text-xl">{invoice.invoiceNumber}</span>
               <p className="text-sm font-normal text-muted-foreground">{customerName}</p>
             </div>
           </DialogTitle>
         </DialogHeader>
 
         <ScrollArea className="flex-1">
           <div className="space-y-6 pr-4">
             {/* Header Info */}
             <div className="flex flex-wrap gap-2">
               <Badge variant="outline">{invoice.status}</Badge>
               {invoice.isOverdue && (
                 <Badge variant="destructive">{metrics.daysOverdue} days overdue</Badge>
               )}
               <UrgencyBadge />
             </div>
 
             {/* Main Amounts */}
             <div className="grid grid-cols-3 gap-4">
               <Card>
                 <CardContent className="pt-4">
                   <div className="flex items-center gap-2 text-muted-foreground mb-1">
                     <PoundSterling className="w-4 h-4" />
                     <span className="text-xs">Total</span>
                   </div>
                   <p className="text-xl font-bold">{formatCurrency(invoice.total)}</p>
                 </CardContent>
               </Card>
               <Card>
                 <CardContent className="pt-4">
                   <div className="flex items-center gap-2 text-muted-foreground mb-1">
                     <Clock className="w-4 h-4" />
                     <span className="text-xs">Amount Due</span>
                   </div>
                   <p className={`text-xl font-bold ${invoice.isOverdue ? "text-destructive" : ""}`}>
                     {formatCurrency(invoice.amountDue)}
                   </p>
                 </CardContent>
               </Card>
               <Card>
                 <CardContent className="pt-4">
                   <div className="flex items-center gap-2 text-muted-foreground mb-1">
                     <CheckCircle2 className="w-4 h-4" />
                     <span className="text-xs">Paid</span>
                   </div>
                   <p className="text-xl font-bold text-green-600">
                     {formatCurrency(invoice.amountPaid)}
                   </p>
                   <p className="text-xs text-muted-foreground">{metrics.percentPaid.toFixed(0)}% paid</p>
                 </CardContent>
               </Card>
             </div>
 
             <Separator />
 
             {/* Timeline Section */}
             <Card>
               <CardHeader className="pb-2">
                 <CardTitle className="text-sm font-medium flex items-center gap-2">
                   <Timer className="w-4 h-4" />
                   Payment Timeline
                 </CardTitle>
               </CardHeader>
               <CardContent className="space-y-4">
                 <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                   <div>
                     <p className="text-sm font-medium">Invoice Date</p>
                     <p className="text-xs text-muted-foreground">When issued</p>
                   </div>
                   <div className="text-right">
                     <p className="font-medium">{formatDate(invoice.date)}</p>
                     <p className="text-xs text-muted-foreground">{metrics.daysOutstanding} days ago</p>
                   </div>
                 </div>
 
                 <div className={`flex items-center justify-between p-3 rounded-lg ${
                   invoice.isOverdue ? "bg-destructive/10 border border-destructive/20" : "bg-muted/50"
                 }`}>
                   <div>
                     <p className="text-sm font-medium">Due Date</p>
                     <p className="text-xs text-muted-foreground">{metrics.paymentTermsDays} day terms</p>
                   </div>
                   <div className="text-right">
                     <p className={`font-medium ${invoice.isOverdue ? "text-destructive" : ""}`}>
                       {formatDate(invoice.dueDate)}
                     </p>
                     {invoice.isOverdue && (
                       <p className="text-xs text-destructive">{metrics.daysOverdue} days overdue</p>
                     )}
                   </div>
                 </div>
 
                 {metrics.expectedPaymentDate && invoice.amountDue > 0 && (
                   <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 border border-blue-200">
                     <div>
                       <p className="text-sm font-medium text-blue-700">Expected Payment</p>
                       <p className="text-xs text-blue-600">Based on customer history</p>
                     </div>
                     <div className="text-right">
                       <p className="font-medium text-blue-700">
                         {format(metrics.expectedPaymentDate, "dd MMM yyyy")}
                       </p>
                     </div>
                   </div>
                 )}
               </CardContent>
             </Card>
 
             {/* Comparison Section */}
             <Card>
               <CardHeader className="pb-2">
                 <CardTitle className="text-sm font-medium flex items-center gap-2">
                   <BarChart3 className="w-4 h-4" />
                   Comparison Metrics
                 </CardTitle>
               </CardHeader>
               <CardContent className="space-y-3">
                 <div className="flex items-center justify-between">
                   <span className="text-sm text-muted-foreground">Customer Average Invoice</span>
                   <span className="font-medium">{formatCurrency(metrics.customerAverageInvoiceAmount)}</span>
                 </div>
                 <div className="flex items-center justify-between">
                   <span className="text-sm text-muted-foreground">This Invoice vs Average</span>
                   <div className="flex items-center gap-2">
                     {metrics.isLargerThanAverage ? (
                       <>
                         <TrendingUp className="w-4 h-4 text-amber-600" />
                         <span className="font-medium text-amber-600">
                           +{metrics.comparisonToAverage.toFixed(0)}%
                         </span>
                       </>
                     ) : metrics.comparisonToAverage < 0 ? (
                       <>
                         <TrendingDown className="w-4 h-4 text-green-600" />
                         <span className="font-medium text-green-600">
                           {metrics.comparisonToAverage.toFixed(0)}%
                         </span>
                       </>
                     ) : (
                       <>
                         <ArrowRight className="w-4 h-4 text-muted-foreground" />
                         <span className="font-medium">Average</span>
                       </>
                     )}
                   </div>
                 </div>
                 <div className="flex items-center justify-between">
                   <span className="text-sm text-muted-foreground">Invoice Age Category</span>
                   <Badge variant="outline">
                     {metrics.invoiceAgeBucket === "current" && "Current"}
                     {metrics.invoiceAgeBucket === "30days" && "1-30 Days"}
                     {metrics.invoiceAgeBucket === "60days" && "31-60 Days"}
                     {metrics.invoiceAgeBucket === "90days" && "61-90 Days"}
                     {metrics.invoiceAgeBucket === "older" && "90+ Days"}
                   </Badge>
                 </div>
               </CardContent>
             </Card>
 
             {/* Recommendations */}
             {invoice.isOverdue && (
               <Card className="border-amber-200 bg-amber-50">
                 <CardHeader className="pb-2">
                   <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-700">
                     <AlertTriangle className="w-4 h-4" />
                     Recommended Actions
                   </CardTitle>
                 </CardHeader>
                 <CardContent>
                   <ul className="text-sm text-amber-700 space-y-2">
                     {metrics.urgencyLevel === "critical" && (
                       <>
                         <li className="flex items-start gap-2">
                           <span className="mt-1">•</span>
                           <span>Escalate to management immediately</span>
                         </li>
                         <li className="flex items-start gap-2">
                           <span className="mt-1">•</span>
                           <span>Consider formal collection procedures</span>
                         </li>
                       </>
                     )}
                     {metrics.urgencyLevel === "high" && (
                       <>
                         <li className="flex items-start gap-2">
                           <span className="mt-1">•</span>
                           <span>Make direct phone contact with accounts payable</span>
                         </li>
                         <li className="flex items-start gap-2">
                           <span className="mt-1">•</span>
                           <span>Request commitment to specific payment date</span>
                         </li>
                       </>
                     )}
                     {metrics.urgencyLevel === "medium" && (
                       <>
                         <li className="flex items-start gap-2">
                           <span className="mt-1">•</span>
                           <span>Send payment reminder email</span>
                         </li>
                         <li className="flex items-start gap-2">
                           <span className="mt-1">•</span>
                           <span>Follow up within 7 days if no response</span>
                         </li>
                       </>
                     )}
                   </ul>
                 </CardContent>
               </Card>
             )}
 
             {/* Additional Details */}
             {invoice.reference && (
               <div className="text-sm">
                 <span className="text-muted-foreground">Reference: </span>
                 <span className="font-medium">{invoice.reference}</span>
               </div>
             )}
           </div>
         </ScrollArea>
       </DialogContent>
     </Dialog>
   );
 }