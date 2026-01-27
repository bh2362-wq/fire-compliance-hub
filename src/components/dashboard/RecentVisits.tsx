import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, User, ChevronRight } from "lucide-react";

const visits = [
  {
    id: 1,
    site: "Manchester Royal Infirmary",
    date: "2026-01-25",
    engineer: "John Doe",
    status: "completed",
    coverage: 98,
  },
  {
    id: 2,
    site: "Leeds City Council HQ",
    date: "2026-01-24",
    engineer: "Sarah Smith",
    status: "in_progress",
    coverage: 72,
  },
  {
    id: 3,
    site: "Birmingham Airport T1",
    date: "2026-01-23",
    engineer: "Mike Johnson",
    status: "completed",
    coverage: 100,
  },
  {
    id: 4,
    site: "Sheffield University",
    date: "2026-01-22",
    engineer: "John Doe",
    status: "pending_review",
    coverage: 95,
  },
  {
    id: 5,
    site: "Liverpool ONE Shopping",
    date: "2026-01-21",
    engineer: "Emma Wilson",
    status: "completed",
    coverage: 99,
  },
];

const statusConfig = {
  completed: { label: "Completed", variant: "default" as const, className: "bg-success/10 text-success border-success/20" },
  in_progress: { label: "In Progress", variant: "default" as const, className: "bg-warning/10 text-warning border-warning/20" },
  pending_review: { label: "Pending Review", variant: "default" as const, className: "bg-accent/10 text-accent border-accent/20" },
};

const RecentVisits = () => {
  return (
    <div className="bg-card rounded-xl border border-border">
      <div className="p-6 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Recent Visits</h3>
          <p className="text-sm text-muted-foreground">Latest service visits across all sites</p>
        </div>
        <Button variant="ghost" size="sm" className="text-accent">
          View All
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
      <div className="divide-y divide-border">
        {visits.map((visit) => {
          const status = statusConfig[visit.status as keyof typeof statusConfig];
          return (
            <div 
              key={visit.id} 
              className="p-4 hover:bg-muted/50 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-foreground">{visit.site}</h4>
                <Badge variant="outline" className={status.className}>
                  {status.label}
                </Badge>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  <span>{new Date(visit.date).toLocaleDateString('en-GB', { 
                    day: 'numeric', 
                    month: 'short' 
                  })}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <User className="w-4 h-4" />
                  <span>{visit.engineer}</span>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-success rounded-full"
                      style={{ width: `${visit.coverage}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium">{visit.coverage}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RecentVisits;
