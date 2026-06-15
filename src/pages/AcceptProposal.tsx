import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, CheckCircle2, FileCheck, Wrench, Building2, Calendar, PoundSterling, AlertCircle, Shield, XCircle, ThumbsDown } from "lucide-react";
import { TypedSignature } from "@/components/ui/typed-signature";
import { format } from "date-fns";

interface ProposalSummary {
  id: string;
  proposal_number: string;
  title: string | null;
  introduction: string | null;
  status: string;
  annual_fee: number | null;
  payment_terms: string | null;
  vat_rate: number | null;
  service_visits_per_year: number | null;
  ppm_interval_months: number | null;
  sla_tier: string | null;
  fault_response_hours: number | null;
  ooh_response_hours: number | null;
  valid_until: string | null;
  client_accepted_at: string | null;
  client_declined_at: string | null;
  customer: { name: string } | null;
  site: { name: string; address: string | null; city: string | null; postcode: string | null } | null;
}

// Customer-facing acceptance page for a maintenance proposal. Same
// shape as /accept-quote — one typed-signature field, optional PO,
// Accept + Decline. The proposal summary above the form gives the
// signer the headline terms so they're not signing blind.
export default function AcceptProposal() {
  const { token } = useParams<{ token: string }>();
  const [proposal, setProposal] = useState<ProposalSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [signature, setSignature] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [declineName, setDeclineName] = useState("");

  useEffect(() => {
    if (!token) {
      setError("Missing acceptance token");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const res = await fetch(
          `${supabaseUrl}/functions/v1/accept-maintenance-proposal?token=${encodeURIComponent(token)}`,
          { headers: { apikey: anonKey } },
        );
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error ?? "Proposal not found");
        } else {
          setProposal(data as ProposalSummary);
          if (data?.client_accepted_at) setAccepted(true);
          if (data?.client_declined_at) setDeclined(true);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load proposal");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function handleAccept() {
    if (!signature.trim()) {
      setError("Please type your name to sign");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/accept-maintenance-proposal`, {
        method: "POST",
        headers: { apikey: anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          action: "accept",
          accepted_by_name: signature.trim(),
          signature: `typed:${signature.trim()}`,
          po_number: poNumber.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Failed to accept");
        return;
      }
      setAccepted(true);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDecline() {
    if (!declineName.trim()) {
      setError("Please enter your name");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/accept-maintenance-proposal`, {
        method: "POST",
        headers: { apikey: anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          action: "decline",
          accepted_by_name: declineName.trim(),
          decline_reason: declineReason.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Failed to decline");
        return;
      }
      setDeclineOpen(false);
      setDeclined(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }
  if (error && !proposal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center space-y-2">
            <XCircle className="w-10 h-10 mx-auto text-destructive" />
            <p className="font-medium">Proposal not found</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <p className="text-xs text-muted-foreground">
              If you've received a link from BHO Fire that doesn't work, please contact{" "}
              <a href="mailto:admin@bhofire.com" className="text-primary hover:underline">admin@bhofire.com</a>.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!proposal) return null;

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <img src="/bho-fire-logo.png" alt="Logo" className="h-12 mx-auto mb-3" />
          <p className="text-xs text-muted-foreground">
            BHO Fire Ltd · Fire Alarm & Life Safety Systems
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Wrench className="w-5 h-5 text-primary" />
              Maintenance Proposal {proposal.proposal_number}
            </CardTitle>
            {proposal.title && <p className="text-sm text-muted-foreground">{proposal.title}</p>}
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              {proposal.customer?.name && (
                <div>
                  <p className="text-[10px] text-muted-foreground">Client</p>
                  <p className="font-medium">{proposal.customer.name}</p>
                </div>
              )}
              {proposal.site && (
                <div>
                  <p className="text-[10px] text-muted-foreground">Site</p>
                  <p className="font-medium">{proposal.site.name}</p>
                  {[proposal.site.address, proposal.site.city, proposal.site.postcode].filter(Boolean).length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {[proposal.site.address, proposal.site.city, proposal.site.postcode].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
              )}
            </div>
            {proposal.introduction && (
              <div className="pt-2 border-t">
                <p className="text-[10px] text-muted-foreground mb-1">About this proposal</p>
                <p className="whitespace-pre-wrap">{proposal.introduction}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t">
              {proposal.annual_fee != null && (
                <div>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <PoundSterling className="w-3 h-3" />Annual fee
                  </p>
                  <p className="font-semibold text-base">£{Number(proposal.annual_fee).toFixed(2)}</p>
                  {proposal.payment_terms && (
                    <p className="text-[10px] text-muted-foreground">{proposal.payment_terms}</p>
                  )}
                </div>
              )}
              {proposal.service_visits_per_year != null && (
                <div>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />Service visits
                  </p>
                  <p className="font-semibold">{proposal.service_visits_per_year}/year</p>
                  {proposal.ppm_interval_months != null && (
                    <p className="text-[10px] text-muted-foreground">Every {proposal.ppm_interval_months} months</p>
                  )}
                </div>
              )}
              {proposal.sla_tier && (
                <div>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Shield className="w-3 h-3" />SLA tier
                  </p>
                  <p className="font-semibold">{proposal.sla_tier}</p>
                  {proposal.fault_response_hours != null && (
                    <p className="text-[10px] text-muted-foreground">
                      Fault response: {proposal.fault_response_hours} hrs
                      {proposal.ooh_response_hours != null && ` (OOH: ${proposal.ooh_response_hours} hrs)`}
                    </p>
                  )}
                </div>
              )}
              {proposal.valid_until && (
                <div>
                  <p className="text-[10px] text-muted-foreground">Valid until</p>
                  <p className="font-semibold">{format(new Date(proposal.valid_until), "d MMM yyyy")}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {accepted ? (
          <Card>
            <CardContent className="p-6 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 mx-auto text-success" />
              <p className="font-medium">Thanks — your acceptance is recorded.</p>
              <p className="text-sm text-muted-foreground">
                BHO Fire Ltd will be in touch shortly to confirm scheduling.
              </p>
            </CardContent>
          </Card>
        ) : declined ? (
          <Card>
            <CardContent className="p-6 text-center space-y-2">
              <ThumbsDown className="w-10 h-10 mx-auto text-muted-foreground" />
              <p className="font-medium">Recorded as declined.</p>
              <p className="text-sm text-muted-foreground">
                If you'd like to revisit the terms, please contact{" "}
                <a href="mailto:admin@bhofire.com" className="text-primary hover:underline">admin@bhofire.com</a>.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-primary" />
                Acceptance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="po">Purchase Order Number (optional)</Label>
                <Input
                  id="po"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  placeholder="Enter PO number if applicable"
                  maxLength={100}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sig">Your Full Name (Digital Signature) *</Label>
                <TypedSignature
                  value={signature}
                  onChange={setSignature}
                  placeholder="Type your full name"
                />
                <p className="text-xs text-muted-foreground">
                  Typing your name here is your digital signature on this proposal.
                </p>
              </div>
              {error && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </p>
              )}
              <div className="flex flex-col-reverse sm:flex-row gap-2">
                <Button
                  variant="outline"
                  onClick={() => setDeclineOpen(true)}
                  disabled={submitting}
                  className="sm:w-auto"
                >
                  <ThumbsDown className="w-4 h-4 mr-2" />
                  Decline
                </Button>
                <Button
                  onClick={handleAccept}
                  disabled={submitting || !signature.trim()}
                  className="flex-1"
                  size="lg"
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting…</>
                  ) : (
                    <><CheckCircle2 className="w-4 h-4 mr-2" />Accept Proposal</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-3 text-center text-xs text-muted-foreground space-y-1">
            <p><Building2 className="w-3 h-3 inline mr-1" />BHO Fire Ltd · Company Reg No. 12235152</p>
            <p>
              <a href="mailto:admin@bhofire.com" className="text-primary hover:underline">admin@bhofire.com</a>
            </p>
          </CardContent>
        </Card>
      </div>

      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline this proposal</DialogTitle>
            <DialogDescription>
              Let us know what didn't work so we can revisit the terms. Optional.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Your name *</Label>
              <Input
                value={declineName}
                onChange={(e) => setDeclineName(e.target.value)}
                placeholder="Your full name"
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Reason (optional)</Label>
              <Textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="What didn't fit?"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={handleDecline} disabled={submitting || !declineName.trim()} variant="destructive">
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ThumbsDown className="w-4 h-4 mr-2" />}
              Decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
