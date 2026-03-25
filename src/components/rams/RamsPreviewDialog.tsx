import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Download, FileText } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { RamsDocument } from "@/services/ramsService";
import { generateRamsPDF } from "@/lib/ramsPdfGenerator";
import { RamsEngineerBriefing } from "@/components/rams/RamsEngineerBriefing";

interface RamsPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: RamsDocument | null;
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-500",
  pending_approval: "bg-yellow-500",
  approved: "bg-green-500",
  superseded: "bg-orange-500",
  archived: "bg-slate-400",
};

const riskColors: Record<string, string> = {
  Low: "text-green-600 bg-green-50",
  Medium: "text-yellow-600 bg-yellow-50",
  High: "text-orange-600 bg-orange-50",
  "Very High": "text-red-600 bg-red-50",
};

/** Normalise literal \n sequences into real newlines for display */
function formatText(text: string): string {
  return text.replace(/\\\\n/g, "\n").replace(/\\n/g, "\n");
}

export function RamsPreviewDialog({ open, onOpenChange, document }: RamsPreviewDialogProps) {
  const [generating, setGenerating] = useState(false);

  if (!document) return null;

  const handleDownloadPDF = async () => {
    setGenerating(true);
    try {
      await generateRamsPDF(document);
      toast.success("PDF downloaded");
    } catch (error) {
      console.error("PDF generation error:", error);
      toast.error("Failed to generate PDF");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl">{document.title}</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {document.rams_number} • Version {document.version}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={statusColors[document.status] || "bg-gray-500"}>
                {document.status.replace("_", " ")}
              </Badge>
              <Button onClick={handleDownloadPDF} disabled={generating}>
                <Download className="h-4 w-4 mr-2" />
                {generating ? "Generating..." : "Download PDF"}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="h-[70vh] pr-4">
          <div className="space-y-6">
            {/* Engineer Briefing & Sign-off */}
            <RamsEngineerBriefing
              ramsDocumentId={document.id}
              ramsTitle={document.title}
              ramsNumber={document.rams_number}
            />
            {/* Document Info */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              {document.site && (
                <div>
                  <span className="font-medium">Site:</span> {document.site.name}
                </div>
              )}
              {document.review_date && (
                <div>
                  <span className="font-medium">Review Date:</span>{" "}
                  {format(new Date(document.review_date), "dd/MM/yyyy")}
                </div>
              )}
            </div>

            {/* Site-Specific Info */}
            {(document.site_specific_hazards || document.site_access_notes) && (
              <>
                <Separator />
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Site Information</h3>
                  {document.site_specific_hazards && (
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Site-Specific Hazards</h4>
                      <p className="mt-1">{document.site_specific_hazards}</p>
                    </div>
                  )}
                  {document.site_access_notes && (
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Access Notes</h4>
                      <p className="mt-1">{document.site_access_notes}</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Hazards */}
            <Separator />
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Risk Assessment</h3>
              {(document.hazards || []).map((hazard, index) => (
                <div key={hazard.id || index} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">{hazard.hazard || `Hazard ${index + 1}`}</h4>
                    <div className="flex gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${riskColors[hazard.risk_level] || ""}`}>
                        Initial: {hazard.risk_level}
                      </span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${riskColors[hazard.residual_risk] || ""}`}>
                        Residual: {hazard.residual_risk}
                      </span>
                    </div>
                  </div>
                  {hazard.who_affected && (
                    <p className="text-sm"><span className="font-medium">Who Affected:</span> {hazard.who_affected}</p>
                  )}
                  {hazard.existing_controls && (
                    <p className="text-sm"><span className="font-medium">Existing Controls:</span> {hazard.existing_controls}</p>
                  )}
                  {hazard.additional_controls && (
                    <p className="text-sm"><span className="font-medium">Additional Controls:</span> {hazard.additional_controls}</p>
                  )}
                </div>
              ))}
            </div>

            {/* Method Statement */}
            <Separator />
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Method Statement</h3>
              {(document.method_statements || []).map((step, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-medium">
                      {index + 1}
                    </span>
                    <div className="flex-1">
                      <p>{step.description}</p>
                      <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                        {step.responsible_person && <span>Responsible: {step.responsible_person}</span>}
                        {step.equipment_required && <span>Equipment: {step.equipment_required}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* PPE */}
            {Array.isArray(document.ppe_requirements) && document.ppe_requirements.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">PPE Requirements</h3>
                  <div className="flex flex-wrap gap-2">
                    {document.ppe_requirements.map((ppe) => (
                      <Badge key={ppe} variant="outline">{ppe}</Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Emergency Procedures */}
            {document.emergency_procedures && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">Emergency Procedures</h3>
                  <p className="whitespace-pre-wrap">{document.emergency_procedures}</p>
                </div>
              </>
            )}

            {/* Signatures */}
            <Separator />
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Signatures</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="border rounded-lg p-4">
                  <h4 className="font-medium text-sm text-muted-foreground mb-2">Preparer</h4>
                  {document.preparer_signature ? (
                    <img src={document.preparer_signature} alt="Preparer signature" className="max-h-16 object-contain" />
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Not signed</p>
                  )}
                  {document.preparer_signed_at && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(document.preparer_signed_at), "dd/MM/yyyy HH:mm")}
                    </p>
                  )}
                </div>
                <div className="border rounded-lg p-4">
                  <h4 className="font-medium text-sm text-muted-foreground mb-2">Reviewer</h4>
                  {document.reviewer_signature ? (
                    <img src={document.reviewer_signature} alt="Reviewer signature" className="max-h-16 object-contain" />
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Not signed</p>
                  )}
                  {document.reviewer_signed_at && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(document.reviewer_signed_at), "dd/MM/yyyy HH:mm")}
                    </p>
                  )}
                </div>
                <div className="border rounded-lg p-4">
                  <h4 className="font-medium text-sm text-muted-foreground mb-2">Client {document.client_name && `(${document.client_name})`}</h4>
                  {document.client_signature ? (
                    <img src={document.client_signature} alt="Client signature" className="max-h-16 object-contain" />
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Not signed</p>
                  )}
                  {document.client_signed_at && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(document.client_signed_at), "dd/MM/yyyy HH:mm")}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
