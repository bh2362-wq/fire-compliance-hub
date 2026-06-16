import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Bid, BidQuestion } from "@/services/bidService";
import { getCompanySettings } from "@/services/companySettingsService";
import { generateBidPDF } from "@/lib/bidPdfGenerator";

interface EmailBidDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bid: Bid;
  questions: BidQuestion[];
}

export function EmailBidDialog({ open, onOpenChange, bid, questions }: EmailBidDialogProps) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTo(bid.customers?.contact_email ?? "");
    setSubject(`${bid.title}${bid.bid_reference ? ` (${bid.bid_reference})` : ""}`);
    setBody(
      `Dear ${bid.customers?.contact_name || "Sir/Madam"},\n\n` +
      `Please find attached our tender response for ${bid.title}.\n\n` +
      `Kind regards,`
    );
  }, [open, bid]);

  const handleSend = async () => {
    const recipients = to.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    if (!recipients.length) { toast.error("Add at least one recipient"); return; }
    setSending(true);
    try {
      const companySettings = await getCompanySettings();
      const doc = await generateBidPDF({ bid, questions, companySettings });
      const dataUri = doc.output("datauristring");
      const pdfBase64 = dataUri.split(",")[1];

      const { data, error } = await supabase.functions.invoke("send-report-email", {
        body: {
          to: recipients,
          subject,
          siteName: bid.buyer_name || bid.title,
          reportNumber: bid.bid_reference || "BID",
          reportDate: format(new Date(), "yyyy-MM-dd"),
          pdfBase64,
          customerName: bid.customers?.contact_name || bid.customers?.name || "",
          companyName: companySettings?.company_name || "",
          logoUrl: companySettings?.report_logo_url || companySettings?.company_logo_url || undefined,
          emailBody: body,
          documentType: "Tender Response",
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Bid emailed");
      onOpenChange(false);
    } catch (e: any) {
      console.error("Email bid failed:", e);
      toast.error(e.message || "Failed to send email");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Email bid</DialogTitle>
          <DialogDescription>The assembled response is attached as a branded PDF.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bid-to">To</Label>
            <Input id="bid-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@buyer.gov.uk (comma-separated)" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bid-subject">Subject</Label>
            <Input id="bid-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bid-body">Message</Label>
            <Textarea id="bid-body" value={body} onChange={(e) => setBody(e.target.value)} rows={6} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
