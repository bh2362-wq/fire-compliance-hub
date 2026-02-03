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
  ClipboardCheck, 
  Plus, 
  Search,
  AlertCircle
} from "lucide-react";
import { fetchCAPAs, QMSCAPA } from "@/services/qmsService";
import { format } from "date-fns";

const CAPAs = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data: capas, isLoading } = useQuery({
    queryKey: ['qms-capas'],
    queryFn: fetchCAPAs,
  });

  const filteredCAPAs = capas?.filter(capa => {
    const matchesSearch = capa.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         capa.capa_number.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || capa.status === statusFilter;
    const matchesType = typeFilter === "all" || capa.type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  }) || [];

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-destructive text-destructive-foreground';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-yellow-500 text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-blue-500 text-white';
      case 'in_progress': return 'bg-purple-500 text-white';
      case 'verification': return 'bg-yellow-500 text-white';
      case 'closed': return 'bg-green-500 text-white';
      case 'cancelled': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const isOverdue = (capa: QMSCAPA) => {
    if (!capa.due_date || ['closed', 'cancelled'].includes(capa.status)) return false;
    return new Date(capa.due_date) < new Date();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Corrective & Preventive Actions</h2>
            <p className="text-muted-foreground">Manage CAPAs and track effectiveness</p>
          </div>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New CAPA
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold">{capas?.filter(c => c.status === 'open').length || 0}</p>
              <p className="text-sm text-muted-foreground">Open</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold">{capas?.filter(c => c.status === 'in_progress').length || 0}</p>
              <p className="text-sm text-muted-foreground">In Progress</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold">{capas?.filter(c => c.status === 'verification').length || 0}</p>
              <p className="text-sm text-muted-foreground">Verification</p>
            </CardContent>
          </Card>
          <Card className="border-destructive">
            <CardContent className="pt-4">
              <p className="text-2xl font-bold text-destructive">{capas?.filter(c => isOverdue(c)).length || 0}</p>
              <p className="text-sm text-muted-foreground">Overdue</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold text-green-600">{capas?.filter(c => c.status === 'closed').length || 0}</p>
              <p className="text-sm text-muted-foreground">Closed</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search CAPAs..."
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
              <SelectItem value="corrective">Corrective</SelectItem>
              <SelectItem value="preventive">Preventive</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="verification">Verification</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
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
            ) : filteredCAPAs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <ClipboardCheck className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No CAPAs found</p>
                <p className="text-muted-foreground">Create a new CAPA to get started</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>CAPA #</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Linked NCR</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCAPAs.map((capa) => (
                    <TableRow 
                      key={capa.id} 
                      className={`cursor-pointer hover:bg-muted/50 ${isOverdue(capa) ? 'bg-destructive/5' : ''}`}
                    >
                      <TableCell className="font-mono">
                        <div className="flex items-center gap-2">
                          {isOverdue(capa) && <AlertCircle className="h-4 w-4 text-destructive" />}
                          {capa.capa_number}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={capa.type === 'corrective' ? 'default' : 'secondary'}>
                          {capa.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">{capa.title}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">
                        {capa.ncr ? (capa.ncr as any).ncr_number : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge className={getPriorityColor(capa.priority)}>{capa.priority}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(capa.status)}>{capa.status.replace('_', ' ')}</Badge>
                      </TableCell>
                      <TableCell>
                        {capa.due_date ? (
                          <span className={isOverdue(capa) ? 'text-destructive font-medium' : ''}>
                            {format(new Date(capa.due_date), 'dd MMM yyyy')}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell>{format(new Date(capa.created_at), 'dd MMM yyyy')}</TableCell>
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

export default CAPAs;
