import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  DropdownMenuSeparator,
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
import { toast } from "sonner";
import {
  MoreVertical,
  Plus,
  Sparkles,
  CheckCircle2,
  ShieldAlert,
  Loader2,
  Trash2,
  Shield,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { AIDefectQuoteDialog } from "@/components/defects/AIDefectQuoteDialog";
import {
  listDefects,
  updateDefect,
  deleteDefect,
  type DefectStatus,
  type DefectCategory,
  type SiteDefect,
} from "@/services/defectService";
import { DefectCategoryBadge, DefectStatusBadge } from "@/components/defects/DefectBadge";
import { DefectFormDialog } from "@/components/defects/DefectFormDialog";
import DeclinationOfWorksForm from "@/components/defects/DeclinationOfWorksForm";
import { supabase } from "@/integrations/supabase/client";

export default function Defects() {
  const navigate = useNavigate();
  const [defects, setDefects] = useState<SiteDefect[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<DefectStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<DefectCategory | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [aiBusyId, setAiBusyId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [aiQuoteOpen, setAiQuoteOpen] = useState(false);
  const [declinationDefectId, setDeclinationDefectId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listDefects({ status: statusFilter, category: categoryFilter });
      setDefects(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load defects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, categoryFilter]);

  const stats = useMemo(() => {
    const open = defects.filter((d) => d.status === "open");
    return {
      total: defects.length,
      cat1: open.filter((d) => d.category === 1).length,
      cat2: open.filter((d) => d.category === 2).length,
      cat3: open.filter((d) => d.category === 3).length,
      open: open.length,
    };
  }, [defects]);

  const handleStatusChange = async (id: string, status: DefectStatus) => {
    try {
      const patch: any = { status };
      if (status === "remediated") patch.remediated_at = new Date().toISOString();
      await updateDefect(id, patch);
      toast.success(`Marked as ${status.replace("_", " ")}`);
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to update");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteDefect(deleteId);
      toast.success("Defect deleted");
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-primary" />
              Defect Register
            </h2>
            <p className="text-muted-foreground text-sm">
              Cat 1 / 2 / 3 defect tracking with AI remedial quotation
            </p>
          </div>
          <div className="flex gap-2">
            {selectedIds.length > 0 && (
              <Button
                onClick={() => {
                  const sel = defects.filter((d) => selectedIds.includes(d.id));
                  const uniqueSites = new Set(sel.map((d) => d.site_id));
                  if (uniqueSites.size > 1) {
                    toast.error("Select defects from a single site to generate a quote");
                    return;
                  }
                  setAiQuoteOpen(true);
                }}
                className="gap-2"
                variant="default"
              >
                <Sparkles className="h-4 w-4" />
                AI Quote ({selectedIds.length} defect{selectedIds.length !== 1 ? "s" : ""})
              </Button>
            )}
            {selectedIds.length === 1 && (
              <Button
                variant="outline"
                onClick={() => setDeclinationDefectId(selectedIds[0])}
                className="gap-1.5"
              >
                <Shield className="h-4 w-4 text-amber-500" />
                Declination of Works
              </Button>
            )}
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> Raise Defect
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-6">
              <p className="text-3xl font-bold">{stats.open}</p>
              <p className="text-sm text-muted-foreground">Open Defects</p>
            </CardContent>
          </Card>
          <Card className="border-destructive/40">
            <CardContent className="pt-6">
              <p className="text-3xl font-bold text-destructive">{stats.cat1}</p>
              <p className="text-sm text-muted-foreground">Cat 1 — Critical</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-3xl font-bold text-warning">{stats.cat2}</p>
              <p className="text-sm text-muted-foreground">Cat 2 — Major</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-3xl font-bold">{stats.cat3}</p>
              <p className="text-sm text-muted-foreground">Cat 3 — Minor</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-lg">All Defects</CardTitle>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="pointer-events-auto">
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="quoted">Quoted</SelectItem>
                  <SelectItem value="remediated">Remediated</SelectItem>
                  <SelectItem value="accepted_risk">Accepted Risk</SelectItem>
                </SelectContent>
              </Select>
              <Select value={String(categoryFilter)} onValueChange={(v) => setCategoryFilter(v === "all" ? "all" : (Number(v) as DefectCategory))}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="pointer-events-auto">
                  <SelectItem value="all">All categories</SelectItem>
                  <SelectItem value="1">Cat 1</SelectItem>
                  <SelectItem value="2">Cat 2</SelectItem>
                  <SelectItem value="3">Cat 3</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : defects.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">No defects match the filters.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={defects.length > 0 && selectedIds.length === defects.length}
                        onCheckedChange={(v) => setSelectedIds(v ? defects.map((d) => d.id) : [])}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead>Cat</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Raised</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {defects.map((d) => (
                    <TableRow key={d.id} data-state={selectedIds.includes(d.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.includes(d.id)}
                          onCheckedChange={(v) =>
                            setSelectedIds((prev) => (v ? [...prev, d.id] : prev.filter((id) => id !== d.id)))
                          }
                          aria-label={`Select defect ${d.id}`}
                        />
                      </TableCell>
                      <TableCell><DefectCategoryBadge category={d.category} /></TableCell>
                      <TableCell>
                        <div className="font-medium">{d.site?.name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{d.site?.customers?.name || ""}</div>
                      </TableCell>
                      <TableCell className="max-w-md">
                        <div className="line-clamp-2 text-sm">{d.description}</div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{d.location || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {format(new Date(d.raised_at), "dd MMM yy")}
                      </TableCell>
                      <TableCell><DefectStatusBadge status={d.status} /></TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" disabled={aiBusyId === d.id}>
                              {aiBusyId === d.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MoreVertical className="h-4 w-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="pointer-events-auto">
                            <DropdownMenuItem onClick={() => handleStatusChange(d.id, "remediated")}>
                              <CheckCircle2 className="h-4 w-4 mr-2 text-success" />
                              Mark Remediated
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(d.id, "accepted_risk")}>
                              Mark Accepted Risk
                            </DropdownMenuItem>
                            {d.status !== "open" && (
                              <DropdownMenuItem onClick={() => handleStatusChange(d.id, "open")}>
                                Re-open
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setDeleteId(d.id)} className="text-destructive">
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <DefectFormDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={load} />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete defect?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {(() => {
        const selectedDefects = defects.filter((d) => selectedIds.includes(d.id));
        if (!selectedDefects.length) return null;
        return (
          <AIDefectQuoteDialog
            open={aiQuoteOpen}
            onOpenChange={setAiQuoteOpen}
            defects={selectedDefects.map((d) => ({
              id: d.id,
              description: d.description,
              category: d.category,
              location: d.location,
              status: d.status,
              site_id: d.site_id,
              site_name: d.site?.name,
              notes: d.notes,
            }))}
            onQuoteCreated={() => {
              setSelectedIds([]);
              load();
            }}
          />
        );
      })()}
      {declinationDefectId && (
        <DeclinationOfWorksForm
          open={!!declinationDefectId}
          onOpenChange={(o) => { if (!o) setDeclinationDefectId(null); }}
          defectId={declinationDefectId}
          siteId={defects.find((d) => d.id === declinationDefectId)?.site_id}
          onSaved={() => { setDeclinationDefectId(null); load(); }}
        />
      )}
    </DashboardLayout>
  );
}
