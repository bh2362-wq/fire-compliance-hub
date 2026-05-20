import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, Loader2, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { duplicateQuotation } from "@/services/duplicateQuotationService";

interface SiteRow {
  id: string;
  name: string;
  address: string | null;
  customer_id: string | null;
}
interface CustomerRow {
  id: string;
  name: string;
}

interface DuplicateQuotationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceQuotation: { id: string; quotation_number: string } | null;
  onDuplicated?: (newQuote: { id: string; quotation_number: string }) => void;
}

export function DuplicateQuotationDialog({
  open,
  onOpenChange,
  sourceQuotation,
  onDuplicated,
}: DuplicateQuotationDialogProps) {
  const { user } = useAuth();
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [siteId, setSiteId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [sitePopOpen, setSitePopOpen] = useState(false);
  const [customerPopOpen, setCustomerPopOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSiteId("");
    setCustomerId("");
    setLoading(true);
    (async () => {
      const [sitesRes, customersRes] = await Promise.all([
        supabase.from("sites").select("id, name, address, customer_id").order("name"),
        supabase.from("customers").select("id, name").order("name"),
      ]);
      setSites((sitesRes.data as SiteRow[]) || []);
      setCustomers((customersRes.data as CustomerRow[]) || []);
      setLoading(false);
    })();
  }, [open]);

  // When site changes, auto-fill customer from site's default customer
  useEffect(() => {
    if (!siteId) return;
    const s = sites.find((x) => x.id === siteId);
    if (s?.customer_id) setCustomerId(s.customer_id);
  }, [siteId, sites]);

  const selectedSite = useMemo(() => sites.find((s) => s.id === siteId), [siteId, sites]);
  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId),
    [customerId, customers],
  );

  const handleSubmit = async () => {
    if (!sourceQuotation) return;
    if (!siteId) {
      toast.error("Please select a site");
      return;
    }
    if (!customerId) {
      toast.error("Please select a customer");
      return;
    }
    if (!user?.id) {
      toast.error("Not signed in");
      return;
    }
    setSubmitting(true);
    try {
      const result = await duplicateQuotation({
        sourceQuotationId: sourceQuotation.id,
        targetSiteId: siteId,
        targetCustomerId: customerId,
        currentUserId: user.id,
      });
      toast.success(`Duplicate created: ${result.quotation_number}`);
      onOpenChange(false);
      onDuplicated?.(result);
    } catch (err: any) {
      console.error("Duplicate quotation error:", err);
      toast.error(err?.message || "Failed to duplicate quotation");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="w-4 h-4" />
            Duplicate Quote
          </DialogTitle>
          <DialogDescription>
            Create a new draft quote based on{" "}
            <span className="font-mono font-semibold">
              {sourceQuotation?.quotation_number ?? "—"}
            </span>
            ?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>
              Site <span className="text-destructive">*</span>
            </Label>
            <Popover open={sitePopOpen} onOpenChange={setSitePopOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal"
                  disabled={loading}
                >
                  {selectedSite ? (
                    <span className="truncate">
                      {selectedSite.name}
                      {selectedSite.address ? (
                        <span className="text-muted-foreground"> — {selectedSite.address}</span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Select a site…</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[--radix-popover-trigger-width] p-0 pointer-events-auto"
                align="start"
              >
                <Command>
                  <CommandInput placeholder="Search sites…" />
                  <CommandList>
                    <CommandEmpty>No sites found.</CommandEmpty>
                    <CommandGroup>
                      {sites.map((s) => (
                        <CommandItem
                          key={s.id}
                          value={`${s.name} ${s.address ?? ""}`}
                          onSelect={() => {
                            setSiteId(s.id);
                            setSitePopOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              s.id === siteId ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <div className="flex flex-col">
                            <span>{s.name}</span>
                            {s.address && (
                              <span className="text-xs text-muted-foreground">{s.address}</span>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>
              Customer <span className="text-destructive">*</span>
            </Label>
            <Popover open={customerPopOpen} onOpenChange={setCustomerPopOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal"
                  disabled={loading}
                >
                  {selectedCustomer ? (
                    selectedCustomer.name
                  ) : (
                    <span className="text-muted-foreground">
                      {siteId ? "Select a customer…" : "Select a site first"}
                    </span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[--radix-popover-trigger-width] p-0 pointer-events-auto"
                align="start"
              >
                <Command>
                  <CommandInput placeholder="Search customers…" />
                  <CommandList>
                    <CommandEmpty>No customers found.</CommandEmpty>
                    <CommandGroup>
                      {customers.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={c.name}
                          onSelect={() => {
                            setCustomerId(c.id);
                            setCustomerPopOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              c.id === customerId ? "opacity-100" : "opacity-0",
                            )}
                          />
                          {c.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <p className="text-xs text-muted-foreground">
            You can edit all other details after creating the duplicate.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || loading || !siteId || !customerId}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 mr-2" />
                Create Duplicate
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
