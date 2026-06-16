import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createBid } from "@/services/bidService";

interface NewBidDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

const NONE = "__none__";

export function NewBidDialog({ open, onOpenChange, onCreated }: NewBidDialogProps) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);

  const [title, setTitle] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [customerId, setCustomerId] = useState<string>(NONE);
  const [portalName, setPortalName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [summary, setSummary] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(""); setBuyerName(""); setCustomerId(NONE); setPortalName("");
    setDeadline(""); setEstimatedValue(""); setSummary("");
    (async () => {
      const { data } = await supabase.from("customers").select("id, name").order("name");
      setCustomers((data ?? []) as Array<{ id: string; name: string }>);
    })();
  }, [open]);

  const handleCreate = async () => {
    if (!title.trim()) { toast.error("A bid title is required"); return; }
    setSaving(true);
    try {
      const bid = await createBid({
        title: title.trim(),
        buyer_name: buyerName.trim() || null,
        customer_id: customerId === NONE ? null : customerId,
        portal_name: portalName.trim() || null,
        submission_deadline: deadline ? new Date(deadline).toISOString() : null,
        estimated_value: estimatedValue ? Number(estimatedValue) : null,
        summary: summary.trim() || null,
        status: "draft",
      });
      toast.success(`${bid.bid_reference || "Bid"} created`);
      onOpenChange(false);
      onCreated?.();
      navigate(`/dashboard/bids/${bid.id}`);
    } catch (e: any) {
      console.error("Create bid failed:", e);
      toast.error(e.message || "Failed to create bid");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Bid</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bid-title">Title *</Label>
            <Input id="bid-title" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Fire Alarm Maintenance — NHS Trust Framework" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bid-buyer">Buyer / authority</Label>
              <Input id="bid-buyer" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Contracting authority" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bid-portal">Tender portal</Label>
              <Input id="bid-portal" value={portalName} onChange={(e) => setPortalName(e.target.value)} placeholder="e.g. ProContract" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Linked customer</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bid-deadline">Submission deadline</Label>
              <Input id="bid-deadline" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bid-value">Estimated value (£)</Label>
              <Input id="bid-value" type="number" value={estimatedValue} onChange={(e) => setEstimatedValue(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bid-summary">Context / summary</Label>
            <Textarea id="bid-summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={3}
              placeholder="Scope, lots, key requirements — helps the AI write on-point answers." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Create Bid
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
