import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, FileCheck, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { createAppointment } from "@/services/appointmentService";

interface AcceptQuotationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quotation: {
    id: string;
    quotation_number: string;
    site_id: string;
    customer_id: string | null;
    title: string | null;
    sites?: { name: string } | null;
  };
  onAccepted: () => void;
}

export function AcceptQuotationDialog({
  open,
  onOpenChange,
  quotation,
  onAccepted,
}: AcceptQuotationDialogProps) {
  const [poNumber, setPoNumber] = useState("");
  const [visitDate, setVisitDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [loading, setLoading] = useState(false);

  const handleAccept = async () => {
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // 1. Update quotation status and PO number
      const { error: updateError } = await supabase
        .from("quotations")
        .update({
          status: "accepted",
          po_number: poNumber || null,
        })
        .eq("id", quotation.id);

      if (updateError) throw updateError;

      // 2. Create remedial visit linked to the quotation
      const visitNotes = JSON.stringify({
        asset_type: "general",
        user_notes: `Remedial works from ${quotation.quotation_number}${poNumber ? ` (PO: ${poNumber})` : ""}`,
        quotation_number: quotation.quotation_number,
        po_number: poNumber || null,
      });

      const { data: visit, error: visitError } = await supabase
        .from("visits")
        .insert({
          site_id: quotation.site_id,
          visit_date: visitDate,
          visit_type: "remedial",
          status: "in_progress",
          engineer_id: user.id,
          quotation_id: quotation.id,
          notes: visitNotes,
        })
        .select("id")
        .single();

      if (visitError) throw visitError;

      // 3. Create appointment for the visit
      try {
        await createAppointment({
          visit_id: visit.id,
          site_id: quotation.site_id,
          customer_id: quotation.customer_id,
          engineer_id: user.id,
          title: `Remedial Works - ${quotation.sites?.name || "Site"}`,
          description: `${quotation.quotation_number}${poNumber ? ` | PO: ${poNumber}` : ""}`,
          appointment_date: visitDate,
          start_time: "09:00:00",
          end_time: "17:00:00",
          status: "scheduled",
          visit_type: "remedial",
        }, user.id);
      } catch (aptError) {
        console.error("Error creating appointment:", aptError);
      }

      toast.success("Quotation accepted and remedial visit created");
      onOpenChange(false);
      onAccepted();
    } catch (error) {
      console.error("Error accepting quotation:", error);
      toast.error("Failed to accept quotation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-primary" />
            Accept Quotation
          </DialogTitle>
          <DialogDescription>
            Accept {quotation.quotation_number} and create a remedial visit for{" "}
            {quotation.sites?.name || "the site"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="po-number">PO Number (optional)</Label>
            <Input
              id="po-number"
              placeholder="Enter customer PO number"
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              This will be added to the invoice reference and description.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="visit-date">Visit Date</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="visit-date"
                type="date"
                value={visitDate}
                onChange={(e) => setVisitDate(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAccept} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <FileCheck className="mr-2 h-4 w-4" />
                Accept & Create Visit
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
