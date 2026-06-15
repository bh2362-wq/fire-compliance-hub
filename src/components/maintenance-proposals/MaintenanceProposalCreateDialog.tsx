import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getCustomers } from "@/services/customerService";
import {
  createMaintenanceProposal,
  type CreateMaintenanceProposalData,
} from "@/services/maintenanceProposalService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: string) => void;
  /** Pre-select a site (and infer its customer) when opened from Site Detail. */
  initialSiteId?: string | null;
  initialCustomerId?: string | null;
}

interface CustomerOpt { id: string; name: string }
interface SiteOpt { id: string; name: string; customer_id: string | null }

// Lean create dialog — just the fields needed to spawn a draft. Everything
// else (scope text, SLA tiers, payment terms, etc.) is edited in the
// detail dialog after creation. Matches the same "create → open detail
// immediately" flow QuotationDetailDialog uses.
export function MaintenanceProposalCreateDialog({
  open, onOpenChange, onCreated, initialSiteId = null, initialCustomerId = null,
}: Props) {
  const [customers, setCustomers] = useState<CustomerOpt[]>([]);
  const [sites, setSites] = useState<SiteOpt[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(initialCustomerId);
  const [siteId, setSiteId] = useState<string | null>(initialSiteId);
  const [title, setTitle] = useState<string>("");
  const [annualFee, setAnnualFee] = useState<string>("");
  const [visitsPerYear, setVisitsPerYear] = useState<string>("");
  const [slaTier, setSlaTier] = useState<string>("");
  const [validUntil, setValidUntil] = useState<string>("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCustomerId(initialCustomerId);
    setSiteId(initialSiteId);
    setTitle("");
    setAnnualFee("");
    setVisitsPerYear("");
    setSlaTier("");
    setValidUntil("");
    (async () => {
      const [{ customers: cs }, sitesRes] = await Promise.all([
        getCustomers(),
        supabase.from("sites").select("id, name, customer_id").order("name"),
      ]);
      setCustomers(cs.map((c) => ({ id: c.id, name: c.name })));
      setSites(((sitesRes.data ?? []) as SiteOpt[]));
    })();
  }, [open, initialSiteId, initialCustomerId]);

  // When a site is picked, auto-fill the customer if unset (or correct it
  // if the engineer flipped between sites under different customers).
  useEffect(() => {
    if (!siteId) return;
    const site = sites.find((s) => s.id === siteId);
    if (site?.customer_id && site.customer_id !== customerId) {
      setCustomerId(site.customer_id);
    }
  }, [siteId, sites]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reverse: filter site dropdown to the picked customer's sites. Keeps
  // the engineer from accidentally pairing a site with the wrong customer.
  const visibleSites = customerId
    ? sites.filter((s) => s.customer_id === customerId)
    : sites;

  async function handleCreate() {
    if (!customerId && !siteId) {
      toast.error("Pick a customer or a site first");
      return;
    }
    setCreating(true);
    try {
      const payload: CreateMaintenanceProposalData = {
        customer_id: customerId,
        site_id: siteId,
        title: title.trim() || null,
        annual_fee: annualFee ? Number(annualFee) : null,
        service_visits_per_year: visitsPerYear ? Number(visitsPerYear) : null,
        sla_tier: slaTier || null,
        valid_until: validUntil || null,
      };
      const { proposal, error } = await createMaintenanceProposal(payload);
      if (error || !proposal) throw new Error(error?.message ?? "Failed to create proposal");
      toast.success(`Proposal ${proposal.proposal_number} created`);
      onCreated(proposal.id);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create proposal");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-primary" />
            New Maintenance Proposal
          </DialogTitle>
          <DialogDescription>
            Captures the headline terms. Edit the full proposal — scope,
            payment terms, SLA detail — after it's created.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Customer</Label>
            <Select value={customerId ?? ""} onValueChange={(v) => setCustomerId(v || null)}>
              <SelectTrigger><SelectValue placeholder="Pick a customer…" /></SelectTrigger>
              <SelectContent className="max-h-64">
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Site</Label>
            <Select value={siteId ?? ""} onValueChange={(v) => setSiteId(v || null)}>
              <SelectTrigger>
                <SelectValue placeholder={customerId ? "Pick a site for this customer…" : "Pick a site…"} />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {visibleSites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Title (optional)</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='e.g. "Annual Fire Alarm Maintenance — BS 5839-1:2025 Cat L2"'
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Annual fee £</Label>
              <Input type="number" min={0} step={0.01} value={annualFee} onChange={(e) => setAnnualFee(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Visits / year</Label>
              <Input type="number" min={0} step={1} value={visitsPerYear} onChange={(e) => setVisitsPerYear(e.target.value)} placeholder="4" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">SLA tier</Label>
              <Select value={slaTier} onValueChange={setSlaTier}>
                <SelectTrigger><SelectValue placeholder="Pick…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="P1">P1 — Highest priority</SelectItem>
                  <SelectItem value="P2">P2 — Standard</SelectItem>
                  <SelectItem value="P3">P3 — Lowest priority</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Valid until</Label>
              <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wrench className="w-4 h-4 mr-2" />}
            Create Proposal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
