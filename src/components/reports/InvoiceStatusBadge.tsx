import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Receipt, Check, X, RefreshCw, Link } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface InvoiceStatusBadgeProps {
  reportId: string;
  /** From xero_invoices table lookup */
  xeroInvoice?: {
    xero_invoice_number: string | null;
    status: string | null;
  } | null;
  /** From service_reports.invoiced field */
  manuallyInvoiced: boolean;
  /** From service_reports.xero_invoice_number field */
  manualInvoiceNumber?: string | null;
  onStatusChanged?: () => void;
}

export function InvoiceStatusBadge({
  reportId,
  xeroInvoice,
  manuallyInvoiced,
  manualInvoiceNumber,
  onStatusChanged,
}: InvoiceStatusBadgeProps) {
  const [updating, setUpdating] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [invoiceNumberInput, setInvoiceNumberInput] = useState("");

  // Determine effective invoice status
  const isInvoiced = !!xeroInvoice || manuallyInvoiced;
  const invoiceNumber = xeroInvoice?.xero_invoice_number || manualInvoiceNumber;
  const xeroStatus = xeroInvoice?.status;

  const handleMarkAsInvoiced = async (invoiceNum?: string) => {
    setUpdating(true);
    try {
      const { error } = await supabase
        .from("service_reports")
        .update({
          invoiced: true,
          xero_invoice_number: invoiceNum || null,
        })
        .eq("id", reportId);

      if (error) throw error;
      toast.success(invoiceNum ? `Linked to invoice ${invoiceNum}` : "Marked as invoiced");
      onStatusChanged?.();
    } catch (err) {
      console.error("Failed to update invoice status:", err);
      toast.error("Failed to update status");
    } finally {
      setUpdating(false);
      setShowLinkDialog(false);
      setInvoiceNumberInput("");
    }
  };

  const handleUnmarkInvoiced = async () => {
    setUpdating(true);
    try {
      const { error } = await supabase
        .from("service_reports")
        .update({
          invoiced: false,
          xero_invoice_number: null,
        })
        .eq("id", reportId);

      if (error) throw error;
      toast.success("Marked as not invoiced");
      onStatusChanged?.();
    } catch (err) {
      console.error("Failed to update invoice status:", err);
      toast.error("Failed to update status");
    } finally {
      setUpdating(false);
    }
  };

  const getBadgeContent = () => {
    if (xeroStatus === "PAID") {
      return { label: "Paid", className: "bg-success/10 text-success border-success/20" };
    }
    if (xeroStatus === "AUTHORISED") {
      return { label: invoiceNumber ? `Invoiced (${invoiceNumber})` : "Invoiced", className: "bg-blue-50 text-blue-700 border-blue-200" };
    }
    if (xeroInvoice) {
      return { label: "Draft", className: "bg-amber-50 text-amber-700 border-amber-200" };
    }
    if (manuallyInvoiced) {
      return {
        label: manualInvoiceNumber ? `Invoiced (${manualInvoiceNumber})` : "Invoiced (Manual)",
        className: "bg-blue-50 text-blue-700 border-blue-200",
      };
    }
    return { label: "Not Invoiced", className: "bg-muted text-muted-foreground border-border" };
  };

  const badge = getBadgeContent();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Badge
            variant="outline"
            className={`${badge.className} cursor-pointer hover:opacity-80 transition-opacity text-xs`}
          >
            <Receipt className="w-3 h-3 mr-1" />
            {badge.label}
          </Badge>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          {!isInvoiced ? (
            <>
              <DropdownMenuItem
                onClick={() => handleMarkAsInvoiced()}
                disabled={updating}
              >
                <Check className="w-4 h-4 mr-2 text-success" />
                Mark as Invoiced
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowLinkDialog(true)}
                disabled={updating}
              >
                <Link className="w-4 h-4 mr-2 text-primary" />
                Link Invoice Number
              </DropdownMenuItem>
            </>
          ) : (
            <>
              {!xeroInvoice && (
                <DropdownMenuItem
                  onClick={handleUnmarkInvoiced}
                  disabled={updating}
                >
                  <X className="w-4 h-4 mr-2 text-destructive" />
                  Mark as Not Invoiced
                </DropdownMenuItem>
              )}
              {xeroInvoice && (
                <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Synced from Xero
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link Xero Invoice</DialogTitle>
            <DialogDescription>
              Enter the Xero invoice number to link to this report.
            </DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <Input
              placeholder="e.g. 23328"
              value={invoiceNumberInput}
              onChange={(e) => setInvoiceNumberInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && invoiceNumberInput.trim()) {
                  handleMarkAsInvoiced(invoiceNumberInput.trim());
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => handleMarkAsInvoiced(invoiceNumberInput.trim())}
              disabled={!invoiceNumberInput.trim() || updating}
            >
              {updating ? "Linking..." : "Link Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
