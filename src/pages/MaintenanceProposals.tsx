import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Wrench, Search } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  listMaintenanceProposals,
  type MaintenanceProposalWithRefs,
  type MaintenanceProposalStatus,
} from "@/services/maintenanceProposalService";
import { MaintenanceProposalCreateDialog } from "@/components/maintenance-proposals/MaintenanceProposalCreateDialog";
import { MaintenanceProposalDetailDialog } from "@/components/maintenance-proposals/MaintenanceProposalDetailDialog";

const STATUS_META: Record<MaintenanceProposalStatus, { label: string; className: string }> = {
  draft:              { label: "Draft",     className: "bg-muted text-muted-foreground border-border" },
  sent:               { label: "Sent",      className: "bg-primary/10 text-primary border-primary/20" },
  customer_accepted:  { label: "Accepted",  className: "bg-success/10 text-success border-success/20" },
  declined:           { label: "Declined",  className: "bg-destructive/10 text-destructive border-destructive/20" },
  expired:            { label: "Expired",   className: "bg-warning/10 text-warning border-warning/20" },
};

export default function MaintenanceProposals() {
  const [proposals, setProposals] = useState<MaintenanceProposalWithRefs[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | MaintenanceProposalStatus>("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { proposals: data, error } = await listMaintenanceProposals();
    if (error) toast.error("Failed to load proposals", { description: error.message });
    setProposals(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return proposals.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.proposal_number.toLowerCase().includes(q) ||
        (p.customer_name ?? "").toLowerCase().includes(q) ||
        (p.site_name ?? "").toLowerCase().includes(q) ||
        (p.title ?? "").toLowerCase().includes(q)
      );
    });
  }, [proposals, statusFilter, search]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Wrench className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Maintenance Proposals</h1>
              <p className="text-sm text-muted-foreground">
                Recurring PPM / monitoring offers — annual fee, service visits, SLA.
              </p>
            </div>
          </div>
          <Button variant="hero" onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="w-4 h-4" />
            New Proposal
          </Button>
        </div>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by ref, customer, site, title…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="customer_accepted">Accepted</SelectItem>
                  <SelectItem value="declined">Declined</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <Wrench className="w-10 h-10 mx-auto text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  {proposals.length === 0
                    ? "No maintenance proposals yet. Create your first one."
                    : "No proposals match the current filters."}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ref</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Annual £</TableHead>
                    <TableHead>SLA</TableHead>
                    <TableHead>Valid until</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => {
                    const meta = STATUS_META[p.status] ?? STATUS_META.draft;
                    return (
                      <TableRow
                        key={p.id}
                        className="cursor-pointer hover:bg-muted/30"
                        onClick={() => setDetailId(p.id)}
                      >
                        <TableCell className="font-mono text-sm font-medium">{p.proposal_number}</TableCell>
                        <TableCell className="text-sm">{p.customer_name ?? "—"}</TableCell>
                        <TableCell className="text-sm">{p.site_name ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm font-semibold">
                          {p.annual_fee != null ? `£${Number(p.annual_fee).toFixed(2)}` : "—"}
                        </TableCell>
                        <TableCell className="text-sm">{p.sla_tier ?? "—"}</TableCell>
                        <TableCell className="text-sm">
                          {p.valid_until ? format(new Date(p.valid_until), "d MMM yyyy") : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <MaintenanceProposalCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          setCreateOpen(false);
          load();
          setDetailId(id);
        }}
      />
      <MaintenanceProposalDetailDialog
        open={detailId !== null}
        proposalId={detailId}
        onOpenChange={(o) => { if (!o) setDetailId(null); }}
        onUpdated={() => load()}
      />
    </DashboardLayout>
  );
}
