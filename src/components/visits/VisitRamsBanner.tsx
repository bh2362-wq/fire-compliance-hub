import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HardHat, Mail, Send, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import type { RamsDocument } from "@/services/ramsService";
import { EmailRamsDialog } from "@/components/rams/EmailRamsDialog";

interface VisitRamsBannerProps {
  visitId: string;
}

export function VisitRamsBanner({ visitId }: VisitRamsBannerProps) {
  const [emailDoc, setEmailDoc] = useState<RamsDocument | null>(null);

  const { data: rams, refetch } = useQuery({
    queryKey: ["visit-rams", visitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rams_documents")
        .select(`*, site:sites(id, name, address, customer_id, customers(name))`)
        .eq("visit_id", visitId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as RamsDocument | null;
    },
  });

  if (!rams) return null;

  const markPrepared = async () => {
    const { error } = await supabase
      .from("rams_documents")
      .update({ status: "prepared" })
      .eq("id", rams.id);
    if (error) {
      toast.error("Failed to update RAMS status");
      return;
    }
    toast.success("RAMS marked as prepared");
    refetch();
  };

  const statusBadge = () => {
    switch (rams.status) {
      case "draft":
        return (
          <Badge variant="outline" className="bg-muted text-muted-foreground">
            <AlertTriangle className="w-3 h-3 mr-1" /> Draft — needs review
          </Badge>
        );
      case "prepared":
        return (
          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
            <Send className="w-3 h-3 mr-1" /> Prepared — ready to send
          </Badge>
        );
      case "sent":
        return (
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Sent to client
          </Badge>
        );
      case "accepted":
        return (
          <Badge variant="outline" className="bg-success/10 text-success border-success/20">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Accepted
          </Badge>
        );
      default:
        return <Badge variant="outline">{rams.status}</Badge>;
    }
  };

  return (
    <>
      <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <HardHat className="w-4 h-4 text-warning flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                RAMS {rams.rams_number}
              </p>
              <p className="text-xs text-muted-foreground truncate">{rams.title}</p>
            </div>
          </div>
          {statusBadge()}
        </div>

        {(rams.sent_at || rams.accepted_at) && (
          <div className="text-xs text-muted-foreground space-y-0.5">
            {rams.sent_at && (
              <div>
                Sent {format(new Date(rams.sent_at), "dd MMM yyyy HH:mm")}
                {rams.sent_to && rams.sent_to.length > 0 && ` to ${rams.sent_to.join(", ")}`}
              </div>
            )}
            {rams.accepted_at && (
              <div className="text-success">
                Accepted by {rams.accepted_by_name} on{" "}
                {format(new Date(rams.accepted_at), "dd MMM yyyy HH:mm")}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {rams.status === "draft" && (
            <Button size="sm" variant="outline" onClick={markPrepared}>
              <Send className="w-3.5 h-3.5 mr-1" /> Mark Prepared
            </Button>
          )}
          <Button size="sm" variant="default" onClick={() => setEmailDoc(rams)}>
            <Mail className="w-3.5 h-3.5 mr-1" />
            {rams.status === "sent" ? "Resend to Client" : "Email Client"}
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link to="/qms/rams">
              Review RAMS <ExternalLink className="w-3 h-3 ml-1" />
            </Link>
          </Button>
        </div>
      </div>

      {emailDoc && (
        <EmailRamsDialog
          open={!!emailDoc}
          onOpenChange={(open) => {
            if (!open) {
              setEmailDoc(null);
              refetch();
            }
          }}
          document={emailDoc}
        />
      )}
    </>
  );
}
