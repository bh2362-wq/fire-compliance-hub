import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getCompanySettings } from "@/services/companySettingsService";
import { format } from "date-fns";
import { SmartFormSubmission } from "@/services/smartFormService";
import { generateServiceReport as generateBS5839CertificatePDF } from "@/lib/serviceReportGenerator";
import { generateInstallationCertificatePDF } from "@/lib/installationCertificatePdfGenerator";
import { generateCommissioningCertificatePDF } from "@/lib/commissioningCertificatePdfGenerator";
import { generateModificationCertificatePDF } from "@/lib/modificationCertificatePdfGenerator";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  submission: SmartFormSubmission | null;
  formTypeLabel: (t: string) => string;
}

async function buildPdfBase64(sub: SmartFormSubmission): Promise<{ base64: string; fileName: string }> {
  const p = (sub.payload || {}) as any;
  const ft = sub.form_type;
  if (ft === "bs5839_installation") return generateInstallationCertificatePDF(p, { autoSign: true });
  if (ft === "bs5839_commissioning") return generateCommissioningCertificatePDF(p, { autoSign: true });
  if (ft === "bs5839_modification") return generateModificationCertificatePDF(p, { autoSign: true });
  if (ft.startsWith("el_")) {
    const { generateELCertificatePDF } = await import("@/lib/emergencyLightingPdfGenerator");
    return generateELCertificatePDF(p) as any;
  }
  if (ft.startsWith("asd_")) {
    const { generateASDCommissioningPDF } = await import("@/lib/asdCommissioningPdfGenerator");
    return generateASDCommissioningPDF(p) as any;
  }
  if (ft.startsWith("dr_")) {
    const { generateDryRiserPDF } = await import("@/lib/dryRiserPdfGenerator");
    return generateDryRiserPDF(p) as any;
  }
  if (ft === "declination_of_works") {
    const { generateDeclinationPDF } = await import("@/lib/declinationPdfGenerator");
    return generateDeclinationPDF(p) as any;
  }
  return generateBS5839CertificatePDF(p, { autoSign: true });
}

export default function EmailSmartFormDialog({ open, onOpenChange, submission, formTypeLabel }: Props) {
  const [recipients, setRecipients] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || !submission) return;
    const p = (submission.payload || {}) as any;
    const to = p.responsible_person_email || p.responsible_email || p.client_email || "";
    const premises = p.premises_name || "";
    const ref = submission.certificate_reference || "";
    const label = formTypeLabel(submission.form_type);
    setRecipients(to);
    setSubject(`${label} – ${premises} – ${ref}`);
    setMessage(
      `Please find attached your ${label}${premises ? ` for ${premises}` : ""}${ref ? `, reference ${ref}` : ""}.\n\nPlease retain this document for your fire safety records.\n\nIf you have any questions, please get in touch.`
    );
  }, [open, submission, formTypeLabel]);

  const handleSend = async () => {
    if (!submission) return;
    const emails = recipients.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean);
    if (!emails.length) { toast.error("Please enter at least one recipient email"); return; }

    setSending(true);
    try {
      const [{ base64 }, company] = await Promise.all([
        buildPdfBase64(submission),
        getCompanySettings(),
      ]);
      const p = (submission.payload || {}) as any;

      const { error } = await supabase.functions.invoke("send-report-email", {
        body: {
          to: emails,
          subject,
          siteName: p.premises_name || "",
          reportNumber: submission.certificate_reference || "",
          reportDate: format(new Date(), "dd/MM/yyyy"),
          pdfBase64: base64,
          customerName: p.responsible_person_name || p.responsible_name || "",
          companyName: company?.company_name,
          logoUrl: company?.report_logo_url || company?.company_logo_url,
          emailBody: message,
          documentType: formTypeLabel(submission.form_type),
        },
      });
      if (error) throw error;

      toast.success(`Certificate emailed to ${emails.length} recipient(s)`);
      onOpenChange(false);
    } catch (err) {
      console.error("Email send error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" /> Email Certificate
          </DialogTitle>
          <DialogDescription>
            {submission ? `Send "${submission.certificate_reference}" as a branded PDF attachment.` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label htmlFor="sf-email-to">Recipients</Label>
            <Input id="sf-email-to" placeholder="name@example.com, another@example.com"
              value={recipients} onChange={(e) => setRecipients(e.target.value)} autoFocus />
            <p className="text-xs text-muted-foreground">Separate multiple addresses with commas.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sf-email-subject">Subject</Label>
            <Input id="sf-email-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sf-email-message">Message</Label>
            <Textarea id="sf-email-message" rows={6} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</>) : (<><Mail className="h-4 w-4 mr-2" />Send Email</>)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
