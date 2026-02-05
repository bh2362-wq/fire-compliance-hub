 import { useState, useEffect } from "react";
 import DashboardLayout from "@/components/dashboard/DashboardLayout";
 import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
 import { Button } from "@/components/ui/button";
 import { Badge } from "@/components/ui/badge";
 import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
 import { Skeleton } from "@/components/ui/skeleton";
 import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { Mail, MessageSquare, Phone, Play, Settings, Shield, Clock, AlertTriangle, CheckCircle, RefreshCw, FileText, Banknote } from "lucide-react";
 import {
   getSchedules,
   getSteps,
   getReminders,
   getExclusions,
   CreditControlSchedule,
   CreditControlStep,
   CreditControlReminder,
   CreditControlExclusion,
   CHANNEL_LABELS,
   STATUS_LABELS,
 } from "@/services/creditControlService";
import { fetchOutstandingInvoices, XeroOutstandingInvoice, XeroInvoiceSummary } from "@/services/xeroService";
 import { CreditControlTestDialog } from "@/components/credit-control/CreditControlTestDialog";
 import { CreditControlScheduleSetup } from "@/components/credit-control/CreditControlScheduleSetup";
 import { InvoiceActionsDialog } from "@/components/credit-control/InvoiceActionsDialog";
 
 const CreditControl = () => {
   const [loading, setLoading] = useState(true);
   const [schedules, setSchedules] = useState<CreditControlSchedule[]>([]);
   const [steps, setSteps] = useState<CreditControlStep[]>([]);
   const [reminders, setReminders] = useState<CreditControlReminder[]>([]);
   const [exclusions, setExclusions] = useState<CreditControlExclusion[]>([]);
   const [selectedSchedule, setSelectedSchedule] = useState<CreditControlSchedule | null>(null);
   const [testDialogOpen, setTestDialogOpen] = useState(false);
   const [selectedInvoice, setSelectedInvoice] = useState<XeroOutstandingInvoice | null>(null);
   const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [overdueInvoices, setOverdueInvoices] = useState<XeroOutstandingInvoice[]>([]);
  const [invoiceSummary, setInvoiceSummary] = useState<XeroInvoiceSummary | null>(null);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
 
   useEffect(() => {
     loadData();
    loadOverdueInvoices();
   }, []);

  const loadOverdueInvoices = async () => {
    setLoadingInvoices(true);
    try {
      const { invoices, summary } = await fetchOutstandingInvoices();
      // Filter to only overdue invoices
      const overdue = invoices.filter((inv) => inv.isOverdue);
      setOverdueInvoices(overdue);
      setInvoiceSummary(summary);
    } catch (error) {
      console.error("Failed to load overdue invoices:", error);
      // Don't show error - Xero may not be connected
    } finally {
      setLoadingInvoices(false);
    }
  };
 
   const loadData = async () => {
     setLoading(true);
     try {
       const [schedulesData, remindersData, exclusionsData] = await Promise.all([
         getSchedules(),
         getReminders({ limit: 50 }),
         getExclusions(),
       ]);
 
       setSchedules(schedulesData);
       setReminders(remindersData);
       setExclusions(exclusionsData);
 
       // Load steps for default schedule
       const defaultSchedule = schedulesData.find((s) => s.is_default) || schedulesData[0];
       if (defaultSchedule) {
         setSelectedSchedule(defaultSchedule);
         const stepsData = await getSteps(defaultSchedule.id);
         setSteps(stepsData);
       }
     } catch (error) {
       console.error("Failed to load credit control data:", error);
       toast.error("Failed to load credit control data");
     } finally {
       setLoading(false);
     }
   };
 
   const getChannelIcon = (channel: string) => {
     switch (channel) {
       case "email":
         return <Mail className="h-4 w-4" />;
       case "sms":
         return <MessageSquare className="h-4 w-4" />;
       case "call":
         return <Phone className="h-4 w-4" />;
       default:
         return null;
     }
   };
 
   const getStatusBadge = (status: string) => {
     const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
       pending: "outline",
       sent: "secondary",
       delivered: "default",
       failed: "destructive",
       no_answer: "outline",
       responded: "default",
     };
     return <Badge variant={variants[status] || "outline"}>{STATUS_LABELS[status] || status}</Badge>;
   };
 
   const pendingCount = reminders.filter((r) => r.status === "pending").length;
   const sentCount = reminders.filter((r) => r.status === "sent" || r.status === "delivered").length;
   const failedCount = reminders.filter((r) => r.status === "failed").length;
 
   if (loading) {
     return (
       <DashboardLayout>
         <div className="space-y-6">
           <Skeleton className="h-10 w-64" />
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <Skeleton className="h-32" />
             <Skeleton className="h-32" />
             <Skeleton className="h-32" />
           </div>
           <Skeleton className="h-96" />
         </div>
       </DashboardLayout>
     );
   }
 
   return (
     <DashboardLayout>
       <div className="space-y-6">
         {/* Header */}
         <div className="flex items-center justify-between">
           <div>
             <h2 className="text-2xl font-bold text-foreground">Credit Control</h2>
             <p className="text-muted-foreground">Automated payment chasing and reminders</p>
           </div>
           <Button onClick={() => setTestDialogOpen(true)}>
             <Play className="mr-2 h-4 w-4" />
             Test Channels
           </Button>
         </div>
 
         {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Banknote className="h-4 w-4" />
                  Overdue
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">
                  £{invoiceSummary?.totalOverdue.toLocaleString() || 0}
                </div>
                <p className="text-xs text-muted-foreground">{overdueInvoices.length} invoices</p>
              </CardContent>
            </Card>
           <Card>
             <CardHeader className="pb-2">
               <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                 <Clock className="h-4 w-4" />
                 Pending
               </CardTitle>
             </CardHeader>
             <CardContent>
               <div className="text-2xl font-bold">{pendingCount}</div>
               <p className="text-xs text-muted-foreground">Scheduled reminders</p>
             </CardContent>
           </Card>
           <Card>
             <CardHeader className="pb-2">
               <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                 <CheckCircle className="h-4 w-4" />
                 Sent
               </CardTitle>
             </CardHeader>
             <CardContent>
               <div className="text-2xl font-bold">{sentCount}</div>
               <p className="text-xs text-muted-foreground">Delivered reminders</p>
             </CardContent>
           </Card>
           <Card>
             <CardHeader className="pb-2">
               <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                 <AlertTriangle className="h-4 w-4" />
                 Failed
               </CardTitle>
             </CardHeader>
             <CardContent>
               <div className="text-2xl font-bold text-destructive">{failedCount}</div>
               <p className="text-xs text-muted-foreground">Delivery failures</p>
             </CardContent>
           </Card>
           <Card>
             <CardHeader className="pb-2">
               <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                 <Shield className="h-4 w-4" />
                 Exclusions
               </CardTitle>
             </CardHeader>
             <CardContent>
               <div className="text-2xl font-bold">{exclusions.length}</div>
               <p className="text-xs text-muted-foreground">Excluded from chasing</p>
             </CardContent>
           </Card>
         </div>
 
         {/* Tabs */}
          <Tabs defaultValue="overdue">
           <TabsList>
              <TabsTrigger value="overdue">
                <FileText className="mr-2 h-4 w-4" />
                Overdue Invoices
                {overdueInvoices.length > 0 && (
                  <Badge variant="destructive" className="ml-2">{overdueInvoices.length}</Badge>
                )}
              </TabsTrigger>
             <TabsTrigger value="reminders">Reminders</TabsTrigger>
             <TabsTrigger value="schedule">
               <Settings className="mr-2 h-4 w-4" />
               Schedule Setup
             </TabsTrigger>
             <TabsTrigger value="exclusions">Exclusions</TabsTrigger>
           </TabsList>

            <TabsContent value="overdue" className="mt-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Overdue Invoices</CardTitle>
                    <CardDescription>
                      Invoices past their due date from Xero
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={loadOverdueInvoices} disabled={loadingInvoices}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${loadingInvoices ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </CardHeader>
                <CardContent>
                  {loadingInvoices ? (
                    <div className="space-y-2">
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                    </div>
                  ) : overdueInvoices.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No overdue invoices found. Connect to Xero to see outstanding invoices.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice #</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Reference</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead>Days Overdue</TableHead>
                          <TableHead className="text-right">Amount Due</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {overdueInvoices.map((invoice) => {
                          const daysOverdue = differenceInDays(new Date(), new Date(invoice.dueDate));
                          return (
                            <TableRow 
                              key={invoice.invoiceId}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => {
                                setSelectedInvoice(invoice);
                                setInvoiceDialogOpen(true);
                              }}
                            >
                              <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                              <TableCell>{invoice.contactName}</TableCell>
                              <TableCell className="text-muted-foreground">{invoice.reference || "—"}</TableCell>
                              <TableCell>{format(new Date(invoice.dueDate), "dd MMM yyyy")}</TableCell>
                              <TableCell>
                                <Badge variant={daysOverdue > 30 ? "destructive" : daysOverdue > 14 ? "secondary" : "outline"}>
                                  {daysOverdue} days
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                £{invoice.amountDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
 
           <TabsContent value="reminders" className="mt-4">
             <Card>
               <CardHeader>
                 <CardTitle>Recent Reminders</CardTitle>
                 <CardDescription>
                   View and manage automated payment reminders
                 </CardDescription>
               </CardHeader>
               <CardContent>
                 {reminders.length === 0 ? (
                   <div className="text-center py-8 text-muted-foreground">
                     No reminders scheduled yet. Reminders will appear here when invoices become overdue.
                   </div>
                 ) : (
                   <Table>
                     <TableHeader>
                       <TableRow>
                         <TableHead>Invoice</TableHead>
                         <TableHead>Channel</TableHead>
                         <TableHead>Contact</TableHead>
                         <TableHead>Amount</TableHead>
                         <TableHead>Days Overdue</TableHead>
                         <TableHead>Scheduled</TableHead>
                         <TableHead>Status</TableHead>
                       </TableRow>
                     </TableHeader>
                     <TableBody>
                       {reminders.map((reminder) => (
                         <TableRow key={reminder.id}>
                           <TableCell className="font-medium">
                             {reminder.xero_invoice_number || "—"}
                           </TableCell>
                           <TableCell>
                             <div className="flex items-center gap-2">
                               {getChannelIcon(reminder.channel)}
                               {CHANNEL_LABELS[reminder.channel] || reminder.channel}
                             </div>
                           </TableCell>
                           <TableCell>
                             <div className="text-sm">
                               {reminder.contact_name || "—"}
                               {reminder.contact_email && (
                                 <div className="text-xs text-muted-foreground">{reminder.contact_email}</div>
                               )}
                             </div>
                           </TableCell>
                           <TableCell>
                             {reminder.amount_due ? `£${reminder.amount_due.toFixed(2)}` : "—"}
                           </TableCell>
                           <TableCell>
                             {reminder.days_overdue ?? "—"}
                           </TableCell>
                           <TableCell>
                             {format(new Date(reminder.scheduled_at), "dd MMM yyyy HH:mm")}
                           </TableCell>
                           <TableCell>{getStatusBadge(reminder.status)}</TableCell>
                         </TableRow>
                       ))}
                     </TableBody>
                   </Table>
                 )}
               </CardContent>
             </Card>
           </TabsContent>
 
           <TabsContent value="schedule" className="mt-4">
             <CreditControlScheduleSetup
               schedules={schedules}
               selectedSchedule={selectedSchedule}
               steps={steps}
               onScheduleChange={async (schedule) => {
                 setSelectedSchedule(schedule);
                 const stepsData = await getSteps(schedule.id);
                 setSteps(stepsData);
               }}
               onRefresh={loadData}
             />
           </TabsContent>
 
           <TabsContent value="exclusions" className="mt-4">
             <Card>
               <CardHeader>
                 <CardTitle>Exclusions</CardTitle>
                 <CardDescription>
                   Customers or invoices excluded from automated chasing
                 </CardDescription>
               </CardHeader>
               <CardContent>
                 {exclusions.length === 0 ? (
                   <div className="text-center py-8 text-muted-foreground">
                     No exclusions configured. Add exclusions from customer or invoice views.
                   </div>
                 ) : (
                   <Table>
                     <TableHeader>
                       <TableRow>
                         <TableHead>Type</TableHead>
                         <TableHead>Reason</TableHead>
                         <TableHead>Until</TableHead>
                         <TableHead>Created</TableHead>
                       </TableRow>
                     </TableHeader>
                     <TableBody>
                       {exclusions.map((exclusion) => (
                         <TableRow key={exclusion.id}>
                           <TableCell>
                             <Badge variant="outline">
                               {exclusion.customer_id ? "Customer" : "Invoice"}
                             </Badge>
                           </TableCell>
                           <TableCell>{exclusion.reason || "—"}</TableCell>
                           <TableCell>
                             {exclusion.is_permanent
                               ? "Permanent"
                               : exclusion.excluded_until
                               ? format(new Date(exclusion.excluded_until), "dd MMM yyyy")
                               : "—"}
                           </TableCell>
                           <TableCell>
                             {format(new Date(exclusion.created_at), "dd MMM yyyy")}
                           </TableCell>
                         </TableRow>
                       ))}
                     </TableBody>
                   </Table>
                 )}
               </CardContent>
             </Card>
           </TabsContent>
         </Tabs>
       </div>
 
       <CreditControlTestDialog
         open={testDialogOpen}
         onOpenChange={setTestDialogOpen}
       />
       <InvoiceActionsDialog 
         open={invoiceDialogOpen} 
         onOpenChange={setInvoiceDialogOpen} 
         invoice={selectedInvoice}
         onReminderSent={loadData}
       />
     </DashboardLayout>
   );
 };
 
 export default CreditControl;