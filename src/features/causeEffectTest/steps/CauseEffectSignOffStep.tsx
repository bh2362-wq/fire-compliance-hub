import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SignaturePad } from "@/components/ui/signature-pad";
import { CheckCircle2, XCircle, Loader2, FileDown } from "lucide-react";
import { useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { AIRewriteButton } from "@/components/reports/AIRewriteButton";
import type { CauseEffectTestReport } from "../useCauseEffectTestDraft";
import { loadCauseEffectReportBundle } from "@/services/causeEffectTestService";
import { generateCauseEffectReportPDF } from "@/lib/causeEffectReportPdfGenerator";

interface Props {
  report: CauseEffectTestReport;
  onPatch: (updates: Partial<CauseEffectTestReport>) => void;
  onComplete: () => Promise<void> | void;
  completing: boolean;
}

function isDataUrlSig(value: string | null): boolean {
  return typeof value === "string" && value.startsWith("data:image");
}

export function CauseEffectSignOffStep({ report, onPatch, onComplete, completing }: Props) {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const engineerSigOk = isDataUrlSig(report.engineer_signature);
  const clientSigOk = isDataUrlSig(report.client_signature);
  const complianceSet = report.bs5839_compliant !== null && report.bs5839_compliant !== undefined;
  const canComplete = engineerSigOk && clientSigOk && complianceSet;

  // Structured context for the AI rewriter so the polished summary
  // actually references the facts of this test (compliance state,
  // remedial timeframe, next service date, sound-meter info) rather
  // than producing a generic paragraph.
  const aiContext = useMemo(() => {
    const lines: string[] = [
      "Report type: BS 5839-1:2017 Cause & Effect + Audibility Test.",
    ];
    if (report.bs5839_compliant === true) lines.push("Compliance outcome: COMPLIES.");
    else if (report.bs5839_compliant === false) lines.push("Compliance outcome: DOES NOT COMPLY.");
    if (report.remedial_timeframe) lines.push(`Remedial works timeframe: ${report.remedial_timeframe}.`);
    if (report.next_service_due) lines.push(`Next routine test due: ${report.next_service_due}.`);
    if (report.sound_meter_make_model) lines.push(`Sound meter used: ${report.sound_meter_make_model}.`);
    if (report.general_observations) lines.push(`General observations: ${report.general_observations}`);
    return lines.join("\n");
  }, [
    report.bs5839_compliant,
    report.remedial_timeframe,
    report.next_service_due,
    report.sound_meter_make_model,
    report.general_observations,
  ]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const bundle = await loadCauseEffectReportBundle(report.id);
      await generateCauseEffectReportPDF(bundle);
    } catch (e) {
      toast({
        title: "Couldn't generate PDF",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold">Compliance &amp; sign-off</h3>
        <p className="text-xs text-muted-foreground">
          Confirm compliance with BS 5839-1:2017, capture recommendations, both
          signatures, then complete the report.
        </p>
      </div>

      {/* Compliance statement (§7) */}
      <section className="space-y-2 rounded-lg border bg-card p-3">
        <Label className="text-sm font-medium">Compliance statement</Label>
        <p className="text-xs text-muted-foreground">
          Following completion of tests, the fire alarm system:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={() => onPatch({ bs5839_compliant: true })}
            className={`rounded-lg border p-3 text-left transition-colors ${
              report.bs5839_compliant === true
                ? "bg-emerald-600 text-white border-emerald-700"
                : "bg-background hover:bg-accent"
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <p className="text-sm font-semibold">COMPLIES</p>
            </div>
            <p className={`text-xs mt-1 ${report.bs5839_compliant === true ? "opacity-90" : "text-muted-foreground"}`}>
              With BS 5839-1:2017 for cause &amp; effect and audibility.
            </p>
          </button>
          <button
            type="button"
            onClick={() => onPatch({ bs5839_compliant: false })}
            className={`rounded-lg border p-3 text-left transition-colors ${
              report.bs5839_compliant === false
                ? "bg-destructive text-white border-destructive"
                : "bg-background hover:bg-accent"
            }`}
          >
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              <p className="text-sm font-semibold">DOES NOT COMPLY</p>
            </div>
            <p className={`text-xs mt-1 ${report.bs5839_compliant === false ? "opacity-90" : "text-muted-foreground"}`}>
              Remedial work needed (see previous step).
            </p>
          </button>
        </div>
      </section>

      {/* Recommendations (§8) */}
      <section className="space-y-2 rounded-lg border bg-card p-3">
        <Label className="text-sm font-medium">Recommendations</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Remedial works timeframe
            </Label>
            <Input
              value={report.remedial_timeframe ?? ""}
              onChange={(e) => onPatch({ remedial_timeframe: e.target.value || null })}
              placeholder="e.g. within 28 days"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Next routine test due
            </Label>
            <Input
              type="date"
              value={report.next_service_due ?? ""}
              onChange={(e) => onPatch({ next_service_due: e.target.value || null })}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Summary for the client
            </Label>
            <AIRewriteButton
              text={report.notes ?? ""}
              type="recommendations"
              onRewrite={(v) => onPatch({ notes: v || null })}
              context={aiContext}
            />
          </div>
          <Textarea
            rows={4}
            value={report.notes ?? ""}
            onChange={(e) => onPatch({ notes: e.target.value || null })}
            placeholder="2–4 sentences summarising findings, referencing BS 5839-1:2017 clauses where relevant. Type a rough draft then tap Improve with AI."
          />
        </div>
      </section>

      {/* Engineer signature */}
      <section className="space-y-2 rounded-lg border bg-card p-3">
        <Label className="text-sm font-medium">Engineer signature</Label>
        <Input
          value={report.engineer_name ?? ""}
          onChange={(e) => onPatch({ engineer_name: e.target.value || null })}
          placeholder="Engineer name"
        />
        <SignaturePad
          label="Engineer signature"
          value={report.engineer_signature ?? ""}
          onChange={(v) => onPatch({ engineer_signature: v || null })}
        />
      </section>

      {/* Client signature */}
      <section className="space-y-2 rounded-lg border bg-card p-3">
        <Label className="text-sm font-medium">Client / Responsible Person</Label>
        <Input
          value={report.client_sign_name ?? ""}
          onChange={(e) => onPatch({ client_sign_name: e.target.value || null })}
          placeholder="Client name (print)"
        />
        <Input
          value={report.client_sign_position ?? ""}
          onChange={(e) => onPatch({ client_sign_position: e.target.value || null })}
          placeholder="Position (e.g. Site Manager)"
        />
        <SignaturePad
          label="Client signature"
          value={isDataUrlSig(report.client_signature) ? (report.client_signature as string) : ""}
          onChange={(v) => onPatch({ client_signature: v || null })}
        />
      </section>

      <div className="pt-2 space-y-2">
        <Button onClick={onComplete} disabled={!canComplete || completing} className="w-full" size="lg">
          {completing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Completing…
            </>
          ) : (
            "Complete C&E test report"
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Building PDF…
            </>
          ) : (
            <>
              <FileDown className="w-4 h-4 mr-2" /> Download PDF
            </>
          )}
        </Button>
        {!canComplete && (
          <ul className="text-xs text-muted-foreground mt-2 space-y-0.5">
            {!complianceSet && <li>• Compliance statement required</li>}
            {!engineerSigOk && <li>• Engineer signature required</li>}
            {!clientSigOk && <li>• Client signature required</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
