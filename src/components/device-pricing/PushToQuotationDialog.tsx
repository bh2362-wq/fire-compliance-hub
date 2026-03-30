import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { AIExpandButton } from "@/components/quotations/AIExpandButton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DevicePriceList, DevicePriceItem } from "@/services/devicePricingService";
import { toast } from "sonner";

interface PushToQuotationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  priceList: DevicePriceList;
  items: DevicePriceItem[];
}

export function PushToQuotationDialog({ open, onOpenChange, priceList, items }: PushToQuotationDialogProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState(priceList.name || "Device Replacement Quotation");
  const [vatRate, setVatRate] = useState(20);
  const [validDays, setValidDays] = useState(30);
  const [summary, setSummary] = useState("Supply and installation of replacement fire alarm devices as per device health report.");
  const [terms, setTerms] = useState("");
  const [saving, setSaving] = useState(false);

  const subtotal = items.reduce((s, i) => s + Number(i.sell_price), 0);
  const vatAmount = subtotal * (vatRate / 100);
  const total = subtotal + vatAmount;

  const handleCreate = async () => {
    setSaving(true);
    try {
      if (!user) throw new Error("Not authenticated");

      const { data: quotationNumber } = await supabase.rpc("get_next_quotation_number");

      const { data: quotation, error } = await supabase
        .from("quotations")
        .insert({
          quotation_number: quotationNumber,
          site_id: priceList.site_id,
          customer_id: priceList.customer_id,
          status: "draft",
          title,
          summary,
          total_amount: subtotal,
          vat_rate: vatRate,
          valid_until: new Date(Date.now() + validDays * 86400000).toISOString().split("T")[0],
          terms: terms || null,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Create line items from priced devices
      const lineItems = items
        .filter(i => Number(i.sell_price) > 0 || i.description)
        .map((item, idx) => ({
          quotation_id: quotation.id,
          description: `${item.model_number ? item.model_number + " - " : ""}${item.description}`,
          quantity: item.quantity,
          unit_price: Number(item.cost_price) * (1 + Number(item.markup_percent) / 100),
          labour_cost: Number(item.labour_cost),
          total_price: Number(item.sell_price),
          cost_price: Number(item.cost_price),
          markup_percent: Number(item.markup_percent),
          sort_order: idx,
          priority: "medium",
        }));

      if (lineItems.length > 0) {
        const { error: itemsErr } = await supabase.from("quotation_line_items").insert(lineItems);
        if (itemsErr) throw itemsErr;
      }

      // Update price list status
      await supabase
        .from("device_price_lists")
        .update({ status: "quoted" })
        .eq("id", priceList.id);

      toast.success(`Quotation ${quotationNumber} created with ${lineItems.length} items`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to create quotation");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Push to Quotation</DialogTitle>
          <DialogDescription>Create a quotation from {items.length} priced devices.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Quote Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Summary</Label>
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} className="min-h-[60px]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Valid (days)</Label>
              <Input type="number" value={validDays} onChange={(e) => setValidDays(parseInt(e.target.value) || 30)} />
            </div>
            <div className="space-y-2">
              <Label>VAT %</Label>
              <Input type="number" value={vatRate} onChange={(e) => setVatRate(parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Terms</Label>
            <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Payment terms..." className="min-h-[40px]" />
          </div>

          <div className="border-t pt-3 space-y-1 text-right text-sm">
            <div><span className="text-muted-foreground">Subtotal:</span> <span className="font-medium">£{subtotal.toFixed(2)}</span></div>
            <div><span className="text-muted-foreground">VAT ({vatRate}%):</span> <span className="font-medium">£{vatAmount.toFixed(2)}</span></div>
            <div className="text-base"><span className="text-muted-foreground">Total:</span> <span className="font-semibold">£{total.toFixed(2)}</span></div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</> : "Create Quotation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
