/**
 * Declination of Recommended Works — single-page document form
 * Legal document: responsible person refuses recommended fire safety works.
 * Saves to smart_form_submissions with form_type = "declination_of_works".
 */

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SmartSignature } from "@/components/ui/smart-signature";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import {
  DocBlock, DocBody, DocDialogShell, DocField,
  StickyFooter, StickyHeader, TitleBlock, AISummarySection,
  SitePrefillBlock, PdfPreviewBlock,
} from "./_DocLayout";
import { ClientSummaryPanel } from "./ClientSummaryPanel";

export interface DeclinationPayload {
  premises_name: string;
  premises_address: string;
  responsible_person_name: string;
  responsible_person_role: string;
  responsible_person_email: string;
  recommended_works: string;
  standard_reference: string;
  risk_statement: string;
  risk_accepted_statement: string;
  bho_representative: string;
  bho_date: string;
  bho_signature: string;
  signed_by: string;
  signed_date: string;
  signature: string;
  witnessed_by: string;
}

function buildEmpty(): DeclinationPayload {
  const now = format(new Date(), "yyyy-MM-dd");
  return {
    premises_name: "", premises_address: "",
    responsible_person_name: "", responsible_person_role: "", responsible_person_email: "",
    recommended_works: "", standard_reference: "BS 5839-1:2025",
    risk_statement: "",
    risk_accepted_statement: "",
    bho_representative: "", bho_date: now, bho_signature: "",
    signed_by: "", signed_date: now, signature: "", witnessed_by: "",
  };
}

function autoStatement(p: DeclinationPayload): string {
  if (!p.responsible_person_name && !p.premises_name) return "";
  return `I, ${p.responsible_person_name || "[name]"}, acting as ${p.responsible_person_role || "Responsible Person"} for the above premises, hereby confirm that I have been informed of the recommended fire safety works described above, understand the associated fire risk of declining them, am exercising my right to decline, and accept full responsibility for any consequences arising from this decision. I confirm that BHO Fire Ltd has discharged its duty of care by formally notifying me.`;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  visitId?: string | null;
  siteId?: string | null;
  onSaved?: () => void;
}

export default function DeclinationForm({ open, onOpenChange, visitId, siteId, onSaved }: Props) {
  const { user } = useAuth();
  const [payload, setPayload] = useState<DeclinationPayload>(buildEmpty());
  const [saving, setSaving] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [certRef, setCertRef] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPayload(buildEmpty());
      setSubmissionId(null);
      setAiOpen(false);
      setCertRef(`DOW-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`);
    }
  }, [open]);

  function up(p: Partial<DeclinationPayload>) {
    setPayload((prev) => ({ ...prev, ...p }));
  }

  async function save(status: "draft" | "completed" = "draft") {
    if (status === "completed" &&
        (!payload.premises_name || !payload.responsible_person_name || !payload.recommended_works)) {
      toast.error("Premises, responsible person and works are required");
      return;
    }
    setSaving(true);
    try {
      const ref = certRef ?? `DOW-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
      const row = {
        form_type: "declination_of_works",
        certificate_reference: ref,
        status,
        payload: payload as unknown as Record<string, unknown>,
        visit_id: visitId ?? null,
        site_id: siteId ?? null,
        user_id: user?.id,
        ...(status === "completed" ? { completed_at: new Date().toISOString() } : {}),
      };
      if (submissionId) {
        const { error } = await supabase.from("smart_form_submissions")
          .update(row as any).eq("id", submissionId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("smart_form_submissions")
          .insert(row as any).select("id").single();
        if (error) throw error;
        setSubmissionId((data as any).id);
      }
      toast.success(status === "completed" ? "Declination document completed" : "Draft saved");
      if (status === "completed") onSaved?.();
    } catch (e) {
      console.error(e);
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDownload() {
    await save("completed");
    try {
      const { generateDeclinationPDF } = await import("@/lib/declinationPdfGenerator");
      await generateDeclinationPDF(payload);
    } catch {
      toast.error("PDF generation failed");
    }
  }

  return (
    <DocDialogShell open={open} onOpenChange={onOpenChange}>
      <StickyHeader
        title="Declination of Recommended Works"
        reference={certRef}
        onSaveDraft={() => save("draft")}
        onComplete={handleDownload}
        saving={saving}
        meta={
          <Badge variant="outline" className="gap-1 text-[10px] border-amber-300 text-amber-700">
            <ShieldAlert className="h-3 w-3" />Legal document
          </Badge>
        }
      />

      <DocBody>
        <PdfPreviewBlock
          payload={payload}
          generate={async () => {
            const { generateDeclinationPDF } = await import("@/lib/declinationPdfGenerator");
            await generateDeclinationPDF(payload);
          }}
        />
        <SitePrefillBlock
          formType="declination_of_works"
          siteId={siteId}
          onPrefillApplied={(fields) => up(fields as any)}
        />
        {/* 1. Title */}
        <TitleBlock
          title="Declination of Recommended Works"
          subtitle="Confidential Fire Safety Document"
          reference={certRef}
          date={payload.signed_date}
          onDateChange={(v) => up({ signed_date: v })}
        />

        {/* 2. Important banner */}
        <div className="bg-amber-50 border border-amber-300 rounded-md p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-relaxed">
            This document records that the responsible person has been informed of fire safety risks and declined the recommended works.
            It evidences that BHO Fire Ltd has discharged its duty of care.
          </p>
        </div>

        {/* 3. Premises + responsible person */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DocBlock title="PREMISES">
            <DocField label="Name" value={payload.premises_name} onChange={(v) => up({ premises_name: v })} />
            <DocField label="Address" value={payload.premises_address} onChange={(v) => up({ premises_address: v })} multiline />
          </DocBlock>
          <DocBlock title="RESPONSIBLE PERSON">
            <DocField label="Name" value={payload.responsible_person_name} onChange={(v) => up({ responsible_person_name: v })} />
            <DocField label="Role / Title" value={payload.responsible_person_role} onChange={(v) => up({ responsible_person_role: v })} placeholder="e.g. Facilities Manager" />
            <DocField label="Email" type="email" value={payload.responsible_person_email} onChange={(v) => up({ responsible_person_email: v })} />
          </DocBlock>
        </div>

        {/* 4. Works declined + risk */}
        <DocBlock title="WORKS DECLINED & RISK">
          <DocField label="Recommended works" value={payload.recommended_works} onChange={(v) => up({ recommended_works: v })} multiline rows={4} placeholder="Describe the specific fire safety works recommended by BHO Fire…" />
          <DocField label="Standard reference" value={payload.standard_reference} onChange={(v) => up({ standard_reference: v })} />
          <DocField label="Risk if not done" value={payload.risk_statement} onChange={(v) => up({ risk_statement: v })} multiline rows={3} placeholder="Describe the fire safety risk if these works are not completed…" />
        </DocBlock>

        {/* 5. Risk acceptance statement */}
        <DocBlock
          title="RISK ACCEPTANCE STATEMENT"
          actions={
            <Button
              size="sm"
              variant="secondary"
              className="h-6 text-[10px] px-2"
              onClick={() => up({ risk_accepted_statement: autoStatement(payload) })}
            >
              Auto-fill
            </Button>
          }
        >
          <Textarea
            rows={6}
            value={payload.risk_accepted_statement}
            onChange={(e) => up({ risk_accepted_statement: e.target.value })}
            className="text-xs"
            placeholder="Statement confirming the responsible person understands the risk and accepts liability…"
          />
          <p className="text-[10px] text-muted-foreground">
            Click Auto-fill to generate the standard statement from the details entered.
          </p>
        </DocBlock>

        {/* 6. Signatures */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DocBlock title="BHO FIRE REPRESENTATIVE">
            <DocField label="Name" value={payload.bho_representative} onChange={(v) => up({ bho_representative: v })} />
            <DocField label="Date" type="date" value={payload.bho_date} onChange={(v) => up({ bho_date: v })} />
            <div className="text-[11px] text-muted-foreground mb-1 mt-1">Signature</div>
            <SmartSignature value={payload.bho_signature || ""} onChange={(v) => up({ bho_signature: v })} />
          </DocBlock>
          <DocBlock title="RESPONSIBLE PERSON (CLIENT)">
            <DocField label="Signed by" value={payload.signed_by} onChange={(v) => up({ signed_by: v })} />
            <DocField label="Date" type="date" value={payload.signed_date} onChange={(v) => up({ signed_date: v })} />
            <div className="text-[11px] text-muted-foreground mb-1 mt-1">Signature</div>
            <SmartSignature value={payload.signature || ""} onChange={(v) => up({ signature: v })} showAbsent />
            <DocField label="Witness" value={payload.witnessed_by} onChange={(v) => up({ witnessed_by: v })} placeholder="Name of witness if applicable" />
          </DocBlock>
        </div>

        {/* 7. AI summary */}
        <AISummarySection open={aiOpen} onOpenChange={setAiOpen}>
          <ClientSummaryPanel payload={payload as any} />
        </AISummarySection>
      </DocBody>

      <StickyFooter
        standardLabel="Legal document — retain for fire safety audit trail"
        onClose={() => onOpenChange(false)}
        onComplete={handleDownload}
        saving={saving}
      />
    </DocDialogShell>
  );
}
