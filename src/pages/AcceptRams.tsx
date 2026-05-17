import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignaturePad } from "@/components/ui/signature-pad";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, FileCheck, AlertCircle, HardHat } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface RamsSummary {
  id: string;
  rams_number: string;
  title: string;
  version: number;
  sent_at: string | null;
  accepted_at: string | null;
  accepted_by_name: string | null;
  site?: { name: string | null } | null;
}

const AcceptRams = () => {
  const { token } = useParams<{ token: string }>();
  const [rams, setRams] = useState<RamsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const [name, setName] = useState("");
  const [signature, setSignature] = useState("");

  useEffect(() => {
    if (token) fetchRams();
  }, [token]);

  const fetchRams = async () => {
    try {
      const { data, error: dbError } = await supabase
        .from("rams_documents")
        .select("id, rams_number, title, version, sent_at, accepted_at, accepted_by_name, site:sites(name)")
        .eq("acceptance_token", token!)
        .maybeSingle();

      if (dbError || !data) {
        setError("RAMS document not found or link is invalid.");
        return;
      }
      setRams(data as any);
      if (data.accepted_at) setAccepted(true);
    } catch (err) {
      console.error(err);
      setError("Failed to load document");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Please enter your full name");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const acceptedAt = new Date().toISOString();
      // If no drawn signature, the typed name + timestamp constitutes the
      // legally-binding digital signature (per UK Electronic Communications Act 2000).
      const typedSignatureRecord = signature
        ? signature
        : `TYPED:${name.trim()}|${acceptedAt}`;
      const { error: updErr } = await supabase
        .from("rams_documents")
        .update({
          status: "accepted",
          accepted_at: acceptedAt,
          accepted_by_name: name.trim(),
          acceptance_signature: typedSignatureRecord,
          client_name: name.trim(),
          client_signature: typedSignatureRecord,
          client_signed_at: acceptedAt,
        })
        .eq("acceptance_token", token!);
      if (updErr) throw updErr;
      setAccepted(true);
    } catch (err) {
      console.error(err);
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

  if (!rams && error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
            <h2 className="text-xl font-semibold">Document Not Found</h2>
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
            <h2 className="text-2xl font-bold">RAMS Acknowledged</h2>
            <p className="text-muted-foreground">
              Thank you for reviewing {rams?.rams_number}
              {rams?.accepted_by_name ? ` — recorded under ${rams.accepted_by_name}` : ""}.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center space-y-2">
          <HardHat className="w-10 h-10 mx-auto text-primary" />
          <h1 className="text-2xl font-bold">Acknowledge RAMS</h1>
          <p className="text-sm text-muted-foreground">
            Please review and sign to confirm receipt of this Risk Assessment & Method Statement.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>{rams!.rams_number}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-medium">{rams!.title}</p>
            {rams!.site?.name && <p className="text-muted-foreground">Site: {rams!.site.name}</p>}
            <p className="text-muted-foreground">Version {rams!.version}</p>
            {rams!.sent_at && (
              <p className="text-muted-foreground">
                Issued {format(new Date(rams!.sent_at), "dd MMM yyyy")}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-primary" />
              Acknowledgement
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rams-name">Your Full Name *</Label>
              <Input
                id="rams-name"
                placeholder="Enter your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label>Digital Signature (optional)</Label>
              <SignaturePad value={signature} onChange={setSignature} width={380} height={140} label="Sign to accept" />
              <p className="text-xs text-muted-foreground">
                Drawing a signature is optional. If left blank, your typed name above together with the date and time of submission will be recorded as your legally-binding digital signature.
              </p>
            </div>
            {error && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {error}
              </p>
            )}
            <Button className="w-full" size="lg" onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting...</>
              ) : (
                <><FileCheck className="mr-2 h-4 w-4" />Acknowledge RAMS</>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              By submitting, you confirm receipt and acknowledgement of this document. Your typed name and the submission timestamp constitute a legally-binding electronic signature under the UK Electronic Communications Act 2000.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AcceptRams;
