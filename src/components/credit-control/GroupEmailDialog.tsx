 import { useState, useMemo } from "react";
 import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogHeader,
   DialogTitle,
 } from "@/components/ui/dialog";
 import { Button } from "@/components/ui/button";
 import { Badge } from "@/components/ui/badge";
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 import { Textarea } from "@/components/ui/textarea";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
 import { ScrollArea } from "@/components/ui/scroll-area";
 import { Checkbox } from "@/components/ui/checkbox";
 import { toast } from "sonner";
 import { format } from "date-fns";
 import { Mail, Send, Loader2, Users } from "lucide-react";
 import { XeroOutstandingInvoice } from "@/services/xeroService";
 import { supabase } from "@/integrations/supabase/client";
 
 interface GroupEmailDialogProps {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   invoices: XeroOutstandingInvoice[];
   onEmailSent?: () => void;
 }
 
 interface CustomerGroup {
   contactId: string;
   contactName: string;
   invoices: XeroOutstandingInvoice[];
   totalDue: number;
 }
 
 const DEFAULT_MESSAGE = `Please confirm the following information:
 
  - That all the invoices have been received.
  - That there are no disputes.
  - If there is a dispute, has backup been supplied?
  - The payment date for the open invoices. 
 
 If there are no issues and a payment was already made please
 disregard this message.
 
 
 
 Kind Regards
 
 Credit Control
 
 accounts@bhofire.com`;
 
 export function GroupEmailDialog({
   open,
   onOpenChange,
   invoices,
   onEmailSent,
 }: GroupEmailDialogProps) {
   const [sending, setSending] = useState(false);
   const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
   const [emailAddresses, setEmailAddresses] = useState<Record<string, string>>({});
   const [message, setMessage] = useState(DEFAULT_MESSAGE);
 
   // Group invoices by customer
   const customerGroups = useMemo(() => {
     const groups: Record<string, CustomerGroup> = {};
     
     invoices.forEach((inv) => {
       if (!groups[inv.contactId]) {
         groups[inv.contactId] = {
           contactId: inv.contactId,
           contactName: inv.contactName,
           invoices: [],
           totalDue: 0,
         };
       }
       groups[inv.contactId].invoices.push(inv);
       groups[inv.contactId].totalDue += inv.amountDue;
     });
     
     return Object.values(groups).sort((a, b) => b.totalDue - a.totalDue);
   }, [invoices]);
 
   const toggleCustomer = (contactId: string) => {
     const newSelected = new Set(selectedCustomers);
     if (newSelected.has(contactId)) {
       newSelected.delete(contactId);
     } else {
       newSelected.add(contactId);
     }
     setSelectedCustomers(newSelected);
   };
 
   const selectAll = () => {
     setSelectedCustomers(new Set(customerGroups.map((g) => g.contactId)));
   };
 
   const deselectAll = () => {
     setSelectedCustomers(new Set());
   };
 
   const handleSendEmails = async () => {
     if (selectedCustomers.size === 0) {
       toast.error("Please select at least one customer");
       return;
     }
 
     // Check all selected customers have email addresses
     const missingEmails = Array.from(selectedCustomers).filter(
       (id) => !emailAddresses[id]?.trim()
     );
     if (missingEmails.length > 0) {
       toast.error("Please enter email addresses for all selected customers");
       return;
     }
 
     setSending(true);
     let successCount = 0;
     let errorCount = 0;
 
     for (const contactId of selectedCustomers) {
       const group = customerGroups.find((g) => g.contactId === contactId);
       if (!group) continue;
 
       try {
         const { data, error } = await supabase.functions.invoke("send-statement-email", {
           body: {
             to: emailAddresses[contactId],
             contactName: group.contactName,
             invoices: group.invoices.map((inv) => ({
               number: inv.invoiceNumber,
               reference: inv.reference,
               date: inv.date,
               dueDate: inv.dueDate,
               amount: inv.amountDue,
             })),
             totalDue: group.totalDue,
             message: message,
           },
         });
 
         if (error) throw error;
         if (data.error) throw new Error(data.error);
         
         successCount++;
         
         // Small delay between emails to avoid rate limiting
         await new Promise((r) => setTimeout(r, 600));
       } catch (error: any) {
         console.error(`Failed to send email to ${group.contactName}:`, error);
         errorCount++;
       }
     }
 
     setSending(false);
 
     if (successCount > 0) {
       toast.success(`Sent ${successCount} statement email${successCount > 1 ? "s" : ""}`);
       onEmailSent?.();
     }
     if (errorCount > 0) {
       toast.error(`Failed to send ${errorCount} email${errorCount > 1 ? "s" : ""}`);
     }
 
     if (errorCount === 0) {
       onOpenChange(false);
     }
   };
 
   const selectedTotal = customerGroups
     .filter((g) => selectedCustomers.has(g.contactId))
     .reduce((sum, g) => sum + g.totalDue, 0);
 
   return (
     <Dialog open={open} onOpenChange={onOpenChange}>
       <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
         <DialogHeader>
           <DialogTitle className="flex items-center gap-2">
             <Users className="h-5 w-5" />
             Send Group Statement Emails
           </DialogTitle>
           <DialogDescription>
             Send consolidated overdue invoice statements to multiple customers
           </DialogDescription>
         </DialogHeader>
 
         <div className="flex-1 overflow-hidden flex flex-col gap-4">
           {/* Customer Selection */}
           <Card>
             <CardHeader className="pb-2">
               <div className="flex items-center justify-between">
                 <CardTitle className="text-sm">Select Customers</CardTitle>
                 <div className="flex gap-2">
                   <Button variant="outline" size="sm" onClick={selectAll}>
                     Select All
                   </Button>
                   <Button variant="outline" size="sm" onClick={deselectAll}>
                     Deselect All
                   </Button>
                 </div>
               </div>
             </CardHeader>
             <CardContent>
               <ScrollArea className="h-[200px]">
                 <div className="space-y-2">
                   {customerGroups.map((group) => (
                     <div
                       key={group.contactId}
                       className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                         selectedCustomers.has(group.contactId)
                           ? "border-primary bg-primary/5"
                           : "border-border"
                       }`}
                     >
                       <Checkbox
                         checked={selectedCustomers.has(group.contactId)}
                         onCheckedChange={() => toggleCustomer(group.contactId)}
                       />
                       <div className="flex-1 min-w-0">
                         <div className="font-medium truncate">{group.contactName}</div>
                         <div className="text-xs text-muted-foreground">
                           {group.invoices.length} invoice{group.invoices.length > 1 ? "s" : ""}
                         </div>
                       </div>
                       <div className="text-right">
                         <div className="font-semibold">
                           £{group.totalDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                         </div>
                       </div>
                       {selectedCustomers.has(group.contactId) && (
                         <Input
                           type="email"
                           placeholder="Email address"
                           className="w-48"
                           value={emailAddresses[group.contactId] || ""}
                           onChange={(e) =>
                             setEmailAddresses((prev) => ({
                               ...prev,
                               [group.contactId]: e.target.value,
                             }))
                           }
                           onClick={(e) => e.stopPropagation()}
                         />
                       )}
                     </div>
                   ))}
                 </div>
               </ScrollArea>
             </CardContent>
           </Card>
 
           {/* Summary */}
           {selectedCustomers.size > 0 && (
             <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
               <span className="text-sm">
                 <strong>{selectedCustomers.size}</strong> customer{selectedCustomers.size > 1 ? "s" : ""} selected
               </span>
               <Badge variant="secondary" className="text-base">
                 Total: £{selectedTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
               </Badge>
             </div>
           )}
 
           {/* Message Template */}
           <div className="space-y-2">
             <Label>Message (appears below invoice table)</Label>
             <Textarea
               rows={8}
               value={message}
               onChange={(e) => setMessage(e.target.value)}
               className="font-mono text-sm"
             />
           </div>
         </div>
 
         <div className="flex justify-end gap-2 pt-4 border-t">
           <Button variant="outline" onClick={() => onOpenChange(false)}>
             Cancel
           </Button>
           <Button
             onClick={handleSendEmails}
             disabled={sending || selectedCustomers.size === 0}
           >
             {sending ? (
               <Loader2 className="mr-2 h-4 w-4 animate-spin" />
             ) : (
               <Send className="mr-2 h-4 w-4" />
             )}
             Send {selectedCustomers.size > 0 ? `${selectedCustomers.size} ` : ""}Statement{selectedCustomers.size > 1 ? "s" : ""}
           </Button>
         </div>
       </DialogContent>
     </Dialog>
   );
 }