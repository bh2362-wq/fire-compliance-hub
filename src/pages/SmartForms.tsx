import { useEffect, useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sparkles,
  FileSignature,
  Plus,
  ClipboardCheck,
  Eye,
  Pencil,
  Trash2,
  FileDown,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  listSmartFormSubmissions,
  deleteSmartFormSubmission,
  SmartFormSubmission,
  BS5839Payload,
} from "@/services/smartFormService";
import BS5839CertificateForm from "@/components/smart-forms/BS5839CertificateForm";
import { generateBS5839CertificatePDF } from "@/lib/smartFormCertificatePdfGenerator";

const BETA_FORMS = [
  {
    key: "bs5839_inspection_servicing" as const,
    name: "BS 5839-1:2025 Inspection & Servicing Certificate",
    code: "BS5839-IS",
    description:
      "Annex G.6 model certificate for fire detection & alarm system inspection and servicing. Multi-step, mobile-optimised, audit-ready.",
    standard: "BS 5839-1:2025",
  },
];

export default function SmartForms() {
  const [submissions, setSubmissions] = useState<SmartFormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SmartFormSubmission | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const subs = await listSmartFormSubmissions();
      setSubmissions(subs);
    } catch (err) {
      console.error("Failed to load smart forms:", err);
      toast.error("Failed to load smart form submissions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const handleEdit = (sub: SmartFormSubmission) => {
    setEditing(sub);
    setFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this smart form submission?")) return;
    try {
      await deleteSmartFormSubmission(id);
      toast.success("Submission deleted");
      load();
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete");
    }
  };

  const handleDownload = async (sub: SmartFormSubmission) => {
    try {
      await generateBS5839CertificatePDF(sub.payload as BS5839Payload, {
        certificateReference: sub.certificate_reference,
      });
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate PDF");
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "completed":
      case "signed":
        return (
          <Badge className="bg-primary/10 text-primary border-primary/20">
            {status === "signed" ? "Signed" : "Completed"}
          </Badge>
        );
      case "draft":
        return <Badge variant="secondary">Draft</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">Smart Forms</h1>
              <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30">
                BETA
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">
              Next-generation compliance forms — multi-step, mobile-first, and audit-ready.
            </p>
          </div>
        </div>

        <Tabs defaultValue="forms">
          <TabsList>
            <TabsTrigger value="forms">
              <Sparkles className="h-4 w-4 mr-1" />
              Available Forms
            </TabsTrigger>
            <TabsTrigger value="submissions">
              <ClipboardCheck className="h-4 w-4 mr-1" />
              My Submissions ({submissions.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="forms" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {BETA_FORMS.map((f) => (
                <Card
                  key={f.key}
                  className="hover:shadow-md transition-shadow border-primary/20"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-snug flex items-start gap-2">
                        <FileSignature className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                        <span>{f.name}</span>
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[10px]">
                        {f.code}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {f.standard}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">{f.description}</p>
                    <Button size="sm" onClick={handleNew} className="w-full">
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Start New
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
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <ClipboardCheck className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No smart form submissions yet. Start a new form above.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {submissions.map((sub) => {
                  const p = (sub.payload || {}) as BS5839Payload;
                  return (
                    <Card key={sub.id} className="hover:shadow-sm transition-shadow">
                      <CardContent className="py-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <FileSignature className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">
                              {sub.certificate_reference}
                              {p.premises_name ? ` · ${p.premises_name}` : ""}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {format(new Date(sub.created_at), "dd MMM yyyy HH:mm")}
                              {p.date_of_service ? ` · Service: ${p.date_of_service}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {statusBadge(sub.status)}
                          {(sub.status === "completed" || sub.status === "signed") && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Download PDF"
                              onClick={() => handleDownload(sub)}
                            >
                              <FileDown className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            title={sub.status === "draft" ? "Edit" : "View"}
                            onClick={() => handleEdit(sub)}
                          >
                            {sub.status === "draft" ? (
                              <Pencil className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => handleDelete(sub.id)}
                          >
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

      <BS5839CertificateForm
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditing(null);
        }}
        existing={editing}
        onSaved={load}
      />
    </DashboardLayout>
  );
}
