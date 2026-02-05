 import { useState } from "react";
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
 import { Button } from "@/components/ui/button";
 import { Badge } from "@/components/ui/badge";
 import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
 import { Switch } from "@/components/ui/switch";
 import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
 import { toast } from "sonner";
 import { Plus, Pencil, Trash2, Mail, MessageSquare, Phone } from "lucide-react";
 import {
   CreditControlSchedule,
   CreditControlStep,
   updateStep,
   deleteStep,
   createStep,
   createSchedule,
   CHANNEL_LABELS,
 } from "@/services/creditControlService";
 import { CreditControlStepDialog } from "./CreditControlStepDialog";
 import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
 } from "@/components/ui/alert-dialog";
 
 interface CreditControlScheduleSetupProps {
   schedules: CreditControlSchedule[];
   selectedSchedule: CreditControlSchedule | null;
   steps: CreditControlStep[];
   onScheduleChange: (schedule: CreditControlSchedule) => void;
   onRefresh: () => void;
 }
 
 export function CreditControlScheduleSetup({
   schedules,
   selectedSchedule,
   steps,
   onScheduleChange,
   onRefresh,
 }: CreditControlScheduleSetupProps) {
   const [stepDialogOpen, setStepDialogOpen] = useState(false);
   const [editStep, setEditStep] = useState<CreditControlStep | null>(null);
   const [deleteStepId, setDeleteStepId] = useState<string | null>(null);
 
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
 
   const handleToggleStep = async (step: CreditControlStep) => {
     try {
       await updateStep(step.id, { is_active: !step.is_active });
       toast.success(`Step ${step.is_active ? "disabled" : "enabled"}`);
       onRefresh();
     } catch (error) {
       console.error("Failed to toggle step:", error);
       toast.error("Failed to update step");
     }
   };
 
   const handleDeleteStep = async () => {
     if (!deleteStepId) return;
     try {
       await deleteStep(deleteStepId);
       toast.success("Step deleted");
       onRefresh();
     } catch (error) {
       console.error("Failed to delete step:", error);
       toast.error("Failed to delete step");
     } finally {
       setDeleteStepId(null);
     }
   };
 
   const handleAddStep = () => {
     setEditStep(null);
     setStepDialogOpen(true);
   };
 
   const handleEditStep = (step: CreditControlStep) => {
     setEditStep(step);
     setStepDialogOpen(true);
   };
 
   const handleCreateDefaultSchedule = async () => {
     try {
       const schedule = await createSchedule({
         name: "Standard Chase Schedule",
         description: "Default escalation: Email → SMS → Phone → Final Notice",
         is_default: true,
         is_active: true,
       });
 
       // Create default steps
       const defaultSteps = [
         {
           schedule_id: schedule.id,
           days_overdue: 7,
           channel: "email",
          template_type: "reminder",
           subject_template: "Payment Reminder - Invoice {{invoice_number}}",
           message_template: "Dear {{contact_name}},\n\nThis is a friendly reminder that invoice {{invoice_number}} for £{{amount_due}} is now {{days_overdue}} days overdue.\n\nPlease arrange payment at your earliest convenience.",
           sort_order: 1,
           is_active: true,
         },
         {
           schedule_id: schedule.id,
           days_overdue: 14,
           channel: "sms",
          template_type: "warning",
           message_template: "BHO Fire: Invoice {{invoice_number}} for £{{amount_due}} is {{days_overdue}} days overdue. Please make payment urgently. Contact us if you have queries.",
           sort_order: 2,
           is_active: true,
         },
         {
           schedule_id: schedule.id,
           days_overdue: 21,
           channel: "call",
          template_type: "escalation",
           message_template: "Hello, this is a call from BHO Fire regarding invoice {{invoice_number}} for £{{amount_due}} which is now {{days_overdue}} days overdue. Please arrange payment immediately to avoid further action.",
           sort_order: 3,
           is_active: true,
         },
         {
           schedule_id: schedule.id,
           days_overdue: 30,
           channel: "email",
           template_type: "final_notice",
           subject_template: "URGENT: Final Notice - Invoice {{invoice_number}}",
           message_template: "Dear {{contact_name}},\n\nDespite our previous reminders, invoice {{invoice_number}} for £{{amount_due}} remains unpaid and is now {{days_overdue}} days overdue.\n\nThis is our final notice before we escalate this matter. Please contact us immediately to resolve this.",
           sort_order: 4,
           is_active: true,
         },
       ];
 
       for (const step of defaultSteps) {
         await createStep(step);
       }
 
       toast.success("Default schedule created");
       onRefresh();
     } catch (error) {
       console.error("Failed to create schedule:", error);
       toast.error("Failed to create schedule");
     }
   };
 
   if (schedules.length === 0) {
     return (
       <Card>
         <CardHeader>
           <CardTitle>Chase Schedule</CardTitle>
           <CardDescription>
             No chase schedule configured. Create one to enable automated payment reminders.
           </CardDescription>
         </CardHeader>
         <CardContent>
           <Button onClick={handleCreateDefaultSchedule}>
             <Plus className="mr-2 h-4 w-4" />
             Create Default Schedule
           </Button>
         </CardContent>
       </Card>
     );
   }
 
   return (
     <>
       <Card>
         <CardHeader>
           <div className="flex items-center justify-between">
             <div>
               <CardTitle>Chase Schedule</CardTitle>
               <CardDescription>
                 Configure automated escalation steps for overdue invoices
               </CardDescription>
             </div>
             <div className="flex items-center gap-2">
               {schedules.length > 1 && (
                 <Select
                   value={selectedSchedule?.id}
                   onValueChange={(id) => {
                     const schedule = schedules.find((s) => s.id === id);
                     if (schedule) onScheduleChange(schedule);
                   }}
                 >
                   <SelectTrigger className="w-48">
                     <SelectValue placeholder="Select schedule" />
                   </SelectTrigger>
                   <SelectContent>
                     {schedules.map((s) => (
                       <SelectItem key={s.id} value={s.id}>
                         {s.name}
                       </SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
               )}
               <Button size="sm" onClick={handleAddStep}>
                 <Plus className="mr-2 h-4 w-4" />
                 Add Step
               </Button>
             </div>
           </div>
         </CardHeader>
         <CardContent>
           {steps.length === 0 ? (
             <div className="text-center py-8 text-muted-foreground">
               No steps configured. Add steps to define the escalation path.
             </div>
           ) : (
             <Table>
               <TableHeader>
                 <TableRow>
                   <TableHead className="w-12">Active</TableHead>
                   <TableHead>Days Overdue</TableHead>
                   <TableHead>Channel</TableHead>
                   <TableHead>Type</TableHead>
                   <TableHead className="hidden md:table-cell">Message Preview</TableHead>
                   <TableHead className="text-right">Actions</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {steps.map((step) => (
                   <TableRow key={step.id} className={!step.is_active ? "opacity-50" : ""}>
                     <TableCell>
                       <Switch
                         checked={step.is_active ?? true}
                         onCheckedChange={() => handleToggleStep(step)}
                       />
                     </TableCell>
                     <TableCell>
                       <Badge variant="outline">{step.days_overdue} days</Badge>
                     </TableCell>
                     <TableCell>
                       <div className="flex items-center gap-2">
                         {getChannelIcon(step.channel)}
                         {CHANNEL_LABELS[step.channel] || step.channel}
                       </div>
                     </TableCell>
                     <TableCell className="capitalize">
                       {step.template_type.replace(/_/g, " ")}
                     </TableCell>
                     <TableCell className="hidden md:table-cell max-w-xs">
                       <span className="text-sm text-muted-foreground truncate block">
                         {step.message_template.substring(0, 60)}...
                       </span>
                     </TableCell>
                     <TableCell className="text-right">
                       <div className="flex justify-end gap-1">
                         <Button
                           variant="ghost"
                           size="icon"
                           onClick={() => handleEditStep(step)}
                         >
                           <Pencil className="h-4 w-4" />
                         </Button>
                         <Button
                           variant="ghost"
                           size="icon"
                           onClick={() => setDeleteStepId(step.id)}
                         >
                           <Trash2 className="h-4 w-4 text-destructive" />
                         </Button>
                       </div>
                     </TableCell>
                   </TableRow>
                 ))}
               </TableBody>
             </Table>
           )}
         </CardContent>
       </Card>
 
       {selectedSchedule && (
         <CreditControlStepDialog
           open={stepDialogOpen}
           onOpenChange={setStepDialogOpen}
           scheduleId={selectedSchedule.id}
           step={editStep}
           onSaved={onRefresh}
         />
       )}
 
       <AlertDialog open={!!deleteStepId} onOpenChange={() => setDeleteStepId(null)}>
         <AlertDialogContent>
           <AlertDialogHeader>
             <AlertDialogTitle>Delete Step</AlertDialogTitle>
             <AlertDialogDescription>
               Are you sure you want to delete this chase step? This action cannot be undone.
             </AlertDialogDescription>
           </AlertDialogHeader>
           <AlertDialogFooter>
             <AlertDialogCancel>Cancel</AlertDialogCancel>
             <AlertDialogAction onClick={handleDeleteStep}>Delete</AlertDialogAction>
           </AlertDialogFooter>
         </AlertDialogContent>
       </AlertDialog>
     </>
   );
 }