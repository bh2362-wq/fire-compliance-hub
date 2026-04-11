import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Visit } from "@/hooks/useVisits";
import { format } from "date-fns";

interface SendVisitConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visit: Visit;
  onSuccess?: () => void;
}

export function SendVisitConfirmationDialog({ open, onOpenChange, visit, onSuccess }: SendVisitConfirmationDialogProps) {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [email, setEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      loadCustomerData();
    }
  }, [open, visit.site_id]);

  const loadCustomerData = async () => {
    setLoading(true);
    try {
      const { data: site } = await supabase
        .from("sites")
        .select("customer_id, address, city, postcode, customers(name, contact_email, contact_name)")
        .eq("id", visit.site_id)
        .maybeSingle();

      const customer = site?.customers as any;
      if (customer) {
        setEmail(customer.contact_email || "");
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
      // Generate acceptance token if not already set
      let token = null;
      
      const { data: existingVisit } = await supabase
        .from("visits")
        .select("acceptance_token")
        .eq("id", visit.id)
        .single();

      if (existingVisit?.acceptance_token) {
        token = existingVisit.acceptance_token;
      } else {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        token = Array.from(array, b => b.toString(16).padStart(2, "0")).join("");

        const { error: tokenError } = await supabase
          .from("visits")
          .update({ acceptance_token: token })
          .eq("id", visit.id);

        if (tokenError) throw tokenError;
      }

      const baseUrl = window.location.origin;
      const acceptUrl = `${baseUrl}/accept-visit/${token}`;

      // Get site address
      const { data: siteData } = await supabase
        .from("sites")
        .select("address, city, postcode")
        .eq("id", visit.site_id)
        .maybeSingle();

      const siteAddress = [siteData?.address, siteData?.city, siteData?.postcode].filter(Boolean).join(", ");

      // Extract user-readable job notes
      let jobNotes = "";
      try {
        const parsed = JSON.parse(visit.notes || "{}");
        jobNotes = parsed.user_notes || "";
      } catch {
        jobNotes = visit.notes || "";
      }

      const { error } = await supabase.functions.invoke("send-notification", {
        body: {
          type: "visit_confirmation",
          customerEmail: email.trim(),
          customerName: customerName || "Customer",
          siteName: visit.site?.name || "Site",
          siteAddress,
          appointmentDate: visit.visit_date,
          appointmentTime: (visit as any).appointment_time || "TBC",
          visitType: visit.visit_type,
          acceptUrl,
          jobNotes: jobNotes || undefined,
        },
      });

      if (error) throw error;

      toast({
        title: "Confirmation sent",
        description: `Appointment confirmation email sent to ${email}`,
      });

      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      console.error("Error sending confirmation:", err);
      toast({
        title: "Error",
        description: "Failed to send confirmation email. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            Send Appointment Confirmation
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
            <p><strong>Site:</strong> {visit.site?.name || "—"}</p>
            <p><strong>Date:</strong> {format(new Date(visit.visit_date + "T00:00:00"), "dd MMM yyyy")}</p>
            <p><strong>Type:</strong> {visit.visit_type?.replace(/_/g, " ") || "—"}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-email">Customer Email *</Label>
            <Input
              id="confirm-email"
              type="email"
              placeholder="customer@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-customer-name">Customer Name</Label>
            <Input
              id="confirm-customer-name"
              placeholder="Contact name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              disabled={loading}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            The customer will receive an email with a link to confirm the appointment date and provide a PO number if applicable. This serves as a job acceptance document for audit purposes.
          </p>
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
                Send Confirmation
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
