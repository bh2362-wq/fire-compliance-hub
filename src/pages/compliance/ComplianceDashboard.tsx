import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck, FilePlus, ListChecks, AlertCircle, ClipboardList, FileSearch } from "lucide-react";
import { ComplianceDisclaimer } from "@/components/compliance/ComplianceDisclaimer";
import { fetchCases, fetchOpenReviewResults } from "@/services/compliance/complianceService";

const ComplianceDashboard = () => {
  const navigate = useNavigate();

  const { data: cases, isLoading: casesLoading } = useQuery({
    queryKey: ["compliance-cases"],
    queryFn: fetchCases,
  });
  const { data: openResults } = useQuery({
    queryKey: ["compliance-review-open"],
    queryFn: fetchOpenReviewResults,
  });

  const counts = {
    total: cases?.length ?? 0,
    needsReview: cases?.filter((c) => c.case_status === "needs_review").length ?? 0,
    needsEvidence: cases?.filter((c) => c.case_status === "needs_evidence").length ?? 0,
    remediation: cases?.filter((c) => c.case_status === "remediation_required").length ?? 0,
    signedOff: cases?.filter((c) => c.case_status === "signed_off").length ?? 0,
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-primary" />
              BS 5839-1 Compliance Validator
            </h2>
            <p className="text-muted-foreground">
              Internal compliance cases, evidence and review queue (draft rule pack)
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/compliance/review-queue")}>
              <ListChecks className="h-4 w-4 mr-2" /> Review queue
            </Button>
            <Button onClick={() => navigate("/compliance/cases")}>
              <FilePlus className="h-4 w-4 mr-2" /> Cases
            </Button>
          </div>
        </div>

        <ComplianceDisclaimer />

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {casesLoading ? (
            Array(5).fill(0).map((_, i) => (
              <Card key={i}><CardContent className="pt-6"><Skeleton className="h-8 w-16 mb-2" /><Skeleton className="h-4 w-24" /></CardContent></Card>
            ))
          ) : (
            <>
              <KpiCard label="Total cases" value={counts.total} icon={ClipboardList} tone="text-primary" />
              <KpiCard label="Needs review" value={counts.needsReview} icon={FileSearch} tone="text-orange-500" />
              <KpiCard label="Needs evidence" value={counts.needsEvidence} icon={AlertCircle} tone="text-yellow-500" />
              <KpiCard label="Remediation" value={counts.remediation} icon={AlertCircle} tone="text-destructive" />
              <KpiCard label="Signed off" value={counts.signedOff} icon={ShieldCheck} tone="text-green-500" />
            </>
          )}
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent compliance cases</CardTitle>
              <CardDescription>Latest cases across the team</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/compliance/cases")}>View all</Button>
          </CardHeader>
          <CardContent>
            {!cases || cases.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No compliance cases yet. Create the first one from the Cases page.</p>
            ) : (
              <div className="space-y-3">
                {cases.slice(0, 6).map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/compliance/cases/${c.id}`)}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-muted-foreground">{c.case_number}</span>
                        <Badge variant="outline">{c.job_type}</Badge>
                      </div>
                      <p className="font-medium">{c.premises_name || c.job_reference || "Untitled case"}</p>
                    </div>
                    <Badge>{c.case_status.replace(/_/g, " ")}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Open review items</CardTitle>
            <CardDescription>Findings awaiting competent-person action</CardDescription>
          </CardHeader>
          <CardContent>
            {!openResults || openResults.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Nothing in the review queue.</p>
            ) : (
              <div className="space-y-2">
                {openResults.slice(0, 8).map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{r.rule?.short_title ?? r.rule_key_snapshot}</p>
                      <p className="text-sm text-muted-foreground truncate">{r.finding_summary}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{r.severity}</Badge>
                      <Badge>{r.outcome.replace(/_/g, " ")}</Badge>
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

const KpiCard = ({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  tone: string;
}) => (
  <Card>
    <CardContent className="pt-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-3xl font-bold text-foreground">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
        <Icon className={`h-7 w-7 ${tone}`} />
      </div>
    </CardContent>
  </Card>
);

export default ComplianceDashboard;
