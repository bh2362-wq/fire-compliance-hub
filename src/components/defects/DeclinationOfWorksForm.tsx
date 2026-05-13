import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TypedSignature } from "@/components/ui/typed-signature";
import { AlertTriangle, FileDown, Save, Shield } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateDeclinationPDF } from "@/lib/declinationPdfGenerator";
import type { DeclinationOfWorks } from "@/services/defectAccountabilityService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defectId: string;
  noticeId?: string;
  siteId?: string;
  customerId?: string;
  prefill?: {
    premisesName?: string;
    premisesAddress?: string;
    responsiblePerson?: string;
    recommendedWorks?: string;
    standardReference?: string;
    riskStatement?: string;
  };
  onSaved?: () => void;
}

function uid() { return Math.random().toString(36).slice(2, 10); }

export default function DeclinationOfWorksForm({
  open, onOpenChange, defectId, noticeId, siteId, customerId, prefill, onSaved,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [form, setForm] = useState({
    premises_name: prefill?.premisesName || "",
    premises_address: prefill?.premisesAddress || "",
    responsible_person_name: prefill?.responsiblePerson || "",
    responsible_person_role: "",
    recommended_works: prefill?.recommendedWorks || "",
    standard_reference: prefill?.standardReference || "",
    risk_statement: prefill?.riskStatement || "",
    signed_by: "",
    signature: "",
    signed_date: new Date().toISOString().split("T")[0],
    witnessed_by: "",
    bho_representative: "",
    bho_signature: "",
  });

  function update(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }));
  }

  const riskAcceptedStatement = `I, ${form.signed_by || "[Name]"}, acting as ${form.responsible_person_role || "Responsible Person"} for ${form.premises_name || "[Premises]"}, hereby confirm that:

1. I have been advised by BHO Fire & Security Ltd that the above works are recommended in accordance with ${form.standard_reference || "[Standard Reference]"}.

2. I understand the risk associated with not carrying out these works: ${form.risk_statement || "[Risk statement]"}

3. I am exercising my right to decline the recommended works at this time.

4. I accept full responsibility for any consequences arising from this decision, including but not limited to impaired fire safety system performance, non-compliance with fire safety legislation, and any resulting harm to persons or property.

5. I confirm that BHO Fire & Security Ltd has discharged its duty of care by bringing this matter to my attention, providing this formal notice, and requesting my written acknowledgement.`;

  async function handleSave() {
    if (!form.signed_by || !form.signature) {
      toast.error("Signature and name required");
      return;
    }
    if (!understood) {
      toast.error("Please confirm you understand and accept the risk");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("declination_of_works").insert({
        id: uid(),
        defect_notice_id: noticeId || null,
        defect_id: defectId,
        site_id: siteId || null,
        customer_id: customerId || null,
        premises_name: form.premises_name,
        premises_address: form.premises_address,
        responsible_person_name: form.responsible_person_name,
        responsible_person_role: form.responsible_person_role,
        recommended_works: form.recommended_works,
        standard_reference: form.standard_reference,
        risk_statement: form.risk_statement,
        risk_accepted_statement: riskAcceptedStatement,
        signed_by: form.signed_by,
        signature: form.signature,
        signed_date: form.signed_date,
        witnessed_by: form.witnessed_by,
        bho_representative: form.bho_representative,
        bho_signature: form.bho_signature,
      });
      if (error) throw error;

      // Update defect notice status
      if (noticeId) {
        await supabase.from("defect_notices").update({
          acknowledgement_status: "declined",
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: form.signed_by,
          acknowledgement_method: "declination_of_works",
        }).eq("id", noticeId);
      }

      // Audit trail
      await supabase.from("compliance_audit_trail").insert({
        site_id: siteId || null,
        entity_id: defectId,
        event_type: "works_declined",
        entity_type: "defect",
        description: `Declination of Works signed by ${form.signed_by} (${form.responsible_person_role}) for ${form.premises_name}`,
        actor: form.signed_by,
      });

      toast.success("Declination of Works recorded and saved");
      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handlePDF() {
    await generateDeclinationPDF({ ...form, risk_accepted_statement: riskAcceptedStatement } as any);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-500" />
            Declination of Recommended Works
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground">
            This document records the client's decision to decline recommended fire safety works.
            It is legally important — the responsible person's signature transfers liability.
          </p>
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 mt-1">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <p className="text-[11px] text-amber-800">
              By signing, the responsible person accepts liability for any consequences of not completing the recommended works.
            </p>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          <div className="space-y-4">
            {/* Premises */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Premises</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Premises Name</Label>
                  <Input value={form.premises_name} onChange={e => update("premises_name", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Address</Label>
                  <Input value={form.premises_address} onChange={e => update("premises_address", e.target.value)} />
                </div>
              </div>
            </div>

            {/* Works and risk */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Works Declined</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Recommended Works (being declined)</Label>
                  <Textarea
                    value={form.recommended_works}
                    onChange={e => update("recommended_works", e.target.value)}
                    rows={3}
                    placeholder="Describe the works that have been recommended and are being declined…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Standard / Regulatory Reference</Label>
                  <Input
                    value={form.standard_reference}
                    onChange={e => update("standard_reference", e.target.value)}
                    placeholder="e.g. BS 5839-1:2017 Clause 45 — Cat 1 defect"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Risk of Not Completing Works</Label>
                  <Textarea
                    value={form.risk_statement}
                    onChange={e => update("risk_statement", e.target.value)}
                    rows={3}
                    placeholder="Describe the fire safety risk created by not carrying out the recommended works…"
                  />
                </div>
              </div>
            </div>

            {/* Risk acceptance statement */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Risk Acceptance Statement</p>
              <div className="p-3 rounded-lg bg-muted/40 border text-xs leading-relaxed whitespace-pre-line font-mono text-muted-foreground">
                {riskAcceptedStatement}
              </div>
            </div>

            {/* Confirmation checkbox */}
            <div className={cn(
              "flex items-start gap-3 p-3 rounded-lg border transition-colors",
              understood ? "border-green-300/60 bg-green-50 dark:bg-green-950/20" : "border-border"
            )}>
              <Checkbox checked={understood} onCheckedChange={v => setUnderstood(!!v)} className="mt-0.5 flex-shrink-0" />
              <Label className="text-xs leading-relaxed cursor-pointer">
                I confirm that I have read and understood the above statement. I understand that by signing this document I am accepting responsibility for the fire safety risk associated with declining these works.
              </Label>
            </div>

            {/* Signatures */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-xs font-bold text-destructive">Responsible Person (declining works)</p>
                <Input value={form.responsible_person_name} onChange={e => update("responsible_person_name", e.target.value)} placeholder="Full name" />
                <Input value={form.responsible_person_role} onChange={e => update("responsible_person_role", e.target.value)} placeholder="Role / Title (e.g. Facilities Manager)" />
                <Input value={form.signed_by} onChange={e => update("signed_by", e.target.value)} placeholder="Full name for signature" />
                <Input type="date" value={form.signed_date} onChange={e => update("signed_date", e.target.value)} />
                <TypedSignature
                  value={form.signature}
                  onChange={v => update("signature", v)}
                  placeholder="Responsible person signature"
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold">BHO Fire Representative (witness)</p>
                <Input value={form.bho_representative} onChange={e => update("bho_representative", e.target.value)} placeholder="BHO Fire engineer name" />
                <TypedSignature
                  value={form.bho_signature}
                  onChange={v => update("bho_signature", v)}
                  placeholder="BHO Fire witness signature"
                />
                {form.witnessed_by !== form.bho_representative && (
                  <Input value={form.witnessed_by} onChange={e => update("witnessed_by", e.target.value)} placeholder="Witness name (if different)" />
                )}
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="border-t px-6 py-3 flex items-center justify-between gap-2 flex-shrink-0 bg-background">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handlePDF} disabled={saving}>
              <FileDown className="w-4 h-4 mr-1" />Preview PDF
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !understood || !form.signature || !form.signed_by}
              className="bg-amber-600 hover:bg-amber-700"
            >
              <Shield className="w-4 h-4 mr-1" />
              {saving ? "Saving…" : "Record Declination"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
