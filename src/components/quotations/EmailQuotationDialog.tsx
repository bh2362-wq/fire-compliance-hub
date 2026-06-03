import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Send, Mail, FileText, Link2, Volume2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fetchQuotationFull, renderQuotePdfBase64 } from "@/features/quotes/useQuoteGeneration";
import { getCauseEffectReportPdfBase64 } from "@/features/causeEffectTest/useCauseEffectGeneration";
import { getCompanySettings } from "@/services/companySettingsService";
import {
  EmailTemplate,
  getEmailTemplates,
  getDefaultTemplate,
  applyTemplate,
} from "@/services/emailTemplateService";

interface ContactSuggestion {
  email: string;
  name: string;
  source: string;
}

interface EmailQuotationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quotation: {
    id: string;
    quotation_number: string;
    title: string;
    site_id: string;
    customer_id: string | null;
    sites: { name: string } | null;
    acceptance_token?: string | null;
  };
  customerEmail: string;
  defaultRecipients?: string;
  customerName?: string;
  onSuccess?: () => void;
  /** When the quote was raised from a C&E report, pass the report id
      here. The dialog shows an "Include C&E source report" checkbox
      (default on) and, when sent, fetches the C&E PDF and adds it as
      a second attachment via additionalAttachments. */
  sourceCauseEffectReportId?: string | null;
  /** Display label for the source report — usually its report_number.
      Falls back to "Cause & Effect report" when unknown. */
  sourceCauseEffectReportLabel?: string | null;
}

export function EmailQuotationDialog({
  open,
  onOpenChange,
  quotation,
  customerEmail,
  defaultRecipients,
  customerName,
  onSuccess,
  sourceCauseEffectReportId,
  sourceCauseEffectReportLabel,
}: EmailQuotationDialogProps) {
  const [sending, setSending] = useState(false);
  const [recipients, setRecipients] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [companyNameVal, setCompanyNameVal] = useState("");
  const [includeAcceptLink, setIncludeAcceptLink] = useState(!!quotation.acceptance_token);
  const [includeCeReport, setIncludeCeReport] = useState(!!sourceCauseEffectReportId);

  // Email autocomplete state
  const [allContacts, setAllContacts] = useState<ContactSuggestion[]>([]);
  const [emailSuggestions, setEmailSuggestions] = useState<ContactSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      const allRecipients = [customerEmail, defaultRecipients].filter(Boolean).join(", ");
      setRecipients(allRecipients || "");
      loadTemplatesAndDefaults();
      loadContactEmails();
    }
  }, [open, customerEmail, defaultRecipients, quotation]);

  // Close suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadContactEmails = async () => {
    try {
      const { data: customers } = await supabase
        .from("customers")
        .select("name, contact_name, contact_email, email_recipients, quote_email_recipients, invoice_email_recipients, report_email_recipients")
        .order("name");

      const contacts: ContactSuggestion[] = [];
      const seen = new Set<string>();

      for (const c of customers || []) {
        if (c.contact_email && !seen.has(c.contact_email.toLowerCase())) {
          seen.add(c.contact_email.toLowerCase());
          contacts.push({ email: c.contact_email, name: c.contact_name || c.name, source: c.name });
        }
        // Parse comma-separated recipient fields
        const recipientFields = [c.email_recipients, c.quote_email_recipients, c.invoice_email_recipients, c.report_email_recipients];
        for (const field of recipientFields) {
          if (field) {
            for (const email of field.split(/[,;\s]+/).map((e: string) => e.trim()).filter(Boolean)) {
              if (!seen.has(email.toLowerCase())) {
                seen.add(email.toLowerCase());
                contacts.push({ email, name: "", source: c.name });
              }
            }
          }
        }
      }

      // Also add site contacts
      const { data: sites } = await supabase
        .from("sites")
        .select("name, contact_name, contact_email")
        .not("contact_email", "is", null);

      for (const s of sites || []) {
        if (s.contact_email && !seen.has(s.contact_email.toLowerCase())) {
          seen.add(s.contact_email.toLowerCase());
          contacts.push({ email: s.contact_email, name: s.contact_name || "", source: s.name });
        }
      }

      setAllContacts(contacts);
    } catch (err) {
      console.error("Failed to load contacts:", err);
    }
  };

  const handleRecipientsChange = (value: string) => {
    setRecipients(value);

    // Get the current "word" being typed (after last comma/semicolon)
    const parts = value.split(/[,;]/);
    const currentPart = parts[parts.length - 1].trim().toLowerCase();

    if (currentPart.length >= 2) {
      const filtered = allContacts.filter(
        (c) =>
          c.email.toLowerCase().includes(currentPart) ||
          c.name.toLowerCase().includes(currentPart) ||
          c.source.toLowerCase().includes(currentPart)
      );
      setEmailSuggestions(filtered.slice(0, 8));
      setShowSuggestions(filtered.length > 0);
    } else {
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (suggestion: ContactSuggestion) => {
    const parts = recipients.split(/[,;]/);
    parts[parts.length - 1] = " " + suggestion.email;
    setRecipients(parts.join(",").replace(/^,\s*/, "").trim() + ", ");
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const loadTemplatesAndDefaults = async () => {
    setLoadingTemplates(true);
    try {
      const [templatesList, defaultTemplate, settings] = await Promise.all([
        getEmailTemplates("quotation"),
        getDefaultTemplate("quotation"),
        getCompanySettings().catch(() => null),
      ]);

      setTemplates(templatesList);
      const compName = settings?.company_name || "The Service Team";
      setCompanyNameVal(compName);

      const variables = {
        customer_name: customerName || "Customer",
        site_name: quotation.sites?.name || "Site",
        report_number: quotation.quotation_number,
        report_date: new Date().toISOString().split("T")[0],
        company_name: compName,
      };

      if (defaultTemplate) {
        setSelectedTemplateId(defaultTemplate.id);
        const applied = applyTemplate(defaultTemplate, variables);
        setSubject(applied.subject);
        setBody(`${applied.greeting}\n\n${applied.body}\n\n${applied.signoff}`);
      } else if (templatesList.length > 0) {
        setSelectedTemplateId(templatesList[0].id);
        const applied = applyTemplate(templatesList[0], variables);
        setSubject(applied.subject);
        setBody(`${applied.greeting}\n\n${applied.body}\n\n${applied.signoff}`);
      } else {
        setSubject(`Quotation ${quotation.quotation_number} - ${quotation.title || quotation.sites?.name || "Fire Safety Works"}`);
        setBody(`Dear ${customerName || "Customer"},\n\nPlease find attached our quotation ${quotation.quotation_number} for fire safety works at ${quotation.sites?.name || "your site"}.\n\nThis quotation is valid for 30 days from the date of issue. Please review the attached document and contact us if you have any questions.\n\nKind regards,\n${compName}`);
      }
    } catch (error) {
      console.error("Failed to load templates:", error);
      setSubject(`Quotation ${quotation.quotation_number} - ${quotation.title || quotation.sites?.name || "Fire Safety Works"}`);
      setBody(`Dear ${customerName || "Customer"},\n\nPlease find attached our quotation ${quotation.quotation_number}.\n\nKind regards,\nBHO Fire Ltd`);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      const variables = {
        customer_name: customerName || "Customer",
        site_name: quotation.sites?.name || "Site",
        report_number: quotation.quotation_number,
        report_date: new Date().toISOString().split("T")[0],
        company_name: companyNameVal || "The Service Team",
      };
      const applied = applyTemplate(template, variables);
      setSubject(applied.subject);
      setBody(`${applied.greeting}\n\n${applied.body}\n\n${applied.signoff}`);
    }
  };

  const handleSend = async () => {
    if (!recipients.trim()) {
      toast.error("Please enter at least one recipient");
      return;
    }

    setSending(true);
    try {
      // Render the email attachment from the master Word template via
      // generate-quote-docx → convert-quote-pdf so it matches the Download
      // PDF byte-for-byte. Single source of truth — see renderQuotePdfBase64.
      const full = await fetchQuotationFull(quotation.id);
      const pdfBase64 = await renderQuotePdfBase64(full);
      if (!pdfBase64) {
        throw new Error("Failed to generate PDF");
      }

      const recipientList = recipients
        .split(/[,;\s]+/)
        .map((email) => email.trim())
        .filter((email) => email.length > 0);

      // Append accept link to body if toggled on
      let finalBody = body;
      if (includeAcceptLink && quotation.acceptance_token) {
        const acceptUrl = `${window.location.origin}/accept-quote/${quotation.acceptance_token}`;
        finalBody += `\n\nTo accept this quotation online, please click the link below:\n${acceptUrl}`;
      }

      // Optionally attach the source C&E report PDF so the customer
      // sees the findings the quote was raised from in the same email.
      // Fetched via the same DOCX→PDF pipeline used for direct C&E
      // downloads, so byte-identical to the report PDF the engineer
      // sees on the Reports page.
      let additionalAttachments: { filename: string; content: string }[] | undefined;
      if (includeCeReport && sourceCauseEffectReportId) {
        try {
          const cePdfBase64 = await getCauseEffectReportPdfBase64(sourceCauseEffectReportId);
          const ceFilename = `${sourceCauseEffectReportLabel || "Cause-Effect-Report"}.pdf`;
          additionalAttachments = [{ filename: ceFilename, content: cePdfBase64 }];
        } catch (ceErr) {
          // Don't block the send — surface and continue without the
          // C&E attachment so the quote still goes out.
          console.error("C&E source attachment failed:", ceErr);
          toast.warning("Sending without C&E attachment", {
            description: ceErr instanceof Error ? ceErr.message : String(ceErr),
          });
        }
      }

      const { data, error } = await supabase.functions.invoke("send-report-email", {
        body: {
          to: recipientList,
          subject,
          emailBody: finalBody,
          pdfBase64,
          siteName: quotation.sites?.name || "Site",
          reportNumber: quotation.quotation_number,
          reportDate: new Date().toISOString().split("T")[0],
          ...(additionalAttachments ? { additionalAttachments } : {}),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("email_logs").insert({
        email_type: "quotation",
        recipients: recipientList,
        subject,
        status: "sent",
        site_id: quotation.site_id,
        customer_id: quotation.customer_id,
        created_by: user?.id,
      });

      await supabase
        .from("quotations")
        .update({ 
          status: "sent",
          locked_at: new Date().toISOString(),
          locked_by: user?.id
        })
        .eq("id", quotation.id);

      toast.success(`Quotation sent to ${recipientList.length} recipient(s)`);

      // Save any new emails back to customer for future use
      if (quotation.customer_id) {
        try {
          const { data: custData } = await supabase
            .from("customers")
            .select("quote_email_recipients, email_recipients")
            .eq("id", quotation.customer_id)
            .single();

          if (custData) {
            const existingEmails = (custData.quote_email_recipients || custData.email_recipients || "")
              .split(",")
              .map((e: string) => e.trim().toLowerCase())
              .filter(Boolean);

            const newEmails = recipientList
              .map(e => e.trim().toLowerCase())
              .filter(e => e && !existingEmails.includes(e));

            if (newEmails.length > 0) {
              const updatedList = [...existingEmails, ...newEmails].join(", ");
              await supabase
                .from("customers")
                .update({ quote_email_recipients: updatedList })
                .eq("id", quotation.customer_id);
              console.log("Saved new quote email recipients to customer:", newEmails);
            }
          }
        } catch (saveErr) {
          console.log("Could not save new emails to customer:", saveErr);
        }
      }

      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Error sending quotation:", error);
      toast.error(error instanceof Error ? error.message : "Failed to send quotation");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Quotation
          </DialogTitle>
          <DialogDescription>
            Send {quotation.quotation_number} to the customer
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template Selection */}
          {templates.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Email Template
              </Label>
              <Select value={selectedTemplateId} onValueChange={handleTemplateChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent className="z-[200]">
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="relative">
            <Label>Recipients</Label>
            <Input
              ref={inputRef}
              value={recipients}
              onChange={(e) => handleRecipientsChange(e.target.value)}
              onFocus={() => {
                const parts = recipients.split(/[,;]/);
                const currentPart = parts[parts.length - 1].trim().toLowerCase();
                if (currentPart.length >= 2) {
                  const filtered = allContacts.filter(
                    (c) =>
                      c.email.toLowerCase().includes(currentPart) ||
                      c.name.toLowerCase().includes(currentPart) ||
                      c.source.toLowerCase().includes(currentPart)
                  );
                  setEmailSuggestions(filtered.slice(0, 8));
                  setShowSuggestions(filtered.length > 0);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setShowSuggestions(false);
              }}
              placeholder="email@company.com — start typing a name or email to search"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Separate multiple emails with commas
            </p>

            {showSuggestions && emailSuggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute z-50 top-[calc(100%-1.25rem)] left-0 right-0 bg-popover border border-border rounded-md shadow-lg max-h-[200px] overflow-y-auto"
              >
                {emailSuggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-accent transition-colors flex items-center justify-between gap-2 border-b border-border/50 last:border-0"
                    onClick={() => selectSuggestion(suggestion)}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium">{suggestion.email}</span>
                      {suggestion.name && (
                        <span className="text-xs text-muted-foreground ml-2">{suggestion.name}</span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{suggestion.source}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label>Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
            />
          </div>

          {quotation.acceptance_token && (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label className="text-sm font-medium">Include Accept Link</Label>
                  <p className="text-xs text-muted-foreground">Adds a clickable link for the client to accept online</p>
                </div>
              </div>
              <Switch checked={includeAcceptLink} onCheckedChange={setIncludeAcceptLink} />
            </div>
          )}

          {sourceCauseEffectReportId && (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label className="text-sm font-medium">Attach source C&amp;E report</Label>
                  <p className="text-xs text-muted-foreground">
                    Sends {sourceCauseEffectReportLabel || "the Cause & Effect report"} alongside the quote PDF
                  </p>
                </div>
              </div>
              <Switch checked={includeCeReport} onCheckedChange={setIncludeCeReport} />
            </div>
          )}

          <div>
            <Label>Message</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Email message..."
              className="min-h-[200px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send Quotation
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
