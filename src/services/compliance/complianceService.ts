import { supabase } from "@/integrations/supabase/client";
import {
  CaseContext,
  ValidationRule,
  RuleSeverity,
  RuleEvaluationType,
  Applicability,
  Outcome,
  runValidation,
} from "./validationEngine";

// The generated supabase types do not yet include the compliance_* tables
// (they're added by this PR's migration and Lovable regenerates types from the
// hosted DB). Use a typed alias rather than untyped `any` everywhere.
type AnyRecord = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export interface ComplianceStandard {
  id: string;
  code: string;
  title: string;
  version: string;
  domain: string;
  publisher: string;
  status: string;
  source_url: string | null;
  notes: string | null;
}

export type ComplianceCaseStatus =
  | "draft"
  | "ready_to_validate"
  | "in_validation"
  | "needs_evidence"
  | "needs_review"
  | "remediation_required"
  | "ready_for_signoff"
  | "signed_off"
  | "archived";

export type ComplianceJobType =
  | "design"
  | "installation"
  | "commissioning"
  | "maintenance"
  | "takeover"
  | "remedial";

export interface ComplianceCase {
  id: string;
  case_number: string;
  site_id: string | null;
  customer_id: string | null;
  job_reference: string | null;
  premises_name: string | null;
  premises_address: string | null;
  domain: string;
  job_type: ComplianceJobType;
  case_status: ComplianceCaseStatus;
  scope: AnyRecord;
  applicable_standards: string[];
  created_by: string;
  assigned_reviewer: string | null;
  signed_off_by: string | null;
  signed_off_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComplianceCaseInput {
  id: string;
  case_id: string;
  input_key: string;
  input_value: unknown;
  source: string;
}

export interface ComplianceEvidenceDocument {
  id: string;
  case_id: string;
  document_type: string;
  file_name: string;
  storage_path: string | null;
  external_url: string | null;
  metadata: AnyRecord;
  created_at: string;
}

export interface ComplianceValidationResult {
  id: string;
  run_id: string;
  case_id: string;
  rule_id: string;
  rule_key_snapshot: string;
  rule_version_snapshot: number;
  outcome: Outcome;
  severity: RuleSeverity;
  confidence: number | null;
  evidence_used: string[];
  missing_inputs: string[];
  missing_evidence: string[];
  finding_summary: string;
  finding_detail: AnyRecord;
  review_status: string;
  created_at: string;
  rule?: { rule_key: string; short_title: string; clause_id: string | null };
}

export interface ComplianceValidationRun {
  id: string;
  case_id: string;
  run_status: string;
  rule_pack: string[];
  run_summary: AnyRecord;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------
// Standards / Rules
// ---------------------------------------------------------------------

export const fetchStandards = async (): Promise<ComplianceStandard[]> => {
  const { data, error } = await sb
    .from("compliance_standards")
    .select("*")
    .order("code");
  if (error) throw error;
  return (data as ComplianceStandard[]) ?? [];
};

export const fetchRulesForStandard = async (
  standardId: string,
  status: "active" | "draft" | "all" = "active",
): Promise<ValidationRule[]> => {
  let query = sb
    .from("compliance_validation_rules")
    .select("*")
    .eq("standard_id", standardId);
  if (status !== "all") query = query.eq("status", status);
  const { data, error } = await query.order("rule_key");
  if (error) throw error;
  return ((data as AnyRecord[]) ?? []).map(toRule);
};

function toRule(row: AnyRecord): ValidationRule {
  return {
    id: row.id as string,
    rule_key: row.rule_key as string,
    rule_version: (row.rule_version as number) ?? 1,
    short_title: row.short_title as string,
    obligation_summary: row.obligation_summary as string,
    domain: row.domain as string,
    stage: row.stage as string,
    topic: row.topic as string,
    evaluation_type: row.evaluation_type as RuleEvaluationType,
    evaluation_logic: (row.evaluation_logic as Record<string, unknown>) ?? {},
    applicability: (row.applicability as Applicability) ?? {},
    inputs_required: (row.inputs_required as string[]) ?? [],
    evidence_required: (row.evidence_required as string[]) ?? [],
    manual_review_triggers: (row.manual_review_triggers as string[]) ?? [],
    severity: (row.severity as RuleSeverity) ?? "medium",
    pass_message: (row.pass_message as string) ?? null,
    fail_message: (row.fail_message as string) ?? null,
  };
}

// ---------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------

export const fetchCases = async (): Promise<ComplianceCase[]> => {
  const { data, error } = await sb
    .from("compliance_cases")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as ComplianceCase[]) ?? [];
};

export const fetchCase = async (id: string): Promise<ComplianceCase | null> => {
  const { data, error } = await sb
    .from("compliance_cases")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as ComplianceCase) ?? null;
};

export interface NewCaseInput {
  case_number?: string;
  site_id?: string | null;
  customer_id?: string | null;
  job_reference?: string | null;
  premises_name?: string | null;
  premises_address?: string | null;
  job_type: ComplianceJobType;
  scope?: AnyRecord;
  applicable_standards?: string[];
  created_by: string;
}

export const createCase = async (input: NewCaseInput): Promise<ComplianceCase> => {
  const case_number =
    input.case_number ??
    `BS5839-1-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(
      Math.random() * 9000 + 1000,
    )}`;

  const { data, error } = await sb
    .from("compliance_cases")
    .insert({
      case_number,
      site_id: input.site_id ?? null,
      customer_id: input.customer_id ?? null,
      job_reference: input.job_reference ?? null,
      premises_name: input.premises_name ?? null,
      premises_address: input.premises_address ?? null,
      domain: "fire_alarm",
      job_type: input.job_type,
      scope: input.scope ?? {},
      applicable_standards: input.applicable_standards ?? ["BS 5839-1:2025"],
      created_by: input.created_by,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ComplianceCase;
};

export const updateCaseStatus = async (
  id: string,
  case_status: ComplianceCaseStatus,
): Promise<void> => {
  const { error } = await sb
    .from("compliance_cases")
    .update({ case_status })
    .eq("id", id);
  if (error) throw error;
};

// ---------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------

export const fetchCaseInputs = async (caseId: string): Promise<ComplianceCaseInput[]> => {
  const { data, error } = await sb
    .from("compliance_case_inputs")
    .select("*")
    .eq("case_id", caseId);
  if (error) throw error;
  return (data as ComplianceCaseInput[]) ?? [];
};

export const upsertCaseInput = async (
  caseId: string,
  key: string,
  value: unknown,
  createdBy?: string,
): Promise<void> => {
  const { error } = await sb.from("compliance_case_inputs").upsert(
    {
      case_id: caseId,
      input_key: key,
      input_value: value,
      created_by: createdBy ?? null,
      source: "manual",
    },
    { onConflict: "case_id,input_key" },
  );
  if (error) throw error;
};

// ---------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------

export const fetchEvidence = async (
  caseId: string,
): Promise<ComplianceEvidenceDocument[]> => {
  const { data, error } = await sb
    .from("compliance_evidence_documents")
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as ComplianceEvidenceDocument[]) ?? [];
};

export interface NewEvidenceInput {
  case_id: string;
  document_type: string;
  file_name: string;
  storage_path?: string | null;
  external_url?: string | null;
  metadata?: AnyRecord;
  uploaded_by?: string;
}

export const addEvidence = async (
  input: NewEvidenceInput,
): Promise<ComplianceEvidenceDocument> => {
  const { data, error } = await sb
    .from("compliance_evidence_documents")
    .insert({
      case_id: input.case_id,
      document_type: input.document_type,
      file_name: input.file_name,
      storage_path: input.storage_path ?? null,
      external_url: input.external_url ?? null,
      metadata: input.metadata ?? {},
      uploaded_by: input.uploaded_by ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ComplianceEvidenceDocument;
};

// ---------------------------------------------------------------------
// Validation runs
// ---------------------------------------------------------------------

export const fetchLatestRun = async (
  caseId: string,
): Promise<ComplianceValidationRun | null> => {
  const { data, error } = await sb
    .from("compliance_validation_runs")
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const rows = (data as ComplianceValidationRun[]) ?? [];
  return rows[0] ?? null;
};

export const fetchResultsForRun = async (
  runId: string,
): Promise<ComplianceValidationResult[]> => {
  const { data, error } = await sb
    .from("compliance_validation_results")
    .select(
      "*, rule:compliance_validation_rules(rule_key,short_title,clause_id)",
    )
    .eq("run_id", runId)
    .order("created_at");
  if (error) throw error;
  return (data as ComplianceValidationResult[]) ?? [];
};

export const fetchOpenReviewResults = async (): Promise<
  ComplianceValidationResult[]
> => {
  const { data, error } = await sb
    .from("compliance_validation_results")
    .select(
      "*, rule:compliance_validation_rules(rule_key,short_title,clause_id)",
    )
    .in("outcome", ["fail", "needs_review", "needs_evidence"])
    .eq("review_status", "open")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as ComplianceValidationResult[]) ?? [];
};

// ---------------------------------------------------------------------
// Run a validation – this does the work in-process (Edge Function would
// be a future enhancement; the engine itself is identical).
// ---------------------------------------------------------------------

export interface RunValidationParams {
  caseId: string;
  triggeredBy?: string;
}

export const runValidationForCase = async ({
  caseId,
  triggeredBy,
}: RunValidationParams): Promise<{
  run: ComplianceValidationRun;
  results: ComplianceValidationResult[];
}> => {
  const c = await fetchCase(caseId);
  if (!c) throw new Error("Case not found");

  // Build context
  const inputs = await fetchCaseInputs(caseId);
  const evidence = await fetchEvidence(caseId);
  const inputMap: Record<string, unknown> = {
    job_type: c.job_type,
    system_domain: c.domain,
    ...((c.scope as Record<string, unknown>) ?? {}),
  };
  for (const i of inputs) inputMap[i.input_key] = i.input_value;
  const ctx: CaseContext = {
    inputs: inputMap,
    evidence: evidence.map((e) => ({ id: e.id, document_type: e.document_type })),
    flags: extractFlags(inputMap),
  };

  // Load active rules for the first applicable standard
  const standards = await fetchStandards();
  const standard = standards.find((s) => s.code === "BS 5839-1") ?? standards[0];
  if (!standard) throw new Error("No compliance standards seeded");
  // For internal MVP: include draft rules so the seeded pack is exercised.
  const activeRules = await fetchRulesForStandard(standard.id, "all");

  const { results, summary } = runValidation(activeRules, ctx);

  // Persist run
  const startedAt = new Date().toISOString();
  const { data: runData, error: runErr } = await sb
    .from("compliance_validation_runs")
    .insert({
      case_id: caseId,
      run_status: "completed",
      triggered_by: triggeredBy ?? null,
      rule_pack: [`${standard.code}:${standard.version}`],
      run_summary: summary,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (runErr) throw runErr;
  const run = runData as ComplianceValidationRun;

  // Persist results
  if (results.length > 0) {
    const rows = results.map((r) => ({
      run_id: run.id,
      case_id: caseId,
      rule_id: r.rule_id,
      rule_key_snapshot: r.rule_key_snapshot,
      rule_version_snapshot: r.rule_version_snapshot,
      outcome: r.outcome,
      severity: r.severity,
      confidence: r.confidence,
      evidence_used: r.evidence_used,
      missing_inputs: r.missing_inputs,
      missing_evidence: r.missing_evidence,
      finding_summary: r.finding_summary,
      finding_detail: r.finding_detail,
    }));
    const { error: resErr } = await sb
      .from("compliance_validation_results")
      .insert(rows);
    if (resErr) throw resErr;
  }

  // Derive case status
  const nextStatus = deriveCaseStatus(summary);
  await updateCaseStatus(caseId, nextStatus);

  const persisted = await fetchResultsForRun(run.id);
  return { run, results: persisted };
};

function extractFlags(inputs: Record<string, unknown>): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(inputs)) {
    if (typeof v === "boolean") flags[k] = v;
  }
  return flags;
}

export function deriveCaseStatus(summary: {
  fail: number;
  needs_evidence: number;
  needs_review: number;
}): ComplianceCaseStatus {
  if (summary.fail > 0) return "remediation_required";
  if (summary.needs_evidence > 0) return "needs_evidence";
  if (summary.needs_review > 0) return "needs_review";
  return "ready_for_signoff";
}

// ---------------------------------------------------------------------
// Review actions
// ---------------------------------------------------------------------

export type ReviewActionKind =
  | "accept"
  | "reject"
  | "override"
  | "permitted_variation"
  | "assign_remediation"
  | "request_evidence"
  | "reopen"
  | "close";

export const recordReviewAction = async (params: {
  resultId: string;
  action: ReviewActionKind;
  reviewer: string;
  rationale: string;
  evidenceRefs?: string[];
}): Promise<void> => {
  const { error } = await sb.from("compliance_review_actions").insert({
    result_id: params.resultId,
    action: params.action,
    reviewer: params.reviewer,
    rationale: params.rationale,
    evidence_refs: params.evidenceRefs ?? [],
  });
  if (error) throw error;

  const newStatus = mapActionToReviewStatus(params.action);
  if (newStatus) {
    const { error: updErr } = await sb
      .from("compliance_validation_results")
      .update({ review_status: newStatus })
      .eq("id", params.resultId);
    if (updErr) throw updErr;
  }
};

function mapActionToReviewStatus(a: ReviewActionKind): string | null {
  switch (a) {
    case "accept":
      return "accepted";
    case "reject":
      return "rejected";
    case "override":
      return "overridden";
    case "permitted_variation":
      return "permitted_variation";
    case "assign_remediation":
      return "remediation_assigned";
    case "request_evidence":
      return "evidence_requested";
    case "reopen":
      return "open";
    case "close":
      return "closed";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------
// Disclaimer (single source of truth used in UI + reports)
// ---------------------------------------------------------------------

export const COMPLIANCE_DISCLAIMER = `This tool supports compliance checking by applying structured, internally
paraphrased rules derived from licensed standards, competent-person inputs, and project evidence. It is not a
replacement for the relevant British Standards, statutory duties, risk assessment, professional judgement,
certification-body requirements, or competent-person review. Users must hold appropriate rights to access the
standards used in their organisation. Rule pack is DRAFT/EXAMPLE only until reviewed and activated by a
competent person.`;
