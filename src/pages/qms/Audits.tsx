import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Search as SearchIcon, 
  Plus, 
  Calendar,
  ClipboardList
} from "lucide-react";
import { fetchAudits, QMSAudit } from "@/services/qmsService";
import { format } from "date-fns";

const Audits = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data: audits, isLoading } = useQuery({
    queryKey: ['qms-audits'],
    queryFn: fetchAudits,
  });

  const filteredAudits = audits?.filter(audit => {
    const matchesSearch = audit.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         audit.audit_number.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || audit.status === statusFilter;
    const matchesType = typeFilter === "all" || audit.audit_type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  }) || [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planned': return 'bg-blue-500 text-white';
      case 'in_progress': return 'bg-yellow-500 text-white';
      case 'completed': return 'bg-green-500 text-white';
      case 'cancelled': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'internal': return 'bg-purple-500 text-white';
      case 'external': return 'bg-blue-500 text-white';
      case 'supplier': return 'bg-orange-500 text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const plannedAudits = audits?.filter(a => a.status === 'planned') || [];
  const completedAudits = audits?.filter(a => a.status === 'completed') || [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Internal Audits</h2>
            <p className="text-muted-foreground">Schedule and manage internal audits</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">
              <ClipboardList className="h-4 w-4 mr-2" />
              Audit Templates
            </Button>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Schedule Audit
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <Calendar className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{plannedAudits.length}</p>
                  <p className="text-sm text-muted-foreground">Planned</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold">{audits?.filter(a => a.status === 'in_progress').length || 0}</p>
              <p className="text-sm text-muted-foreground">In Progress</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold text-green-600">{completedAudits.length}</p>
              <p className="text-sm text-muted-foreground">Completed (YTD)</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold">{audits?.filter(a => a.audit_type === 'internal').length || 0}</p>
              <p className="text-sm text-muted-foreground">Internal Audits</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search audits..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="internal">Internal</SelectItem>
              <SelectItem value="external">External</SelectItem>
              <SelectItem value="supplier">Supplier</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="planned">Planned</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-4">
                {Array(5).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filteredAudits.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <SearchIcon className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No audits found</p>
                <p className="text-muted-foreground">Schedule a new audit to get started</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Audit #</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Scope/Department</TableHead>
                    <TableHead>Scheduled Date</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAudits.map((audit) => (
                    <TableRow key={audit.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-mono">{audit.audit_number}</TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">{audit.title}</TableCell>
                      <TableCell>
                        <Badge className={getTypeColor(audit.audit_type)}>{audit.audit_type}</Badge>
                      </TableCell>
                      <TableCell>{audit.auditee_department || audit.scope || '-'}</TableCell>
                      <TableCell>{format(new Date(audit.scheduled_date), 'dd MMM yyyy')}</TableCell>
                      <TableCell>
                        {audit.completed_date ? format(new Date(audit.completed_date), 'dd MMM yyyy') : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(audit.status)}>{audit.status.replace('_', ' ')}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Audits;
