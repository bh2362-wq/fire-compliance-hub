 import { useState } from "react";
 import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
   DialogDescription,
   DialogFooter,
 } from "@/components/ui/dialog";
 import { Button } from "@/components/ui/button";
 import { Loader2, Sparkles, AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";
 import { supabase } from "@/integrations/supabase/client";
 import { toast } from "sonner";
 import { Badge } from "@/components/ui/badge";
 import { Textarea } from "@/components/ui/textarea";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
 import { ScrollArea } from "@/components/ui/scroll-area";
 import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
 } from "@/components/ui/select";
 
 interface QuotationLineItem {
   id?: string;
   description: string;
   regulation_reference?: string;
   priority: string;
   source_section?: string;
   quantity: number;
   unit_price: number;
   total_price: number;
   notes?: string;
 }
 
 interface GenerateQuotationDialogProps {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   report: {
     id: string;
     report_number: string;
     site_id: string;
     visit_id: string;
     notes?: string | null;
     defects?: string | null;
     recommendations?: string | null;
     sites?: {
       name: string;
       address?: string | null;
       customer_id?: string | null;
    } | null;
     visits?: {
       visit_type?: string;
    } | null;
   };
   onSuccess?: () => void;
 }
 
 export function GenerateQuotationDialog({
   open,
   onOpenChange,
   report,
   onSuccess,
 }: GenerateQuotationDialogProps) {
   const [analyzing, setAnalyzing] = useState(false);
   const [saving, setSaving] = useState(false);
   const [lineItems, setLineItems] = useState<QuotationLineItem[]>([]);
   const [summary, setSummary] = useState("");
   const [analyzed, setAnalyzed] = useState(false);
 
   const handleAnalyze = async () => {
     setAnalyzing(true);
     try {
       // Parse report data
       let reportData: any = {
         report_type: "service",
         defects: report.defects || "",
         recommendations: report.recommendations || "",
       };
 
       if (report.notes) {
         try {
           const notes = JSON.parse(report.notes);
           reportData = {
             ...reportData,
             ...notes,
             report_type: notes.report_type || notes.jobType || "service",
           };
         } catch {
           // Notes is not JSON
         }
       }
 
       const { data, error } = await supabase.functions.invoke("analyze-compliance", {
         body: {
           reportId: report.id,
           reportData,
           siteInfo: {
             name: report.sites?.name || "Unknown Site",
             address: report.sites?.address || "",
           },
         },
       });
 
       if (error) throw error;
       if (data.error) throw new Error(data.error);
 
       const items: QuotationLineItem[] = (data.items || []).map((item: any, index: number) => ({
         description: item.description,
         regulation_reference: item.regulation_reference,
         priority: item.priority || "medium",
         source_section: item.source_section,
         quantity: 1,
         unit_price: 0,
         total_price: 0,
         notes: "",
       }));
 
       setLineItems(items);
       setSummary(data.summary || "");
       setAnalyzed(true);
 
       if (items.length === 0) {
         toast.success("No compliance issues found - system is compliant!");
       } else {
         toast.success(`Found ${items.length} item(s) requiring attention`);
       }
     } catch (error) {
       console.error("Analysis error:", error);
       toast.error(error instanceof Error ? error.message : "Failed to analyze report");
     } finally {
       setAnalyzing(false);
     }
   };
 
   const handleAddItem = () => {
     setLineItems([
       ...lineItems,
       {
         description: "",
         priority: "medium",
         quantity: 1,
         unit_price: 0,
         total_price: 0,
       },
     ]);
   };
 
   const handleRemoveItem = (index: number) => {
     setLineItems(lineItems.filter((_, i) => i !== index));
   };
 
   const handleItemChange = (index: number, field: keyof QuotationLineItem, value: any) => {
     const updated = [...lineItems];
     updated[index] = { ...updated[index], [field]: value };
     
     // Recalculate total if quantity or unit price changed
     if (field === "quantity" || field === "unit_price") {
       updated[index].total_price = updated[index].quantity * updated[index].unit_price;
     }
     
     setLineItems(updated);
   };
 
   const handleSaveQuotation = async () => {
     if (lineItems.length === 0) {
       toast.error("Add at least one line item");
       return;
     }
 
     setSaving(true);
     try {
       // Get quotation number
       const { data: quotationNumber } = await supabase.rpc("get_next_quotation_number");
 
       // Get current user
       const { data: { user } } = await supabase.auth.getUser();
       if (!user) throw new Error("Not authenticated");
 
       // Calculate total
       const totalAmount = lineItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
 
       // Create quotation
       const { data: quotation, error: quotationError } = await supabase
         .from("quotations")
         .insert({
           quotation_number: quotationNumber,
           report_id: report.id,
           visit_id: report.visit_id,
           site_id: report.site_id,
           customer_id: report.sites?.customer_id || null,
           status: "draft",
           title: `Remedial Works - ${report.sites?.name || "Site"}`,
           summary,
           total_amount: totalAmount,
           valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
           created_by: user.id,
         })
         .select()
         .single();
 
       if (quotationError) throw quotationError;
 
       // Insert line items
       const lineItemsToInsert = lineItems.map((item, index) => ({
         quotation_id: quotation.id,
         description: item.description,
         regulation_reference: item.regulation_reference || null,
         priority: item.priority,
         source_section: item.source_section || null,
         quantity: item.quantity,
         unit_price: item.unit_price,
         total_price: item.total_price,
         notes: item.notes || null,
         sort_order: index,
       }));
 
       const { error: itemsError } = await supabase
         .from("quotation_line_items")
         .insert(lineItemsToInsert);
 
       if (itemsError) throw itemsError;
 
       toast.success(`Quotation ${quotationNumber} created successfully`);
       onSuccess?.();
       onOpenChange(false);
       
       // Reset state
       setLineItems([]);
       setSummary("");
       setAnalyzed(false);
     } catch (error) {
       console.error("Save error:", error);
       toast.error(error instanceof Error ? error.message : "Failed to save quotation");
     } finally {
       setSaving(false);
     }
   };
 
   const getPriorityColor = (priority: string) => {
     switch (priority) {
       case "critical":
         return "destructive";
       case "high":
         return "default";
       case "medium":
         return "secondary";
       case "low":
         return "outline";
       default:
         return "secondary";
     }
   };
 
   return (
     <Dialog open={open} onOpenChange={onOpenChange}>
       <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
         <DialogHeader>
           <DialogTitle className="flex items-center gap-2">
             <Sparkles className="h-5 w-5 text-primary" />
             Generate Quotation from Report
           </DialogTitle>
           <DialogDescription>
             Analyze {report.report_number} for {report.sites?.name} to identify non-compliant items and generate a quotation for remedial works.
           </DialogDescription>
         </DialogHeader>
 
         <div className="flex-1 overflow-hidden">
           {!analyzed ? (
             <div className="flex flex-col items-center justify-center py-12 space-y-4">
               <div className="text-center space-y-2">
                 <h3 className="font-medium">AI Compliance Analysis</h3>
                 <p className="text-sm text-muted-foreground max-w-md">
                   The AI will analyze the report data including checklists, defects, and recommendations to identify items that don't meet BS 5839 and other fire safety regulations.
                 </p>
               </div>
               <Button onClick={handleAnalyze} disabled={analyzing} size="lg">
                 {analyzing ? (
                   <>
                     <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                     Analyzing Report...
                   </>
                 ) : (
                   <>
                     <Sparkles className="mr-2 h-4 w-4" />
                     Analyze for Compliance Issues
                   </>
                 )}
               </Button>
             </div>
           ) : (
             <ScrollArea className="h-[50vh] pr-4">
               <div className="space-y-4">
                 {summary && (
                   <div className="p-3 rounded-lg bg-muted/50 text-sm">
                     <span className="font-medium">Summary: </span>
                     {summary}
                   </div>
                 )}
 
                 {lineItems.length === 0 ? (
                   <div className="flex flex-col items-center justify-center py-8 text-center">
                    <CheckCircle2 className="h-12 w-12 text-success mb-3" />
                     <h3 className="font-medium">No Issues Found</h3>
                     <p className="text-sm text-muted-foreground">
                       The system appears to be fully compliant.
                     </p>
                     <Button variant="outline" onClick={handleAddItem} className="mt-4">
                       <Plus className="mr-2 h-4 w-4" />
                       Add Item Manually
                     </Button>
                   </div>
                 ) : (
                   <div className="space-y-4">
                     <div className="flex items-center justify-between">
                       <h3 className="font-medium">
                         Quotation Items ({lineItems.length})
                       </h3>
                       <Button variant="outline" size="sm" onClick={handleAddItem}>
                         <Plus className="mr-2 h-4 w-4" />
                         Add Item
                       </Button>
                     </div>
 
                     {lineItems.map((item, index) => (
                       <div
                         key={index}
                         className="border rounded-lg p-4 space-y-3"
                       >
                         <div className="flex items-start justify-between gap-4">
                           <div className="flex-1 space-y-3">
                             <div className="flex items-center gap-2">
                               <Badge variant={getPriorityColor(item.priority)}>
                                 {item.priority}
                               </Badge>
                               {item.regulation_reference && (
                                 <Badge variant="outline" className="text-xs">
                                   {item.regulation_reference}
                                 </Badge>
                               )}
                               {item.source_section && (
                                 <span className="text-xs text-muted-foreground">
                                   Source: {item.source_section}
                                 </span>
                               )}
                             </div>
 
                             <Textarea
                               value={item.description}
                               onChange={(e) => handleItemChange(index, "description", e.target.value)}
                               placeholder="Description of remedial work required..."
                               className="min-h-[60px]"
                             />
 
                             <div className="grid grid-cols-4 gap-3">
                               <div>
                                 <Label className="text-xs">Priority</Label>
                                 <Select
                                   value={item.priority}
                                   onValueChange={(value) => handleItemChange(index, "priority", value)}
                                 >
                                   <SelectTrigger className="h-9">
                                     <SelectValue />
                                   </SelectTrigger>
                                   <SelectContent>
                                     <SelectItem value="critical">Critical</SelectItem>
                                     <SelectItem value="high">High</SelectItem>
                                     <SelectItem value="medium">Medium</SelectItem>
                                     <SelectItem value="low">Low</SelectItem>
                                   </SelectContent>
                                 </Select>
                               </div>
                               <div>
                                 <Label className="text-xs">Qty</Label>
                                 <Input
                                   type="number"
                                   min={1}
                                   value={item.quantity}
                                   onChange={(e) => handleItemChange(index, "quantity", parseInt(e.target.value) || 1)}
                                   className="h-9"
                                 />
                               </div>
                               <div>
                                 <Label className="text-xs">Unit Price (£)</Label>
                                 <Input
                                   type="number"
                                   min={0}
                                   step={0.01}
                                   value={item.unit_price}
                                   onChange={(e) => handleItemChange(index, "unit_price", parseFloat(e.target.value) || 0)}
                                   className="h-9"
                                 />
                               </div>
                               <div>
                                 <Label className="text-xs">Total (£)</Label>
                                 <Input
                                   type="number"
                                   value={item.total_price.toFixed(2)}
                                   readOnly
                                   className="h-9 bg-muted"
                                 />
                               </div>
                             </div>
                           </div>
 
                           <Button
                             variant="ghost"
                             size="icon"
                             onClick={() => handleRemoveItem(index)}
                             className="text-muted-foreground hover:text-destructive"
                           >
                             <Trash2 className="h-4 w-4" />
                           </Button>
                         </div>
                       </div>
                     ))}
 
                     <div className="flex justify-end pt-2 border-t">
                       <div className="text-right">
                         <span className="text-sm text-muted-foreground">Total: </span>
                         <span className="text-lg font-semibold">
                           £{lineItems.reduce((sum, item) => sum + (item.total_price || 0), 0).toFixed(2)}
                         </span>
                       </div>
                     </div>
                   </div>
                 )}
               </div>
             </ScrollArea>
           )}
         </div>
 
         <DialogFooter>
           <Button variant="outline" onClick={() => onOpenChange(false)}>
             Cancel
           </Button>
           {analyzed && lineItems.length > 0 && (
             <Button onClick={handleSaveQuotation} disabled={saving}>
               {saving ? (
                 <>
                   <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                   Saving...
                 </>
               ) : (
                 "Save Quotation"
               )}
             </Button>
           )}
         </DialogFooter>
       </DialogContent>
     </Dialog>
   );
 }