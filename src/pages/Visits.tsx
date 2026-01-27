import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Calendar, 
  User, 
  Building2, 
  Plus, 
  Filter,
  Download,
  Eye
} from "lucide-react";

const visits = [
  {
    id: "VIS-001",
    site: "Manchester Royal Infirmary",
    date: "2026-01-25",
    engineer: "John Doe",
    type: "Quarterly Service",
    status: "completed",
    coverage: 98,
    devices: { tested: 335, total: 342 },
    issues: 2,
  },
  {
    id: "VIS-002",
    site: "Leeds City Council HQ",
    date: "2026-01-24",
    engineer: "Sarah Smith",
    type: "Quarterly Service",
    status: "in_progress",
    coverage: 72,
    devices: { tested: 134, total: 186 },
    issues: 0,
  },
  {
    id: "VIS-003",
    site: "Birmingham Airport T1",
    date: "2026-01-23",
    engineer: "Mike Johnson",
    type: "Annual Inspection",
    status: "completed",
    coverage: 100,
    devices: { tested: 524, total: 524 },
    issues: 0,
  },
  {
    id: "VIS-004",
    site: "Sheffield University",
    date: "2026-01-22",
    engineer: "John Doe",
    type: "Quarterly Service",
    status: "pending_review",
    coverage: 95,
    devices: { tested: 391, total: 412 },
    issues: 5,
  },
  {
    id: "VIS-005",
    site: "Liverpool ONE Shopping",
    date: "2026-01-21",
    engineer: "Emma Wilson",
    type: "Quarterly Service",
    status: "completed",
    coverage: 99,
    devices: { tested: 295, total: 298 },
    issues: 1,
  },
];

const statusConfig = {
  completed: { label: "Completed", className: "bg-success/10 text-success border-success/20" },
  in_progress: { label: "In Progress", className: "bg-warning/10 text-warning border-warning/20" },
  pending_review: { label: "Pending Review", className: "bg-accent/10 text-accent border-accent/20" },
};

const Visits = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Visits</h2>
            <p className="text-muted-foreground">Manage and track all service visits</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm">
              <Filter className="w-4 h-4 mr-2" />
              Filter
            </Button>
            <Button variant="hero" size="sm">
              <Plus className="w-4 h-4 mr-2" />
              New Visit
            </Button>
          </div>
        </div>

        {/* Visits table */}
        <div className="bg-card rounded-xl border border-border">
          {/* Table header */}
          <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-muted/50 text-sm font-medium text-muted-foreground border-b border-border">
            <div className="col-span-1">ID</div>
            <div className="col-span-3">Site</div>
            <div className="col-span-2">Date / Engineer</div>
            <div className="col-span-2">Devices</div>
            <div className="col-span-2">Coverage</div>
            <div className="col-span-2">Actions</div>
          </div>

          {/* Table body */}
          <div className="divide-y divide-border">
            {visits.map((visit) => {
              const status = statusConfig[visit.status as keyof typeof statusConfig];
              return (
                <div 
                  key={visit.id}
                  className="grid grid-cols-12 gap-4 px-6 py-4 hover:bg-muted/30 transition-colors items-center"
                >
                  <div className="col-span-1">
                    <span className="text-sm font-mono text-muted-foreground">{visit.id}</span>
                  </div>
                  <div className="col-span-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{visit.site}</p>
                        <p className="text-xs text-muted-foreground">{visit.type}</p>
                      </div>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-sm text-foreground">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        {new Date(visit.date).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <User className="w-4 h-4" />
                        {visit.engineer}
                      </div>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="space-y-1">
                      <p className="text-sm text-foreground">
                        {visit.devices.tested} / {visit.devices.total} tested
                      </p>
                      {visit.issues > 0 && (
                        <p className="text-xs text-destructive">{visit.issues} issues found</p>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              visit.coverage >= 95 ? 'bg-success' : 
                              visit.coverage >= 80 ? 'bg-warning' : 
                              'bg-destructive'
                            }`}
                            style={{ width: `${visit.coverage}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-foreground w-10">{visit.coverage}%</span>
                      </div>
                      <Badge variant="outline" className={status.className}>
                        {status.label}
                      </Badge>
                    </div>
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <Button variant="ghost" size="sm">
                      <Eye className="w-4 h-4 mr-1" />
                      View
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Download className="w-4 h-4 mr-1" />
                      PDF
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Visits;
