import { useState, useEffect } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, FileCheck, Calendar, Clock, User } from "lucide-react";
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

interface Engineer {
  user_id: string;
  full_name: string | null;
}

export function AcceptQuotationDialog({
  open,
  onOpenChange,
  quotation,
  onAccepted,
}: AcceptQuotationDialogProps) {
  const [poNumber, setPoNumber] = useState("");
  const [visitDate, setVisitDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [selectedEngineer, setSelectedEngineer] = useState<string>("");
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchEngineers();
    }
  }, [open]);

  const fetchEngineers = async () => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .order("full_name");
      
      if (data) {
        setEngineers(data);
        // Auto-select current user
        const { data: { user } } = await supabase.auth.getUser();
        if (user) setSelectedEngineer(user.id);
      }
    } catch (err) {
      console.error("Error fetching engineers:", err);
    }
  };

  const handleAccept = async () => {
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const engineerId = selectedEngineer || user.id;

      // 1. Update quotation status and PO number
      const { error: updateError } = await supabase
        .from("quotations")
        .update({
          status: "accepted",
          po_number: poNumber || null,
        })
        .eq("id", quotation.id);

      if (updateError) throw updateError;

      // 2. Fetch quotation details + line items to populate the works description
      const { data: quoteFull } = await supabase
        .from("quotations")
        .select("title, summary, total_amount, quotation_line_items(item_name, description, quantity, sort_order)")
        .eq("id", quotation.id)
        .single();

      const lineItems = (quoteFull?.quotation_line_items || [])
        .slice()
        .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

      const worksLines: string[] = [];
      worksLines.push(`Remedial works from quotation ${quotation.quotation_number}`);
      if (poNumber) worksLines.push(`Customer PO: ${poNumber}`);
      if (quoteFull?.title) worksLines.push(`Title: ${quoteFull.title}`);
      if (quoteFull?.summary) worksLines.push(`\nSummary:\n${quoteFull.summary}`);
      if (lineItems.length > 0) {
        worksLines.push(`\nScope of works:`);
        lineItems.forEach((li: any, idx: number) => {
          const name = li.item_name || li.description || "Item";
          const qty = li.quantity && li.quantity !== 1 ? ` (x${li.quantity})` : "";
          worksLines.push(`${idx + 1}. ${name}${qty}`);
          if (li.item_name && li.description && li.description !== li.item_name) {
            worksLines.push(`   ${li.description}`);
          }
        });
      }
      if (quoteFull?.total_amount != null) {
        worksLines.push(`\nQuoted total: £${Number(quoteFull.total_amount).toFixed(2)}`);
      }

      const visitNotes = JSON.stringify({
        asset_type: "general",
        user_notes: worksLines.join("\n"),
        quotation_number: quotation.quotation_number,
        po_number: poNumber || null,
      });

      const { data: visit, error: visitError } = await supabase
        .from("service_visits")
        .insert({
          site_id: quotation.site_id,
          visit_date: visitDate,
          visit_type: "remedial",
          status: "in_progress",
          engineer_id: engineerId,
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
          engineer_id: engineerId,
          title: `Remedial Works - ${quotation.sites?.name || "Site"}`,
          description: `${quotation.quotation_number}${poNumber ? ` | PO: ${poNumber}` : ""}`,
          appointment_date: visitDate,
          start_time: `${startTime}:00`,
          end_time: `${endTime}:00`,
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
            Accept {quotation.quotation_number} and schedule remedial works for{" "}
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
            <Label htmlFor="engineer">Assign Engineer</Label>
            <Select value={selectedEngineer} onValueChange={setSelectedEngineer}>
              <SelectTrigger>
                <User className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Select engineer" />
              </SelectTrigger>
              <SelectContent>
                {engineers.map((eng) => (
                  <SelectItem key={eng.user_id} value={eng.user_id}>
                    {eng.full_name || "Unnamed"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="visit-date">Appointment Date</Label>
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start-time">Start Time</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="start-time"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-time">End Time</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="end-time"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="pl-10"
                />
              </div>
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
                Accept & Schedule
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
