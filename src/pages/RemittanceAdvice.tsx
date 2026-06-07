import { useEffect, useState } from "react";
import { format } from "date-fns";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  Mail,
  RefreshCw,
  Settings,
  Sparkles,
  XCircle,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  RemittanceAdvice as RemittanceAdviceModel,
  RemittanceLineItem,
  RemittanceStatus,
  REMITTANCE_STATUS_LABELS,
  applyLineItem,
  dismissRemittance,
  getBibbyAccountCode,
  listRemittances,
  refreshRemittanceStatus,
  scanRemittanceEmails,
} from "@/services/remittanceService";
import { RemittanceSettingsDialog } from "@/components/remittance/RemittanceSettingsDialog";
import { InvoiceLinkPickerDialog } from "@/components/remittance/InvoiceLinkPickerDialog";

const TAB_STATUSES: Record<string, RemittanceStatus[]> = {
  pending: ["parsed", "needs_review"],
  applied: ["applied"],
  other: ["dismissed", "failed"],
};

function StatusBadge({ status }: { status: RemittanceStatus }) {
  const variants: Record<RemittanceStatus, string> = {
    parsed: "bg-blue-100 text-blue-800 border-blue-200",
    needs_review: "bg-amber-100 text-amber-800 border-amber-200",
    applied: "bg-emerald-100 text-emerald-800 border-emerald-200",
    dismissed: "bg-muted text-muted-foreground border-border",
    failed: "bg-red-100 text-red-800 border-red-200",
  };
  return (
    <Badge variant="outline" className={variants[status]}>
      {REMITTANCE_STATUS_LABELS[status]}
    </Badge>
  );
}

// Surfaces whether the parser sent any PDFs to Claude for this
// remittance + a hover-tip with the per-attachment audit. Lets the
// user diagnose "PDF wasn't read" cases without poking at the DB.
function PdfBadge({ remittance }: { remittance: RemittanceAdviceModel }) {
  const count = remittance.pdf_count ?? 0;
  const diagnostics = remittance.attachment_diagnostics ?? [];

  // Older rows from before the diagnostics shipped have no data at all
  // — render nothing so the badge isn't a sea of "n/a" on history.
  if (count === 0 && diagnostics.length === 0 && remittance.has_attachments_flag == null) {
    return null;
  }

  const tone =
    count > 0
      ? "bg-secondary/10 text-secondary border-secondary/25"
      : diagnostics.length > 0
        ? "bg-warning/10 text-warning border-warning/25"
        : "bg-muted text-muted-foreground border-border";

  const label =
    count > 0 ? `PDF×${count}` : diagnostics.length > 0 ? "PDF skipped" : "Body only";

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`${tone} cursor-help inline-flex items-center gap-1`}>
            <FileText className="w-3 h-3" />
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs space-y-1">
          <p className="font-semibold text-foreground">
            {count} PDF{count === 1 ? "" : "s"} sent to Claude
          </p>
          {remittance.has_attachments_flag === false && diagnostics.length > 0 && (
            <p className="text-muted-foreground">
              Outlook reported <code>hasAttachments=false</code>, but the parser found {diagnostics.length} inline attachment{diagnostics.length === 1 ? "" : "s"}.
            </p>
          )}
          {diagnostics.length === 0 ? (
            <p className="text-muted-foreground">No attachments on the email.</p>
          ) : (
            <ul className="space-y-1 mt-1">
              {diagnostics.map((d, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span
                    className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                      d.status === "included" ? "bg-success" : "bg-warning"
                    }`}
                  />
                  <span className="min-w-0">
                    <span className="font-medium">{d.name}</span>
                    {" — "}
                    <span className="text-muted-foreground">
                      {d.status === "included"
                        ? `included${d.fallback_used ? " (via /$value)" : ""}`
                        : d.status === "skipped_not_pdf"
                          ? `skipped (${d.content_type || "unknown type"})`
                          : d.status === "skipped_empty_bytes"
                            ? `empty bytes${d.reason ? ` — ${d.reason}` : ""}`
                            : `fetch error${d.reason ? ` — ${d.reason}` : ""}`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function formatGBP(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(n);
}

interface LineItemRowProps {
  item: RemittanceLineItem;
  bibbyCode: string | null;
  remittanceLocked: boolean;
  onApplied: () => void;
}

function LineItemRow({ item, bibbyCode, remittanceLocked, onApplied }: LineItemRowProps) {
  const { toast } = useToast();
  const [applying, setApplying] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // A line is "matched" if either the auto-match populated the FK or
  // the manual-link picker dropped a Xero invoice ID on it.
  const matched = !!(item.matched_xero_invoice_id || item.xero_invoice_id);
  const isApplied = item.status === "applied";
  const isFailed = item.status === "failed";
  const isManual = item.match_confidence === "manual";
  const isFuzzy = item.match_confidence === "fuzzy";

  const handleApply = async () => {
    if (!bibbyCode) {
      toast({
        title: "Set the Bibby account first",
        description: "Open Settings and enter the Xero account code before applying.",
        variant: "destructive",
      });
      return;
    }
    setApplying(true);
    try {
      const result = await applyLineItem(item, bibbyCode);
      if (result.status === "applied") {
        toast({ title: "Payment applied", description: `Xero payment ${result.xero_payment_id ?? ""} created.` });
        onApplied();
      } else {
        toast({ title: "Apply failed", description: result.error, variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Apply failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  const contactName = item.matched_contact_name ?? item.matched_invoice?.contact_name ?? null;

  return (
    <>
      <div className="flex items-center justify-between gap-3 py-2 border-t border-border first:border-t-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm">{item.invoice_number ?? "—"}</span>
            {matched ? (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                {isManual ? "Linked" : isFuzzy ? "Fuzzy match" : "Matched"}
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                No match
              </Badge>
            )}
            {contactName && (
              <span className="text-xs text-muted-foreground truncate">{contactName}</span>
            )}
          </div>
          {item.raw_text && (
            <p className="text-xs text-muted-foreground italic mt-0.5 truncate" title={item.raw_text}>
              {item.raw_text}
            </p>
          )}
          {isFailed && item.error_message && (
            <p className="text-xs text-red-700 mt-0.5">{item.error_message}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold">{formatGBP(item.amount)}</p>
          {isApplied ? (
            <span className="text-[11px] text-emerald-700 flex items-center justify-end gap-1 mt-0.5">
              <CheckCircle2 className="w-3 h-3" /> Applied
            </span>
          ) : remittanceLocked ? (
            <span className="text-[11px] text-muted-foreground">Skipped</span>
          ) : matched ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs mt-1"
              onClick={handleApply}
              disabled={applying}
            >
              {applying ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
              {applying ? "Applying…" : "Apply"}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs mt-1"
              onClick={() => setPickerOpen(true)}
            >
              Link invoice…
            </Button>
          )}
        </div>
      </div>

      <InvoiceLinkPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        lineItemId={item.id}
        initialQuery={item.invoice_number}
        hintAmount={item.amount}
        onLinked={onApplied}
      />
    </>
  );
}

interface RemittanceCardProps {
  remittance: RemittanceAdviceModel;
  bibbyCode: string | null;
  onChanged: () => void;
}

function RemittanceCard({ remittance, bibbyCode, onChanged }: RemittanceCardProps) {
  const { toast } = useToast();
  const [dismissing, setDismissing] = useState(false);
  const locked = remittance.status === "applied" || remittance.status === "dismissed";

  const handleDismiss = async () => {
    setDismissing(true);
    try {
      await dismissRemittance(remittance.id);
      toast({ title: "Dismissed" });
      onChanged();
    } catch (e) {
      toast({ title: "Couldn't dismiss", description: (e as Error).message, variant: "destructive" });
    } finally {
      setDismissing(false);
    }
  };

  const handleLineApplied = async () => {
    await refreshRemittanceStatus(remittance.id);
    onChanged();
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-foreground truncate">
              {remittance.payer_name ?? remittance.from_name ?? remittance.from_address ?? "Unknown sender"}
            </h3>
            <StatusBadge status={remittance.status} />
            <PdfBadge remittance={remittance} />
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            <Mail className="w-3 h-3 inline mr-1" />
            {remittance.subject ?? "(no subject)"}
          </p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
            <span>
              Mailbox: <span className="font-medium text-foreground">{remittance.mailbox}</span>
            </span>
            {remittance.received_at && (
              <span>Received {format(new Date(remittance.received_at), "dd MMM yyyy HH:mm")}</span>
            )}
            {remittance.payment_date && (
              <span>Paid {format(new Date(remittance.payment_date), "dd MMM yyyy")}</span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold text-foreground">{formatGBP(remittance.total_amount)}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total</p>
        </div>
      </div>

      {remittance.status === "failed" && remittance.error_message && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex items-start gap-2">
          <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{remittance.error_message}</span>
        </div>
      )}

      {remittance.line_items.length > 0 ? (
        <div className="border-t pt-2">
          {remittance.line_items.map((item) => (
            <LineItemRow
              key={item.id}
              item={item}
              bibbyCode={bibbyCode}
              remittanceLocked={locked}
              onApplied={handleLineApplied}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          No invoice line items extracted. {remittance.error_message ?? ""}
        </p>
      )}

      {!locked && (
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            disabled={dismissing}
            className="text-muted-foreground"
          >
            {dismissing ? "Dismissing…" : "Not a remittance"}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function RemittanceAdvicePage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"pending" | "applied" | "other">("pending");
  const [remittances, setRemittances] = useState<RemittanceAdviceModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [bibbyCode, setBibbyCode] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadEverything = async () => {
    setLoading(true);
    try {
      const [list, code] = await Promise.all([
        listRemittances({ statuses: TAB_STATUSES[tab] }),
        getBibbyAccountCode(),
      ]);
      setRemittances(list);
      setBibbyCode(code);
    } catch (e) {
      toast({ title: "Couldn't load remittances", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEverything();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const result = await scanRemittanceEmails({ hours_back: 168 });
      toast({
        title: "Scan complete",
        description:
          `Checked ${result.scanned} emails · ${result.relevant} looked like remittances · ` +
          `${result.queued} newly parsed · ${result.already_parsed} already known.`,
      });
      await loadEverything();
    } catch (e) {
      toast({ title: "Scan failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="page-title">Remittance advice</h2>
            <p className="page-subtitle">
              Parsed payment notifications from the accounts inboxes. Apply each one to Xero against
              the Bibby Factoring account.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
              <Settings className="w-4 h-4 mr-1.5" />
              Settings
            </Button>
            <Button onClick={handleScan} disabled={scanning} size="sm">
              {scanning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Scanning…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-1.5" />
                  Scan now
                </>
              )}
            </Button>
          </div>
        </div>

        {!bibbyCode && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">Bibby Factoring account not configured</p>
              <p className="text-xs">
                Set the Xero bank account code in Settings before applying any payments.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
              Open settings
            </Button>
          </div>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="applied">Applied</TabsTrigger>
            <TabsTrigger value="other">Dismissed / failed</TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-4 space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading…
              </div>
            ) : remittances.length === 0 ? (
              <div className="rounded-lg border bg-card p-12 text-center">
                <Mail className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                <h3 className="text-base font-medium">No remittances in this tab</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Press "Scan now" to fetch the latest from accounts@ and ben@.
                </p>
              </div>
            ) : (
              remittances.map((r) => (
                <RemittanceCard
                  key={r.id}
                  remittance={r}
                  bibbyCode={bibbyCode}
                  onChanged={loadEverything}
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      <RemittanceSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onSaved={() => {
          void loadEverything();
        }}
      />
    </DashboardLayout>
  );
}
