import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  PenLine, Search, Plus, Building2, Calendar, MoreVertical, Eye, Trash2,
  PoundSterling, Clock, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { format, differenceInCalendarDays, isPast } from "date-fns";
import { Bid, BidStatus, BID_STATUS_LABELS, listBids, deleteBid } from "@/services/bidService";
import { NewBidDialog } from "@/components/bids/NewBidDialog";

const statusClasses: Record<BidStatus, string> = {
  draft: "bg-muted text-muted-foreground border-muted",
  in_progress: "bg-primary/10 text-primary border-primary/20",
  submitted: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  won: "bg-success/10 text-success border-success/20",
  lost: "bg-destructive/10 text-destructive border-destructive/20",
  withdrawn: "bg-orange-500/10 text-orange-600 border-orange-500/20",
};

const Bids = () => {
  const navigate = useNavigate();
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [newOpen, setNewOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Bid | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchBids = async () => {
    try {
      setBids(await listBids());
    } catch (e: any) {
      console.error("Failed to load bids:", e);
      toast.error("Failed to load bids");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBids(); }, []);

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteBid(toDelete.id);
      toast.success("Bid deleted");
      fetchBids();
    } catch (e: any) {
      toast.error(e.message || "Failed to delete bid");
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  };

  const filtered = bids.filter((b) => {
    const matchesSearch =
      b.title.toLowerCase().includes(search.toLowerCase()) ||
      (b.bid_reference || "").toLowerCase().includes(search.toLowerCase()) ||
      (b.buyer_name || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || b.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const deadlineBadge = (bid: Bid) => {
    if (!bid.submission_deadline) return null;
    const d = new Date(bid.submission_deadline);
    const open = bid.status === "draft" || bid.status === "in_progress";
    const overdue = isPast(d) && open;
    const days = differenceInCalendarDays(d, new Date());
    const soon = open && !overdue && days <= 7;
    return (
      <span className={`flex items-center gap-1 ${overdue ? "text-destructive font-medium" : soon ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
        {overdue ? <AlertTriangle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
        {overdue ? "Overdue" : `Due ${format(d, "d MMM yyyy")}`}
      </span>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Bid Writer</h1>
            <p className="text-muted-foreground mt-1">Draft and refine tender / ITT responses with AI assistance</p>
          </div>
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> New Bid
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search bids..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter by status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {(Object.keys(BID_STATUS_LABELS) as BidStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{BID_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <PenLine className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No bids found</h3>
            <p className="text-muted-foreground">
              {search || statusFilter !== "all" ? "Try adjusting your search or filters" : "Create your first bid to get started"}
            </p>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border divide-y divide-border">
            {filtered.map((bid) => (
              <div key={bid.id} className="p-6 hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => navigate(`/dashboard/bids/${bid.id}`)}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <PenLine className="w-6 h-6 text-primary" />
                    </div>
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground">{bid.bid_reference || "Bid"}</h3>
                        <Badge variant="outline" className={statusClasses[bid.status]}>{BID_STATUS_LABELS[bid.status]}</Badge>
                      </div>
                      <p className="text-sm font-medium truncate">{bid.title}</p>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                        {bid.buyer_name && <span className="flex items-center gap-1"><Building2 className="w-4 h-4" />{bid.buyer_name}</span>}
                        <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />{format(new Date(bid.created_at), "d MMM yyyy")}</span>
                        {deadlineBadge(bid)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    {bid.estimated_value != null && (
                      <div className="flex items-center gap-1 text-lg font-semibold">
                        <PoundSterling className="w-4 h-4" />{bid.estimated_value.toLocaleString()}
                      </div>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm"><MoreVertical className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem onClick={() => navigate(`/dashboard/bids/${bid.id}`)}>
                          <Eye className="w-4 h-4 mr-2" /> Open
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setToDelete(bid)}>
                          <Trash2 className="w-4 h-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <NewBidDialog open={newOpen} onOpenChange={setNewOpen} onCreated={fetchBids} />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete bid?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes {toDelete?.bid_reference} and all its questions and answers. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default Bids;
