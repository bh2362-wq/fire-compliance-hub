import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, AlertTriangle, CheckCircle2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PurchaseOrder, fetchPurchaseOrderById, updatePurchaseOrder } from "@/services/purchaseOrderService";
import { generatePurchaseOrderPDF } from "@/lib/purchaseOrderPdfGenerator";
import { getCompanySettings } from "@/services/companySettingsService";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface PORecipient {
  poId: string;
  poNumber: string;
  supplierName: string;
  email: string;
  hasEmail: boolean;
  reference?: string;
}

interface BulkSendPODialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: Set<string>;
  purchaseOrders: PurchaseOrder[];
  onSuccess: () => void;
}

export function BulkSendPODialog({
  open,
  onOpenChange,
  selectedIds,
  purchaseOrders,
  onSuccess,
}: BulkSendPODialogProps) {
  const { user } = useAuth();
  const [recipients, setRecipients] = useState<PORecipient[]>([]);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ sent: 0, total: 0 });

  useEffect(() => {
    if (open) {
      const selected = purchaseOrders.filter((po) => selectedIds.has(po.id));
      setRecipients(
        selected.map((po) => ({
          poId: po.id,
          poNumber: po.po_number,
          supplierName: po.supplier?.name || "Unknown Supplier",
          email: po.supplier?.email || "",
          hasEmail: !!po.supplier?.email,
          reference: po.reference || undefined,
        }))
      );
      setProgress({ sent: 0, total: 0 });
    }
  }, [open, selectedIds, purchaseOrders]);

  const updateEmail = (poId: string, email: string) => {
    setRecipients((prev) =>
      prev.map((r) =>
        r.poId === poId ? { ...r, email, hasEmail: !!email.trim() } : r
      )
    );
  };

  const validRecipients = recipients.filter((r) => r.hasEmail && r.email.trim());
  const invalidRecipients = recipients.filter((r) => !r.hasEmail || !r.email.trim());

  const handleSend = async () => {
    if (validRecipients.length === 0) {
      toast.error("No POs have valid email addresses");
      return;
    }

    setSending(true);
    setProgress({ sent: 0, total: validRecipients.length });
    let sentCount = 0;
    let failCount = 0;

    try {
      const companySettings = await getCompanySettings();
      const compName = companySettings?.company_name || "BHO Fire";

      for (const recipient of validRecipients) {
        try {
          const fullPO = await fetchPurchaseOrderById(recipient.poId);
          if (!fullPO) { failCount++; continue; }

          const doc = await generatePurchaseOrderPDF(fullPO, companySettings || null);
          const pdfBase64 = doc.output("datauristring").split(",")[1];

          const emailSubject = `Purchase Order ${fullPO.po_number}${fullPO.reference ? ` - ${fullPO.reference}` : ""}`;
          const emailBody = `Dear ${recipient.supplierName},\n\nPlease find attached our purchase order ${fullPO.po_number}.\n\nPlease confirm receipt and expected delivery date at your earliest convenience.\n\nKind regards,\n${compName}`;

          const { data, error } = await supabase.functions.invoke("send-report-email", {
            body: {
              to: [recipient.email.trim()],
              subject: emailSubject,
              emailBody,
              pdfBase64,
              siteName: "",
              reportNumber: fullPO.po_number,
              reportDate: fullPO.order_date,
              documentType: "Purchase Order",
            },
          });

          if (error || data?.error) throw new Error(data?.error || "Send failed");

          await updatePurchaseOrder(fullPO.id, { status: "sent" });

          await supabase.from("email_logs").insert({
            email_type: "purchase_order",
            recipients: [recipient.email.trim()],
            subject: emailSubject,
            status: "sent",
            created_by: user?.id,
          });

          sentCount++;
          setProgress({ sent: sentCount, total: validRecipients.length });
        } catch (err) {
          console.error(`Failed to send PO ${recipient.poNumber}:`, err);
          failCount++;
        }
      }

      if (sentCount > 0) toast.success(`${sentCount} purchase order(s) sent successfully`);
      if (failCount > 0) toast.error(`${failCount} purchase order(s) failed to send`);

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Bulk send error:", error);
      toast.error("Bulk send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Confirm Bulk Send
          </DialogTitle>
          <DialogDescription>
            Review recipients before sending {recipients.length} purchase order{recipients.length !== 1 ? "s" : ""}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px]">
          <div className="space-y-3 pr-3">
            {recipients.map((r) => (
              <div
                key={r.poId}
                className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30"
              >
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{r.poNumber}</span>
                    {r.reference && (
                      <Badge variant="outline" className="text-xs">{r.reference}</Badge>
                    )}
                    {r.hasEmail && r.email.trim() ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{r.supplierName}</p>
                  <Input
                    value={r.email}
                    onChange={(e) => updateEmail(r.poId, e.target.value)}
                    placeholder="Enter supplier email"
                    className="h-8 text-sm"
                    disabled={sending}
                  />
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {invalidRecipients.length > 0 && (
          <p className="text-xs text-amber-600 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {invalidRecipients.length} PO{invalidRecipients.length !== 1 ? "s" : ""} without email will be skipped
          </p>
        )}

        {sending && (
          <div className="text-sm text-muted-foreground text-center">
            Sending {progress.sent}/{progress.total}...
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || validRecipients.length === 0}>
            {sending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Send {validRecipients.length} PO{validRecipients.length !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
