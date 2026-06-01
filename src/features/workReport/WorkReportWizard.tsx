import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { WizardShell, WizardLoadingState } from "@/features/_shared/WizardShell";
import { InvoicePromptDialog } from "@/components/reports/InvoicePromptDialog";
import { CustomerCreateInvoiceDialog } from "@/components/customers/CustomerCreateInvoiceDialog";
import { PasteAINotesDialog } from "@/components/notes-paste/PasteAINotesDialog";
import { createDefect } from "@/services/defectService";
import {
  useWorkReportDraft,
  WorkReportDraft,
  WorkReportVisit,
} from "./useWorkReportDraft";
import {
  runCompleteSideEffects,
  CompleteSiteInfo,
  CompleteCustomerInfo,
} from "./completeWorkReport";
import { JobStep } from "./steps/JobStep";
import { WorksStep } from "./steps/WorksStep";
import { MaterialsStep } from "./steps/MaterialsStep";
import { PhotosStep } from "./steps/PhotosStep";
import { SignStep } from "./steps/SignStep";

interface Props {
  visit: WorkReportVisit;
  userId: string;
  site: CompleteSiteInfo;
  customer: CompleteCustomerInfo | null;
  onCompleted?: () => void;
}

const STEP_LABELS = ["Job", "Works", "Materials", "Photos", "Sign-off"];

function buildFullAddress(s: CompleteSiteInfo): string {
  return [s.address, s.city, s.postcode].filter(Boolean).join(", ");
}

export function WorkReportWizard({ visit, userId, site, customer, onCompleted }: Props) {
  const { toast } = useToast();
  const { draft, loading, saving, error, patch, complete } = useWorkReportDraft(visit, userId);
  const [stepIdx, setStepIdx] = useState(0);
  const [completing, setCompleting] = useState(false);
  const [showInvoicePrompt, setShowInvoicePrompt] = useState(false);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);

  if (error) {
    return (
      <div className="max-w-md mx-auto p-6 text-center space-y-3">
        <p className="text-sm font-medium text-destructive">Couldn't open this work report.</p>
        <p className="text-xs text-muted-foreground break-words">{error.message}</p>
      </div>
    );
  }

  if (loading || !draft) {
    return <WizardLoadingState />;
  }

  const patchScalars = (updates: Partial<WorkReportDraft>) => {
    void patch(updates);
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      const completed = await complete(visit.id);
      if (!completed) return;
      toast({
        title: `Work report ${completed.report_number || ""} completed`.trim(),
        description: "Locked. Syncing to SharePoint and notifying the office in the background.",
      });
      const result = await runCompleteSideEffects(completed, site, customer, visit, userId);
      if (result.shouldOfferInvoice) {
        setShowInvoicePrompt(true);
      } else {
        onCompleted?.();
      }
    } catch (e) {
      toast({
        title: "Could not complete",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setCompleting(false);
    }
  };

  return (
    <>
      <WizardShell
        stepLabels={STEP_LABELS}
        stepIdx={stepIdx}
        setStepIdx={setStepIdx}
        saving={saving}
        headerActions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            onClick={() => setPasteOpen(true)}
            title="Paste AI notes (defects + field updates)"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Paste notes</span>
          </Button>
        }
      >
        {stepIdx === 0 && (
          <JobStep
            draft={draft}
            onPatch={patchScalars}
            siteName={site.name}
            siteContactName={site.contact_name}
            siteFullAddress={buildFullAddress(site)}
          />
        )}
        {stepIdx === 1 && <WorksStep draft={draft} onPatch={patchScalars} />}
        {stepIdx === 2 && <MaterialsStep draft={draft} onPatch={patchScalars} />}
        {stepIdx === 3 && <PhotosStep draft={draft} onPatch={patchScalars} />}
        {stepIdx === 4 && (
          <SignStep
            draft={draft}
            onPatch={patchScalars}
            onComplete={handleComplete}
            completing={completing}
            visitDate={visit.visit_date}
          />
        )}
      </WizardShell>

      {/* Paste AI notes — Work Report maps recommendations → further_action
          and work_carried_out → works_report. The other AI field names
          (defects_found / system_condition / notes) don't have a clean
          column on this draft shape, so we omit them from currentValues
          and the dialog skips them in the preview. */}
      <PasteAINotesDialog
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        reportType="work"
        siteId={visit.site_id}
        visitId={visit.id}
        reportId={draft.id}
        currentValues={{
          recommendations: draft.further_action,
          work_carried_out: draft.works_report,
        }}
        onApply={async ({ defects, fieldUpdates }) => {
          for (const d of defects) {
            const composed = d.recommended_action
              ? `${d.description}\nRecommended: ${d.recommended_action}`
              : d.description;
            try {
              await createDefect({
                site_id: visit.site_id,
                visit_id: visit.id,
                report_id: draft.id,
                description: composed,
                location: d.location,
                category: d.category,
                status: "open",
              });
            } catch (e) {
              console.error("Failed to create defect from AI extract:", e);
            }
          }
          const updates: Partial<WorkReportDraft> = {};
          if (fieldUpdates.recommendations !== undefined) updates.further_action = fieldUpdates.recommendations;
          if (fieldUpdates.work_carried_out !== undefined) updates.works_report = fieldUpdates.work_carried_out;
          if (Object.keys(updates).length > 0) await patch(updates);
        }}
      />

      <InvoicePromptDialog
        open={showInvoicePrompt}
        onOpenChange={setShowInvoicePrompt}
        siteName={site.name}
        onDecline={() => {
          setShowInvoicePrompt(false);
          onCompleted?.();
        }}
        onConfirm={() => {
          setShowInvoicePrompt(false);
          setShowInvoiceDialog(true);
        }}
      />

      {customer && (
        <CustomerCreateInvoiceDialog
          open={showInvoiceDialog}
          onOpenChange={(open) => {
            setShowInvoiceDialog(open);
            if (!open) onCompleted?.();
          }}
          customerId={customer.id}
          customerName={customer.name}
          xeroContactId={customer.xero_contact_id}
          sites={[{
            id: site.id,
            name: site.name,
            address: site.address,
            city: site.city,
          }]}
          onSuccess={() => {
            setShowInvoiceDialog(false);
            onCompleted?.();
          }}
          jobReportData={{
            jobType: draft.job_type,
            reportDate: draft.report_date,
            reportNumber: draft.report_number,
            siteName: site.name,
            jobDescription: draft.works_report || undefined,
            visitDate: visit.visit_date,
            materials: draft.materials.filter((m) => m.name && m.name.trim()),
          }}
        />
      )}
    </>
  );
}
