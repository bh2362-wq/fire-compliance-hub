import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { SignaturePad } from "@/components/ui/signature-pad";
import { CheckCircle, Clock, FileCheck, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import {
  getRamsAcknowledgements,
  acknowledgeRams,
  RamsAcknowledgement,
} from "@/services/ramsActivityService";
import { supabase } from "@/integrations/supabase/client";

interface RamsEngineerBriefingProps {
  ramsDocumentId: string;
  ramsTitle: string;
  ramsNumber: string;
}

export function RamsEngineerBriefing({ ramsDocumentId, ramsTitle, ramsNumber }: RamsEngineerBriefingProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [signOffOpen, setSignOffOpen] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const { data: acknowledgements = [] } = useQuery({
    queryKey: ["rams-acknowledgements", ramsDocumentId],
    queryFn: () => getRamsAcknowledgements(ramsDocumentId),
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-for-acks"],
    queryFn: async () => {
      const ids = acknowledgements.map((a) => a.engineer_id);
      if (ids.length === 0) return [];
      const { data } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", ids);
      return data || [];
    },
    enabled: acknowledgements.length > 0,
  });

  const ackMutation = useMutation({
    mutationFn: () => acknowledgeRams(ramsDocumentId, user!.id, signature || undefined, notes || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rams-acknowledgements", ramsDocumentId] });
      toast.success("RAMS acknowledged - you have confirmed you have read and understood this document");
      setSignOffOpen(false);
      setSignature(null);
      setNotes("");
    },
    onError: () => toast.error("Failed to acknowledge"),
  });

  const currentUserAcknowledged = acknowledgements.some((a) => a.engineer_id === user?.id);

  const getEngineerName = (engineerId: string) => {
    const profile = profiles.find((p: any) => p.user_id === engineerId);
    return profile?.full_name || profile?.email || "Unknown";
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-primary" />
            Engineer Briefing
          </CardTitle>
          <Badge variant={currentUserAcknowledged ? "default" : "destructive"} className="text-xs">
            {currentUserAcknowledged ? (
              <><CheckCircle className="w-3 h-3 mr-1" /> Acknowledged</>
            ) : (
              <><Clock className="w-3 h-3 mr-1" /> Not Acknowledged</>
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!currentUserAcknowledged && (
          <Button className="w-full" onClick={() => setSignOffOpen(true)}>
            <FileCheck className="w-4 h-4 mr-2" />
            I have read and understood {ramsNumber}
          </Button>
        )}

        {acknowledgements.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Acknowledged by:</p>
            {acknowledgements.map((ack) => (
              <div key={ack.id} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/50">
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="w-3 h-3 text-green-600" />
                  <span className="font-medium">{getEngineerName(ack.engineer_id)}</span>
                </div>
                <span className="text-muted-foreground">
                  {format(new Date(ack.acknowledged_at), "dd/MM/yyyy HH:mm")}
                </span>
              </div>
            ))}
          </div>
        )}

        <Dialog open={signOffOpen} onOpenChange={setSignOffOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Acknowledge RAMS</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                By signing below, you confirm that you have read, understood, and will comply with RAMS document <strong>{ramsNumber}</strong>: <strong>{ramsTitle}</strong>.
              </p>
              <div className="space-y-2">
                <Label>Signature *</Label>
                <SignaturePad value={signature} onChange={setSignature} />
              </div>
              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes or queries..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSignOffOpen(false)}>Cancel</Button>
              <Button onClick={() => ackMutation.mutate()} disabled={!signature || ackMutation.isPending}>
                Confirm & Sign
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
