import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus, Search, ExternalLink, Calendar, Building2, RefreshCw, Library } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  listTenders,
  tenderStatusCounts,
  TENDER_STATUS_LABELS,
  type Tender,
  type TenderStatus,
} from "@/services/tenderService";
import { AddTenderDialog } from "@/components/tenders/AddTenderDialog";
import { TenderDetailDialog } from "@/components/tenders/TenderDetailDialog";
import { supabase } from "@/integrations/supabase/client";

const STATUS_BADGE: Record<TenderStatus, string> = {
  discovered: "bg-blue-500/10 text-blue-700 border-blue-300 dark:text-blue-300",
  watching: "bg-amber-500/10 text-amber-700 border-amber-300 dark:text-amber-300",
  bidding: "bg-violet-500/10 text-violet-700 border-violet-300 dark:text-violet-300",
  submitted: "bg-indigo-500/10 text-indigo-700 border-indigo-300 dark:text-indigo-300",
  won: "bg-emerald-500/10 text-emerald-700 border-emerald-300 dark:text-emerald-300",
  lost: "bg-rose-500/10 text-rose-700 border-rose-300 dark:text-rose-300",
  dismissed: "bg-muted text-muted-foreground border-muted-foreground/20",
};

const TAB_FILTERS: Record<string, TenderStatus[] | undefined> = {
  active: ["discovered", "watching", "bidding", "submitted"],
  won: ["won"],
  lost: ["lost", "dismissed"],
  all: undefined,
};

export default function Tenders() {
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<keyof typeof TAB_FILTERS>("active");
  const [counts, setCounts] = useState<Record<TenderStatus, number>>({
    discovered: 0, watching: 0, bidding: 0, submitted: 0, won: 0, lost: 0, dismissed: 0,
  });
  const [addOpen, setAddOpen] = useState(false);
  const [detail, setDetail] = useState<Tender | null>(null);
  const [polling, setPolling] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [list, c] = await Promise.all([
        listTenders({ statuses: TAB_FILTERS[tab], search }),
        tenderStatusCounts(),
      ]);
      setTenders(list);
      setCounts(c);
    } catch (e) {
      toast.error("Couldn't load tenders", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const pollContractsFinder = async () => {
    setPolling(true);
    try {
      const { data, error } = await supabase.functions.invoke("poll-contracts-finder", { body: {} });
      if (error) throw error;
      const inserted = (data as { inserted?: number } | null)?.inserted ?? 0;
      const skipped = (data as { skipped?: number } | null)?.skipped ?? 0;
      toast.success(`Contracts Finder sync: ${inserted} new tenders`, {
        description: skipped > 0 ? `${skipped} already in the system, skipped.` : undefined,
      });
      void load();
    } catch (e) {
      toast.error("Couldn't poll Contracts Finder", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setPolling(false);
    }
  };

  const activeCount = counts.discovered + counts.watching + counts.bidding + counts.submitted;
  const lostCount = counts.lost + counts.dismissed;

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Tenders</h1>
            <p className="text-sm text-muted-foreground">
              Track active tenders, build tender packs, and pull new opportunities from Contracts Finder.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" asChild>
              <Link to="/dashboard/tender-library">
                <Library className="w-4 h-4 mr-1.5" /> Document library
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={pollContractsFinder} disabled={polling}>
              {polling ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-1.5" />
              )}
              Sync Contracts Finder
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4 mr-1.5" /> Add tender
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as keyof typeof TAB_FILTERS)}>
          <TabsList>
            <TabsTrigger value="active">Active · {activeCount}</TabsTrigger>
            <TabsTrigger value="won">Won · {counts.won}</TabsTrigger>
            <TabsTrigger value="lost">Lost · {lostCount}</TabsTrigger>
            <TabsTrigger value="all">All · {Object.values(counts).reduce((s, n) => s + n, 0)}</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            placeholder="Search title, buyer, description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void load(); }}
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : tenders.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No tenders here yet. Tap <strong>Add tender</strong> to paste one in, or{" "}
              <strong>Sync Contracts Finder</strong> to pull recent opportunities.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {tenders.map((t) => (
              <button
                type="button"
                key={t.id}
                onClick={() => setDetail(t)}
                className="w-full text-left rounded-lg border bg-card p-4 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground">{t.title}</h3>
                      <Badge variant="outline" className={STATUS_BADGE[t.status]}>
                        {TENDER_STATUS_LABELS[t.status]}
                      </Badge>
                      {t.source !== "manual" && (
                        <Badge variant="outline" className="text-[10px]">{t.source.replace(/_/g, " ")}</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1.5">
                      {t.buyer_org && (
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          {t.buyer_org}
                        </span>
                      )}
                      {t.deadline_at && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Deadline {format(new Date(t.deadline_at), "dd MMM yyyy")}
                          <span className="text-muted-foreground/70">
                            ({formatDistanceToNow(new Date(t.deadline_at), { addSuffix: true })})
                          </span>
                        </span>
                      )}
                      {t.value_max != null && (
                        <span>
                          £{t.value_min != null ? `${t.value_min.toLocaleString()}–` : ""}
                          {t.value_max.toLocaleString()}
                        </span>
                      )}
                      {t.region && <span>{t.region}</span>}
                    </div>
                    {t.description && (
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{t.description}</p>
                    )}
                  </div>
                  {t.url && (
                    <a
                      href={t.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-primary hover:underline flex items-center gap-1 flex-shrink-0"
                    >
                      Source <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        <AddTenderDialog open={addOpen} onOpenChange={setAddOpen} onAdded={load} />
        <TenderDetailDialog
          tender={detail}
          open={!!detail}
          onOpenChange={(open) => { if (!open) setDetail(null); }}
          onChanged={load}
        />
      </div>
    </DashboardLayout>
  );
}
