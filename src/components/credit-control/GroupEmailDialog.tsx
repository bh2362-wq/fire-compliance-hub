import { useState, useMemo, useEffect } from "react";
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
import { Mail, Send, Loader2, Users, X, Plus } from "lucide-react";
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
  storedEmails: string[];
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
  const [emailAddresses, setEmailAddresses] = useState<Record<string, string[]>>({});
   const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [customerData, setCustomerData] = useState<Record<string, { email_recipients: string | null }>>({});

  // Fetch customer data with email_recipients based on xero_contact_id
  useEffect(() => {
    const fetchCustomerEmails = async () => {
      const contactIds = [...new Set(invoices.map((inv) => inv.contactId))];
      if (contactIds.length === 0) return;

      const { data, error } = await supabase
        .from("customers")
        .select("xero_contact_id, email_recipients")
        .in("xero_contact_id", contactIds);

      if (!error && data) {
        const dataMap: Record<string, { email_recipients: string | null }> = {};
        data.forEach((customer) => {
          if (customer.xero_contact_id) {
            dataMap[customer.xero_contact_id] = {
              email_recipients: customer.email_recipients,
            };
          }
        });
        setCustomerData(dataMap);
      }
    };

    if (open) {
      fetchCustomerEmails();
    }
  }, [open, invoices]);
 
   // Group invoices by customer
   const customerGroups = useMemo(() => {
     const groups: Record<string, CustomerGroup> = {};
     
     invoices.forEach((inv) => {
       if (!groups[inv.contactId]) {
        const storedRecipients = customerData[inv.contactId]?.email_recipients;
        const emailList = storedRecipients
          ? storedRecipients.split(",").map((e) => e.trim()).filter(Boolean)
          : [];

         groups[inv.contactId] = {
           contactId: inv.contactId,
           contactName: inv.contactName,
           invoices: [],
           totalDue: 0,
          storedEmails: emailList,
         };
       }
       groups[inv.contactId].invoices.push(inv);
       groups[inv.contactId].totalDue += inv.amountDue;
     });
     
     return Object.values(groups).sort((a, b) => b.totalDue - a.totalDue);
  }, [invoices, customerData]);

  // Auto-fill email addresses when customer groups change
  useEffect(() => {
    const newEmailAddresses: Record<string, string[]> = {};
    customerGroups.forEach((group) => {
      if (!emailAddresses[group.contactId] || emailAddresses[group.contactId].length === 0) {
        newEmailAddresses[group.contactId] = group.storedEmails.length > 0
          ? [...group.storedEmails]
          : [""];
      } else {
        newEmailAddresses[group.contactId] = emailAddresses[group.contactId];
      }
    });
    if (Object.keys(newEmailAddresses).length > 0) {
      setEmailAddresses((prev) => ({ ...prev, ...newEmailAddresses }));
    }
  }, [customerGroups]);

  const addEmailField = (contactId: string) => {
    setEmailAddresses((prev) => ({
      ...prev,
      [contactId]: [...(prev[contactId] || []), ""],
    }));
  };

  const removeEmailField = (contactId: string, index: number) => {
    setEmailAddresses((prev) => ({
      ...prev,
      [contactId]: prev[contactId].filter((_, i) => i !== index),
    }));
  };

  const updateEmailField = (contactId: string, index: number, value: string) => {
    setEmailAddresses((prev) => ({
      ...prev,
      [contactId]: prev[contactId].map((email, i) => (i === index ? value : email)),
    }));
  };
 
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
      (id) => !emailAddresses[id]?.some((e) => e.trim())
     );
     if (missingEmails.length > 0) {
      toast.error("Please enter at least one email address for all selected customers");
       return;
     }
 
     setSending(true);
     let successCount = 0;
     let errorCount = 0;
 
     for (const contactId of selectedCustomers) {
       const group = customerGroups.find((g) => g.contactId === contactId);
       if (!group) continue;
 
      const validEmails = emailAddresses[contactId]?.filter((e) => e.trim()) || [];
      if (validEmails.length === 0) continue;

       try {
         const { data, error } = await supabase.functions.invoke("send-statement-email", {
           body: {
            to: validEmails.join(", "),
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
       <DialogContent className="max-w-3xl max-h-[90dvh] overflow-hidden flex flex-col">
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
                      <div key={group.contactId} className="space-y-2">
                        <div
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
                       </div>
                        {selectedCustomers.has(group.contactId) && (
                          <div className="ml-8 space-y-2">
                            {(emailAddresses[group.contactId] || [""]).map((email, index) => (
                              <div key={index} className="flex items-center gap-2">
                                <Input
                                  type="email"
                                  placeholder="email@company.com"
                                  className="flex-1"
                                  value={email}
                                  onChange={(e) =>
                                    updateEmailField(group.contactId, index, e.target.value)
                                  }
                                  onClick={(e) => e.stopPropagation()}
                                />
                                {(emailAddresses[group.contactId]?.length || 0) > 1 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 shrink-0"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeEmailField(group.contactId, index);
                                    }}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            ))}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                addEmailField(group.contactId);
                              }}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add another email
                            </Button>
                          </div>
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