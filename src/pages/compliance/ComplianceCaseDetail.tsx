import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Play, Plus, FileText, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { ComplianceDisclaimer } from "@/components/compliance/ComplianceDisclaimer";
import {
  fetchCase,
  fetchCaseInputs,
  fetchEvidence,
  fetchLatestRun,
  fetchResultsForRun,
  upsertCaseInput,
  addEvidence,
  runValidationForCase,
  recordReviewAction,
  ReviewActionKind,
} from "@/services/compliance/complianceService";

const EVIDENCE_TYPES = [
  "fire_risk_assessment",
  "design_drawings",
  "design_certificate",
  "installation_photos",
  "variation_record",
  "commissioning_certificate",
  "handover_pack",
  "maintenance_record",
];

const INPUT_KEYS = [
  "fire_alarm_category",
  "premises_type",
  "zoning_summary",
  "fire_risk_assessment_reference",
  "power_supply_summary",
  "battery_capacity_calc_reference",
  "cabling_summary",
  "variation_declared",
  "variation_summary",
  "commissioning_test_results",
  "cause_effect_verified",
  "service_interval_months",
];

const ComplianceCaseDetail = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: kase, isLoading } = useQuery({
    queryKey: ["compliance-case", id],
    queryFn: () => fetchCase(id),
    enabled: !!id,
  });
  const { data: inputs } = useQuery({
    queryKey: ["compliance-case-inputs", id],
    queryFn: () => fetchCaseInputs(id),
    enabled: !!id,
  });
  const { data: evidence } = useQuery({
    queryKey: ["compliance-evidence", id],
    queryFn: () => fetchEvidence(id),
    enabled: !!id,
  });
  const { data: latestRun } = useQuery({
    queryKey: ["compliance-latest-run", id],
    queryFn: () => fetchLatestRun(id),
    enabled: !!id,
  });
  const { data: results } = useQuery({
    queryKey: ["compliance-results", latestRun?.id],
    queryFn: () => (latestRun ? fetchResultsForRun(latestRun.id) : Promise.resolve([])),
    enabled: !!latestRun?.id,
  });

  const [running, setRunning] = useState(false);

  const handleRunValidation = async () => {
    setRunning(true);
    try {
      const { run } = await runValidationForCase({ caseId: id, triggeredBy: user?.id });
      toast.success("Validation run completed");
      qc.invalidateQueries({ queryKey: ["compliance-latest-run", id] });
      qc.invalidateQueries({ queryKey: ["compliance-case", id] });
      qc.invalidateQueries({ queryKey: ["compliance-results", run.id] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-40 w-full" /></div>
      </DashboardLayout>
    );
  }
  if (!kase) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Case not found.</p>
          <Button variant="outline" className="mt-3" onClick={() => navigate("/compliance/cases")}>Back to cases</Button>
        </div>
      </DashboardLayout>
    );
  }

  const summary = (latestRun?.run_summary as Record<string, number> | undefined) ?? {};

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/compliance/cases")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to cases
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">{kase.premises_name || kase.case_number}</h2>
            <p className="text-muted-foreground font-mono text-sm">{kase.case_number}</p>
            <div className="flex gap-2 mt-2">
              <Badge variant="outline">{kase.job_type}</Badge>
              <Badge>{kase.case_status.replace(/_/g, " ")}</Badge>
            </div>
          </div>
          <Button onClick={handleRunValidation} disabled={running}>
            <Play className="h-4 w-4 mr-2" /> {running ? "Running…" : "Run validation"}
          </Button>
        </div>

        <ComplianceDisclaimer />

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="inputs">Case inputs ({inputs?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="evidence">Evidence ({evidence?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="results">Results ({results?.length ?? 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Latest run</CardTitle></CardHeader>
              <CardContent>
                {!latestRun ? (
                  <p className="text-muted-foreground">No validation has been run yet. Add inputs/evidence then run validation.</p>
                ) : (
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-center">
                    {(["pass", "fail", "needs_evidence", "needs_review", "not_applicable", "error"] as const).map((k) => (
                      <div key={k} className="border rounded-lg p-3">
                        <p className="text-2xl font-bold">{summary[k] ?? 0}</p>
                        <p className="text-xs text-muted-foreground">{k.replace(/_/g, " ")}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inputs">
            <CaseInputsTab caseId={id} userId={user?.id} />
          </TabsContent>

          <TabsContent value="evidence">
            <EvidenceTab caseId={id} userId={user?.id} />
          </TabsContent>

          <TabsContent value="results">
            <ResultsTab caseId={id} runId={latestRun?.id ?? null} userId={user?.id} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

// ---------------------------------------------------------------------
// Inputs tab
// ---------------------------------------------------------------------

const CaseInputsTab = ({ caseId, userId }: { caseId: string; userId?: string }) => {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["compliance-case-inputs", caseId],
    queryFn: () => fetchCaseInputs(caseId),
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ key: INPUT_KEYS[0], value: "" });

  const handleSave = async () => {
    if (!form.key) return;
    let value: unknown = form.value;
    if (form.value === "true") value = true;
    else if (form.value === "false") value = false;
    else if (!Number.isNaN(Number(form.value)) && form.value.trim() !== "") value = Number(form.value);
    try {
      await upsertCaseInput(caseId, form.key, value, userId);
      toast.success("Input saved");
      qc.invalidateQueries({ queryKey: ["compliance-case-inputs", caseId] });
      setOpen(false);
      setForm({ key: INPUT_KEYS[0], value: "" });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Case inputs</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-2" /> Add input</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add or update input</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Key</Label>
                <Select value={form.key} onValueChange={(v) => setForm({ ...form, key: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INPUT_KEYS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Value (text, number, true/false)</Label>
                <Input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleSave}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {!data || data.length === 0 ? (
          <p className="text-muted-foreground text-center py-6">No inputs recorded.</p>
        ) : (
          <div className="space-y-2">
            {data.map((i) => (
              <div key={i.id} className="flex items-center justify-between p-2 border rounded-md">
                <span className="font-mono text-sm">{i.input_key}</span>
                <span className="text-sm">{JSON.stringify(i.input_value)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ---------------------------------------------------------------------
// Evidence tab
// ---------------------------------------------------------------------

const EvidenceTab = ({ caseId, userId }: { caseId: string; userId?: string }) => {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["compliance-evidence", caseId],
    queryFn: () => fetchEvidence(caseId),
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    document_type: EVIDENCE_TYPES[0],
    file_name: "",
    external_url: "",
  });

  const handleAdd = async () => {
    if (!form.file_name) {
      toast.error("File name required");
      return;
    }
    try {
      await addEvidence({
        case_id: caseId,
        document_type: form.document_type,
        file_name: form.file_name,
        external_url: form.external_url || null,
        uploaded_by: userId,
      });
      toast.success("Evidence linked");
      qc.invalidateQueries({ queryKey: ["compliance-evidence", caseId] });
      setOpen(false);
      setForm({ document_type: EVIDENCE_TYPES[0], file_name: "", external_url: "" });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const required = EVIDENCE_TYPES;
  const present = new Set((data ?? []).map((e) => e.document_type));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Evidence</CardTitle>
          <CardDescription>Link supporting documents – required types are listed below.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-2" /> Link evidence</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Link evidence document</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Document type</Label>
                <Select value={form.document_type} onValueChange={(v) => setForm({ ...form, document_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EVIDENCE_TYPES.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>File name</Label>
                <Input value={form.file_name} onChange={(e) => setForm({ ...form, file_name: e.target.value })} />
              </div>
              <div>
                <Label>External URL (optional)</Label>
                <Input value={form.external_url} onChange={(e) => setForm({ ...form, external_url: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleAdd}>Link</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          {required.map((t) => (
            <Badge key={t} variant={present.has(t) ? "default" : "outline"} className="justify-center">
              {present.has(t) ? "✓" : "○"} {t}
            </Badge>
          ))}
        </div>
        {!data || data.length === 0 ? (
          <p className="text-muted-foreground text-center py-6">No evidence linked.</p>
        ) : (
          <div className="space-y-2">
            {data.map((e) => (
              <div key={e.id} className="flex items-center justify-between p-2 border rounded-md">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm truncate">{e.file_name}</span>
                </div>
                <Badge variant="outline">{e.document_type}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ---------------------------------------------------------------------
// Results tab
// ---------------------------------------------------------------------

const ResultsTab = ({
  caseId,
  runId,
  userId,
}: {
  caseId: string;
  runId: string | null;
  userId?: string;
}) => {
  const qc = useQueryClient();
  const { data: results, isLoading } = useQuery({
    queryKey: ["compliance-results", runId],
    queryFn: () => (runId ? fetchResultsForRun(runId) : Promise.resolve([])),
    enabled: !!runId,
  });

  if (!runId) {
    return (
      <Card><CardContent className="py-8 text-center text-muted-foreground">
        No run yet. Click "Run validation" above.
      </CardContent></Card>
    );
  }
  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (!results || results.length === 0) {
    return <Card><CardContent className="py-8 text-center text-muted-foreground">No results.</CardContent></Card>;
  }

  return (
    <div className="space-y-2">
      {results.map((r) => (
        <ResultRow
          key={r.id}
          rule_key={r.rule?.short_title ?? r.rule_key_snapshot}
          outcome={r.outcome}
          severity={r.severity}
          summary={r.finding_summary}
          missing_inputs={r.missing_inputs}
          missing_evidence={r.missing_evidence}
          onAction={async (action, rationale) => {
            if (!userId) {
              toast.error("Sign in required");
              return;
            }
            try {
              await recordReviewAction({
                resultId: r.id,
                action,
                reviewer: userId,
                rationale,
              });
              toast.success("Action recorded");
              qc.invalidateQueries({ queryKey: ["compliance-results", runId] });
              qc.invalidateQueries({ queryKey: ["compliance-review-open"] });
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
          reviewStatus={r.review_status}
        />
      ))}
    </div>
  );
};

const outcomeColor = (o: string) => {
  switch (o) {
    case "pass": return "bg-green-500 text-white";
    case "fail": return "bg-destructive text-destructive-foreground";
    case "needs_evidence": return "bg-yellow-500 text-white";
    case "needs_review": return "bg-orange-500 text-white";
    case "not_applicable": return "bg-muted text-muted-foreground";
    case "error": return "bg-destructive text-destructive-foreground";
    default: return "bg-muted text-muted-foreground";
  }
};

export const ResultRow = ({
  rule_key,
  outcome,
  severity,
  summary,
  missing_inputs,
  missing_evidence,
  reviewStatus,
  onAction,
}: {
  rule_key: string;
  outcome: string;
  severity: string;
  summary: string;
  missing_inputs: string[];
  missing_evidence: string[];
  reviewStatus: string;
  onAction: (action: ReviewActionKind, rationale: string) => Promise<void>;
}) => {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<ReviewActionKind>("accept");
  const [rationale, setRationale] = useState("");

  const reviewable = ["fail", "needs_review", "needs_evidence"].includes(outcome) && reviewStatus === "open";

  return (
    <Card>
      <CardContent className="py-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium">{rule_key}</p>
          <p className="text-sm text-muted-foreground">{summary}</p>
          {missing_inputs.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">Missing inputs: {missing_inputs.join(", ")}</p>
          )}
          {missing_evidence.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">Missing evidence: {missing_evidence.join(", ")}</p>
          )}
          {reviewStatus !== "open" && <Badge className="mt-2" variant="outline">Review: {reviewStatus.replace(/_/g, " ")}</Badge>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge variant="outline">{severity}</Badge>
          <Badge className={outcomeColor(outcome)}>{outcome.replace(/_/g, " ")}</Badge>
          {reviewable && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">Review</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Review action</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Action</Label>
                    <Select value={action} onValueChange={(v) => setAction(v as ReviewActionKind)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="accept">Accept finding</SelectItem>
                        <SelectItem value="reject">Reject finding</SelectItem>
                        <SelectItem value="override">Override</SelectItem>
                        <SelectItem value="permitted_variation">Permitted variation</SelectItem>
                        <SelectItem value="assign_remediation">Assign remediation</SelectItem>
                        <SelectItem value="request_evidence">Request evidence</SelectItem>
                        <SelectItem value="close">Close</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Rationale</Label>
                    <Textarea value={rationale} onChange={(e) => setRationale(e.target.value)} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button
                    onClick={async () => {
                      if (!rationale.trim()) {
                        toast.error("Rationale is required");
                        return;
                      }
                      await onAction(action, rationale);
                      setOpen(false);
                      setRationale("");
                    }}
                  >
                    Record
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ComplianceCaseDetail;
