import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import {
  Loader2, Save, Wrench, Trash2, Lock, LockOpen, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getMaintenanceProposal,
  updateMaintenanceProposal,
  deleteMaintenanceProposal,
  type MaintenanceProposalWithRefs,
  type MaintenanceProposalStatus,
} from "@/services/maintenanceProposalService";

interface Props {
  open: boolean;
  proposalId: string | null;
  onOpenChange: (v: boolean) => void;
  onUpdated?: () => void;
}

const STATUS_META: Record<MaintenanceProposalStatus, { label: string; className: string }> = {
  draft:              { label: "Draft",     className: "bg-muted text-muted-foreground border-border" },
  sent:               { label: "Sent",      className: "bg-primary/10 text-primary border-primary/20" },
  customer_accepted:  { label: "Accepted",  className: "bg-success/10 text-success border-success/20" },
  declined:           { label: "Declined",  className: "bg-destructive/10 text-destructive border-destructive/20" },
  expired:            { label: "Expired",   className: "bg-warning/10 text-warning border-warning/20" },
};

// Compact full-detail editor. Tabs split the surface into Overview /
// Service / Pricing / Notes — engineers rarely need all four at once.
// Save persists every field at once (no partial state) and clears the
// render cache via the service's updateMaintenanceProposal contract.
export function MaintenanceProposalDetailDialog({ open, proposalId, onOpenChange, onUpdated }: Props) {
  const [proposal, setProposal] = useState<MaintenanceProposalWithRefs | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Editable fields
  const [status, setStatus] = useState<MaintenanceProposalStatus>("draft");
  const [title, setTitle] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [annualFee, setAnnualFee] = useState<string>("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [vatRate, setVatRate] = useState<string>("20");
  const [calloutCharge, setCalloutCharge] = useState<string>("");
  const [oohCalloutCharge, setOohCalloutCharge] = useState<string>("");
  const [partsMarkupPercent, setPartsMarkupPercent] = useState<string>("");
  const [serviceVisitsPerYear, setServiceVisitsPerYear] = useState<string>("");
  const [ppmIntervalMonths, setPpmIntervalMonths] = useState<string>("");
  const [slaTier, setSlaTier] = useState("");
  const [faultResponseHours, setFaultResponseHours] = useState<string>("");
  const [oohResponseHours, setOohResponseHours] = useState<string>("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");

  const isLocked = !!proposal?.locked_at;

  useEffect(() => {
    if (!open || !proposalId) return;
    setLoading(true);
    (async () => {
      const { proposal: data, error } = await getMaintenanceProposal(proposalId);
      if (error) toast.error("Failed to load proposal", { description: error.message });
      if (data) {
        setProposal(data);
        setStatus(data.status);
        setTitle(data.title ?? "");
        setIntroduction(data.introduction ?? "");
        setAnnualFee(data.annual_fee != null ? String(data.annual_fee) : "");
        setPaymentTerms(data.payment_terms ?? "");
        setVatRate(data.vat_rate != null ? String(data.vat_rate) : "20");
        setCalloutCharge(data.callout_charge != null ? String(data.callout_charge) : "");
        setOohCalloutCharge(data.ooh_callout_charge != null ? String(data.ooh_callout_charge) : "");
        setPartsMarkupPercent(data.parts_markup_percent != null ? String(data.parts_markup_percent) : "");
        setServiceVisitsPerYear(data.service_visits_per_year != null ? String(data.service_visits_per_year) : "");
        setPpmIntervalMonths(data.ppm_interval_months != null ? String(data.ppm_interval_months) : "");
        setSlaTier(data.sla_tier ?? "");
        setFaultResponseHours(data.fault_response_hours != null ? String(data.fault_response_hours) : "");
        setOohResponseHours(data.ooh_response_hours != null ? String(data.ooh_response_hours) : "");
        setValidUntil(data.valid_until ?? "");
        setNotes(data.notes ?? "");
        setHasChanges(false);
      }
      setLoading(false);
    })();
  }, [open, proposalId]);

  async function handleSave() {
    if (!proposalId) return;
    setSaving(true);
    try {
      const { error } = await updateMaintenanceProposal(proposalId, {
        status,
        title: title.trim() || null,
        introduction: introduction.trim() || null,
        annual_fee: annualFee ? Number(annualFee) : null,
        payment_terms: paymentTerms.trim() || null,
        vat_rate: vatRate ? Number(vatRate) : null,
        callout_charge: calloutCharge ? Number(calloutCharge) : null,
        ooh_callout_charge: oohCalloutCharge ? Number(oohCalloutCharge) : null,
        parts_markup_percent: partsMarkupPercent ? Number(partsMarkupPercent) : null,
        service_visits_per_year: serviceVisitsPerYear ? Number(serviceVisitsPerYear) : null,
        ppm_interval_months: ppmIntervalMonths ? Number(ppmIntervalMonths) : null,
        sla_tier: slaTier || null,
        fault_response_hours: faultResponseHours ? Number(faultResponseHours) : null,
        ooh_response_hours: oohResponseHours ? Number(oohResponseHours) : null,
        valid_until: validUntil || null,
        notes: notes.trim() || null,
      });
      if (error) throw error;
      toast.success("Proposal saved");
      setHasChanges(false);
      onUpdated?.();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save proposal");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!proposalId) return;
    const { error } = await deleteMaintenanceProposal(proposalId);
    if (error) {
      toast.error("Failed to delete proposal", { description: error.message });
      return;
    }
    toast.success("Proposal deleted");
    setDeleteOpen(false);
    onOpenChange(false);
    onUpdated?.();
  }

  const meta = STATUS_META[status] ?? STATUS_META.draft;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <Wrench className="w-5 h-5 text-primary" />
            <span className="font-mono text-sm">{proposal?.proposal_number ?? "…"}</span>
            <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
            {isLocked && (
              <Badge variant="outline" className="gap-1 text-xs"><Lock className="w-3 h-3" />Locked</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading || !proposal ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />Loading…
          </div>
        ) : (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="service">Service & SLA</TabsTrigger>
              <TabsTrigger value="pricing">Pricing</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-3 mt-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <Card><CardContent className="p-3">
                  <Label className="text-[10px] text-muted-foreground">Customer</Label>
                  <p className="font-medium">{proposal.customer_name ?? "—"}</p>
                </CardContent></Card>
                <Card><CardContent className="p-3">
                  <Label className="text-[10px] text-muted-foreground">Site</Label>
                  <p className="font-medium">{proposal.site_name ?? "—"}</p>
                </CardContent></Card>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Title</Label>
                <Input
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); setHasChanges(true); }}
                  disabled={isLocked}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Status</Label>
                <Select
                  value={status}
                  onValueChange={(v) => { setStatus(v as MaintenanceProposalStatus); setHasChanges(true); }}
                  disabled={isLocked}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="customer_accepted">Accepted</SelectItem>
                    <SelectItem value="declined">Declined</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Introduction / §1 prose</Label>
                <Textarea
                  rows={4}
                  value={introduction}
                  onChange={(e) => { setIntroduction(e.target.value); setHasChanges(true); }}
                  placeholder="A short paragraph the customer reads first — what BHO Fire will provide, headline standards, term length…"
                  disabled={isLocked}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Valid until</Label>
                <Input
                  type="date"
                  value={validUntil}
                  onChange={(e) => { setValidUntil(e.target.value); setHasChanges(true); }}
                  disabled={isLocked}
                />
              </div>
            </TabsContent>

            <TabsContent value="service" className="space-y-3 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Service visits / year</Label>
                  <Input
                    type="number" min={0} step={1}
                    value={serviceVisitsPerYear}
                    onChange={(e) => { setServiceVisitsPerYear(e.target.value); setHasChanges(true); }}
                    disabled={isLocked}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">PPM interval (months)</Label>
                  <Input
                    type="number" min={0} step={1}
                    value={ppmIntervalMonths}
                    onChange={(e) => { setPpmIntervalMonths(e.target.value); setHasChanges(true); }}
                    disabled={isLocked}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">SLA tier</Label>
                  <Select value={slaTier} onValueChange={(v) => { setSlaTier(v); setHasChanges(true); }} disabled={isLocked}>
                    <SelectTrigger><SelectValue placeholder="…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="P1">P1</SelectItem>
                      <SelectItem value="P2">P2</SelectItem>
                      <SelectItem value="P3">P3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Fault response (hrs)</Label>
                  <Input
                    type="number" min={0} step={1}
                    value={faultResponseHours}
                    onChange={(e) => { setFaultResponseHours(e.target.value); setHasChanges(true); }}
                    disabled={isLocked}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">OOH response (hrs)</Label>
                  <Input
                    type="number" min={0} step={1}
                    value={oohResponseHours}
                    onChange={(e) => { setOohResponseHours(e.target.value); setHasChanges(true); }}
                    disabled={isLocked}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="pricing" className="space-y-3 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Annual fee £</Label>
                  <Input
                    type="number" min={0} step={0.01}
                    value={annualFee}
                    onChange={(e) => { setAnnualFee(e.target.value); setHasChanges(true); }}
                    disabled={isLocked}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">VAT %</Label>
                  <Input
                    type="number" min={0} step={0.01}
                    value={vatRate}
                    onChange={(e) => { setVatRate(e.target.value); setHasChanges(true); }}
                    disabled={isLocked}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Payment terms</Label>
                <Input
                  value={paymentTerms}
                  onChange={(e) => { setPaymentTerms(e.target.value); setHasChanges(true); }}
                  placeholder='e.g. "Annual in advance" / "Quarterly" / "Monthly direct debit"'
                  disabled={isLocked}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Callout £</Label>
                  <Input
                    type="number" min={0} step={0.01}
                    value={calloutCharge}
                    onChange={(e) => { setCalloutCharge(e.target.value); setHasChanges(true); }}
                    disabled={isLocked}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">OOH callout £</Label>
                  <Input
                    type="number" min={0} step={0.01}
                    value={oohCalloutCharge}
                    onChange={(e) => { setOohCalloutCharge(e.target.value); setHasChanges(true); }}
                    disabled={isLocked}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Parts markup %</Label>
                  <Input
                    type="number" min={0} step={0.01}
                    value={partsMarkupPercent}
                    onChange={(e) => { setPartsMarkupPercent(e.target.value); setHasChanges(true); }}
                    disabled={isLocked}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="notes" className="space-y-3 mt-4">
              <Label className="text-xs font-semibold">Internal notes</Label>
              <Textarea
                rows={8}
                value={notes}
                onChange={(e) => { setNotes(e.target.value); setHasChanges(true); }}
                placeholder="Internal — not rendered into the customer-facing doc."
                disabled={isLocked}
              />
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter className="flex items-center justify-between gap-2 flex-wrap">
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive gap-1.5"
            onClick={() => setDeleteOpen(true)}
            disabled={loading || isLocked}
          >
            <Trash2 className="w-4 h-4" />Delete
          </Button>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-600" />
                Unsaved changes
              </span>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            <Button onClick={handleSave} disabled={saving || loading || isLocked || !hasChanges}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this proposal?</AlertDialogTitle>
            <AlertDialogDescription>
              {proposal?.proposal_number} will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
