import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileDown, FileText, Sparkles, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { recommendReport, ReportKind } from "@/lib/visitReportRouting";
import { buildCalloutReportInput } from "@/services/calloutReportService";
import { generateCalloutReportPDF } from "@/lib/calloutReportPdfGenerator";
import ModificationCertificateForm from "@/components/smart-forms/ModificationCertificateForm";

interface Props {
  visitId: string;
  visitType: string | null;
  siteId: string;
  customerId: string | null;
}

const ICONS: Record<ReportKind, typeof FileText> = {
  service_report: FileText,
  callout_report: FileDown,
  modification_cert: Sparkles,
};

const PRIMARY_LABELS: Record<ReportKind, string> = {
  service_report: "Open Service Report capture",
  callout_report: "Generate Callout Report PDF",
  modification_cert: "Open Modification Certificate",
};

export function RecommendedReportCard({
  visitId,
  visitType,
  siteId,
  customerId,
}: Props) {
  const rec = recommendReport(visitType);
  const navigate = useNavigate();
  const [generating, setGenerating] = useState(false);
  const [modCertOpen, setModCertOpen] = useState(false);

  const Icon = rec.kind ? ICONS[rec.kind] : FileText;

  const handlePrimary = async () => {
    if (!rec.kind) return;
    if (rec.kind === "service_report") {
      navigate(`/dashboard/visits/${visitId}/service-report/capture`);
      return;
    }
    if (rec.kind === "modification_cert") {
      setModCertOpen(true);
      return;
    }
    // callout_report — one-click PDF generation
    setGenerating(true);
    try {
      const input = await buildCalloutReportInput(visitId);
      await generateCalloutReportPDF(input);
      toast.success("Callout Report downloaded");
    } catch (e) {
      toast.error((e as Error).message || "Could not generate PDF");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3 flex items-start gap-3">
      <div className="rounded-md bg-primary/10 p-2 mt-0.5">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            Recommended report
          </p>
          {visitType && (
            <Badge variant="outline" className="text-[10px]">
              {visitType.replace(/_/g, " ")}
            </Badge>
          )}
        </div>
        <p className="text-sm font-medium text-foreground mt-0.5">{rec.label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{rec.reason}</p>
      </div>
      {rec.kind ? (
        <Button
          size="sm"
          onClick={handlePrimary}
          disabled={generating}
          className="flex-shrink-0"
        >
          {generating ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
              {PRIMARY_LABELS[rec.kind]}
            </>
          )}
        </Button>
      ) : null}

      {rec.kind === "modification_cert" && (
        <ModificationCertificateForm
          open={modCertOpen}
          onOpenChange={setModCertOpen}
          visitId={visitId}
          siteId={siteId}
          customerId={customerId}
          prefill={null}
          onSaved={() => setModCertOpen(false)}
        />
      )}
    </div>
  );
}
