 import { useState, useEffect } from "react";
 import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
 import { Textarea } from "@/components/ui/textarea";
 import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
 import { toast } from "sonner";
 import { Loader2 } from "lucide-react";
 import { CreditControlStep, createStep, updateStep } from "@/services/creditControlService";
 
 interface CreditControlStepDialogProps {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   scheduleId: string;
   step?: CreditControlStep | null;
   onSaved: () => void;
 }
 
 const CHANNELS = [
   { value: "email", label: "Email" },
   { value: "sms", label: "SMS" },
   { value: "call", label: "Phone Call" },
 ];
 
 const TEMPLATE_TYPES = [
   { value: "first_reminder", label: "First Reminder" },
   { value: "second_reminder", label: "Second Reminder" },
   { value: "phone_reminder", label: "Phone Reminder" },
   { value: "final_notice", label: "Final Notice" },
   { value: "custom", label: "Custom" },
 ];
 
 export function CreditControlStepDialog({
   open,
   onOpenChange,
   scheduleId,
   step,
   onSaved,
 }: CreditControlStepDialogProps) {
   const [loading, setLoading] = useState(false);
   const [daysOverdue, setDaysOverdue] = useState(step?.days_overdue?.toString() || "7");
   const [channel, setChannel] = useState(step?.channel || "email");
   const [templateType, setTemplateType] = useState(step?.template_type || "first_reminder");
   const [subjectTemplate, setSubjectTemplate] = useState(step?.subject_template || "");
   const [messageTemplate, setMessageTemplate] = useState(step?.message_template || "");
 
   useEffect(() => {
     if (open) {
       setDaysOverdue(step?.days_overdue?.toString() || "7");
       setChannel(step?.channel || "email");
       setTemplateType(step?.template_type || "first_reminder");
       setSubjectTemplate(step?.subject_template || "");
       setMessageTemplate(step?.message_template || getDefaultMessage(step?.channel || "email"));
     }
   }, [open, step]);
 
   const getDefaultMessage = (ch: string) => {
     if (ch === "sms") {
       return "BHO Fire: Invoice {{invoice_number}} for £{{amount_due}} is {{days_overdue}} days overdue. Please make payment. Contact us if you have queries.";
     }
     if (ch === "call") {
       return "Hello, this is a call from BHO Fire regarding invoice {{invoice_number}} for £{{amount_due}} which is now {{days_overdue}} days overdue. Please arrange payment to avoid further action.";
     }
     return "Dear {{contact_name}},\n\nThis is a reminder that invoice {{invoice_number}} for £{{amount_due}} is now {{days_overdue}} days overdue.\n\nPlease arrange payment at your earliest convenience.";
   };
 
   const handleSubmit = async (e: React.FormEvent) => {
     e.preventDefault();
 
     const days = parseInt(daysOverdue, 10);
     if (isNaN(days) || days < 1) {
       toast.error("Please enter a valid number of days");
       return;
     }
 
     if (!messageTemplate.trim()) {
       toast.error("Please enter a message template");
       return;
     }
 
     setLoading(true);
     try {
       const data = {
         schedule_id: scheduleId,
         days_overdue: days,
         channel,
         template_type: templateType,
         subject_template: channel === "email" ? subjectTemplate : null,
         message_template: messageTemplate,
         is_active: true,
       };
 
       if (step) {
         await updateStep(step.id, data);
         toast.success("Step updated");
       } else {
         await createStep(data);
         toast.success("Step created");
       }
 
       onOpenChange(false);
       onSaved();
     } catch (error) {
       console.error("Failed to save step:", error);
       toast.error("Failed to save step");
     } finally {
       setLoading(false);
     }
   };
 
   return (
     <Dialog open={open} onOpenChange={onOpenChange}>
       <DialogContent className="sm:max-w-lg">
         <DialogHeader>
           <DialogTitle>{step ? "Edit Step" : "Add Step"}</DialogTitle>
         </DialogHeader>
         <form onSubmit={handleSubmit} className="space-y-4">
           <div className="grid grid-cols-2 gap-4">
             <div className="space-y-2">
               <Label htmlFor="days">Days Overdue</Label>
               <Input
                 id="days"
                 type="number"
                 min="1"
                 value={daysOverdue}
                 onChange={(e) => setDaysOverdue(e.target.value)}
               />
             </div>
             <div className="space-y-2">
               <Label htmlFor="channel">Channel</Label>
               <Select value={channel} onValueChange={(v) => {
                 setChannel(v);
                 setMessageTemplate(getDefaultMessage(v));
               }}>
                 <SelectTrigger id="channel">
                   <SelectValue />
                 </SelectTrigger>
                 <SelectContent>
                   {CHANNELS.map((c) => (
                     <SelectItem key={c.value} value={c.value}>
                       {c.label}
                     </SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             </div>
           </div>
 
           <div className="space-y-2">
             <Label htmlFor="template-type">Template Type</Label>
             <Select value={templateType} onValueChange={setTemplateType}>
               <SelectTrigger id="template-type">
                 <SelectValue />
               </SelectTrigger>
               <SelectContent>
                 {TEMPLATE_TYPES.map((t) => (
                   <SelectItem key={t.value} value={t.value}>
                     {t.label}
                   </SelectItem>
                 ))}
               </SelectContent>
             </Select>
           </div>
 
           {channel === "email" && (
             <div className="space-y-2">
               <Label htmlFor="subject">Subject Template</Label>
               <Input
                 id="subject"
                 value={subjectTemplate}
                 onChange={(e) => setSubjectTemplate(e.target.value)}
                 placeholder="Payment Reminder - Invoice {{invoice_number}}"
               />
             </div>
           )}
 
           <div className="space-y-2">
             <Label htmlFor="message">Message Template</Label>
             <Textarea
               id="message"
               value={messageTemplate}
               onChange={(e) => setMessageTemplate(e.target.value)}
               rows={6}
               placeholder="Enter message template..."
             />
             <p className="text-xs text-muted-foreground">
               Available variables: {"{{contact_name}}"}, {"{{invoice_number}}"}, {"{{amount_due}}"}, {"{{days_overdue}}"}
             </p>
           </div>
 
           <div className="flex justify-end gap-2">
             <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
               Cancel
             </Button>
             <Button type="submit" disabled={loading}>
               {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
               {step ? "Update" : "Add"} Step
             </Button>
           </div>
         </form>
       </DialogContent>
     </Dialog>
   );
 }