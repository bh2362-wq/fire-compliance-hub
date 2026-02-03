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
  MessageSquare, 
  Plus, 
  Search,
  ThumbsUp,
  AlertCircle,
  Lightbulb,
  HelpCircle
} from "lucide-react";
import { fetchFeedback, QMSFeedback } from "@/services/qmsService";
import { format } from "date-fns";

const Feedback = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: feedback, isLoading } = useQuery({
    queryKey: ['qms-feedback'],
    queryFn: fetchFeedback,
  });

  const filteredFeedback = feedback?.filter(fb => {
    const matchesSearch = fb.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         fb.feedback_number.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "all" || fb.type === typeFilter;
    const matchesStatus = statusFilter === "all" || fb.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  }) || [];

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'complaint': return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'positive': return <ThumbsUp className="h-4 w-4 text-green-500" />;
      case 'suggestion': return <Lightbulb className="h-4 w-4 text-yellow-500" />;
      case 'enquiry': return <HelpCircle className="h-4 w-4 text-blue-500" />;
      default: return null;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'complaint': return 'bg-destructive text-destructive-foreground';
      case 'positive': return 'bg-green-500 text-white';
      case 'suggestion': return 'bg-yellow-500 text-white';
      case 'enquiry': return 'bg-blue-500 text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-destructive text-destructive-foreground';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-yellow-500 text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-blue-500 text-white';
      case 'investigating': return 'bg-purple-500 text-white';
      case 'resolved': return 'bg-green-500 text-white';
      case 'closed': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const complaints = feedback?.filter(f => f.type === 'complaint') || [];
  const positive = feedback?.filter(f => f.type === 'positive') || [];
  const openFeedback = feedback?.filter(f => !['resolved', 'closed'].includes(f.status)) || [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Customer Feedback</h2>
            <p className="text-muted-foreground">Track complaints, suggestions, and positive feedback</p>
          </div>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Log Feedback
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <MessageSquare className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{openFeedback.length}</p>
                  <p className="text-sm text-muted-foreground">Open</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-destructive">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-8 w-8 text-destructive" />
                <div>
                  <p className="text-2xl font-bold text-destructive">{complaints.length}</p>
                  <p className="text-sm text-muted-foreground">Complaints</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-green-500">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <ThumbsUp className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold text-green-600">{positive.length}</p>
                  <p className="text-sm text-muted-foreground">Positive</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold">{feedback?.filter(f => f.status === 'resolved').length || 0}</p>
              <p className="text-sm text-muted-foreground">Resolved</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search feedback..."
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
              <SelectItem value="complaint">Complaints</SelectItem>
              <SelectItem value="positive">Positive</SelectItem>
              <SelectItem value="suggestion">Suggestions</SelectItem>
              <SelectItem value="enquiry">Enquiries</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="investigating">Investigating</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
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
            ) : filteredFeedback.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No feedback found</p>
                <p className="text-muted-foreground">Log customer feedback to get started</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ref #</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFeedback.map((fb) => (
                    <TableRow key={fb.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-mono">{fb.feedback_number}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getTypeIcon(fb.type)}
                          <Badge className={getTypeColor(fb.type)}>{fb.type}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">{fb.subject}</TableCell>
                      <TableCell>{fb.customer?.name || '-'}</TableCell>
                      <TableCell className="capitalize">{fb.channel?.replace('_', ' ') || '-'}</TableCell>
                      <TableCell>
                        <Badge className={getPriorityColor(fb.priority)}>{fb.priority}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(fb.status)}>{fb.status}</Badge>
                      </TableCell>
                      <TableCell>{format(new Date(fb.created_at), 'dd MMM yyyy')}</TableCell>
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

export default Feedback;
