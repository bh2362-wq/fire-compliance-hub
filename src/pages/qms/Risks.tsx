import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  ShieldAlert, 
  Plus, 
  Search
} from "lucide-react";
import { fetchRisks, QMSRisk } from "@/services/qmsService";
import { format } from "date-fns";

const Risks = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: risks, isLoading } = useQuery({
    queryKey: ['qms-risks'],
    queryFn: fetchRisks,
  });

  const filteredRisks = risks?.filter(risk => {
    const matchesSearch = risk.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         risk.risk_number.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "all" || risk.category === categoryFilter;
    const matchesStatus = statusFilter === "all" || risk.status === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  }) || [];

  const getRiskScoreColor = (score: number) => {
    if (score >= 20) return 'bg-destructive text-destructive-foreground';
    if (score >= 15) return 'bg-orange-500 text-white';
    if (score >= 10) return 'bg-yellow-500 text-white';
    if (score >= 5) return 'bg-blue-500 text-white';
    return 'bg-green-500 text-white';
  };

  const getRiskLevel = (score: number) => {
    if (score >= 20) return 'Critical';
    if (score >= 15) return 'High';
    if (score >= 10) return 'Medium';
    if (score >= 5) return 'Low';
    return 'Very Low';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-blue-500 text-white';
      case 'mitigated': return 'bg-green-500 text-white';
      case 'accepted': return 'bg-yellow-500 text-white';
      case 'closed': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getCategoryLabel = (category: string) => {
    return category.charAt(0).toUpperCase() + category.slice(1);
  };

  // Risk matrix summary
  const riskMatrix = {
    critical: risks?.filter(r => r.risk_score >= 20 && r.status === 'active').length || 0,
    high: risks?.filter(r => r.risk_score >= 15 && r.risk_score < 20 && r.status === 'active').length || 0,
    medium: risks?.filter(r => r.risk_score >= 10 && r.risk_score < 15 && r.status === 'active').length || 0,
    low: risks?.filter(r => r.risk_score < 10 && r.status === 'active').length || 0,
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Risk Register</h2>
            <p className="text-muted-foreground">Identify, assess, and mitigate risks</p>
          </div>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Risk
          </Button>
        </div>

        {/* Risk Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-destructive">
            <CardContent className="pt-4">
              <p className="text-3xl font-bold text-destructive">{riskMatrix.critical}</p>
              <p className="text-sm text-muted-foreground">Critical Risks (20-25)</p>
            </CardContent>
          </Card>
          <Card className="border-orange-500">
            <CardContent className="pt-4">
              <p className="text-3xl font-bold text-orange-500">{riskMatrix.high}</p>
              <p className="text-sm text-muted-foreground">High Risks (15-19)</p>
            </CardContent>
          </Card>
          <Card className="border-yellow-500">
            <CardContent className="pt-4">
              <p className="text-3xl font-bold text-yellow-500">{riskMatrix.medium}</p>
              <p className="text-sm text-muted-foreground">Medium Risks (10-14)</p>
            </CardContent>
          </Card>
          <Card className="border-green-500">
            <CardContent className="pt-4">
              <p className="text-3xl font-bold text-green-500">{riskMatrix.low}</p>
              <p className="text-sm text-muted-foreground">Low Risks (1-9)</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search risks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="operational">Operational</SelectItem>
              <SelectItem value="financial">Financial</SelectItem>
              <SelectItem value="compliance">Compliance</SelectItem>
              <SelectItem value="safety">Safety</SelectItem>
              <SelectItem value="environmental">Environmental</SelectItem>
              <SelectItem value="reputational">Reputational</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="mitigated">Mitigated</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
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
            ) : filteredRisks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <ShieldAlert className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No risks found</p>
                <p className="text-muted-foreground">Add a new risk to the register</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Risk #</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-center">L</TableHead>
                    <TableHead className="text-center">I</TableHead>
                    <TableHead className="text-center">Score</TableHead>
                    <TableHead>Risk Level</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Review Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRisks.map((risk) => (
                    <TableRow key={risk.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-mono">{risk.risk_number}</TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">{risk.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{getCategoryLabel(risk.category)}</Badge>
                      </TableCell>
                      <TableCell className="text-center">{risk.likelihood}</TableCell>
                      <TableCell className="text-center">{risk.impact}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={getRiskScoreColor(risk.risk_score)}>{risk.risk_score}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className={`font-medium ${risk.risk_score >= 15 ? 'text-destructive' : ''}`}>
                          {getRiskLevel(risk.risk_score)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(risk.status)}>{risk.status}</Badge>
                      </TableCell>
                      <TableCell>
                        {risk.review_date ? format(new Date(risk.review_date), 'dd MMM yyyy') : '-'}
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

export default Risks;
