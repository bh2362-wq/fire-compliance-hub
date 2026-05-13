/**
 * Declination of Recommended Works Form
 * Legal document — responsible person refuses recommended fire safety works.
 * Saves to smart_form_submissions with form_type = "declination_of_works"
 */

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TypedSignature } from "@/components/ui/typed-signature";
import { ChevronLeft, ChevronRight, Save, FileDown, AlertTriangle, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export interface DeclinationPayload {
  // Premises
  premises_name: string;
  premises_address: string;
  responsible_person_name: string;
  responsible_person_role: string;
  responsible_person_email: string;

  // Works declined
  recommended_works: string;
  standard_reference: string;
  risk_statement: string;

  // Risk acceptance statement
  risk_accepted_statement: string;

  // BHO representative
  bho_representative: string;
  bho_date: string;
  bho_signature: string;

  // Client signature
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

function autoStatement(payload: DeclinationPayload): string {
  if (!payload.responsible_person_name && !payload.premises_name) return "";
  return `I, ${payload.responsible_person_name || "[name]"}, acting as ${payload.responsible_person_role || "Responsible Person"} for the above premises, hereby confirm that I have been informed of the recommended fire safety works described above, understand the associated fire risk of declining them, am exercising my right to decline, and accept full responsibility for any consequences arising from this decision. I confirm that BHO Fire Ltd has discharged its duty of care by formally notifying me.`;
}

const STEPS = ["Premises", "Works & Risk", "Statement", "Signatures", "Preview"];

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
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setPayload(buildEmpty()); setStep(0); setSubmissionId(null); }
  }, [open]);

  function up(partial: Partial<DeclinationPayload>) {
    setPayload(prev => ({ ...prev, ...partial }));
  }

  async function save(status: "draft" | "completed" = "draft") {
    if (status === "completed") {
      if (!payload.premises_name || !payload.responsible_person_name || !payload.recommended_works) {
        toast.error("Please fill in premises, responsible person and works details");
        return;
      }
    }
    setSaving(true);
    try {
      const certRef = `DOW-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
      const row = {
        form_type: "declination_of_works",
        certificate_reference: certRef,
        status,
        payload: payload as unknown as Record<string, unknown>,
        visit_id: visitId ?? null,
        site_id: siteId ?? null,
        user_id: user?.id,
        ...(status === "completed" ? { completed_at: new Date().toISOString() } : {}),
      };
      if (submissionId) {
        const { error } = await supabase.from("smart_form_submissions").update(row as any).eq("id", submissionId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("smart_form_submissions").insert(row as any).select("id").single();
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
    try {
      const { generateDeclinationPDF } = await import("@/lib/declinationPdfGenerator");
      await generateDeclinationPDF(payload);
    } catch { toast.error("PDF generation failed"); }
  }

  const isLast = step === STEPS.length - 1;
  const prog = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-600" />
            Declination of Recommended Works
            <Badge variant="outline" className="text-[10px] ml-1 border-amber-300 text-amber-700">Legal Document</Badge>
          </DialogTitle>
          <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 mt-1">
            This document records that the responsible person has been informed of fire safety risks and declined recommended works. It protects BHO Fire's liability.
          </div>
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>{STEPS[step]}</span>
              <span>{step + 1} / {STEPS.length}</span>
            </div>
            <Progress value={prog} className="h-1.5" />
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          {step === 0 && (
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>Premises Name</Label>
                <Input value={payload.premises_name} onChange={e => up({ premises_name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Premises Address</Label>
                <Textarea rows={2} value={payload.premises_address} onChange={e => up({ premises_address: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Responsible Person Name</Label>
                <Input value={payload.responsible_person_name} onChange={e => up({ responsible_person_name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label>Role / Title</Label>
                  <Input value={payload.responsible_person_role} onChange={e => up({ responsible_person_role: e.target.value })} placeholder="e.g. Facilities Manager" /></div>
                <div className="space-y-1.5"><Label>Email</Label>
                  <Input type="email" value={payload.responsible_person_email} onChange={e => up({ responsible_person_email: e.target.value })} /></div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Recommended Works (what was advised)</Label>
                <Textarea rows={4} value={payload.recommended_works}
                  onChange={e => up({ recommended_works: e.target.value })}
                  placeholder="Describe the specific fire safety works recommended by BHO Fire..." />
              </div>
              <div className="space-y-1.5">
                <Label>Standard / Regulation Reference</Label>
                <Input value={payload.standard_reference} onChange={e => up({ standard_reference: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  Risk of Non-Completion
                </Label>
                <Textarea rows={3} value={payload.risk_statement}
                  onChange={e => up({ risk_statement: e.target.value })}
                  placeholder="Describe the fire safety risk if these works are not completed..." />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Risk Acceptance Statement</Label>
                  <Button variant="outline" size="sm" className="h-7 text-xs"
                    onClick={() => up({ risk_accepted_statement: autoStatement(payload) })}>
                    Auto-fill
                  </Button>
                </div>
                <Textarea rows={8} value={payload.risk_accepted_statement}
                  onChange={e => up({ risk_accepted_statement: e.target.value })}
                  placeholder="Statement confirming the responsible person understands the risk and accepts liability..." />
                <p className="text-xs text-muted-foreground">Click Auto-fill to generate the standard statement from the details entered.</p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              {/* BHO representative */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">BHO Fire Representative</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Name</Label>
                    <Input value={payload.bho_representative} onChange={e => up({ bho_representative: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Date</Label>
                    <Input type="date" value={payload.bho_date} onChange={e => up({ bho_date: e.target.value })} /></div>
                </div>
                <div className="space-y-1.5"><Label>Signature</Label>
                  <TypedSignature value={payload.bho_signature} onChange={v => up({ bho_signature: v })} /></div>
              </div>

              {/* Client */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Responsible Person (Client)</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Signed by (name)</Label>
                    <Input value={payload.signed_by} onChange={e => up({ signed_by: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Date</Label>
                    <Input type="date" value={payload.signed_date} onChange={e => up({ signed_date: e.target.value })} /></div>
                </div>
                <div className="space-y-1.5"><Label>Signature</Label>
                  <TypedSignature value={payload.signature} onChange={v => up({ signature: v })} /></div>
                <div className="space-y-1.5"><Label>Witness Name (optional)</Label>
                  <Input value={payload.witnessed_by} onChange={e => up({ witnessed_by: e.target.value })} placeholder="Name of witness if applicable" /></div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                <p className="text-xs font-bold text-amber-700 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Review before completing
                </p>
                {[
                  ["Premises",         payload.premises_name],
                  ["Responsible Person",payload.responsible_person_name],
                  ["Role",             payload.responsible_person_role],
                  ["Works Declined",   payload.recommended_works?.substring(0, 80) + (payload.recommended_works?.length > 80 ? "..." : "")],
                  ["Standard",         payload.standard_reference],
                  ["BHO Representative",payload.bho_representative],
                  ["Date",             payload.signed_date],
                ].filter(([,v]) => v).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-2 gap-2 text-xs">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-medium">{v}</span>
                  </div>
                ))}
              </div>
              <Button onClick={handleDownload} className="w-full" variant="outline">
                <FileDown className="w-4 h-4 mr-2" /> Download PDF
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Download the PDF and obtain the client signature before completing.
              </p>
            </div>
          )}
        </ScrollArea>

        <div className="flex items-center justify-between px-6 py-3 border-t shrink-0 bg-muted/30">
          <Button variant="ghost" size="sm" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => save("draft")} disabled={saving}>
              <Save className="w-3.5 h-3.5 mr-1" /> Save Draft
            </Button>
            {isLast ? (
              <Button size="sm" variant="destructive" onClick={() => save("completed")} disabled={saving}>
                Complete & Lock
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStep(s => s + 1)}>
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
