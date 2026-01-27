import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, MapPin, Cpu, Calendar, MoreHorizontal, Plus } from "lucide-react";

const sites = [
  {
    id: 1,
    name: "Manchester Royal Infirmary",
    address: "Oxford Road, Manchester M13 9WL",
    deviceCount: 342,
    lastVisit: "2026-01-25",
    nextVisit: "2026-04-25",
    status: "compliant",
    coverage: 98,
  },
  {
    id: 2,
    name: "Leeds City Council HQ",
    address: "Merrion Way, Leeds LS2 8BB",
    deviceCount: 186,
    lastVisit: "2026-01-24",
    nextVisit: "2026-04-24",
    status: "in_progress",
    coverage: 72,
  },
  {
    id: 3,
    name: "Birmingham Airport T1",
    address: "Airport Way, Birmingham B26 3QJ",
    deviceCount: 524,
    lastVisit: "2026-01-23",
    nextVisit: "2026-04-23",
    status: "compliant",
    coverage: 100,
  },
  {
    id: 4,
    name: "Sheffield University",
    address: "Western Bank, Sheffield S10 2TN",
    deviceCount: 412,
    lastVisit: "2026-01-22",
    nextVisit: "2026-04-22",
    status: "attention",
    coverage: 89,
  },
  {
    id: 5,
    name: "Liverpool ONE Shopping",
    address: "5 Wall Street, Liverpool L1 8JQ",
    deviceCount: 298,
    lastVisit: "2026-01-21",
    nextVisit: "2026-04-21",
    status: "compliant",
    coverage: 99,
  },
];

const statusConfig = {
  compliant: { label: "Compliant", className: "bg-success/10 text-success border-success/20" },
  in_progress: { label: "In Progress", className: "bg-warning/10 text-warning border-warning/20" },
  attention: { label: "Needs Attention", className: "bg-destructive/10 text-destructive border-destructive/20" },
};

const SitesList = () => {
  return (
    <div className="bg-card rounded-xl border border-border">
      <div className="p-6 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Sites</h3>
          <p className="text-sm text-muted-foreground">Manage your fire alarm installations</p>
        </div>
        <Button variant="hero" size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Add Site
        </Button>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-muted/50 text-sm font-medium text-muted-foreground border-b border-border">
        <div className="col-span-4">Site</div>
        <div className="col-span-2">Devices</div>
        <div className="col-span-2">Last Visit</div>
        <div className="col-span-2">Coverage</div>
        <div className="col-span-2">Status</div>
      </div>

      {/* Table body */}
      <div className="divide-y divide-border">
        {sites.map((site) => {
          const status = statusConfig[site.status as keyof typeof statusConfig];
          return (
            <div 
              key={site.id}
              className="grid grid-cols-12 gap-4 px-6 py-4 hover:bg-muted/30 transition-colors cursor-pointer items-center"
            >
              <div className="col-span-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{site.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {site.address}
                    </p>
                  </div>
                </div>
              </div>
              <div className="col-span-2">
                <div className="flex items-center gap-2 text-foreground">
                  <Cpu className="w-4 h-4 text-muted-foreground" />
                  <span>{site.deviceCount}</span>
                </div>
              </div>
              <div className="col-span-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span className="text-sm">
                    {new Date(site.lastVisit).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short'
                    })}
                  </span>
                </div>
              </div>
              <div className="col-span-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden max-w-20">
                    <div 
                      className={`h-full rounded-full ${
                        site.coverage >= 95 ? 'bg-success' : 
                        site.coverage >= 80 ? 'bg-warning' : 
                        'bg-destructive'
                      }`}
                      style={{ width: `${site.coverage}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-foreground">{site.coverage}%</span>
                </div>
              </div>
              <div className="col-span-2 flex items-center justify-between">
                <Badge variant="outline" className={status.className}>
                  {status.label}
                </Badge>
                <button className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SitesList;
