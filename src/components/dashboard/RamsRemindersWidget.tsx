import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { HardHat, ArrowRight, AlertTriangle, Send, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInDays } from "date-fns";
import { toast } from "sonner";

interface RamsReminderRow {
  id: string;
  rams_number: string;
  title: string;
  status: string;
  sent_at: string | null;
  accepted_at: string | null;
  visit?: { id: string; visit_date: string; visit_type: string } | null;
  site?: { name: string } | null;
}

export function RamsRemindersWidget() {
  const { data: rows = [] } = useQuery({
    queryKey: ["rams-reminders"],
    queryFn: async () => {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() + 1);
      const { data, error } = await supabase
        .from("rams_documents")
        .select(`
          id, rams_number, title, status, sent_at, accepted_at,
          visit:service_visits(id, visit_date, visit_type),
          site:sites(name)
        `)
        .in("status", ["draft", "prepared", "sent"])
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const today = new Date();
      return ((data || []) as unknown as RamsReminderRow[]).filter((r) => {
        // only show RAMS for upcoming or recent visits (or no visit)
        if (!r.visit) return r.status === "draft";
        const vd = new Date(r.visit.visit_date);
        return vd >= new Date(today.toDateString()) && vd <= cutoff;
      });
    },
  });

  const drafts = useMemo(() => rows.filter((r) => r.status === "draft"), [rows]);
  const unsent = useMemo(() => rows.filter((r) => r.status === "prepared"), [rows]);
  const awaitingClient = useMemo(() => rows.filter((r) => r.status === "sent"), [rows]);

  // One-shot toast per session if anything outstanding
  useEffect(() => {
    if (rows.length === 0) return;
    const key = "rams-reminder-toast-shown";
    if (sessionStorage.getItem(key)) return;
    const needAttention = drafts.length + unsent.length;
    if (needAttention > 0) {
      toast.warning(
        `Please review RAMS — ${needAttention} document${needAttention !== 1 ? "s" : ""} need${needAttention === 1 ? "s" : ""} action`,
        { duration: 6000 }
      );
    }
    sessionStorage.setItem(key, "1");
  }, [rows, drafts.length, unsent.length]);

  if (rows.length === 0) {
    return (
      <div className="section-card">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
            <HardHat className="w-4 h-4 text-success" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">RAMS Reminders</h3>
            <p className="text-xs text-muted-foreground">All RAMS up to date for upcoming visits</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="section-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center">
            <HardHat className="w-4 h-4 text-warning" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">RAMS Reminders</h3>
            <p className="text-xs text-muted-foreground">
              {drafts.length} draft · {unsent.length} prepared · {awaitingClient.length} awaiting client
            </p>
          </div>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/qms/rams">View all <ArrowRight className="w-3 h-3 ml-1" /></Link>
        </Button>
      </div>

      <div className="divide-y divide-border">
        {rows.slice(0, 6).map((r) => {
          const daysToVisit = r.visit ? differenceInDays(new Date(r.visit.visit_date), new Date()) : null;
          return (
            <Link
              key={r.id}
              to={r.site ? `/qms/rams` : "/qms/rams"}
              className="flex items-center justify-between py-2.5 hover:bg-muted/40 -mx-2 px-2 rounded-md transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{r.rams_number}</span>
                  {r.status === "draft" && (
                    <Badge variant="outline" className="bg-muted text-muted-foreground text-[10px]">
                      <AlertTriangle className="w-3 h-3 mr-1" /> Draft
                    </Badge>
                  )}
                  {r.status === "prepared" && (
                    <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-[10px]">
                      <Send className="w-3 h-3 mr-1" /> Prepared
                    </Badge>
                  )}
                  {r.status === "sent" && (
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Sent
                    </Badge>
                  )}
                </div>
                <p className="text-sm font-medium text-foreground truncate mt-0.5">
                  {r.site?.name || r.title}
                </p>
                {r.visit && (
                  <p className="text-xs text-muted-foreground">
                    Visit {format(new Date(r.visit.visit_date), "dd MMM")}{" "}
                    {daysToVisit !== null && daysToVisit <= 7 && (
                      <span className="text-warning font-medium">· in {daysToVisit}d</span>
                    )}
                  </p>
                )}
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
