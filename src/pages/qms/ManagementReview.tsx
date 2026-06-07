import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart3,
  Plus,
  Calendar,
  TrendingUp,
  TrendingDown,
  Users,
  FileText,
} from "lucide-react";
import { fetchManagementReviews, fetchQMSKPIs } from "@/services/qmsService";
import { format } from "date-fns";
import { ScheduleReviewDialog } from "@/components/qms/ScheduleReviewDialog";
import { ManagementReviewDetailDialog } from "@/components/qms/ManagementReviewDetailDialog";

const ManagementReview = () => {
  const queryClient = useQueryClient();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  // null = dialog closed. Setting to a row id opens the detail dialog
  // for that row (works for scheduled, in-progress, and completed
  // reviews — the dialog flips to read-only on completed).
  const [detailReviewId, setDetailReviewId] = useState<string | null>(null);

  const refreshReviews = () => {
    queryClient.invalidateQueries({ queryKey: ['qms-management-reviews'] });
    queryClient.invalidateQueries({ queryKey: ['qms-kpis'] });
  };

  const { data: reviews, isLoading } = useQuery({
    queryKey: ['qms-management-reviews'],
    queryFn: fetchManagementReviews,
  });

  const { data: kpis } = useQuery({
    queryKey: ['qms-kpis'],
    queryFn: fetchQMSKPIs,
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-500 text-white';
      case 'in_progress': return 'bg-yellow-500 text-white';
      case 'completed': return 'bg-green-500 text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const upcomingReview = reviews?.find(r => r.status === 'scheduled' || r.status === 'in_progress');
  const completedReviews = reviews?.filter(r => r.status === 'completed') || [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Management Review</h2>
            <p className="text-muted-foreground">QMS performance review and strategic decisions</p>
          </div>
          <Button onClick={() => setScheduleOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Schedule Review
          </Button>
        </div>

        {/* Next Review Card */}
        {upcomingReview && (
          <Card className="border-primary bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Next Management Review
              </CardTitle>
              <CardDescription>
                Scheduled for {format(new Date(upcomingReview.review_date), 'EEEE, dd MMMM yyyy')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 flex-wrap">
                <Badge className="text-sm">{upcomingReview.review_number}</Badge>
                <Badge variant="outline" className="capitalize">{upcomingReview.status.replace("_", " ")}</Badge>
                <Button
                  size="sm"
                  onClick={() => setDetailReviewId(upcomingReview.id)}
                >
                  {upcomingReview.status === 'scheduled' ? 'Start Review' : 'Open Review'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* KPI Summary for Reviews */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Open NCRs</p>
                  <p className="text-2xl font-bold">{kpis?.openNCRs || 0}</p>
                </div>
                <TrendingDown className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Overdue CAPAs</p>
                  <p className="text-2xl font-bold text-destructive">{kpis?.overdueCAPAs || 0}</p>
                </div>
                {(kpis?.overdueCAPAs || 0) > 0 ? (
                  <TrendingUp className="h-8 w-8 text-destructive" />
                ) : (
                  <TrendingDown className="h-8 w-8 text-green-500" />
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">High Risks</p>
                  <p className="text-2xl font-bold">{kpis?.highRisks || 0}</p>
                </div>
                <BarChart3 className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Expiring Training</p>
                  <p className="text-2xl font-bold">{kpis?.expiringTraining || 0}</p>
                </div>
                <Users className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Review Inputs Section */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Review Inputs (ISO 9001 Clause 9.3.2)</CardTitle>
              <CardDescription>Required inputs for management review</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {[
                  'Status of actions from previous reviews',
                  'Changes in external and internal issues',
                  'Customer satisfaction and feedback',
                  'Quality objectives and performance',
                  'Process performance and product conformity',
                  'Nonconformities and corrective actions',
                  'Monitoring and measurement results',
                  'Audit results',
                  'Supplier performance',
                  'Resource adequacy',
                  'Risk and opportunity actions effectiveness',
                  'Improvement opportunities',
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Review Outputs (ISO 9001 Clause 9.3.3)</CardTitle>
              <CardDescription>Required outputs from management review</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {[
                  'Improvement opportunities',
                  'Need for changes to the QMS',
                  'Resource needs',
                  'Decisions and actions taken',
                  'Updated quality objectives',
                  'Assigned responsibilities and deadlines',
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Previous Reviews */}
        <Card>
          <CardHeader>
            <CardTitle>Review History</CardTitle>
            <CardDescription>Previous management reviews and their outcomes</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-4">
                {Array(3).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : completedReviews.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No completed reviews</p>
                <p className="text-muted-foreground">Schedule your first management review</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Review #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Attendees</TableHead>
                    <TableHead>Actions</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Next Review</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completedReviews.map((review) => (
                    <TableRow
                      key={review.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setDetailReviewId(review.id)}
                    >
                      <TableCell className="font-mono">{review.review_number}</TableCell>
                      <TableCell>{format(new Date(review.review_date), 'dd MMM yyyy')}</TableCell>
                      <TableCell>{review.attendees?.length || 0} attendees</TableCell>
                      <TableCell>{(review.action_items as any[])?.length || 0} actions</TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(review.status)}>{review.status}</Badge>
                      </TableCell>
                      <TableCell>
                        {review.next_review_date ? format(new Date(review.next_review_date), 'dd MMM yyyy') : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <ScheduleReviewDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        onScheduled={(id) => {
          refreshReviews();
          // Drop the user straight into the detail editor so they can
          // populate inputs/outputs immediately.
          setDetailReviewId(id);
        }}
      />

      <ManagementReviewDetailDialog
        reviewId={detailReviewId}
        open={detailReviewId !== null}
        onOpenChange={(o) => { if (!o) setDetailReviewId(null); }}
        onChanged={refreshReviews}
      />
    </DashboardLayout>
  );
};

export default ManagementReview;
