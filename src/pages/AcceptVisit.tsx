import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, FileCheck, Building2, Calendar, MapPin, AlertCircle, Wrench } from "lucide-react";
import { format } from "date-fns";

interface VisitSummary {
  visit_date: string;
  visit_type: string;
  status: string;
  client_accepted_at: string | null;
  accepted_by_name: string | null;
  client_po_number: string | null;
  site_name: string | null;
  site_address: string | null;
  customer_name: string | null;
}

const visitTypeLabels: Record<string, string> = {
  quarterly_service: "Quarterly Service",
  biannual_service: "Biannual Service",
  annual_inspection: "Annual Inspection",
  emergency: "Emergency Call-Out",
  remedial: "Remedial Works",
  supply_only: "Supply Only",
};

const AcceptVisit = () => {
  const { token } = useParams<{ token: string }>();
  const [visit, setVisit] = useState<VisitSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const [name, setName] = useState("");
  const [poNumber, setPoNumber] = useState("");

  useEffect(() => {
    if (token) fetchVisit();
  }, [token]);

  const fetchVisit = async () => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const res = await fetch(`${supabaseUrl}/functions/v1/accept-visit?token=${encodeURIComponent(token!)}`, {
        headers: {
          "apikey": anonKey,
          "Content-Type": "application/json",
        },
      });

      const result = await res.json();
      if (!res.ok) {
        setError(result.error || "Visit not found");
        return;
      }

      setVisit(result);

      if (result.client_accepted_at) {
        setAccepted(true);
      }
    } catch (err) {
      console.error("Error fetching visit:", err);
      setError("Failed to load visit details");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const res = await fetch(`${supabaseUrl}/functions/v1/accept-visit`, {
        method: "POST",
        headers: {
          "apikey": anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          accepted_by_name: name.trim(),
          po_number: poNumber.trim() || null,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        setError(result.error || "Failed to confirm visit");
        return;
      }

      setAccepted(true);
    } catch (err) {
      console.error("Error confirming visit:", err);
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

  if (!visit && error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
            <h2 className="text-xl font-semibold">Visit Not Found</h2>
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
            <h2 className="text-2xl font-bold">Visit Confirmed</h2>
            <p className="text-muted-foreground">
              Thank you for confirming your appointment at {visit?.site_name} on{" "}
              {visit?.visit_date && format(new Date(visit.visit_date + "T00:00:00"), "dd MMMM yyyy")}.
              We look forward to seeing you.
            </p>
            {visit?.client_po_number && (
              <p className="text-sm text-muted-foreground">
                PO Number: <span className="font-medium">{visit.client_po_number}</span>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const visitTypeLabel = visit?.visit_type
    ? visitTypeLabels[visit.visit_type] || visit.visit_type.replace(/_/g, " ")
    : "Service Visit";

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <img src="/bho-fire-logo.png" alt="Logo" className="h-12 mx-auto" />
          <h1 className="text-2xl font-bold">Confirm Appointment</h1>
        </div>

        {/* Visit Summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Appointment Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-3 text-sm">
              {visit!.customer_name && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="w-4 h-4 shrink-0" />
                  <span>{visit!.customer_name}</span>
                </div>
              )}
              {visit!.site_name && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="w-4 h-4 shrink-0" />
                  <span>{visit!.site_name}</span>
                </div>
              )}
              {visit!.site_address && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="w-4 h-4 shrink-0" />
                  <span>{visit!.site_address}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="w-4 h-4 shrink-0" />
                <span className="font-medium text-foreground">
                  {format(new Date(visit!.visit_date + "T00:00:00"), "EEEE, dd MMMM yyyy")}
                </span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Wrench className="w-4 h-4 shrink-0" />
                <span>{visitTypeLabel}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Confirmation Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-primary" />
              Confirm Appointment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="confirm-name">Your Full Name *</Label>
              <Input
                id="confirm-name"
                placeholder="Enter your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-po">Purchase Order Number (optional)</Label>
              <Input
                id="confirm-po"
                placeholder="Enter PO number if applicable"
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                maxLength={100}
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
                  Confirming...
                </>
              ) : (
                <>
                  <FileCheck className="mr-2 h-4 w-4" />
                  Confirm Appointment
                </>
              )}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              By confirming, you acknowledge the scheduled date and agree to provide site access for our engineer.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AcceptVisit;
