import { useQuery } from "@tanstack/react-query";
import { format, parseISO, isValid } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileSignature, CheckCircle2, Lock, ExternalLink } from "lucide-react";
import { getSiteCerts } from "@/services/newCertificateService";
import { cn } from "@/lib/utils";
import { generateInstallationCertificatePDF } from "@/lib/installationCertificatePdfGenerator";
import { generateCommissioningCertificatePDF } from "@/lib/commissioningCertificatePdfGenerator";
import { generateModificationCertificatePDF } from "@/lib/modificationCertificatePdfGenerator";
import { generateBS5839CertificatePDF } from "@/lib/smartFormCertificatePdfGenerator";
import { toast } from "sonner";

// ── Full CERT_META — all disciplines ──────────────────────────────────────────
const CERT_META: Record<string, { label: string; code: string; color: string }> = {
  // Fire Alarm — BS 5839-1
  bs5839_inspection_servicing: { label: "Inspection & Servicing",  code: "IS",    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  bs5839_installation:         { label: "Installation Certificate", code: "FD/02", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  bs5839_commissioning:        { label: "Commissioning Certificate",code: "FD/03", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400" },
  bs5839_modification:         { label: "Modification Certificate", code: "FD/05", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },

  // Emergency Lighting — BS 5266-1
  el_commissioning:    { label: "EL Commissioning Certificate",       code: "EPM6C",    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  el_periodic:         { label: "EL Periodic Inspection (EPM6C)",     code: "EPM6C",    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  el_monthly_log:      { label: "EL Monthly Test Log",                code: "BS 5266",  color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  el_annual_discharge: { label: "EL Annual Discharge Test",           code: "BS 5266",  color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },

  // ASD — BS EN 54-20
  asd_annual_service:  { label: "ASD Annual Service Certificate",     code: "EN 54-20", color: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400" },
  asd_commissioning:   { label: "ASD Commissioning Certificate",      code: "EN 54-20", color: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400" },

  // Dry Riser — BS 9990
  dr_visual:           { label: "Dry Riser Visual Inspection",        code: "BS 9990",  color: "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300" },
  dr_pressure_test:    { label: "Dry Riser Pressure Test",            code: "BS 9990",  color: "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300" },
  dr_visual_inspection:{ label: "Dry Riser Visual Inspection",        code: "BS 9990",  color: "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300" },
};

interface Props { siteId: string; }

export function SiteSmartCerts({ siteId }: Props) {
  const { data: certs = [], isLoading } = useQuery({
    queryKey: ["site-smart-certs", siteId],
    queryFn: () => getSiteCerts(siteId),
  });

  const isLocked = certs.length > 0;

  async function handleDownload(cert: { form_type: string; payload: Record<string, unknown> }) {
    try {
      const p = cert.payload as any;
      const ft = cert.form_type;
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
      } else {
        await generateBS5839CertificatePDF(p, { autoSign: true });
      }
    } catch {
      toast.error("Failed to generate PDF");
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {isLocked && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-green-500/30 bg-green-50 dark:bg-green-950/20">
          <Lock className="w-4 h-4 text-green-600 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-green-700 dark:text-green-400">
              Site has certified documentation
            </p>
            <p className="text-[11px] text-muted-foreground">
              {certs.length} certificate{certs.length !== 1 ? "s" : ""} issued for this site.
              Any changes to site details should be recorded via a new certificate.
            </p>
          </div>
        </div>
      )}

      {certs.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground text-sm border rounded-lg bg-muted/20">
          <FileSignature className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>No smart form certificates issued for this site yet.</p>
          <p className="text-xs mt-1 text-muted-foreground">Issue certificates from Smart Forms or the Visits page.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {certs.map((cert) => {
            const meta = CERT_META[cert.form_type] ?? {
              label: cert.form_type.replace(/_/g, " "),
              code: "—",
              color: "bg-muted text-muted-foreground",
            };
            const dateStr = cert.completed_at && isValid(parseISO(cert.completed_at))
              ? format(parseISO(cert.completed_at), "dd MMM yyyy") : "—";
            const p = cert.payload as Record<string, string | undefined>;
            const engineerName = p.engineer_name || "";

            return (
              <Card key={cert.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn("p-1.5 rounded-md flex-shrink-0",
                      meta.color.split(" ").filter(c => c.startsWith("bg")).join(" "))}>
                      <FileSignature className={cn("w-4 h-4",
                        meta.color.split(" ").filter(c => !c.startsWith("bg")).join(" "))} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-sm">{meta.label}</span>
                        <Badge variant="outline" className="text-[9px] px-1.5">{meta.code}</Badge>
                        <Badge className={cn("text-[9px] px-1.5 border-0", meta.color)}>
                          <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                          Completed
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
                        <span className="font-mono">{cert.certificate_reference}</span>
                        <span>{dateStr}</span>
                        {cert.job_number && <span>Job: {cert.job_number}</span>}
                        {engineerName && <span>Eng: {engineerName}</span>}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownload(cert)}
                    title="Download PDF"
                    className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
