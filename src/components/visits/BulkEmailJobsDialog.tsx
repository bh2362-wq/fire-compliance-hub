import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Visit } from "@/hooks/useVisits";
import { format } from "date-fns";
import { getVisitTypeLabel } from "@/constants/visitTypes";

const statusLabels: Record<string, string> = {
  scheduled: "Scheduled",
  in_progress: "In Progress",
  confirmed: "Confirmed",
  on_hold: "On Hold",
  awaiting_parts: "Awaiting Parts",
  further_works_required: "Further Works Required",
  quote_needed: "Quote Needed",
  awaiting_po: "Awaiting PO",
  pending_review: "Pending Review",
};

interface BulkEmailJobsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedVisits: Visit[];
  onSuccess?: () => void;
}

export function BulkEmailJobsDialog({ open, onOpenChange, selectedVisits, onSuccess }: BulkEmailJobsDialogProps) {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [email, setEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && selectedVisits.length > 0) {
      loadCustomerData();
    }
  }, [open]);

  const loadCustomerData = async () => {
    setLoading(true);
    try {
      // Get customer from first visit's site
      const { data: site } = await supabase
        .from("sites")
        .select("customer_id, customers(name, contact_email, contact_name, email_recipients)")
        .eq("id", selectedVisits[0].site_id)
        .maybeSingle();

      const customer = site?.customers as any;
      if (customer) {
        const recipients = [customer.contact_email, customer.email_recipients].filter(Boolean).join(", ");
        setEmail(recipients || "");
        setCustomerName(customer.contact_name || customer.name || "");
      }
    } catch (err) {
      console.error("Error loading customer:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!email.trim()) {
      toast({ title: "Error", description: "Please enter an email address", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      const jobs = selectedVisits.map((v) => {
        let notes = "";
        try {
          const parsed = JSON.parse(v.notes || "{}");
          notes = parsed.user_notes || "";
        } catch {
          notes = v.notes || "";
        }
        // Truncate notes for email
        if (notes.length > 100) notes = notes.substring(0, 100) + "...";
        
        return {
          siteName: v.site?.name || "Unknown Site",
          visitDate: v.visit_date,
          visitType: v.visit_type,
          status: v.status || "scheduled",
          notes,
        };
      });

      const { error } = await supabase.functions.invoke("send-jobs-email", {
        body: {
          to: email.trim(),
          customerName: customerName || "Customer",
          jobs,
          message: message || undefined,
        },
      });

      if (error) throw error;

      toast({
        title: "Email sent",
        description: `Job summary sent to ${email.split(",")[0].trim()}`,
      });

      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      console.error("Error sending jobs email:", err);
      toast({
        title: "Error",
        description: "Failed to send email. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            Email Job Summary ({selectedVisits.length} job{selectedVisits.length > 1 ? "s" : ""})
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Job preview */}
          <div className="rounded-lg bg-muted/50 p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Jobs to include:</p>
            {selectedVisits.map((v) => (
              <div key={v.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium truncate">{v.site?.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {format(new Date(v.visit_date + "T00:00:00"), "dd MMM yyyy")}
                  </span>
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {statusLabels[v.status || "scheduled"] || v.status}
                </Badge>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="bulk-email">Recipient Email(s) *</Label>
            <Input
              id="bulk-email"
              type="text"
              placeholder="customer@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">Separate multiple emails with commas</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bulk-customer-name">Customer Name</Label>
            <Input
              id="bulk-customer-name"
              placeholder="Contact name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bulk-message">Custom Message (optional)</Label>
            <Textarea
              id="bulk-message"
              placeholder="Add a personal message to the email..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || loading || !email.trim()}>
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send to Client
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
