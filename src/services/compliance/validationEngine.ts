// Pure validation engine for the BS 5839-1 compliance validator.
// Evaluates structured, paraphrased rules against case inputs/evidence.
// Never references or reproduces copyrighted standard text.

export type RuleSeverity = "low" | "medium" | "high" | "critical";

export type RuleEvaluationType =
  | "required_field"
  | "required_evidence"
  | "enumerated"
  | "decision_table"
  | "calculation"
  | "cross_document"
  | "date_interval"
  | "manual_review";

export type Outcome =
  | "pass"
  | "fail"
  | "needs_evidence"
  | "needs_review"
  | "not_applicable"
  | "error";

export interface ApplicabilityCondition {
  field: string;
  operator:
    | "equals"
    | "not_equals"
    | "in"
    | "not_in"
    | "exists"
    | "not_exists"
    | "gte"
    | "lte";
  value?: unknown;
}

export interface Applicability {
  all?: ApplicabilityCondition[];
  any?: ApplicabilityCondition[];
}

export interface ValidationRule {
  id: string;
  rule_key: string;
  rule_version: number;
  short_title: string;
  obligation_summary: string;
  domain: string;
  stage: string;
  topic: string;
  evaluation_type: RuleEvaluationType;
  evaluation_logic: Record<string, unknown>;
  applicability: Applicability;
  inputs_required: string[];
  evidence_required: string[];
  manual_review_triggers: string[];
  severity: RuleSeverity;
  pass_message?: string | null;
  fail_message?: string | null;
}

export interface CaseEvidence {
  id: string;
  document_type: string;
}

export interface CaseContext {
  inputs: Record<string, unknown>;
  evidence: CaseEvidence[];
  // Optional flags useful for manual_review triggers ("variation_declared" etc.)
  flags?: Record<string, boolean>;
}

export interface ValidationResult {
  rule_id: string;
  rule_key_snapshot: string;
  rule_version_snapshot: number;
  outcome: Outcome;
  severity: RuleSeverity;
  confidence: number;
  evidence_used: string[];
  missing_inputs: string[];
  missing_evidence: string[];
  finding_summary: string;
  finding_detail: Record<string, unknown>;
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function getField(ctx: CaseContext, field: string): unknown {
  if (field in ctx.inputs) return ctx.inputs[field];
  if (ctx.flags && field in ctx.flags) return ctx.flags[field];
  return undefined;
}

function evalCondition(ctx: CaseContext, cond: ApplicabilityCondition): boolean {
  const v = getField(ctx, cond.field);
  switch (cond.operator) {
    case "equals":
      return v === cond.value;
    case "not_equals":
      return v !== cond.value;
    case "in":
      return Array.isArray(cond.value) && (cond.value as unknown[]).includes(v);
    case "not_in":
      return Array.isArray(cond.value) && !(cond.value as unknown[]).includes(v);
    case "exists":
      return v !== undefined && v !== null && v !== "";
    case "not_exists":
      return v === undefined || v === null || v === "";
    case "gte":
      return typeof v === "number" && typeof cond.value === "number" && v >= cond.value;
    case "lte":
      return typeof v === "number" && typeof cond.value === "number" && v <= cond.value;
    default:
      return false;
  }
}

export function isApplicable(rule: ValidationRule, ctx: CaseContext): boolean {
  const a = rule.applicability ?? {};
  const all = a.all ?? [];
  const any = a.any ?? [];
  if (all.length > 0 && !all.every((c) => evalCondition(ctx, c))) return false;
  if (any.length > 0 && !any.some((c) => evalCondition(ctx, c))) return false;
  return true;
}

function findMissingInputs(rule: ValidationRule, ctx: CaseContext): string[] {
  return (rule.inputs_required ?? []).filter((key) => {
    const v = ctx.inputs[key];
    return v === undefined || v === null || v === "";
  });
}

function findMissingEvidence(rule: ValidationRule, ctx: CaseContext): string[] {
  const evidenceTypes = new Set(ctx.evidence.map((e) => e.document_type));
  return (rule.evidence_required ?? []).filter((t) => !evidenceTypes.has(t));
}

function evidenceUsed(rule: ValidationRule, ctx: CaseContext): string[] {
  const required = new Set(rule.evidence_required ?? []);
  return ctx.evidence.filter((e) => required.has(e.document_type)).map((e) => e.id);
}

function manualReviewTriggered(rule: ValidationRule, ctx: CaseContext): string[] {
  return (rule.manual_review_triggers ?? []).filter((trigger) => {
    const v = getField(ctx, trigger);
    return v === true || v === "true";
  });
}

// ---------------------------------------------------------------------
// Core evaluation
// ---------------------------------------------------------------------

export function evaluateRule(rule: ValidationRule, ctx: CaseContext): ValidationResult {
  const base = {
    rule_id: rule.id,
    rule_key_snapshot: rule.rule_key,
    rule_version_snapshot: rule.rule_version,
    severity: rule.severity,
    confidence: 1,
    evidence_used: [] as string[],
    missing_inputs: [] as string[],
    missing_evidence: [] as string[],
    finding_detail: {} as Record<string, unknown>,
  };

  if (!isApplicable(rule, ctx)) {
    return {
      ...base,
      outcome: "not_applicable",
      finding_summary: "Rule does not apply to this case based on current scope.",
    };
  }

  const missingInputs = findMissingInputs(rule, ctx);
  const missingEvidence = findMissingEvidence(rule, ctx);
  const triggered = manualReviewTriggered(rule, ctx);

  // Manual review trumps everything if a declared trigger is set.
  if (triggered.length > 0 || rule.evaluation_type === "manual_review") {
    return {
      ...base,
      outcome: "needs_review",
      evidence_used: evidenceUsed(rule, ctx),
      missing_inputs: missingInputs,
      missing_evidence: missingEvidence,
      finding_summary:
        triggered.length > 0
          ? `Manual review required (${triggered.join(", ")}).`
          : rule.fail_message ?? "Competent-person review required.",
      finding_detail: { triggers: triggered },
    };
  }

  if (missingEvidence.length > 0) {
    return {
      ...base,
      outcome: "needs_evidence",
      missing_evidence: missingEvidence,
      missing_inputs: missingInputs,
      finding_summary:
        rule.fail_message ??
        `Missing evidence: ${missingEvidence.join(", ")}.`,
    };
  }

  if (missingInputs.length > 0) {
    return {
      ...base,
      outcome: "fail",
      missing_inputs: missingInputs,
      evidence_used: evidenceUsed(rule, ctx),
      finding_summary:
        rule.fail_message ??
        `Missing required inputs: ${missingInputs.join(", ")}.`,
    };
  }

  // Type-specific extra checks
  switch (rule.evaluation_type) {
    case "calculation": {
      const logic = rule.evaluation_logic as {
        field?: string;
        min?: number;
        max?: number;
        equals?: unknown;
      };
      if (logic.field) {
        const v = ctx.inputs[logic.field];
        if (typeof v === "number") {
          if (typeof logic.min === "number" && v < logic.min) {
            return {
              ...base,
              outcome: "fail",
              evidence_used: evidenceUsed(rule, ctx),
              finding_summary:
                rule.fail_message ?? `${logic.field}=${v} below minimum ${logic.min}.`,
            };
          }
          if (typeof logic.max === "number" && v > logic.max) {
            return {
              ...base,
              outcome: "fail",
              evidence_used: evidenceUsed(rule, ctx),
              finding_summary:
                rule.fail_message ?? `${logic.field}=${v} above maximum ${logic.max}.`,
            };
          }
        }
        if (logic.equals !== undefined && v !== logic.equals) {
          return {
            ...base,
            outcome: "fail",
            evidence_used: evidenceUsed(rule, ctx),
            finding_summary:
              rule.fail_message ?? `${logic.field} expected ${String(logic.equals)}, got ${String(v)}.`,
          };
        }
      }
      break;
    }
    case "required_field": {
      const logic = rule.evaluation_logic as {
        field?: string;
        equals?: unknown;
        min?: number;
        max?: number;
      };
      if (logic.field) {
        const v = ctx.inputs[logic.field];
        if (logic.equals !== undefined && v !== logic.equals) {
          return {
            ...base,
            outcome: "fail",
            evidence_used: evidenceUsed(rule, ctx),
            finding_summary:
              rule.fail_message ??
              `${logic.field} expected ${String(logic.equals)}, got ${String(v)}.`,
          };
        }
        if (typeof v === "number") {
          if (typeof logic.min === "number" && v < logic.min) {
            return {
              ...base,
              outcome: "fail",
              evidence_used: evidenceUsed(rule, ctx),
              finding_summary:
                rule.fail_message ?? `${logic.field}=${v} below minimum ${logic.min}.`,
            };
          }
          if (typeof logic.max === "number" && v > logic.max) {
            return {
              ...base,
              outcome: "fail",
              evidence_used: evidenceUsed(rule, ctx),
              finding_summary:
                rule.fail_message ?? `${logic.field}=${v} above maximum ${logic.max}.`,
            };
          }
        }
      }
      break;
    }
    case "enumerated": {
      const logic = rule.evaluation_logic as { field?: string; allowed?: unknown[] };
      if (logic.field && Array.isArray(logic.allowed)) {
        const v = ctx.inputs[logic.field];
        if (!logic.allowed.includes(v)) {
          return {
            ...base,
            outcome: "fail",
            evidence_used: evidenceUsed(rule, ctx),
            finding_summary:
              rule.fail_message ??
              `${logic.field}=${String(v)} not in allowed values.`,
          };
        }
      }
      break;
    }
    default:
      break;
  }

  return {
    ...base,
    outcome: "pass",
    evidence_used: evidenceUsed(rule, ctx),
    finding_summary: rule.pass_message ?? "Check passed.",
  };
}

export interface RunSummary {
  total: number;
  pass: number;
  fail: number;
  needs_evidence: number;
  needs_review: number;
  not_applicable: number;
  error: number;
}

export function runValidation(
  rules: ValidationRule[],
  ctx: CaseContext,
): { results: ValidationResult[]; summary: RunSummary } {
  const results = rules.map((r) => {
    try {
      return evaluateRule(r, ctx);
    } catch (e) {
      return {
        rule_id: r.id,
        rule_key_snapshot: r.rule_key,
        rule_version_snapshot: r.rule_version,
        outcome: "error" as Outcome,
        severity: r.severity,
        confidence: 0,
        evidence_used: [],
        missing_inputs: [],
        missing_evidence: [],
        finding_summary: `Rule evaluation error: ${(e as Error).message}`,
        finding_detail: {},
      };
    }
  });

  const summary: RunSummary = {
    total: results.length,
    pass: 0,
    fail: 0,
    needs_evidence: 0,
    needs_review: 0,
    not_applicable: 0,
    error: 0,
  };
  for (const r of results) summary[r.outcome] += 1;
  return { results, summary };
}
