import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SignaturePad } from "@/components/ui/signature-pad";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, CheckCircle2, FileCheck, Building2, Calendar, PoundSterling, AlertCircle, FileText, Shield, XCircle, ThumbsDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface QuotationSummary {
  quotation_number: string;
  title: string | null;
  total_amount: number;
  valid_until: string | null;
  created_at: string;
  status: string;
  client_accepted_at: string | null;
  site_name: string | null;
  customer_name: string | null;
  pdf_url: string | null;
}

const AcceptQuote = () => {
  const { token } = useParams<{ token: string }>();
  const [quotation, setQuotation] = useState<QuotationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const [name, setName] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [signature, setSignature] = useState("");
  // Decline flow — separate from accept so customers who can't or
  // won't accept aren't forced to go silent. They can give an
  // optional reason which lands in BHO's inbox for follow-up.
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineName, setDeclineName] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  const [declining, setDeclining] = useState(false);
  const [declined, setDeclined] = useState(false);
  // Signature pad width adapts to the container so the canvas doesn't
  // overflow on narrow phones (iPhone SE = 375px). Re-measured on
  // mount + resize. Fixed 380px broke ~30% of mobile users.
  const sigContainerRef = useRef<HTMLDivElement | null>(null);
  const [sigWidth, setSigWidth] = useState(380);
  useEffect(() => {
    const measure = () => {
      const w = sigContainerRef.current?.clientWidth;
      if (w && w > 0) setSigWidth(Math.min(w, 600));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [quotation]);

  useEffect(() => {
    if (token) fetchQuotation();
  }, [token]);

  const fetchQuotation = async () => {
    try {
      const { data, error: fnError } = await supabase.functions.invoke("accept-quotation", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        body: undefined,
      });

      // Functions.invoke doesn't support query params easily, use fetch directly
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const res = await fetch(`${supabaseUrl}/functions/v1/accept-quotation?token=${encodeURIComponent(token!)}`, {
        headers: {
          "apikey": anonKey,
          "Content-Type": "application/json",
        },
      });

      const result = await res.json();
      if (!res.ok) {
        setError(result.error || "Quotation not found");
        return;
      }

      setQuotation(result);

      if (result.client_accepted_at || result.status === "accepted" || result.status === "customer_accepted") {
        setAccepted(true);
      }
    } catch (err) {
      console.error("Error fetching quotation:", err);
      setError("Failed to load quotation");
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!declineName.trim()) {
      setError("Please enter your name");
      return;
    }
    setDeclining(true);
    setError(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/accept-quotation`, {
        method: "POST",
        headers: { "apikey": anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          action: "decline",
          declined_by_name: declineName.trim(),
          decline_reason: declineReason.trim() || null,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || "Failed to record decline");
        return;
      }
      setDeclineOpen(false);
      setDeclined(true);
    } catch (err) {
      console.error("Decline failed:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setDeclining(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }
    if (!signature) {
      setError("Please provide your digital signature");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const res = await fetch(`${supabaseUrl}/functions/v1/accept-quotation`, {
        method: "POST",
        headers: {
          "apikey": anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          accepted_by_name: name.trim(),
          po_number: poNumber.trim() || null,
          signature,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        setError(result.error || "Failed to accept quotation");
        return;
      }

      setAccepted(true);
    } catch (err) {
      console.error("Error accepting quotation:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!quotation && error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
            <h2 className="text-xl font-semibold">Quotation Not Found</h2>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (declined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <XCircle className="w-16 h-16 text-muted-foreground mx-auto" />
            <h2 className="text-2xl font-bold">Quotation Declined</h2>
            <p className="text-muted-foreground">
              Thanks for letting us know. We've recorded your response and someone from our team may be in touch to see if there's anything we can do.
            </p>
            <p className="text-xs text-muted-foreground pt-2">
              Questions? Email{" "}
              <a href="mailto:admin@bhofire.com" className="text-primary hover:underline">admin@bhofire.com</a>
              {" "}or call{" "}
              <a href="tel:+443300438659" className="text-primary hover:underline">0330 043 8659</a>.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <CheckCircle2 className="w-16 h-16 text-primary mx-auto" />
            <h2 className="text-2xl font-bold">Quotation Accepted</h2>
            <p className="text-muted-foreground">
              Thank you for accepting {quotation?.quotation_number}. We'll be in touch within one working day to schedule the works.
            </p>
            {quotation?.pdf_url && (
              <Button variant="outline" size="lg" className="w-full" asChild>
                <a href={quotation.pdf_url} target="_blank" rel="noopener noreferrer">
                  <FileText className="w-4 h-4 mr-2" />
                  Download your copy
                </a>
              </Button>
            )}
            <p className="text-xs text-muted-foreground pt-2">
              Questions? Email{" "}
              <a href="mailto:admin@bhofire.com" className="text-primary hover:underline">admin@bhofire.com</a>
              {" "}or call{" "}
              <a href="tel:+443300438659" className="text-primary hover:underline">0330 043 8659</a>.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isExpired = quotation?.valid_until && new Date(quotation.valid_until) < new Date();

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <img src="/bho-fire-logo.png" alt="Logo" className="h-12 mx-auto" />
          <h1 className="text-2xl font-bold">Accept Quotation</h1>
        </div>

        {/* Quote Summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <span>{quotation!.quotation_number}</span>
              {isExpired && <Badge variant="destructive">Expired</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {quotation!.title && (
              <p className="text-sm font-medium">{quotation!.title}</p>
            )}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {quotation!.customer_name && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="w-4 h-4" />
                  {quotation!.customer_name}
                </div>
              )}
              {quotation!.site_name && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="w-4 h-4" />
                  {quotation!.site_name}
                </div>
              )}
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="w-4 h-4" />
                {format(new Date(quotation!.created_at), "dd MMM yyyy")}
              </div>
              {quotation!.valid_until && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  Valid until {format(new Date(quotation!.valid_until), "dd MMM yyyy")}
                </div>
              )}
            </div>
            <div className="pt-2 border-t">
              <div className="flex items-center gap-2 text-xl font-bold">
                <PoundSterling className="w-5 h-5" />
                {quotation!.total_amount.toFixed(2)}
                <span className="text-sm font-normal text-muted-foreground">+ VAT</span>
              </div>
            </div>
            {/* Customer needs to see what they're accepting. The summary
                card only shows the total — for the scope of works and
                line items they need the rendered PDF. */}
            {quotation!.pdf_url && (
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                asChild
              >
                <a href={quotation!.pdf_url} target="_blank" rel="noopener noreferrer">
                  <FileText className="w-4 h-4 mr-2" />
                  View quotation PDF
                </a>
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Acceptance Form */}
        {isExpired ? (
          <Card>
            <CardContent className="pt-6 text-center space-y-2">
              <AlertCircle className="w-8 h-8 text-warning mx-auto" />
              <p className="font-medium">This quotation has expired</p>
              <p className="text-sm text-muted-foreground">
                Please contact us for an updated quotation.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-primary" />
                Acceptance Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="accept-name">Your Full Name *</Label>
                <Input
                  id="accept-name"
                  placeholder="Enter your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={200}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="accept-po">Purchase Order Number (optional)</Label>
                <Input
                  id="accept-po"
                  placeholder="Enter PO number if applicable"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  maxLength={100}
                />
              </div>

              <div className="space-y-2">
                <Label>Digital Signature *</Label>
                <div ref={sigContainerRef} className="w-full">
                  <SignaturePad
                    value={signature}
                    onChange={setSignature}
                    width={sigWidth}
                    height={140}
                    label="Sign to accept"
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </p>
              )}

              <Button
                className="w-full"
                size="lg"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <FileCheck className="mr-2 h-4 w-4" />
                    Accept Quotation
                  </>
                )}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                By signing above, you agree to the terms and conditions of this quotation
                and authorise the works to proceed.
              </p>

              {/* Decline option — secondary, plain text to keep the
                  accept path visually dominant but giving the customer
                  a way to say no without going silent. */}
              <div className="pt-3 border-t text-center">
                <button
                  type="button"
                  onClick={() => {
                    setDeclineName(name);
                    setError(null);
                    setDeclineOpen(true);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                >
                  Not going ahead? Decline this quote
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Decline confirmation dialog */}
        <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ThumbsDown className="w-4 h-4 text-muted-foreground" />
                Decline quotation
              </DialogTitle>
              <DialogDescription>
                Let us know you don't want to proceed. We'll mark the quote as
                declined and a member of our team may reach out if there's anything
                we can do.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="decline-name">Your name *</Label>
                <Input
                  id="decline-name"
                  value={declineName}
                  onChange={(e) => setDeclineName(e.target.value)}
                  placeholder="Enter your full name"
                  maxLength={200}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="decline-reason">Reason (optional)</Label>
                <Textarea
                  id="decline-reason"
                  rows={3}
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="e.g. price, timing, going with another supplier…"
                  maxLength={2000}
                />
              </div>
              {error && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </p>
              )}
            </div>
            <DialogFooter className="flex-row gap-2 sm:gap-2">
              <Button
                variant="outline"
                onClick={() => setDeclineOpen(false)}
                disabled={declining}
                className="flex-1 sm:flex-initial"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDecline}
                disabled={declining}
                className="flex-1 sm:flex-initial gap-1.5"
              >
                {declining ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ThumbsDown className="w-4 h-4" />
                )}
                Decline quote
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Trust footer — reassures the customer this is the real BHO
            portal and gives them company credentials at a glance.
            Helps reduce "is this a scam?" hesitation, especially on
            mobile where the URL bar is small. */}
        <div className="text-center text-xs text-muted-foreground space-y-1 pt-4">
          <div className="flex items-center justify-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            <span>BHO Fire Ltd · Company Reg No. 12235152</span>
          </div>
          <p>St Georges Business Park, Castle Rd, Sittingbourne ME10 3TB</p>
          <p>
            Questions about this quote? Email{" "}
            <a href="mailto:admin@bhofire.com" className="text-primary hover:underline">
              admin@bhofire.com
            </a>{" "}
            or call <a href="tel:+443300438659" className="text-primary hover:underline">0330 043 8659</a>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AcceptQuote;
