import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  FileText,
  Users,
  GraduationCap,
  ClipboardCheck,
  BookOpen,
  Wrench,
  Scale,
  Building2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ChecklistItem {
  id: string;
  category: string;
  requirement: string;
  description: string;
  status: "pass" | "fail" | "warning" | "not_applicable";
  detail?: string;
  icon: React.ReactNode;
}

async function fetchAuditReadinessData() {
  // Fetch all required data in parallel
  const [
    { data: qmsDocs },
    { data: ncrs },
    { data: capas },
    { data: audits },
    { data: training },
    { data: bafeCerts },
    { data: riskAssessments },
    { data: companySettings },
    { data: serviceReports },
    { data: supplierEvals },
  ] = await Promise.all([
    supabase.from("qms_documents").select("id, title, status, next_review_date, document_type").order("created_at", { ascending: false }),
    supabase.from("qms_ncrs").select("id, status, ncr_number").order("created_at", { ascending: false }),
    supabase.from("qms_capas").select("id, status, due_date").order("created_at", { ascending: false }),
    supabase.from("qms_audits").select("id, status, audit_type, scheduled_date").order("scheduled_date", { ascending: false }),
    supabase.from("qms_training_records").select("id, status, expiry_date").order("created_at", { ascending: false }),
    supabase.from("site_bafe_certificates").select("id, certificate_type, status, expiry_date").order("created_at", { ascending: false }),
    supabase.from("qms_risks").select("id, status, risk_level").order("created_at", { ascending: false }),
    supabase.from("company_settings").select("company_name, registration_number, vat_number").limit(1).maybeSingle(),
    supabase.from("service_reports").select("id, status, report_number").eq("status", "completed").order("created_at", { ascending: false }).limit(1),
    supabase.from("qms_supplier_evaluations").select("id, rating").order("created_at", { ascending: false }),
  ]);

  return {
    qmsDocs: qmsDocs || [],
    ncrs: ncrs || [],
    capas: capas || [],
    audits: audits || [],
    training: training || [],
    bafeCerts: bafeCerts || [],
    riskAssessments: riskAssessments || [],
    companySettings,
    serviceReports: serviceReports || [],
    supplierEvals: supplierEvals || [],
  };
}

export function FIAAuditReadinessChecklist() {
  const { data, isLoading } = useQuery({
    queryKey: ["fia-audit-readiness"],
    queryFn: fetchAuditReadinessData,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-96 mt-1" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { qmsDocs, ncrs, capas, audits, training, bafeCerts, riskAssessments, companySettings, supplierEvals } = data;

  const now = new Date();

  // Build checklist items based on BAFE SP203-1 surveillance requirements
  const qualityManual = qmsDocs.filter((d: any) => d.document_type === "policy" || d.title?.toLowerCase().includes("quality manual"));
  const overdueDocReviews = qmsDocs.filter((d: any) => d.next_review_date && new Date(d.next_review_date) < now && !["archived", "obsolete"].includes(d.status));
  const openNCRs = ncrs.filter((n: any) => !["closed", "cancelled"].includes(n.status));
  const openCAPAs = capas.filter((c: any) => !["closed", "cancelled"].includes(c.status));
  const overdueCAPAs = capas.filter((c: any) => c.due_date && new Date(c.due_date) < now && !["closed", "cancelled"].includes(c.status));
  const completedAudits = audits.filter((a: any) => a.status === "completed");
  const expiredTraining = training.filter((t: any) => t.expiry_date && new Date(t.expiry_date) < now && t.status !== "expired");
  const validTraining = training.filter((t: any) => !t.expiry_date || new Date(t.expiry_date) >= now);

  const certTypes = new Set(bafeCerts.filter((c: any) => c.status === "valid").map((c: any) => c.certificate_type));
  const hasBafeDesign = certTypes.has("design");
  const hasBafeInstall = certTypes.has("installation");
  const hasBafeCommission = certTypes.has("commissioning");
  const hasBafeMaint = certTypes.has("maintenance");

  const highRisks = riskAssessments.filter((r: any) => r.risk_level === "high" || r.risk_level === "critical");

  const items: ChecklistItem[] = [
    // Section 1: Quality Management System
    {
      id: "quality-manual",
      category: "Quality Management",
      requirement: "Quality Manual / QMS Policy",
      description: "Documented quality management system with policy statement",
      status: qualityManual.length > 0 ? "pass" : "fail",
      detail: qualityManual.length > 0 ? `${qualityManual.length} document(s) found` : "No quality manual or policy found in QMS",
      icon: <BookOpen className="h-4 w-4" />,
    },
    {
      id: "doc-control",
      category: "Quality Management",
      requirement: "Document Control",
      description: "All QMS documents current and within review dates",
      status: overdueDocReviews.length === 0 ? "pass" : overdueDocReviews.length <= 2 ? "warning" : "fail",
      detail: overdueDocReviews.length === 0 ? "All documents up to date" : `${overdueDocReviews.length} document(s) overdue for review`,
      icon: <FileText className="h-4 w-4" />,
    },
    {
      id: "ncr-management",
      category: "Quality Management",
      requirement: "NCR Register & Corrective Actions",
      description: "Non-conformance reports tracked with corrective actions",
      status: ncrs.length > 0 ? (openNCRs.length > 10 ? "warning" : "pass") : "warning",
      detail: `${ncrs.length} total NCRs, ${openNCRs.length} open`,
      icon: <AlertTriangle className="h-4 w-4" />,
    },
    {
      id: "capa-management",
      category: "Quality Management",
      requirement: "CAPA Process",
      description: "Corrective and preventive actions managed and not overdue",
      status: overdueCAPAs.length === 0 ? "pass" : "fail",
      detail: overdueCAPAs.length === 0 ? `${openCAPAs.length} open CAPAs, none overdue` : `${overdueCAPAs.length} CAPA(s) overdue`,
      icon: <Wrench className="h-4 w-4" />,
    },

    // Section 2: Internal Audits
    {
      id: "internal-audits",
      category: "Audits & Reviews",
      requirement: "Internal Audit Programme",
      description: "Evidence of planned and completed internal audits",
      status: completedAudits.length > 0 ? "pass" : "fail",
      detail: completedAudits.length > 0 ? `${completedAudits.length} completed audit(s)` : "No completed audits found",
      icon: <ClipboardCheck className="h-4 w-4" />,
    },
    {
      id: "risk-assessments",
      category: "Audits & Reviews",
      requirement: "Risk Assessments",
      description: "Risk register maintained with mitigations for high risks",
      status: riskAssessments.length > 0 ? (highRisks.length > 0 ? "warning" : "pass") : "fail",
      detail: riskAssessments.length > 0 ? `${riskAssessments.length} risk(s), ${highRisks.length} high/critical` : "No risk assessments found",
      icon: <Scale className="h-4 w-4" />,
    },

    // Section 3: Competence & Training
    {
      id: "training-records",
      category: "Competence",
      requirement: "Staff Training & Competence Records",
      description: "All engineers have valid training records and qualifications",
      status: training.length > 0 ? (expiredTraining.length === 0 ? "pass" : "warning") : "fail",
      detail: training.length > 0 ? `${validTraining.length} valid, ${expiredTraining.length} expired` : "No training records found",
      icon: <GraduationCap className="h-4 w-4" />,
    },

    // Section 4: BAFE Certificates
    {
      id: "bafe-design",
      category: "BAFE Certificates",
      requirement: "Design Certificates (BS 5839-1 Annex H)",
      description: "Valid design certificates issued for applicable sites",
      status: hasBafeDesign ? "pass" : "warning",
      detail: hasBafeDesign ? "Design certificates on file" : "No design certificates recorded",
      icon: <ShieldCheck className="h-4 w-4" />,
    },
    {
      id: "bafe-installation",
      category: "BAFE Certificates",
      requirement: "Installation Certificates",
      description: "Installation certificates for completed installations",
      status: hasBafeInstall ? "pass" : "warning",
      detail: hasBafeInstall ? "Installation certificates on file" : "No installation certificates recorded",
      icon: <ShieldCheck className="h-4 w-4" />,
    },
    {
      id: "bafe-commissioning",
      category: "BAFE Certificates",
      requirement: "Commissioning Certificates",
      description: "Commissioning certificates with test results",
      status: hasBafeCommission ? "pass" : "warning",
      detail: hasBafeCommission ? "Commissioning certificates on file" : "No commissioning certificates recorded",
      icon: <ShieldCheck className="h-4 w-4" />,
    },
    {
      id: "bafe-maintenance",
      category: "BAFE Certificates",
      requirement: "Maintenance Certificates (BS 5839-1 Section 5)",
      description: "Maintenance certificates issued after service visits",
      status: hasBafeMaint ? "pass" : "fail",
      detail: hasBafeMaint ? "Maintenance certificates on file" : "No maintenance certificates recorded",
      icon: <ShieldCheck className="h-4 w-4" />,
    },

    // Section 5: Supplier & Subcontractor Management
    {
      id: "supplier-evaluation",
      category: "Supply Chain",
      requirement: "Supplier / Subcontractor Evaluations",
      description: "Approved supplier list with periodic evaluations",
      status: supplierEvals.length > 0 ? "pass" : "warning",
      detail: supplierEvals.length > 0 ? `${supplierEvals.length} evaluation(s) on record` : "No supplier evaluations found",
      icon: <Users className="h-4 w-4" />,
    },

    // Section 6: Company Details
    {
      id: "company-registration",
      category: "Company Information",
      requirement: "Company Registration & Insurance",
      description: "Company registration number and insurance details on file",
      status: companySettings?.registration_number ? "pass" : "warning",
      detail: companySettings?.registration_number ? "Registration number on file" : "Company registration number not set in settings",
      icon: <Building2 className="h-4 w-4" />,
    },
  ];

  const passCount = items.filter((i) => i.status === "pass").length;
  const failCount = items.filter((i) => i.status === "fail").length;
  const warnCount = items.filter((i) => i.status === "warning").length;
  const scorePercent = Math.round((passCount / items.length) * 100);

  const categories = [...new Set(items.map((i) => i.category))];

  const statusIcon = (status: ChecklistItem["status"]) => {
    switch (status) {
      case "pass": return <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />;
      case "fail": return <XCircle className="h-5 w-5 text-destructive flex-shrink-0" />;
      case "warning": return <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0" />;
      default: return <div className="h-5 w-5 rounded-full bg-muted flex-shrink-0" />;
    }
  };

  const statusBadge = (status: ChecklistItem["status"]) => {
    switch (status) {
      case "pass": return <Badge className="bg-success/10 text-success border-success/20" variant="outline">Ready</Badge>;
      case "fail": return <Badge className="bg-destructive/10 text-destructive border-destructive/20" variant="outline">Action Required</Badge>;
      case "warning": return <Badge className="bg-warning/10 text-warning border-warning/20" variant="outline">Review</Badge>;
      default: return <Badge variant="secondary">N/A</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">FIA & ISO 9001:2015 Audit Readiness</CardTitle>
              <CardDescription>FIA membership and ISO 9001 evidence checklist</CardDescription>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-foreground">{scorePercent}%</p>
            <p className="text-xs text-muted-foreground">
              {passCount} pass · {warnCount} review · {failCount} fail
            </p>
          </div>
        </div>
        <Progress value={scorePercent} className="mt-3 h-2" />
      </CardHeader>

      <CardContent className="space-y-6">
        {categories.map((category) => (
          <div key={category}>
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{category}</h4>
            <div className="space-y-2">
              {items
                .filter((i) => i.category === category)
                .map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
                  >
                    {statusIcon(item.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{item.requirement}</span>
                        {statusBadge(item.status)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                      {item.detail && (
                        <p className="text-xs mt-1 font-medium text-muted-foreground">{item.detail}</p>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-muted-foreground">
                      {item.icon}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
