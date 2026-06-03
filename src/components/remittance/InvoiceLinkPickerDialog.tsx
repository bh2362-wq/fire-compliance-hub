import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fetchOutstandingInvoices, XeroOutstandingInvoice } from "@/services/xeroService";
import { linkLineItemToXeroInvoice } from "@/services/remittanceService";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lineItemId: string;
  /** Pre-fill the search box with what the AI extracted, if anything. */
  initialQuery?: string | null;
  /** Hint to highlight invoices whose amount matches. Not load-bearing. */
  hintAmount?: number | null;
  onLinked: () => void;
}

function formatGBP(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(n);
}

export function InvoiceLinkPickerDialog({
  open,
  onOpenChange,
  lineItemId,
  initialQuery,
  hintAmount,
  onLinked,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<XeroOutstandingInvoice[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery ?? "");
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { invoices: list } = await fetchOutstandingInvoices();
        if (!cancelled) setInvoices(list ?? []);
      } catch (e) {
        toast({
          title: "Couldn't load invoices",
          description: (e as Error).message,
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, initialQuery, toast]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Default sort: amount-matches first, then alphabetical by contact.
      return [...invoices].sort((a, b) => {
        const aMatch = hintAmount != null && Math.abs(a.amountDue - hintAmount) < 0.01 ? 0 : 1;
        const bMatch = hintAmount != null && Math.abs(b.amountDue - hintAmount) < 0.01 ? 0 : 1;
        if (aMatch !== bMatch) return aMatch - bMatch;
        return (a.contactName ?? "").localeCompare(b.contactName ?? "");
      });
    }
    return invoices.filter((inv) => {
      const haystack = `${inv.invoiceNumber ?? ""} ${inv.reference ?? ""} ${inv.contactName ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [invoices, query, hintAmount]);

  const handlePick = async (inv: XeroOutstandingInvoice) => {
    setLinking(inv.invoiceId);
    try {
      await linkLineItemToXeroInvoice(lineItemId, inv.invoiceId, inv.contactName ?? null);
      toast({ title: "Linked", description: `Tied to ${inv.invoiceNumber} (${inv.contactName ?? "—"}).` });
      onLinked();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Link failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLinking(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[80vh] sm:h-auto sm:max-h-[80dvh] flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle>Link to a Xero invoice</DialogTitle>
          <DialogDescription>
            Pick the outstanding invoice this remittance line refers to. Search by invoice number,
            reference, or customer name.
          </DialogDescription>
        </DialogHeader>

        <div className="relative shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="INV-1234, customer name, reference…"
            className="pl-10"
            autoFocus
          />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto border rounded-lg">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Loading outstanding invoices…
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {invoices.length === 0
                ? "No outstanding invoices in Xero."
                : "No matches — try a different search."}
            </p>
          ) : (
            <ul className="divide-y">
              {filtered.slice(0, 100).map((inv) => {
                const amountMatch =
                  hintAmount != null && Math.abs(inv.amountDue - hintAmount) < 0.01;
                return (
                  <li
                    key={inv.invoiceId}
                    className={`flex items-center justify-between gap-3 p-3 hover:bg-muted/40 ${amountMatch ? "bg-emerald-50/50" : ""}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-semibold">{inv.invoiceNumber}</span>
                        {amountMatch && (
                          <Badge variant="outline" className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200">
                            Amount match
                          </Badge>
                        )}
                        {inv.isOverdue && (
                          <Badge variant="outline" className="text-[10px] bg-red-100 text-red-700 border-red-200">
                            Overdue
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{inv.contactName ?? "—"}</p>
                      {inv.reference && (
                        <p className="text-xs text-muted-foreground italic truncate">{inv.reference}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">{formatGBP(inv.amountDue)}</p>
                      <p className="text-[10px] text-muted-foreground">due</p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handlePick(inv)}
                      disabled={!!linking}
                      className="shrink-0"
                    >
                      {linking === inv.invoiceId ? (
                        <>
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          Linking…
                        </>
                      ) : (
                        "Link"
                      )}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="text-xs text-muted-foreground shrink-0">
          Linking only updates the matching pointer. The Apply button still posts the payment to
          Xero against the Bibby Factoring account.
        </p>
      </DialogContent>
    </Dialog>
  );
}
