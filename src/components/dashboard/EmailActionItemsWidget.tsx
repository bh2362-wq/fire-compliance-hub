import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Inbox, ArrowRight, Sparkles } from "lucide-react";
import { listPendingActionItems } from "@/services/emailActionItemsService";

export function EmailActionItemsWidget() {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["email-action-items", "dashboard"],
    queryFn: () => listPendingActionItems(8),
    refetchInterval: 60_000,
  });

  const urgentCount = items.filter((i) => i.priority === "urgent").length;
  const highCount = items.filter((i) => i.priority === "high").length;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          Email Action Items
          {items.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
          )}
        </CardTitle>
        <Button asChild variant="ghost" size="sm" className="h-7 text-xs gap-1">
          <Link to="/email-scanner">
            Open <ArrowRight className="w-3 h-3" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <p className="text-xs text-muted-foreground py-3">Loading…</p>
        ) : items.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">
            <Inbox className="w-5 h-5 mx-auto mb-1 opacity-40" />
            No pending email actions. Run the scanner to surface bookings, callouts and reminders from your inbox.
          </div>
        ) : (
          <div className="space-y-1.5">
            {(urgentCount > 0 || highCount > 0) && (
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {urgentCount > 0 && <span className="text-red-600 font-semibold">{urgentCount} urgent</span>}
                {urgentCount > 0 && highCount > 0 && " · "}
                {highCount > 0 && <span className="text-orange-600 font-semibold">{highCount} high</span>}
              </p>
            )}
            {items.slice(0, 6).map((it) => (
              <Link
                key={it.id}
                to="/email-scanner"
                className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-accent/40 transition-colors text-xs"
              >
                <Badge
                  className={`text-[9px] uppercase tracking-wide flex-shrink-0 ${
                    it.priority === "urgent" ? "bg-red-600 text-white" :
                    it.priority === "high" ? "bg-orange-500 text-white" :
                    it.priority === "medium" ? "bg-amber-100 text-amber-900" :
                    "bg-slate-100 text-slate-700"
                  }`}
                >
                  {it.intent_type}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{it.title}</p>
                  {it.source_from && <p className="text-[10px] text-muted-foreground truncate">{it.source_from}</p>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
