import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, FileSpreadsheet, ClipboardList, Sparkles, AlertCircle, CheckCircle2, Building2, User, MapPin, Phone, AtSign, ListPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { EmailScannerQuoteFlow } from "@/components/email-scanner/EmailScannerQuoteFlow";
import { EmailScannerVisitFlow } from "@/components/email-scanner/EmailScannerVisitFlow";
import { EmailScannerBulkVisitFlow } from "@/components/email-scanner/EmailScannerBulkVisitFlow";
export interface ExtractedEmailData {
  sender_name?: string | null;
  sender_email?: string | null;
  company_name?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  site_name?: string | null;
  site_address?: string | null;
  site_city?: string | null;
  site_postcode?: string | null;
  // Visit fields
  visit_type?: string | null;
  urgency?: string | null;
  preferred_date?: string | null;
  description?: string | null;
  notes?: string | null;
  client_po_number?: string | null;
  // Quote fields
  scope_summary?: string | null;
  job_requirements?: Array<{ description: string; estimated_quantity?: number; unit?: string }>;
  special_requirements?: string | null;
  rams_considerations?: string | null;
}

const EmailScanner = () => {
  const [emailContent, setEmailContent] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanMode, setScanMode] = useState<"quote" | "visit" | "bulk_visits" | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedEmailData | null>(null);
  const [bulkData, setBulkData] = useState<any>(null);
  const [activeFlow, setActiveFlow] = useState<"quote" | "visit" | "bulk_visits" | null>(null);
  const { toast } = useToast();

  const handleScan = async (mode: "quote" | "visit" | "bulk_visits") => {
    if (!emailContent.trim()) {
      toast({ title: "No email content", description: "Please paste an email to scan.", variant: "destructive" });
      return;
    }

    setScanning(true);
    setScanMode(mode);
    setExtractedData(null);
    setBulkData(null);
    setActiveFlow(null);

    try {
      const { data, error } = await supabase.functions.invoke("scan-email", {
        body: { emailContent: emailContent.trim(), mode },
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        if (mode === "bulk_visits") {
          setBulkData(data.data);
          setActiveFlow("bulk_visits");
          toast({ title: "Email scanned", description: `Found ${data.data.visits?.length || 0} visits.` });
        } else {
          setExtractedData(data.data);
          toast({ title: "Email scanned successfully", description: "Review the extracted data below." });
        }
      } else {
        throw new Error(data?.error || "Failed to extract data");
      }
    } catch (err: any) {
      console.error("Scan error:", err);
      toast({ title: "Scan failed", description: err.message || "Could not process the email.", variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  const handleReset = () => {
    setExtractedData(null);
    setBulkData(null);
    setActiveFlow(null);
    setScanMode(null);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-accent" />
            Email Scanner
          </h2>
          <p className="text-muted-foreground">Paste an email to extract job details and create a quote or visit</p>
        </div>

        {/* Active flow takes over */}
        {activeFlow === "quote" && extractedData && (
          <EmailScannerQuoteFlow data={extractedData} onBack={handleReset} />
        )}
        {activeFlow === "visit" && extractedData && (
          <EmailScannerVisitFlow data={extractedData} onBack={handleReset} />
        )}
        {activeFlow === "bulk_visits" && bulkData && (
          <EmailScannerBulkVisitFlow data={bulkData} onBack={handleReset} />
        )}

        {/* Main scanner UI (hidden when in a flow) */}
        {!activeFlow && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Email input */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="w-5 h-5" />
                  Email Content
                </CardTitle>
                <CardDescription>Paste the full email including headers, sender info and body</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={emailContent}
                  onChange={(e) => setEmailContent(e.target.value)}
                  placeholder={`From: john.smith@acmecorp.co.uk\nSubject: Fire Alarm Service Required - Manchester Office\n\nHi,\n\nWe need a quarterly fire alarm service at our Manchester office...\n\nRegards,\nJohn Smith\nFacilities Manager\nAcme Corp\n0161 234 5678`}
                  className="min-h-[350px] font-mono text-sm"
                />
                <div className="flex gap-3">
                  <Button
                    onClick={() => handleScan("quote")}
                    disabled={scanning || !emailContent.trim()}
                    variant="hero"
                    className="flex-1"
                  >
                    {scanning && scanMode === "quote" ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="w-4 h-4 mr-2" />
                    )}
                    Scan for Quote
                  </Button>
                  <Button
                    onClick={() => handleScan("visit")}
                    disabled={scanning || !emailContent.trim()}
                    variant="default"
                    className="flex-1"
                  >
                    {scanning && scanMode === "visit" ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <ClipboardList className="w-4 h-4 mr-2" />
                    )}
                    Scan for Visit
                  </Button>
                  <Button
                    onClick={() => handleScan("bulk_visits")}
                    disabled={scanning || !emailContent.trim()}
                    variant="outline"
                    className="flex-1"
                  >
                    {scanning && scanMode === "bulk_visits" ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <ListPlus className="w-4 h-4 mr-2" />
                    )}
                    Scan Bulk Visits
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Right: Extracted data */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  Extracted Data
                </CardTitle>
                <CardDescription>
                  {extractedData ? "Review the AI-extracted information" : "Scan an email to see results here"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {scanning && (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Loader2 className="w-8 h-8 animate-spin mb-3" />
                    <p className="text-sm">Analysing email with AI...</p>
                  </div>
                )}

                {!scanning && !extractedData && (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Mail className="w-12 h-12 mb-3 opacity-30" />
                    <p className="text-sm">No data extracted yet</p>
                  </div>
                )}

                {!scanning && extractedData && (
                  <div className="space-y-4">
                    {/* Contact info */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Contact</h4>
                      <div className="grid grid-cols-1 gap-2">
                        {extractedData.company_name && (
                          <div className="flex items-center gap-2 text-sm">
                            <Building2 className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{extractedData.company_name}</span>
                          </div>
                        )}
                        {(extractedData.contact_name || extractedData.sender_name) && (
                          <div className="flex items-center gap-2 text-sm">
                            <User className="w-4 h-4 text-muted-foreground" />
                            <span>{extractedData.contact_name || extractedData.sender_name}</span>
                          </div>
                        )}
                        {(extractedData.contact_email || extractedData.sender_email) && (
                          <div className="flex items-center gap-2 text-sm">
                            <AtSign className="w-4 h-4 text-muted-foreground" />
                            <span>{extractedData.contact_email || extractedData.sender_email}</span>
                          </div>
                        )}
                        {extractedData.contact_phone && (
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="w-4 h-4 text-muted-foreground" />
                            <span>{extractedData.contact_phone}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Site info */}
                    {(extractedData.site_name || extractedData.site_address) && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Site</h4>
                        <div className="flex items-start gap-2 text-sm">
                          <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                          <div>
                            {extractedData.site_name && <p className="font-medium">{extractedData.site_name}</p>}
                            {extractedData.site_address && <p>{extractedData.site_address}</p>}
                            {extractedData.site_city && <p>{extractedData.site_city}</p>}
                            {extractedData.site_postcode && <p>{extractedData.site_postcode}</p>}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Job details */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Job Details</h4>
                      {extractedData.urgency && (
                        <Badge variant={extractedData.urgency === "high" ? "destructive" : extractedData.urgency === "medium" ? "default" : "secondary"}>
                          {extractedData.urgency} priority
                        </Badge>
                      )}
                      {extractedData.description && <p className="text-sm">{extractedData.description}</p>}
                      {extractedData.scope_summary && <p className="text-sm">{extractedData.scope_summary}</p>}
                      {extractedData.visit_type && (
                        <p className="text-sm"><span className="font-medium">Visit type:</span> {extractedData.visit_type.replace(/_/g, ' ')}</p>
                      )}
                      {extractedData.preferred_date && (
                        <p className="text-sm"><span className="font-medium">Preferred date:</span> {extractedData.preferred_date}</p>
                      )}
                    </div>

                    {/* Requirements (quote mode) */}
                    {extractedData.job_requirements && extractedData.job_requirements.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Requirements</h4>
                        <ul className="space-y-1">
                          {extractedData.job_requirements.map((req, i) => (
                            <li key={i} className="text-sm flex items-start gap-2">
                              <span className="text-accent font-medium">{i + 1}.</span>
                              <span>{req.description}{req.estimated_quantity ? ` (x${req.estimated_quantity} ${req.unit || ''})` : ''}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* RAMS */}
                    {extractedData.rams_considerations && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">RAMS Considerations</h4>
                        <p className="text-sm">{extractedData.rams_considerations}</p>
                      </div>
                    )}

                    {/* Notes */}
                    {extractedData.notes && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Notes</h4>
                        <p className="text-sm">{extractedData.notes}</p>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="pt-4 border-t flex gap-3">
                      {scanMode === "quote" ? (
                        <Button variant="hero" className="flex-1" onClick={() => setActiveFlow("quote")}>
                          <FileSpreadsheet className="w-4 h-4 mr-2" />
                          Create Quotation
                        </Button>
                      ) : (
                        <Button variant="hero" className="flex-1" onClick={() => setActiveFlow("visit")}>
                          <ClipboardList className="w-4 h-4 mr-2" />
                          Create Visit
                        </Button>
                      )}
                      <Button variant="outline" onClick={handleReset}>
                        Scan Another
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default EmailScanner;
