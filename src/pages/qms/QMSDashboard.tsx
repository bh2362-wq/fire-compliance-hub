import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  AlertTriangle, 
  FileCheck, 
  ClipboardCheck, 
  ShieldAlert, 
  GraduationCap,
  Search,
  MessageSquare,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle
} from "lucide-react";
import { fetchQMSKPIs, fetchNCRs, fetchCAPAs, fetchAudits } from "@/services/qmsService";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

const QMSDashboard = () => {
  const navigate = useNavigate();
  
  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ['qms-kpis'],
    queryFn: fetchQMSKPIs,
  });

  const { data: ncrs } = useQuery({
    queryKey: ['qms-ncrs'],
    queryFn: fetchNCRs,
  });

  const { data: capas } = useQuery({
    queryKey: ['qms-capas'],
    queryFn: fetchCAPAs,
  });

  const { data: audits } = useQuery({
    queryKey: ['qms-audits'],
    queryFn: fetchAudits,
  });

  const recentNCRs = ncrs?.slice(0, 5) || [];
  const upcomingAudits = audits?.filter(a => a.status === 'planned').slice(0, 3) || [];
  const overdueCAPAs = capas?.filter(c => {
    if (!c.due_date || ['closed', 'cancelled'].includes(c.status)) return false;
    return new Date(c.due_date) < new Date();
  }).slice(0, 5) || [];

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-destructive text-destructive-foreground';
      case 'major': return 'bg-orange-500 text-white';
      case 'minor': return 'bg-yellow-500 text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-blue-500 text-white';
      case 'investigation': 
      case 'in_progress': return 'bg-yellow-500 text-white';
      case 'action_required':
      case 'verification': return 'bg-orange-500 text-white';
      case 'closed':
      case 'completed': return 'bg-green-500 text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">QMS Dashboard</h2>
            <p className="text-muted-foreground">ISO 9001 Quality Management System Overview</p>
          </div>
          <Badge variant="outline" className="text-sm">
            ISO 9001:2015 Compliant
          </Badge>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {kpisLoading ? (
            Array(5).fill(0).map((_, i) => (
              <Card key={i}>
                <CardContent className="pt-6">
                  <Skeleton className="h-8 w-16 mb-2" />
                  <Skeleton className="h-4 w-24" />
                </CardContent>
              </Card>
            ))
          ) : (
            <>
              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/qms/ncrs')}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-3xl font-bold text-foreground">{kpis?.openNCRs || 0}</p>
                      <p className="text-sm text-muted-foreground">Open NCRs</p>
                    </div>
                    <AlertTriangle className="h-8 w-8 text-orange-500" />
                  </div>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/qms/capas')}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-3xl font-bold text-foreground">{kpis?.openCAPAs || 0}</p>
                      <p className="text-sm text-muted-foreground">Open CAPAs</p>
                    </div>
                    <ClipboardCheck className="h-8 w-8 text-blue-500" />
                  </div>
                  {(kpis?.overdueCAPAs || 0) > 0 && (
                    <p className="text-xs text-destructive mt-2">{kpis?.overdueCAPAs} overdue</p>
                  )}
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/qms/risks')}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-3xl font-bold text-foreground">{kpis?.highRisks || 0}</p>
                      <p className="text-sm text-muted-foreground">High Risks</p>
                    </div>
                    <ShieldAlert className="h-8 w-8 text-destructive" />
                  </div>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/qms/training')}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-3xl font-bold text-foreground">{kpis?.expiringTraining || 0}</p>
                      <p className="text-sm text-muted-foreground">Expiring Training</p>
                    </div>
                    <GraduationCap className="h-8 w-8 text-yellow-500" />
                  </div>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/qms/documents')}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-3xl font-bold text-foreground">{kpis?.pendingApprovals || 0}</p>
                      <p className="text-sm text-muted-foreground">Pending Approvals</p>
                    </div>
                    <FileCheck className="h-8 w-8 text-purple-500" />
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Recent NCRs */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Recent Non-Conformances</CardTitle>
                <CardDescription>Latest NCRs requiring attention</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate('/qms/ncrs')}>
                View All
              </Button>
            </CardHeader>
            <CardContent>
              {recentNCRs.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No NCRs found</p>
              ) : (
                <div className="space-y-3">
                  {recentNCRs.map((ncr) => (
                    <div key={ncr.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-muted-foreground">{ncr.ncr_number}</span>
                          <Badge className={getSeverityColor(ncr.severity)}>{ncr.severity}</Badge>
                        </div>
                        <p className="font-medium truncate">{ncr.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {ncr.site?.name || ncr.customer?.name || 'No site'}
                        </p>
                      </div>
                      <Badge className={getStatusColor(ncr.status)}>{ncr.status.replace('_', ' ')}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Audits */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Upcoming Audits</CardTitle>
                <CardDescription>Scheduled internal audits</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate('/qms/audits')}>
                View All
              </Button>
            </CardHeader>
            <CardContent>
              {upcomingAudits.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No upcoming audits</p>
              ) : (
                <div className="space-y-3">
                  {upcomingAudits.map((audit) => (
                    <div key={audit.id} className="p-3 rounded-lg border">
                      <div className="flex items-center gap-2 mb-1">
                        <Search className="h-4 w-4 text-muted-foreground" />
                        <span className="font-mono text-sm text-muted-foreground">{audit.audit_number}</span>
                      </div>
                      <p className="font-medium">{audit.title}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(audit.scheduled_date), 'dd MMM yyyy')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Overdue CAPAs */}
        {overdueCAPAs.length > 0 && (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center gap-2">
                <XCircle className="h-5 w-5" />
                Overdue Corrective Actions
              </CardTitle>
              <CardDescription>CAPAs that require immediate attention</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {overdueCAPAs.map((capa) => (
                  <div key={capa.id} className="flex items-center justify-between p-3 rounded-lg border border-destructive/20 bg-destructive/5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">{capa.capa_number}</span>
                        <Badge variant={capa.type === 'corrective' ? 'default' : 'secondary'}>
                          {capa.type}
                        </Badge>
                      </div>
                      <p className="font-medium">{capa.title}</p>
                      <p className="text-sm text-destructive">
                        Due: {capa.due_date ? format(new Date(capa.due_date), 'dd MMM yyyy') : 'Not set'}
                      </p>
                    </div>
                    <Button size="sm" variant="destructive" onClick={() => navigate('/qms/capas')}>
                      Action
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Stats */}
        <div className="grid md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-green-500/10">
                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{kpis?.closedNCRsThisMonth || 0}</p>
                  <p className="text-sm text-muted-foreground">NCRs Closed This Month</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-blue-500/10">
                  <Search className="h-6 w-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{kpis?.upcomingAudits || 0}</p>
                  <p className="text-sm text-muted-foreground">Audits Next 30 Days</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-orange-500/10">
                  <MessageSquare className="h-6 w-6 text-orange-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{kpis?.complaintsThisMonth || 0}</p>
                  <p className="text-sm text-muted-foreground">Complaints This Month</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default QMSDashboard;
