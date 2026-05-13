import { useEffect, useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, FileSignature, Plus, ClipboardCheck, Eye, Pencil, Trash2, FileDown, Mail, Wind, Zap, Droplets } from "lucide-react";
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
import ASDCommissioningForm from "@/components/smart-forms/ASDCommissioningForm";
import EmergencyLightingForm from "@/components/smart-forms/EmergencyLightingForm";
import DryRiserForm from "@/components/smart-forms/DryRiserForm";
import { generateBS5839CertificatePDF } from "@/lib/smartFormCertificatePdfGenerator";
import { generateInstallationCertificatePDF } from "@/lib/installationCertificatePdfGenerator";
import { generateCommissioningCertificatePDF } from "@/lib/commissioningCertificatePdfGenerator";
import { generateModificationCertificatePDF } from "@/lib/modificationCertificatePdfGenerator";

type ActiveForm = "bs5839_inspection_servicing" | "bs5839_installation" | "bs5839_commissioning" | "bs5839_modification" | null;

const ALL_FORMS = [
  {
    key: "bs5839_inspection_servicing" as ActiveForm,
    name: "Inspection & Servicing Certificate",
    code: "IS / Annex G.6",
    bafe: null,
    description: "Routine inspection and servicing certificate for periodic maintenance visits. Multi-step, BS 5839-1:2025 compliant, with full BS checklist, defect register, and device testing record.",
    standard: "BS 5839-1:2025",
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950/20 border-blue-200",
  },
  {
    key: "bs5839_installation" as ActiveForm,
    name: "Installation Certificate",
    code: "FD/02 / Annex E",
    bafe: "FD/02",
    description: "Prescribed certificate issued by the installing organisation upon completion of a new installation, extension, replacement, or takeover. Records system specification, variations, outstanding works, and installer declaration.",
    standard: "BS 5839-1:2025",
    color: "text-green-700",
    bg: "bg-green-50 dark:bg-green-950/20 border-green-200",
  },
  {
    key: "bs5839_commissioning" as ActiveForm,
    name: "Commissioning Certificate",
    code: "FD/03 / Annex C",
    bafe: "FD/03",
    description: "Issued upon successful commissioning of a new system. Records all BS 5839-1 Cl. 45 commissioning tests, device testing percentage, system operational status, and responsible person acknowledgement.",
    standard: "BS 5839-1:2025",
    color: "text-purple-700",
    bg: "bg-purple-50 dark:bg-purple-950/20 border-purple-200",
  },
  {
    key: "bs5839_modification" as ActiveForm,
    name: "Modification Certificate",
    code: "FD/05 / Annex F",
    bafe: "FD/05",
    description: "Issued whenever alterations are made to an existing certified system (BS 5839-1 Cl. 46). Records the modification scope, references to original certificates, post-modification commissioning tests, and system status.",
    standard: "BS 5839-1:2025",
    color: "text-amber-700",
    bg: "bg-amber-50 dark:bg-amber-950/20 border-amber-200",
  },
];

function statusBadge(status: string) {
  if (status === "completed" || status === "signed")
    return <Badge className="bg-green-600/15 text-green-700 border-green-600/30 text-[10px]">Completed</Badge>;
  return <Badge variant="outline" className="text-[10px]">Draft</Badge>;
}

function formTypeLabel(type: string) {
  const f = ALL_FORMS.find((x) => x.key === type);
  return f ? f.name : type;
}

export default function SmartForms() {
  const [submissions, setSubmissions] = useState<SmartFormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeForm, setActiveForm] = useState<ActiveForm>(null);
  const [editing, setEditing] = useState<SmartFormSubmission | null>(null);
  const [asdFormOpen, setAsdFormOpen] = useState(false);
  const [elFormOpen, setElFormOpen] = useState(false);
  const [drFormOpen, setDrFormOpen] = useState(false);

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
      } else {
        await generateBS5839CertificatePDF(p, { autoSign: true });
      }
    } catch (err) { toast.error("Failed to generate PDF"); }
  };

  const buildMailto = (sub: SmartFormSubmission) => {
    const p = (sub.payload || {}) as any;
    const to = p.responsible_person_email || "";
    const premises = p.premises_name || "";
    const ref = sub.certificate_reference || "";
    const certType = formTypeLabel(sub.form_type);
    const dateStr = sub.completed_at ? format(new Date(sub.completed_at), "dd MMMM yyyy") : "";
    const subject = `Fire Detection & Alarm System Certificate – ${premises} – ${ref}`;
    const body = `Please find attached your ${certType} certificate for ${premises}, reference ${ref}, dated ${dateStr}. This certificate has been issued in accordance with BS 5839-1:2025. Please retain this document for your records. If you have any questions please do not hesitate to contact us.`;
    return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const closeForm = () => { setActiveForm(null); setEditing(null); };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileSignature className="w-6 h-6 text-primary" />
              Smart Forms
              <Badge variant="secondary" className="ml-1">BS 5839-1:2025</Badge>
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Official BAFE-prescribed certificates — Installation (FD/02), Commissioning (FD/03), Modification (FD/05), and Inspection &amp; Servicing.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setAsdFormOpen(true)} className="gap-1.5">
              <Wind className="w-4 h-4" />ASD Commissioning
            </Button>
            <Button variant="outline" onClick={() => setElFormOpen(true)} className="gap-1.5">
              <Zap className="w-4 h-4 text-yellow-500" />Emergency Lighting
            </Button>
            <Button variant="outline" onClick={() => setDrFormOpen(true)} className="gap-1.5">
              <Droplets className="w-4 h-4 text-blue-500" />Dry Riser
            </Button>
          </div>
        </div>

        <Tabs defaultValue="forms">
          <TabsList>
            <TabsTrigger value="forms"><Sparkles className="h-4 w-4 mr-1" />Available Certificates</TabsTrigger>
            <TabsTrigger value="submissions"><ClipboardCheck className="h-4 w-4 mr-1" />My Submissions ({submissions.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="forms" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ALL_FORMS.map((f) => (
                <Card key={f.key} className={`border transition-shadow hover:shadow-md ${f.bg}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className={`text-base leading-snug flex items-start gap-2 ${f.color}`}>
                        <FileSignature className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>{f.name}</span>
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{f.code}</Badge>
                      {f.bafe && <Badge variant="outline" className="text-[10px] border-orange-400/50 text-orange-700 dark:text-orange-400">BAFE {f.bafe}</Badge>}
                      <Badge variant="outline" className="text-[10px]">{f.standard}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">{f.description}</p>
                    <Button size="sm" onClick={() => handleNew(f.key)} className="w-full">
                      <Plus className="h-3.5 w-3.5 mr-1" /> Start New
                    </Button>
                  </CardContent>
                </Card>
              ))}
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
                  const premisesName = p.premises_name || (p as BS5839Payload).premises_name || "";
                  return (
                    <Card key={sub.id} className="hover:shadow-sm transition-shadow">
                      <CardContent className="py-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <FileSignature className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">
                              {sub.certificate_reference}
                              {premisesName ? ` · ${premisesName}` : ""}
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
                              <Button variant="ghost" size="icon" title="Email to responsible person" asChild>
                                <a href={buildMailto(sub)}>
                                  <Mail className="h-4 w-4" />
                                </a>
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

      {/* Form dialogs — only one open at a time */}
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
      <ASDCommissioningForm
        open={asdFormOpen}
        onOpenChange={setAsdFormOpen}
        onSaved={load}
      />
      <EmergencyLightingForm
        open={elFormOpen}
        onOpenChange={setElFormOpen}
        onSaved={load}
      />
      <DryRiserForm
        open={drFormOpen}
        onOpenChange={setDrFormOpen}
        onSaved={load}
      />
    </DashboardLayout>
  );
}
