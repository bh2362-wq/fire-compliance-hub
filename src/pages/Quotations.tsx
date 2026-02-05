 import { useState, useEffect } from "react";
 import { useNavigate } from "react-router-dom";
 import DashboardLayout from "@/components/dashboard/DashboardLayout";
 import { Button } from "@/components/ui/button";
 import { Badge } from "@/components/ui/badge";
 import { Skeleton } from "@/components/ui/skeleton";
 import { Input } from "@/components/ui/input";
 import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
 } from "@/components/ui/select";
 import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
 } from "@/components/ui/dropdown-menu";
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
 import {
   ClipboardList,
   Building2,
   Calendar,
   Search,
   Eye,
   Trash2,
   MoreVertical,
   FileCheck,
   Send,
   PoundSterling,
 } from "lucide-react";
 import { toast } from "sonner";
 import { format } from "date-fns";
 import { cn } from "@/lib/utils";
 import { supabase } from "@/integrations/supabase/client";
 import { QuotationDetailDialog } from "@/components/quotations/QuotationDetailDialog";
 
 interface QuotationWithDetails {
   id: string;
   quotation_number: string;
   report_id: string | null;
   visit_id: string | null;
   site_id: string;
   customer_id: string | null;
   status: string;
   title: string | null;
   summary: string | null;
   total_amount: number;
   valid_until: string | null;
   notes: string | null;
   created_at: string;
   updated_at: string;
   sites: { name: string } | null;
   customers: { name: string } | null;
   service_reports: { report_number: string } | null;
 }
 
 const statusConfig: Record<string, { label: string; className: string }> = {
   draft: {
     label: "Draft",
     className: "bg-muted text-muted-foreground border-muted",
   },
   sent: {
     label: "Sent",
     className: "bg-primary/10 text-primary border-primary/20",
   },
   accepted: {
     label: "Accepted",
     className: "bg-success/10 text-success border-success/20",
   },
   declined: {
     label: "Declined",
     className: "bg-destructive/10 text-destructive border-destructive/20",
   },
   expired: {
     label: "Expired",
     className: "bg-warning/10 text-warning border-warning/20",
   },
 };
 
 const Quotations = () => {
   const navigate = useNavigate();
   const [quotations, setQuotations] = useState<QuotationWithDetails[]>([]);
   const [loading, setLoading] = useState(true);
   const [searchTerm, setSearchTerm] = useState("");
   const [statusFilter, setStatusFilter] = useState<string>("all");
   const [selectedQuotation, setSelectedQuotation] = useState<QuotationWithDetails | null>(null);
   const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
   const [quotationToDelete, setQuotationToDelete] = useState<QuotationWithDetails | null>(null);
   const [deleting, setDeleting] = useState(false);
 
   const fetchQuotations = async () => {
     try {
       const { data, error } = await supabase
         .from("quotations")
         .select(`
           *,
           sites:site_id(name),
           customers:customer_id(name),
           service_reports:report_id(report_number)
         `)
         .order("created_at", { ascending: false });
 
       if (error) throw error;
       setQuotations(data || []);
     } catch (error) {
       console.error("Error fetching quotations:", error);
       toast.error("Failed to load quotations");
     } finally {
       setLoading(false);
     }
   };
 
   useEffect(() => {
     fetchQuotations();
   }, []);
 
   const handleStatusChange = async (quotationId: string, newStatus: string) => {
     try {
       const { error } = await supabase
         .from("quotations")
         .update({ status: newStatus })
         .eq("id", quotationId);
 
       if (error) throw error;
       toast.success(`Quotation marked as ${newStatus}`);
       fetchQuotations();
     } catch (error) {
       console.error("Error updating status:", error);
       toast.error("Failed to update status");
     }
   };
 
   const handleDelete = async () => {
     if (!quotationToDelete) return;
 
     setDeleting(true);
     try {
       const { error } = await supabase
         .from("quotations")
         .delete()
         .eq("id", quotationToDelete.id);
 
       if (error) throw error;
       toast.success("Quotation deleted");
       fetchQuotations();
     } catch (error) {
       console.error("Error deleting quotation:", error);
       toast.error("Failed to delete quotation");
     } finally {
       setDeleting(false);
       setDeleteDialogOpen(false);
       setQuotationToDelete(null);
     }
   };
 
   const filteredQuotations = quotations.filter((quotation) => {
     const matchesSearch =
       quotation.quotation_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
       quotation.sites?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
       quotation.customers?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       quotation.title?.toLowerCase().includes(searchTerm.toLowerCase());
 
     const matchesStatus = statusFilter === "all" || quotation.status === statusFilter;
 
     return matchesSearch && matchesStatus;
   });
 
   return (
     <DashboardLayout>
       <div className="space-y-8">
         {/* Header */}
         <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
           <div>
             <h1 className="text-3xl font-bold tracking-tight">Quotations</h1>
             <p className="text-muted-foreground mt-1">
               Manage quotations generated from service reports
             </p>
           </div>
         </div>
 
         {/* Filters */}
         <div className="flex flex-col sm:flex-row gap-4">
           <div className="relative flex-1">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
             <Input
               placeholder="Search quotations..."
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               className="pl-10"
             />
           </div>
           <Select value={statusFilter} onValueChange={setStatusFilter}>
             <SelectTrigger className="w-[180px]">
               <SelectValue placeholder="Filter by status" />
             </SelectTrigger>
             <SelectContent>
               <SelectItem value="all">All Statuses</SelectItem>
               <SelectItem value="draft">Draft</SelectItem>
               <SelectItem value="sent">Sent</SelectItem>
               <SelectItem value="accepted">Accepted</SelectItem>
               <SelectItem value="declined">Declined</SelectItem>
               <SelectItem value="expired">Expired</SelectItem>
             </SelectContent>
           </Select>
         </div>
 
         {/* Quotations List */}
         {loading ? (
           <div className="space-y-4">
             {[...Array(3)].map((_, i) => (
               <Skeleton key={i} className="h-24 w-full" />
             ))}
           </div>
         ) : filteredQuotations.length === 0 ? (
           <div className="text-center py-12">
             <ClipboardList className="mx-auto h-12 w-12 text-muted-foreground" />
             <h3 className="mt-4 text-lg font-semibold">No quotations found</h3>
             <p className="text-muted-foreground">
               {searchTerm || statusFilter !== "all"
                 ? "Try adjusting your search or filters"
                 : "Generate quotations from completed service reports"}
             </p>
           </div>
         ) : (
           <div className="bg-card rounded-xl border border-border divide-y divide-border">
             {filteredQuotations.map((quotation) => {
               const status = statusConfig[quotation.status] || statusConfig.draft;
               const isExpired = quotation.valid_until && new Date(quotation.valid_until) < new Date();
 
               return (
                 <div
                   key={quotation.id}
                   className="p-6 hover:bg-muted/30 transition-colors"
                 >
                   <div className="flex items-start justify-between gap-4">
                     <div className="flex items-start gap-4">
                       <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                         <ClipboardList className="w-6 h-6 text-primary" />
                       </div>
                       <div className="space-y-1">
                         <div className="flex items-center gap-2">
                           <h3 className="font-semibold text-foreground">
                             {quotation.quotation_number}
                           </h3>
                           <Badge variant="outline" className={status.className}>
                             {isExpired && quotation.status === "sent" ? "Expired" : status.label}
                           </Badge>
                         </div>
                         <p className="text-sm font-medium">
                           {quotation.title || quotation.sites?.name || "Untitled"}
                         </p>
                         <div className="flex items-center gap-4 text-sm text-muted-foreground">
                           <span className="flex items-center gap-1">
                             <Building2 className="w-4 h-4" />
                             {quotation.sites?.name || "Unknown Site"}
                           </span>
                           <span className="flex items-center gap-1">
                             <Calendar className="w-4 h-4" />
                             {format(new Date(quotation.created_at), "MMM d, yyyy")}
                           </span>
                           {quotation.service_reports?.report_number && (
                             <span>From: {quotation.service_reports.report_number}</span>
                           )}
                         </div>
                         {quotation.summary && (
                           <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                             {quotation.summary}
                           </p>
                         )}
                       </div>
                     </div>
                     <div className="flex items-center gap-4">
                       <div className="text-right">
                         <div className="flex items-center gap-1 text-lg font-semibold">
                           <PoundSterling className="w-4 h-4" />
                           {quotation.total_amount.toFixed(2)}
                         </div>
                         {quotation.valid_until && (
                           <p className="text-xs text-muted-foreground">
                             Valid until {format(new Date(quotation.valid_until), "MMM d, yyyy")}
                           </p>
                         )}
                       </div>
                       <div className="flex items-center gap-2">
                         <Button
                           variant="outline"
                           size="sm"
                           onClick={() => setSelectedQuotation(quotation)}
                         >
                           <Eye className="w-4 h-4 mr-1" />
                           View
                         </Button>
                         <DropdownMenu>
                           <DropdownMenuTrigger asChild>
                             <Button variant="ghost" size="sm">
                               <MoreVertical className="w-4 h-4" />
                             </Button>
                           </DropdownMenuTrigger>
                           <DropdownMenuContent align="end">
                             <DropdownMenuItem
                               onClick={() => navigate(`/dashboard/sites/${quotation.site_id}`)}
                             >
                               <Building2 className="w-4 h-4 mr-2" />
                               View Site
                             </DropdownMenuItem>
                             {quotation.status === "draft" && (
                               <DropdownMenuItem
                                 onClick={() => handleStatusChange(quotation.id, "sent")}
                               >
                                 <Send className="w-4 h-4 mr-2" />
                                 Mark as Sent
                               </DropdownMenuItem>
                             )}
                             {quotation.status === "sent" && (
                               <>
                                 <DropdownMenuItem
                                   onClick={() => handleStatusChange(quotation.id, "accepted")}
                                 >
                                   <FileCheck className="w-4 h-4 mr-2" />
                                   Mark as Accepted
                                 </DropdownMenuItem>
                                 <DropdownMenuItem
                                   onClick={() => handleStatusChange(quotation.id, "declined")}
                                 >
                                   <FileCheck className="w-4 h-4 mr-2" />
                                   Mark as Declined
                                 </DropdownMenuItem>
                               </>
                             )}
                             <DropdownMenuItem
                               className="text-destructive focus:text-destructive"
                               onClick={() => {
                                 setQuotationToDelete(quotation);
                                 setDeleteDialogOpen(true);
                               }}
                             >
                               <Trash2 className="w-4 h-4 mr-2" />
                               Delete
                             </DropdownMenuItem>
                           </DropdownMenuContent>
                         </DropdownMenu>
                       </div>
                     </div>
                   </div>
                 </div>
               );
             })}
           </div>
         )}
       </div>
 
       {/* View Quotation Dialog */}
       {selectedQuotation && (
         <QuotationDetailDialog
           open={!!selectedQuotation}
           onOpenChange={(open) => {
             if (!open) setSelectedQuotation(null);
           }}
           quotationId={selectedQuotation.id}
           onUpdate={fetchQuotations}
         />
       )}
 
       {/* Delete Confirmation */}
       <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
         <AlertDialogContent>
           <AlertDialogHeader>
             <AlertDialogTitle>Delete Quotation?</AlertDialogTitle>
             <AlertDialogDescription>
               This will permanently delete {quotationToDelete?.quotation_number}.
               This action cannot be undone.
             </AlertDialogDescription>
           </AlertDialogHeader>
           <AlertDialogFooter>
             <AlertDialogCancel>Cancel</AlertDialogCancel>
             <AlertDialogAction
               onClick={handleDelete}
               className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
               disabled={deleting}
             >
               {deleting ? "Deleting..." : "Delete"}
             </AlertDialogAction>
           </AlertDialogFooter>
         </AlertDialogContent>
       </AlertDialog>
     </DashboardLayout>
   );
 };
 
 export default Quotations;