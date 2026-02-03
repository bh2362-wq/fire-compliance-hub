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
  AlertTriangle, 
  Plus, 
  Search,
  Pencil
} from "lucide-react";
import { fetchNCRs, QMSNCR } from "@/services/qmsService";
import { NCRFormDialog } from "@/components/qms/NCRFormDialog";
import { format } from "date-fns";

const NCRs = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedNCR, setSelectedNCR] = useState<QMSNCR | null>(null);

  const { data: ncrs, isLoading } = useQuery({
    queryKey: ['qms-ncrs'],
    queryFn: fetchNCRs,
  });

  const filteredNCRs = ncrs?.filter(ncr => {
    const matchesSearch = ncr.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         ncr.ncr_number.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || ncr.status === statusFilter;
    const matchesSeverity = severityFilter === "all" || ncr.severity === severityFilter;
    return matchesSearch && matchesStatus && matchesSeverity;
  }) || [];

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
      case 'investigation': return 'bg-purple-500 text-white';
      case 'action_required': return 'bg-orange-500 text-white';
      case 'verification': return 'bg-yellow-500 text-white';
      case 'closed': return 'bg-green-500 text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getSourceLabel = (source: string) => {
    return source.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const handleCreateNCR = () => {
    setSelectedNCR(null);
    setDialogOpen(true);
  };

  const handleEditNCR = (ncr: QMSNCR) => {
    setSelectedNCR(ncr);
    setDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Non-Conformance Reports</h2>
            <p className="text-muted-foreground">Track and manage non-conformances</p>
          </div>
          <Button onClick={handleCreateNCR}>
            <Plus className="h-4 w-4 mr-2" />
            Raise NCR
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold">{ncrs?.filter(n => n.status === 'open').length || 0}</p>
              <p className="text-sm text-muted-foreground">Open</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold">{ncrs?.filter(n => n.status === 'investigation').length || 0}</p>
              <p className="text-sm text-muted-foreground">Investigation</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold">{ncrs?.filter(n => n.status === 'action_required').length || 0}</p>
              <p className="text-sm text-muted-foreground">Action Required</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold">{ncrs?.filter(n => n.status === 'verification').length || 0}</p>
              <p className="text-sm text-muted-foreground">Verification</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold text-green-600">{ncrs?.filter(n => n.status === 'closed').length || 0}</p>
              <p className="text-sm text-muted-foreground">Closed</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search NCRs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="investigation">Investigation</SelectItem>
              <SelectItem value="action_required">Action Required</SelectItem>
              <SelectItem value="verification">Verification</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severity</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="major">Major</SelectItem>
              <SelectItem value="minor">Minor</SelectItem>
              <SelectItem value="observation">Observation</SelectItem>
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
            ) : filteredNCRs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No NCRs found</p>
                <p className="text-muted-foreground">Raise a new NCR to get started</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>NCR #</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead className="hidden md:table-cell">Source</TableHead>
                    <TableHead className="hidden lg:table-cell">Site/Customer</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Due Date</TableHead>
                    <TableHead className="hidden lg:table-cell">Created</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredNCRs.map((ncr) => (
                    <TableRow key={ncr.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleEditNCR(ncr)}>
                      <TableCell className="font-mono">{ncr.ncr_number}</TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">{ncr.title}</TableCell>
                      <TableCell className="hidden md:table-cell">{getSourceLabel(ncr.source)}</TableCell>
                      <TableCell className="hidden lg:table-cell">{ncr.site?.name || ncr.customer?.name || '-'}</TableCell>
                      <TableCell>
                        <Badge className={getSeverityColor(ncr.severity)}>{ncr.severity}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(ncr.status)}>{ncr.status.replace('_', ' ')}</Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {ncr.due_date ? (
                          <span className={new Date(ncr.due_date) < new Date() && ncr.status !== 'closed' ? 'text-destructive font-medium' : ''}>
                            {format(new Date(ncr.due_date), 'dd MMM yyyy')}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">{format(new Date(ncr.created_at), 'dd MMM yyyy')}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleEditNCR(ncr); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <NCRFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        ncr={selectedNCR}
      />
    </DashboardLayout>
  );
};

export default NCRs;
