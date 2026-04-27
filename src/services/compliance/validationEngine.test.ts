import { describe, it, expect } from "vitest";
import {
  evaluateRule,
  isApplicable,
  runValidation,
  ValidationRule,
  CaseContext,
} from "./validationEngine";

const baseRule = (overrides: Partial<ValidationRule> = {}): ValidationRule => ({
  id: "r1",
  rule_key: "rule.one",
  rule_version: 1,
  short_title: "Test rule",
  obligation_summary: "Internal paraphrase only.",
  domain: "fire_alarm",
  stage: "design",
  topic: "category",
  evaluation_type: "required_field",
  evaluation_logic: { field: "fire_alarm_category" },
  applicability: {
    all: [{ field: "system_domain", operator: "equals", value: "fire_alarm" }],
  },
  inputs_required: ["fire_alarm_category"],
  evidence_required: [],
  manual_review_triggers: [],
  severity: "high",
  pass_message: "ok",
  fail_message: "missing",
  ...overrides,
});

const ctx = (overrides: Partial<CaseContext> = {}): CaseContext => ({
  inputs: { system_domain: "fire_alarm" },
  evidence: [],
  flags: {},
  ...overrides,
});

describe("isApplicable", () => {
  it("matches when all conditions hold", () => {
    expect(isApplicable(baseRule(), ctx())).toBe(true);
  });

  it("rejects when any 'all' condition fails", () => {
    expect(isApplicable(baseRule(), ctx({ inputs: { system_domain: "intruder" } }))).toBe(false);
  });

  it("'in' operator matches list values", () => {
    const rule = baseRule({
      applicability: { all: [{ field: "job_type", operator: "in", value: ["commissioning", "handover"] }] },
    });
    expect(isApplicable(rule, ctx({ inputs: { job_type: "commissioning" } }))).toBe(true);
    expect(isApplicable(rule, ctx({ inputs: { job_type: "design" } }))).toBe(false);
  });
});

describe("evaluateRule", () => {
  it("returns not_applicable when applicability fails", () => {
    const r = baseRule();
    const result = evaluateRule(r, ctx({ inputs: { system_domain: "intruder" } }));
    expect(result.outcome).toBe("not_applicable");
  });

  it("returns fail when a required input is missing", () => {
    const r = baseRule();
    const result = evaluateRule(r, ctx());
    expect(result.outcome).toBe("fail");
    expect(result.missing_inputs).toContain("fire_alarm_category");
  });

  it("returns pass when all inputs are present", () => {
    const r = baseRule();
    const result = evaluateRule(r, ctx({ inputs: { system_domain: "fire_alarm", fire_alarm_category: "L1" } }));
    expect(result.outcome).toBe("pass");
  });

  it("returns needs_evidence when evidence is missing", () => {
    const r = baseRule({
      evaluation_type: "required_evidence",
      inputs_required: [],
      evidence_required: ["fire_risk_assessment"],
    });
    const result = evaluateRule(r, ctx({ inputs: { system_domain: "fire_alarm" }, evidence: [] }));
    expect(result.outcome).toBe("needs_evidence");
    expect(result.missing_evidence).toEqual(["fire_risk_assessment"]);
  });

  it("returns pass when required evidence is present", () => {
    const r = baseRule({
      evaluation_type: "required_evidence",
      inputs_required: [],
      evidence_required: ["fire_risk_assessment"],
    });
    const result = evaluateRule(
      r,
      ctx({
        inputs: { system_domain: "fire_alarm" },
        evidence: [{ id: "e1", document_type: "fire_risk_assessment" }],
      }),
    );
    expect(result.outcome).toBe("pass");
    expect(result.evidence_used).toContain("e1");
  });

  it("forces needs_review when a manual review trigger fires", () => {
    const r = baseRule({
      manual_review_triggers: ["variation_declared"],
    });
    const result = evaluateRule(
      r,
      ctx({
        inputs: { system_domain: "fire_alarm", fire_alarm_category: "L1", variation_declared: true },
        flags: { variation_declared: true },
      }),
    );
    expect(result.outcome).toBe("needs_review");
  });

  it("manual_review evaluation_type always needs review", () => {
    const r = baseRule({
      evaluation_type: "manual_review",
      inputs_required: [],
      evidence_required: [],
    });
    const result = evaluateRule(r, ctx({ inputs: { system_domain: "fire_alarm" } }));
    expect(result.outcome).toBe("needs_review");
  });

  it("calculation rule fails when value below min", () => {
    const r = baseRule({
      evaluation_type: "calculation",
      inputs_required: ["service_interval_months"],
      evaluation_logic: { field: "service_interval_months", min: 1, max: 12 },
    });
    const result = evaluateRule(
      r,
      ctx({ inputs: { system_domain: "fire_alarm", service_interval_months: 0 } }),
    );
    expect(result.outcome).toBe("fail");
  });

  it("calculation rule passes when in range", () => {
    const r = baseRule({
      evaluation_type: "calculation",
      inputs_required: ["service_interval_months"],
      evaluation_logic: { field: "service_interval_months", min: 1, max: 12 },
    });
    const result = evaluateRule(
      r,
      ctx({ inputs: { system_domain: "fire_alarm", service_interval_months: 6 } }),
    );
    expect(result.outcome).toBe("pass");
  });
});

describe("runValidation", () => {
  it("aggregates outcomes into a summary", () => {
    const rules: ValidationRule[] = [
      baseRule({ id: "r1", rule_key: "k1" }),
      baseRule({
        id: "r2",
        rule_key: "k2",
        evaluation_type: "required_evidence",
        inputs_required: [],
        evidence_required: ["fire_risk_assessment"],
      }),
      baseRule({
        id: "r3",
        rule_key: "k3",
        applicability: { all: [{ field: "system_domain", operator: "equals", value: "intruder" }] },
      }),
    ];
    const { summary, results } = runValidation(
      rules,
      ctx({
        inputs: { system_domain: "fire_alarm", fire_alarm_category: "L1" },
        evidence: [],
      }),
    );
    expect(results).toHaveLength(3);
    expect(summary.pass).toBe(1);
    expect(summary.needs_evidence).toBe(1);
    expect(summary.not_applicable).toBe(1);
    expect(summary.total).toBe(3);
  });
});
