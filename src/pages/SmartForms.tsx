import { useEffect, useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, FileSignature, Plus, ClipboardCheck, Eye, Pencil, Trash2, FileDown, Mail, Zap, Wind, Droplets, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  getSmartFormSubmissions, deleteSmartFormSubmission,
  SmartFormSubmission, BS5839Payload,
} from "@/services/smartFormService";
import BS5839CertificateForm from "@/components/smart-forms/BS5839CertificateForm";
import InstallationCertificateForm from "@/components/smart-forms/InstallationCertificateForm";
import CommissioningCertificateForm from "@/components/smart-forms/CommissioningCertificateForm";
import ModificationCertificateForm from "@/components/smart-forms/ModificationCertificateForm";
import EmergencyLightingForm from "@/components/smart-forms/EmergencyLightingForm";
import ASDServiceForm from "@/components/smart-forms/ASDServiceForm";
import ASDCommissioningForm from "@/components/smart-forms/ASDCommissioningForm";
import DryRiserForm from "@/components/smart-forms/DryRiserForm";
import DeclinationForm from "@/components/smart-forms/DeclinationForm";
import { generateServiceReport as generateBS5839CertificatePDF } from "@/lib/serviceReportGenerator";
import { generateInstallationCertificatePDF } from "@/lib/installationCertificatePdfGenerator";
import { generateCommissioningCertificatePDF } from "@/lib/commissioningCertificatePdfGenerator";
import { generateModificationCertificatePDF } from "@/lib/modificationCertificatePdfGenerator";
import { EmailReportDialog } from "@/components/reports/EmailReportDialog";

// Smart-form PDF dispatcher — picks the right generator per form_type so
// the shared EmailReportDialog can stay PDF-agnostic. Moved out of the
// retired EmailSmartFormDialog.
async function buildSmartFormPdfBase64(sub: SmartFormSubmission): Promise<string> {
  const p = (sub.payload || {}) as any;
  const ft = sub.form_type as string;
  if (ft === "bs5839_installation") {
    const { base64 } = await generateInstallationCertificatePDF(p, { autoSign: true });
    return base64;
  }
  if (ft === "bs5839_commissioning") {
    const { base64 } = await generateCommissioningCertificatePDF(p, { autoSign: true });
    return base64;
  }
  if (ft === "bs5839_modification") {
    const { base64 } = await generateModificationCertificatePDF(p, { autoSign: true });
    return base64;
  }
  if (ft.startsWith("el_")) {
    const { generateELCertificatePDF } = await import("@/lib/emergencyLightingPdfGenerator");
    const r = await generateELCertificatePDF(p);
    return r.base64;
  }
  if (ft.startsWith("asd_")) {
    const { generateASDCommissioningPDF } = await import("@/lib/asdCommissioningPdfGenerator");
    const r = await generateASDCommissioningPDF(p);
    return r.base64;
  }
  if (ft.startsWith("dr_")) {
    const { generateDryRiserPDF } = await import("@/lib/dryRiserPdfGenerator");
    const r = await generateDryRiserPDF(p);
    return r.base64;
  }
  if (ft === "declination_of_works") {
    const { generateDeclinationPDF } = await import("@/lib/declinationPdfGenerator");
    const r = await generateDeclinationPDF(p);
    return r.base64;
  }
  const { base64 } = await generateBS5839CertificatePDF(p, { autoSign: true });
  return base64;
}

type BS5839Form = "bs5839_inspection_servicing" | "bs5839_installation" | "bs5839_commissioning" | "bs5839_modification";
type ActiveForm = BS5839Form | "el" | "asd" | "asd_comm" | "dr" | "declination" | null;

// ── Cert catalogue ────────────────────────────────────────────────────────────
// The BS 5839 Inspection & Servicing Certificate has been retired from this
// page — the canonical capture surface is now the wizard at
// /dashboard/visits/:id/service-report/capture (writes to service_reports,
// not smart_form_submissions). BS5839CertificateForm.tsx still exists for
// historical submissions but isn't listed here. See PR #N for the
// consolidation plan.
const FIRE_ALARM_FORMS = [
  {
    key: "bs5839_installation" as ActiveForm,
    name: "Installation Certificate",
    code: "FD/02 / Annex E",
    bafe: "FD/02",
    description: "Issued upon completion of new installation, extension, replacement or takeover. Records system spec, variations, outstanding works, and installer declaration.",
    standard: "BS 5839-1:2025",
    color: "text-green-700",
    bg: "bg-green-50 dark:bg-green-950/20 border-green-200",
    icon: FileSignature,
  },
  {
    key: "bs5839_commissioning" as ActiveForm,
    name: "Commissioning Certificate",
    code: "FD/03 / Annex C",
    bafe: "FD/03",
    description: "Issued upon successful commissioning. Records all BS 5839-1 Cl. 45 commissioning tests, device testing, system operational status, and RP acknowledgement.",
    standard: "BS 5839-1:2025",
    color: "text-purple-700",
    bg: "bg-purple-50 dark:bg-purple-950/20 border-purple-200",
    icon: FileSignature,
  },
  {
    key: "bs5839_modification" as ActiveForm,
    name: "Modification Certificate",
    code: "FD/05 / Annex F",
    bafe: "FD/05",
    description: "Issued when alterations are made to a certified system (BS 5839-1 Cl. 46). Records modification scope, original cert refs, post-mod commissioning tests.",
    standard: "BS 5839-1:2025",
    color: "text-amber-700",
    bg: "bg-amber-50 dark:bg-amber-950/20 border-amber-200",
    icon: FileSignature,
  },
];

const OTHER_FORMS = [
  {
    key: "el" as ActiveForm,
    name: "Emergency Lighting Certificate",
    code: "EPM6C",
    bafe: null,
    description: "Commissioning, periodic inspection (EPM6C Annex M), monthly test log, and annual full discharge test. Covers BS 5266-1, BS EN 50172 and BS EN 1838.",
    standard: "BS 5266-1:2016",
    color: "text-yellow-700",
    bg: "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200",
    icon: Zap,
  },
  {
    key: "asd" as ActiveForm,
    name: "ASD Service Certificate",
    code: "BS EN 54-20",
    bafe: null,
    description: "Annual service with airflow baseline verification (±20% FIA CoP §8.3). Covers pre-service checks, pipe flow readings, cleaning, system checks and fault recording.",
    standard: "BS EN 54-20:2006+A1:2012",
    color: "text-sky-700",
    bg: "bg-sky-50 dark:bg-sky-950/20 border-sky-200",
    icon: Wind,
  },
  {
    key: "asd_comm" as ActiveForm,
    name: "ASD Commissioning Certificate",
    code: "BS EN 54-20",
    bafe: null,
    description: "Full commissioning certificate for new ASD installations or modifications. Records EN 54-20 class, pipe design vs measured flow, transport time tests, and panel signal verification.",
    standard: "BS EN 54-20:2006+A1:2012",
    color: "text-cyan-700",
    bg: "bg-cyan-50 dark:bg-cyan-950/20 border-cyan-200",
    icon: Wind,
  },
  {
    key: "dr" as ActiveForm,
    name: "Dry Riser Certificate",
    code: "BS 9990",
    bafe: null,
    description: "6-monthly visual inspection and annual hydraulic pressure test at 12 bar for 15 minutes per BS 9990:2015. Includes full landing valve floor record.",
    standard: "BS 9990:2015",
    color: "text-blue-700",
    bg: "bg-blue-50 dark:bg-blue-950/20 border-blue-200",
    icon: Droplets,
  },
  {
    key: "declination" as ActiveForm,
    name: "Declination of Recommended Works",
    code: "Legal",
    bafe: null,
    description: "Legal document recording that the responsible person has been advised of fire safety works, understands the risk, and has declined. Protects BHO Fire's liability.",
    standard: "RR(FS)O 2005",
    color: "text-red-700",
    bg: "bg-red-50 dark:bg-red-950/20 border-red-200",
    icon: ShieldAlert,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function statusBadge(status: string) {
  if (status === "completed" || status === "signed")
    return <Badge className="bg-green-600/15 text-green-700 border-green-600/30 text-[10px]">Completed</Badge>;
  return <Badge variant="outline" className="text-[10px]">Draft</Badge>;
}

function formTypeLabel(type: string) {
  const all = [...FIRE_ALARM_FORMS, ...OTHER_FORMS];
  const f = all.find((x) => x.key === type);
  if (f) return f.name;
  if (type.startsWith("el_")) {
    const labels: Record<string, string> = {
      commissioning: "EL Commissioning", periodic: "EL Periodic (EPM6C)",
      monthly_log: "EL Monthly Log",     annual_discharge: "EL Annual Discharge",
    };
    return labels[type.replace("el_", "")] ?? type;
  }
  if (type.startsWith("asd_")) return type === "asd_annual_service" ? "ASD Annual Service" : "ASD Commissioning";
  if (type.startsWith("dr_"))  return type.includes("visual") ? "Dry Riser Visual Inspection" : "Dry Riser Pressure Test";
  if (type === "declination_of_works") return "Declination of Recommended Works";
  return type;
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SmartForms() {
  const [submissions, setSubmissions] = useState<SmartFormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeForm, setActiveForm] = useState<ActiveForm>(null);
  const [editing, setEditing] = useState<SmartFormSubmission | null>(null);
  const [emailingSub, setEmailingSub] = useState<SmartFormSubmission | null>(null);

  const load = async () => {
    setLoading(true);
    try { setSubmissions(await getSmartFormSubmissions()); }
    catch (err) { console.error(err); toast.error("Failed to load submissions"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleNew = (key: ActiveForm) => { setEditing(null); setActiveForm(key); };

  const handleEdit = (sub: SmartFormSubmission) => {
    setEditing(sub);
    const ft = sub.form_type as string;
    if (ft.startsWith("el_"))             { setActiveForm("el");          return; }
    if (ft === "asd_commissioning")        { setActiveForm("asd_comm");    return; }
    if (ft.startsWith("asd_"))             { setActiveForm("asd");         return; }
    if (ft.startsWith("dr_"))              { setActiveForm("dr");          return; }
    if (ft === "declination_of_works")     { setActiveForm("declination"); return; }
    setActiveForm(sub.form_type as ActiveForm);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this submission?")) return;
    try { await deleteSmartFormSubmission(id); toast.success("Deleted"); load(); }
    catch { toast.error("Failed to delete"); }
  };

  const handleDownload = async (sub: SmartFormSubmission) => {
    try {
      const p = sub.payload as any;
      const ft = sub.form_type as string;
      if (ft === "bs5839_installation") {
        await generateInstallationCertificatePDF(p, { autoSign: true });
      } else if (ft === "bs5839_commissioning") {
        await generateCommissioningCertificatePDF(p, { autoSign: true });
      } else if (ft === "bs5839_modification") {
        await generateModificationCertificatePDF(p, { autoSign: true });
      } else if (ft.startsWith("el_")) {
        const { generateELCertificatePDF } = await import("@/lib/emergencyLightingPdfGenerator");
        await generateELCertificatePDF(p);
      } else if (ft.startsWith("asd_")) {
        const { generateASDCommissioningPDF } = await import("@/lib/asdCommissioningPdfGenerator");
        await generateASDCommissioningPDF(p);
      } else if (ft.startsWith("dr_")) {
        const { generateDryRiserPDF } = await import("@/lib/dryRiserPdfGenerator");
        await generateDryRiserPDF(p);
      } else if (ft === "declination_of_works") {
        const { generateDeclinationPDF } = await import("@/lib/declinationPdfGenerator");
        await generateDeclinationPDF(p);
      } else {
        await generateBS5839CertificatePDF(p, { autoSign: true });
      }
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      toast.error("Failed to generate PDF", { description: message });
    }
  };

  const buildMailto = (sub: SmartFormSubmission) => {
    const p = (sub.payload || {}) as any;
    const to = p.responsible_person_email || p.responsible_email || "";
    const premises = p.premises_name || "";
    const ref = sub.certificate_reference || "";
    const subject = `Fire Safety Certificate – ${premises} – ${ref}`;
    const body = `Please find attached your ${formTypeLabel(sub.form_type)} for ${premises}, reference ${ref}. Please retain this document for your fire safety records.`;
    return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const closeForm = () => { setActiveForm(null); setEditing(null); };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileSignature className="w-6 h-6 text-primary" /> Smart Forms
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              BAFE-prescribed certificates and compliance documents — BS 5839-1:2025 · BS 5266-1:2016 · BS EN 54-20 · BS 9990:2015
            </p>
          </div>
        </div>

        <Tabs defaultValue="forms">
          <TabsList>
            <TabsTrigger value="forms"><Sparkles className="h-4 w-4 mr-1" />Available ({FIRE_ALARM_FORMS.length + OTHER_FORMS.length})</TabsTrigger>
            <TabsTrigger value="submissions"><ClipboardCheck className="h-4 w-4 mr-1" />My Submissions ({submissions.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="forms" className="mt-4 space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                <Badge variant="outline">BS 5839-1:2025</Badge> Fire Alarm Certificates
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {FIRE_ALARM_FORMS.map((f) => (
                  <FormCard key={String(f.key)} form={f} onNew={() => handleNew(f.key)} />
                ))}
              </div>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                <Badge variant="outline">Other Disciplines</Badge>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {OTHER_FORMS.map((f) => (
                  <FormCard key={String(f.key)} form={f} onNew={() => handleNew(f.key)} />
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="submissions" className="mt-4">
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">Loading...</div>
            ) : submissions.length === 0 ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">
                <ClipboardCheck className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No submissions yet. Start a new certificate above.</p>
              </CardContent></Card>
            ) : (
              <div className="space-y-2">
                {submissions.map((sub) => {
                  const p = (sub.payload || {}) as any;
                  const premisesName = p.premises_name || "";
                  return (
                    <Card key={sub.id} className="hover:shadow-sm transition-shadow">
                      <CardContent className="py-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <FileSignature className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">
                              {sub.certificate_reference}{premisesName ? ` · ${premisesName}` : ""}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {formTypeLabel(sub.form_type)} · {format(new Date(sub.created_at), "dd MMM yyyy HH:mm")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {statusBadge(sub.status)}
                          {(sub.status === "completed" || sub.status === "signed") && (
                            <>
                              <Button variant="ghost" size="icon" title="Download PDF" onClick={() => handleDownload(sub)}>
                                <FileDown className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" title="Email to client" onClick={() => setEmailingSub(sub)}>
                                <Mail className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(sub)}>
                            {sub.status === "draft" ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(sub.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Dialogs ──────────────────────────────────────────────────────────── */}
      {/* BS5839CertificateForm is retained for editing historical
          smart_form_submissions only — the catalogue card was removed so
          new ones aren't created here. Rendered when an old submission is
          opened from the catalogue list. */}
      <BS5839CertificateForm
        open={activeForm === "bs5839_inspection_servicing"}
        onOpenChange={(o) => { if (!o) closeForm(); }}
        existing={editing?.form_type === "bs5839_inspection_servicing" ? editing : null}
        onSaved={load}
      />
      <InstallationCertificateForm
        open={activeForm === "bs5839_installation"}
        onOpenChange={(o) => { if (!o) closeForm(); }}
        onSaved={load}
      />
      <CommissioningCertificateForm
        open={activeForm === "bs5839_commissioning"}
        onOpenChange={(o) => { if (!o) closeForm(); }}
        onSaved={load}
      />
      <ModificationCertificateForm
        open={activeForm === "bs5839_modification"}
        onOpenChange={(o) => { if (!o) closeForm(); }}
        onSaved={load}
      />
      <EmergencyLightingForm
        open={activeForm === "el"}
        onOpenChange={(o) => { if (!o) closeForm(); }}
        onSaved={load}
      />
      <ASDServiceForm
        open={activeForm === "asd"}
        onOpenChange={(o) => { if (!o) closeForm(); }}
        onSaved={load}
      />
      <ASDCommissioningForm
        open={activeForm === "asd_comm"}
        onOpenChange={(o) => { if (!o) closeForm(); }}
        onSaved={load}
      />
      <DryRiserForm
        open={activeForm === "dr"}
        onOpenChange={(o) => { if (!o) closeForm(); }}
        onSaved={load}
      />
      <DeclinationForm
        open={activeForm === "declination"}
        onOpenChange={(o) => { if (!o) closeForm(); }}
        onSaved={load}
      />
      <EmailReportDialog
        open={!!emailingSub}
        onOpenChange={(o) => { if (!o) setEmailingSub(null); }}
        defaultEmail={
          (emailingSub?.payload as any)?.responsible_person_email ||
          (emailingSub?.payload as any)?.responsible_email ||
          (emailingSub?.payload as any)?.client_email ||
          ""
        }
        customerName={
          (emailingSub?.payload as any)?.responsible_person_name ||
          (emailingSub?.payload as any)?.responsible_name ||
          ""
        }
        siteName={(emailingSub?.payload as any)?.premises_name || ""}
        reportNumber={emailingSub?.certificate_reference || ""}
        reportDate={format(new Date(), "dd/MM/yyyy")}
        documentType={emailingSub ? formTypeLabel(emailingSub.form_type) : "Certificate"}
        generatePdfBase64={() =>
          emailingSub
            ? buildSmartFormPdfBase64(emailingSub)
            : Promise.reject(new Error("No submission"))
        }
      />
    </DashboardLayout>
  );
}

// ── Shared card ───────────────────────────────────────────────────────────────
function FormCard({ form, onNew }: { form: typeof FIRE_ALARM_FORMS[0]; onNew: () => void }) {
  const Icon = form.icon;
  return (
    <Card className={`border transition-shadow hover:shadow-md ${form.bg}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className={`text-base leading-snug flex items-start gap-2 ${form.color}`}>
            <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{form.name}</span>
          </CardTitle>
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <Badge variant="outline" className="text-[10px]">{form.code}</Badge>
          {form.bafe && (
            <Badge variant="outline" className="text-[10px] border-orange-400/50 text-orange-700 dark:text-orange-400">
              BAFE {form.bafe}
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px]">{form.standard}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">{form.description}</p>
        <Button size="sm" onClick={onNew} className="w-full">
          <Plus className="h-3.5 w-3.5 mr-1" /> Start New
        </Button>
      </CardContent>
    </Card>
  );
}
