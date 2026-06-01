import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getBibbyAccountCode, setBibbyAccountCode } from "@/services/remittanceService";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function RemittanceSettingsDialog({ open, onOpenChange, onSaved }: Props) {
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const current = await getBibbyAccountCode();
        if (!cancelled) setCode(current ?? "");
      } catch (e) {
        toast({ title: "Couldn't load settings", description: (e as Error).message, variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, toast]);

  const handleSave = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      toast({ title: "Account code required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await setBibbyAccountCode(trimmed);
      toast({ title: "Saved", description: `Payments will route to account ${trimmed}.` });
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Remittance settings</DialogTitle>
          <DialogDescription>
            Tell the app which Xero bank account corresponds to Bibby Factoring. When you apply a
            remittance, the payment is posted against this account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="bibby-code">Xero account code</Label>
          <Input
            id="bibby-code"
            placeholder="e.g. 090"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={loading || saving}
          />
          <p className="text-xs text-muted-foreground">
            Find this in Xero under Accounting → Chart of Accounts. The code is shown next to the
            account name (often a 3-digit number like 090).
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
