import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ComplianceDisclaimer } from "@/components/compliance/ComplianceDisclaimer";
import { fetchOpenReviewResults } from "@/services/compliance/complianceService";
import { ArrowRight } from "lucide-react";

const ComplianceReviewQueue = () => {
  const navigate = useNavigate();
  useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["compliance-review-open"],
    queryFn: fetchOpenReviewResults,
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Review queue</h2>
          <p className="text-muted-foreground">
            Findings awaiting competent-person action across all open compliance cases.
          </p>
        </div>

        <ComplianceDisclaimer />

        <Card>
          <CardHeader><CardTitle>Open findings</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{Array(4).fill(0).map((_, i) => (<Skeleton key={i} className="h-14 w-full" />))}</div>
            ) : !data || data.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No open findings.</p>
            ) : (
              <div className="space-y-2">
                {data.map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{r.rule?.short_title ?? r.rule_key_snapshot}</p>
                      <p className="text-sm text-muted-foreground truncate">{r.finding_summary}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{r.severity}</Badge>
                      <Badge>{r.outcome.replace(/_/g, " ")}</Badge>
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/compliance/cases/${r.case_id}`)}>
                        Open <ArrowRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default ComplianceReviewQueue;
