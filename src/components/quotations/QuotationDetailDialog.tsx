 import { useState, useEffect } from "react";
 import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
   DialogFooter,
 } from "@/components/ui/dialog";
 import { Button } from "@/components/ui/button";
 import { Badge } from "@/components/ui/badge";
 import { Loader2, Trash2, Plus, Save, PoundSterling } from "lucide-react";
 import { supabase } from "@/integrations/supabase/client";
 import { toast } from "sonner";
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
 import { format } from "date-fns";
 
 interface LineItem {
   id: string;
   description: string;
   regulation_reference: string | null;
   priority: string;
   source_section: string | null;
   quantity: number;
   unit_price: number;
   total_price: number;
   notes: string | null;
   sort_order: number;
 }
 
 interface Quotation {
   id: string;
   quotation_number: string;
   status: string;
   title: string | null;
   summary: string | null;
   total_amount: number;
   valid_until: string | null;
   notes: string | null;
   created_at: string;
   sites: { name: string } | null;
   customers: { name: string } | null;
 }
 
 interface QuotationDetailDialogProps {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   quotationId: string;
   onUpdate?: () => void;
 }
 
 export function QuotationDetailDialog({
   open,
   onOpenChange,
   quotationId,
   onUpdate,
 }: QuotationDetailDialogProps) {
   const [loading, setLoading] = useState(true);
   const [saving, setSaving] = useState(false);
   const [quotation, setQuotation] = useState<Quotation | null>(null);
   const [lineItems, setLineItems] = useState<LineItem[]>([]);
   const [hasChanges, setHasChanges] = useState(false);
 
   useEffect(() => {
     if (open && quotationId) {
       fetchQuotation();
     }
   }, [open, quotationId]);
 
   const fetchQuotation = async () => {
     setLoading(true);
     try {
       // Fetch quotation
       const { data: quotationData, error: quotationError } = await supabase
         .from("quotations")
         .select(`
           *,
           sites:site_id(name),
           customers:customer_id(name)
         `)
         .eq("id", quotationId)
         .single();
 
       if (quotationError) throw quotationError;
       setQuotation(quotationData);
 
       // Fetch line items
       const { data: itemsData, error: itemsError } = await supabase
         .from("quotation_line_items")
         .select("*")
         .eq("quotation_id", quotationId)
         .order("sort_order", { ascending: true });
 
       if (itemsError) throw itemsError;
       setLineItems(itemsData || []);
     } catch (error) {
       console.error("Error fetching quotation:", error);
       toast.error("Failed to load quotation");
     } finally {
       setLoading(false);
     }
   };
 
   const handleItemChange = (index: number, field: keyof LineItem, value: any) => {
     const updated = [...lineItems];
     updated[index] = { ...updated[index], [field]: value };
 
     if (field === "quantity" || field === "unit_price") {
       updated[index].total_price = updated[index].quantity * updated[index].unit_price;
     }
 
     setLineItems(updated);
     setHasChanges(true);
   };
 
   const handleAddItem = () => {
     const newItem: LineItem = {
       id: `temp-${Date.now()}`,
       description: "",
       regulation_reference: null,
       priority: "medium",
       source_section: null,
       quantity: 1,
       unit_price: 0,
       total_price: 0,
       notes: null,
       sort_order: lineItems.length,
     };
     setLineItems([...lineItems, newItem]);
     setHasChanges(true);
   };
 
   const handleRemoveItem = (index: number) => {
     setLineItems(lineItems.filter((_, i) => i !== index));
     setHasChanges(true);
   };
 
   const handleSave = async () => {
     if (!quotation) return;
 
     setSaving(true);
     try {
       const totalAmount = lineItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
 
       // Update quotation total
       const { error: quotationError } = await supabase
         .from("quotations")
         .update({ total_amount: totalAmount })
         .eq("id", quotationId);
 
       if (quotationError) throw quotationError;
 
       // Delete existing line items
       const { error: deleteError } = await supabase
         .from("quotation_line_items")
         .delete()
         .eq("quotation_id", quotationId);
 
       if (deleteError) throw deleteError;
 
       // Insert updated line items
       if (lineItems.length > 0) {
         const itemsToInsert = lineItems.map((item, index) => ({
           quotation_id: quotationId,
           description: item.description,
           regulation_reference: item.regulation_reference,
           priority: item.priority,
           source_section: item.source_section,
           quantity: item.quantity,
           unit_price: item.unit_price,
           total_price: item.total_price,
           notes: item.notes,
           sort_order: index,
         }));
 
         const { error: insertError } = await supabase
           .from("quotation_line_items")
           .insert(itemsToInsert);
 
         if (insertError) throw insertError;
       }
 
       toast.success("Quotation saved");
       setHasChanges(false);
       onUpdate?.();
       fetchQuotation();
     } catch (error) {
       console.error("Error saving quotation:", error);
       toast.error("Failed to save quotation");
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
 
   const totalAmount = lineItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
 
   return (
     <Dialog open={open} onOpenChange={onOpenChange}>
       <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
         <DialogHeader>
           <DialogTitle className="flex items-center gap-2">
             {quotation?.quotation_number || "Loading..."}
             {quotation && (
               <Badge variant="outline" className="ml-2">
                 {quotation.status}
               </Badge>
             )}
           </DialogTitle>
         </DialogHeader>
 
         {loading ? (
           <div className="flex items-center justify-center py-12">
             <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
           </div>
         ) : quotation ? (
           <div className="flex-1 overflow-hidden">
             <div className="mb-4 space-y-2">
               <p className="text-sm">
                 <span className="text-muted-foreground">Site:</span>{" "}
                 <span className="font-medium">{quotation.sites?.name}</span>
               </p>
               {quotation.customers?.name && (
                 <p className="text-sm">
                   <span className="text-muted-foreground">Customer:</span>{" "}
                   <span className="font-medium">{quotation.customers.name}</span>
                 </p>
               )}
               <p className="text-sm">
                 <span className="text-muted-foreground">Created:</span>{" "}
                 {format(new Date(quotation.created_at), "MMM d, yyyy")}
               </p>
               {quotation.summary && (
                 <p className="text-sm text-muted-foreground">{quotation.summary}</p>
               )}
             </div>
 
             <ScrollArea className="h-[45vh] pr-4">
               <div className="space-y-4">
                 <div className="flex items-center justify-between">
                   <h3 className="font-medium">Line Items ({lineItems.length})</h3>
                   <Button variant="outline" size="sm" onClick={handleAddItem}>
                     <Plus className="mr-2 h-4 w-4" />
                     Add Item
                   </Button>
                 </div>
 
                 {lineItems.length === 0 ? (
                   <p className="text-center py-8 text-muted-foreground">
                     No line items. Click "Add Item" to add one.
                   </p>
                 ) : (
                   lineItems.map((item, index) => (
                     <div key={item.id} className="border rounded-lg p-4 space-y-3">
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
                           </div>
 
                           <Textarea
                             value={item.description}
                             onChange={(e) =>
                               handleItemChange(index, "description", e.target.value)
                             }
                             placeholder="Description..."
                             className="min-h-[60px]"
                           />
 
                           <div className="grid grid-cols-4 gap-3">
                             <div>
                               <Label className="text-xs">Priority</Label>
                               <Select
                                 value={item.priority}
                                 onValueChange={(value) =>
                                   handleItemChange(index, "priority", value)
                                 }
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
                                 onChange={(e) =>
                                   handleItemChange(
                                     index,
                                     "quantity",
                                     parseInt(e.target.value) || 1
                                   )
                                 }
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
                                 onChange={(e) =>
                                   handleItemChange(
                                     index,
                                     "unit_price",
                                     parseFloat(e.target.value) || 0
                                   )
                                 }
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
                   ))
                 )}
 
                 <div className="flex justify-end pt-4 border-t">
                   <div className="text-right">
                     <span className="text-sm text-muted-foreground">Total: </span>
                     <span className="text-xl font-semibold flex items-center gap-1">
                       <PoundSterling className="w-4 h-4" />
                       {totalAmount.toFixed(2)}
                     </span>
                   </div>
                 </div>
               </div>
             </ScrollArea>
           </div>
         ) : (
           <p className="text-center py-8 text-muted-foreground">
             Quotation not found
           </p>
         )}
 
         <DialogFooter>
           <Button variant="outline" onClick={() => onOpenChange(false)}>
             Close
           </Button>
           {hasChanges && (
             <Button onClick={handleSave} disabled={saving}>
               {saving ? (
                 <>
                   <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                   Saving...
                 </>
               ) : (
                 <>
                   <Save className="mr-2 h-4 w-4" />
                   Save Changes
                 </>
               )}
             </Button>
           )}
         </DialogFooter>
       </DialogContent>
     </Dialog>
   );
 }