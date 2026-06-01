import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { WizardShell, WizardLoadingState } from "@/features/_shared/WizardShell";
import { InvoicePromptDialog } from "@/components/reports/InvoicePromptDialog";
import { CustomerCreateInvoiceDialog } from "@/components/customers/CustomerCreateInvoiceDialog";
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
