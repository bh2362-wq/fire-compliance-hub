import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, FileDown, AlertOctagon, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  downloadBs5839CertDocx,
  downloadBs5839CertPdfWithFallback,
} from "@/services/bs5839CertDocxService";
import type { CommissioningDraft } from "../useCommissioningDraft";

// Step 6 — Sign-off. Shows the engineer the answered/unanswered count
// from the §39 checklist, then offers Save + Download buttons. The
// DOCX / PDF buttons drive the edge function from PR #147.
//
// Submission semantics — clicking "Save & Download" calls save()
// (which lazy-creates the parent cert + commissioning row + check
// rows) then invokes the cert DOCX generator with the resulting
// cert_id. The cert stays in "draft" status until the engineer
// flips it to issued from the cert register.

export function Step6Signoff({ draft }: { draft: CommissioningDraft }) {
  const { checks, save, saving, cert } = draft;
  const answered = checks.filter((c) => c.response !== null).length;
  const failed = checks.filter((c) => c.response === "N").length;
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const handleSaveAndDownload = async (format: "docx" | "pdf") => {
    const setLoading = format === "docx" ? setDownloadingDocx : setDownloadingPdf;
    setLoading(true);
    try {
      const certId = await save();
      if (format === "docx") {
        await downloadBs5839CertDocx(certId);
      } else {
        await downloadBs5839CertPdfWithFallback(certId);
      }
      toast.success(`Commissioning ${format.toUpperCase()} downloaded`);
    } catch (e) {
      toast.error("Couldn't generate cert", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <SummaryCard
        answered={answered}
        failed={failed}
        certNumber={cert?.certificate_number ?? null}
      />

      <p className="text-xs text-muted-foreground">
        Saving creates a draft cert in the register. Issuance (flipping
        it from draft to issued) happens from the BAFE Certificate
        Register page once you're satisfied with the form.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => handleSaveAndDownload("docx")}
          disabled={saving || downloadingDocx || downloadingPdf}
          variant="outline"
        >
          {(saving || downloadingDocx) ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <FileText className="w-4 h-4 mr-1" />
          )}
          Save &amp; download DOCX
        </Button>
        <Button
          onClick={() => handleSaveAndDownload("pdf")}
          disabled={saving || downloadingDocx || downloadingPdf}
        >
          {(saving || downloadingPdf) ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <FileDown className="w-4 h-4 mr-1" />
          )}
          Save &amp; download PDF
        </Button>
      </div>
    </div>
  );
}

function SummaryCard({
  answered,
  failed,
  certNumber,
}: {
  answered: number;
  failed: number;
  certNumber: string | null;
}) {
  return (
    <div className="rounded-md border bg-card p-4 space-y-3">
      <div>
        <p className="text-xs uppercase font-semibold tracking-wide text-muted-foreground">
          Cert number
        </p>
        <p className="font-mono mt-0.5">{certNumber ?? "(will be assigned on Save)"}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div
          className={
            answered === 33
              ? "rounded-md border border-success/30 bg-success/10 p-3"
              : "rounded-md border bg-muted/30 p-3"
          }
        >
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-success" />
            <p className="font-semibold">{answered}/33 answered</p>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {answered === 33
              ? "All items have a response."
              : `${33 - answered} items still blank.`}
          </p>
        </div>
        <div
          className={
            failed > 0
              ? "rounded-md border border-destructive/30 bg-destructive/10 p-3"
              : "rounded-md border bg-muted/30 p-3"
          }
        >
          <div className="flex items-center gap-1.5">
            <AlertOctagon
              className={failed > 0 ? "w-4 h-4 text-destructive" : "w-4 h-4 text-muted-foreground"}
            />
            <p className="font-semibold">{failed} failed</p>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {failed > 0
              ? "Items marked N — review before issuing."
              : "No items marked N."}
          </p>
        </div>
      </div>
    </div>
  );
}
