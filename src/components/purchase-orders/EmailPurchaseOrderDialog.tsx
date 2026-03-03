import { useState, useEffect, useRef } from "react";
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
import { Loader2, Send, Mail, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generatePurchaseOrderPDF } from "@/lib/purchaseOrderPdfGenerator";
import { getCompanySettings } from "@/services/companySettingsService";
import {
  EmailTemplate,
  getEmailTemplates,
  getDefaultTemplate,
  applyTemplate,
} from "@/services/emailTemplateService";
import { PurchaseOrder } from "@/services/purchaseOrderService";

interface ContactSuggestion {
  email: string;
  name: string;
  source: string;
}

interface EmailPurchaseOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseOrder: PurchaseOrder;
  onSuccess?: () => void;
}

export function EmailPurchaseOrderDialog({
  open,
  onOpenChange,
  purchaseOrder,
  onSuccess,
}: EmailPurchaseOrderDialogProps) {
  const [sending, setSending] = useState(false);
  const [recipients, setRecipients] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [companyNameVal, setCompanyNameVal] = useState("");

  // Email autocomplete state
  const [allContacts, setAllContacts] = useState<ContactSuggestion[]>([]);
  const [emailSuggestions, setEmailSuggestions] = useState<ContactSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      // Pre-populate with supplier email
      const supplierEmail = purchaseOrder.supplier?.email || "";
      setRecipients(supplierEmail);
      loadTemplatesAndDefaults();
      loadContactEmails();
    }
  }, [open, purchaseOrder]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
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
        .select("name, contact_name, contact_email, email_recipients, invoice_email_recipients")
        .order("name");

      const contacts: ContactSuggestion[] = [];
      const seen = new Set<string>();

      // Add supplier contacts first
      const { data: suppliers } = await supabase
        .from("suppliers")
        .select("name, contact_name, email")
        .eq("status", "active")
        .order("name");

      for (const s of suppliers || []) {
        if (s.email && !seen.has(s.email.toLowerCase())) {
          seen.add(s.email.toLowerCase());
          contacts.push({ email: s.email, name: s.contact_name || "", source: `Supplier: ${s.name}` });
        }
      }

      for (const c of customers || []) {
        if (c.contact_email && !seen.has(c.contact_email.toLowerCase())) {
          seen.add(c.contact_email.toLowerCase());
          contacts.push({ email: c.contact_email, name: c.contact_name || c.name, source: c.name });
        }
        const recipientFields = [c.email_recipients, c.invoice_email_recipients];
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

      setAllContacts(contacts);
    } catch (err) {
      console.error("Failed to load contacts:", err);
    }
  };

  const handleRecipientsChange = (value: string) => {
    setRecipients(value);
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
      // Try purchase_order templates first, fall back to invoice templates
      let templatesList = await getEmailTemplates("purchase_order");
      let defaultTemplate = await getDefaultTemplate("purchase_order");

      if (templatesList.length === 0) {
        templatesList = await getEmailTemplates("invoice");
        defaultTemplate = await getDefaultTemplate("invoice");
      }

      const settings = await getCompanySettings().catch(() => null);
      setTemplates(templatesList);
      const compName = settings?.company_name || "The Service Team";
      setCompanyNameVal(compName);

      const supplierName = purchaseOrder.supplier?.name || "Supplier";
      const variables = {
        customer_name: supplierName,
        site_name: "",
        report_number: purchaseOrder.po_number,
        report_date: purchaseOrder.order_date,
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
        setSubject(`Purchase Order ${purchaseOrder.po_number}${purchaseOrder.reference ? ` - ${purchaseOrder.reference}` : ""}`);
        setBody(
          `Dear ${supplierName},\n\nPlease find attached our purchase order ${purchaseOrder.po_number}.\n\nPlease confirm receipt and expected delivery date at your earliest convenience.\n\nKind regards,\n${compName}`
        );
      }
    } catch (error) {
      console.error("Failed to load templates:", error);
      setSubject(`Purchase Order ${purchaseOrder.po_number}`);
      setBody(
        `Dear ${purchaseOrder.supplier?.name || "Supplier"},\n\nPlease find attached our purchase order ${purchaseOrder.po_number}.\n\nKind regards,\nBHO Fire Ltd`
      );
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      const variables = {
        customer_name: purchaseOrder.supplier?.name || "Supplier",
        site_name: "",
        report_number: purchaseOrder.po_number,
        report_date: purchaseOrder.order_date,
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
      const companySettings = await getCompanySettings();

      // Generate PDF as base64
      const doc = await generatePurchaseOrderPDF(purchaseOrder, companySettings || null);
      const pdfBase64 = doc.output("datauristring").split(",")[1];

      if (!pdfBase64) {
        throw new Error("Failed to generate PDF");
      }

      const recipientList = recipients
        .split(/[,;\s]+/)
        .map((email) => email.trim())
        .filter((email) => email.length > 0);

      const { data, error } = await supabase.functions.invoke("send-report-email", {
        body: {
          to: recipientList,
          subject,
          emailBody: body,
          pdfBase64,
          siteName: "",
          reportNumber: purchaseOrder.po_number,
          reportDate: purchaseOrder.order_date,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("email_logs").insert({
        email_type: "purchase_order",
        recipients: recipientList,
        subject,
        status: "sent",
        created_by: user?.id,
      });

      toast.success(`Purchase order sent to ${recipientList.length} recipient(s)`);
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Error sending purchase order:", error);
      toast.error(error instanceof Error ? error.message : "Failed to send purchase order");
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
            Email Purchase Order
          </DialogTitle>
          <DialogDescription>
            Send {purchaseOrder.po_number} to the supplier
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
              placeholder="email@supplier.com — start typing a name or email to search"
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

          <div>
            <Label>Message</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder="Email message..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || loadingTemplates}>
            {sending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Send Email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
