import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignaturePad } from "@/components/ui/signature-pad";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, FileCheck, Building2, Calendar, PoundSterling, AlertCircle } from "lucide-react";
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

  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <CheckCircle2 className="w-16 h-16 text-primary mx-auto" />
            <h2 className="text-2xl font-bold">Quotation Accepted</h2>
            <p className="text-muted-foreground">
              Thank you for accepting {quotation?.quotation_number}. We will be in touch shortly to schedule the works.
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
                <SignaturePad
                  value={signature}
                  onChange={setSignature}
                  width={380}
                  height={140}
                  label="Sign to accept"
                />
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
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default AcceptQuote;
