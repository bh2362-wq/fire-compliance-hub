import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Eye, FileDown, Ban, CheckCircle2,
  ArrowRight, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  XeroOutstandingInvoice,
  XeroBankAccount,
  listXeroBankAccounts,
  applyInvoicePayment,
  voidInvoice,
  downloadInvoicePdf,
} from "@/services/xeroService";
import { cn } from "@/lib/utils";

// Action drawer for an invoice row. Mirrors VisitActionsDrawer — the
// row is tappable, the drawer offers the right buttons.
//
// "Mark as paid" expands inline rather than navigating, so the user
// picks the right bank account and date in-place. The submit calls
// xero-apply-payment with the chosen bankAccountCode so the payment
// reconciles to the correct Xero account instead of falling back to
// whichever active bank account Xero returns first.

interface InvoiceActionsDrawerProps {
  invoice: XeroOutstandingInvoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fires after a mutating action (mark paid / void) succeeds — the
   *  parent should refetch its list so the row updates immediately. */
  onActionTaken?: () => void;
}

function invoiceTone(status: string): string {
  switch (status) {
    case "PAID":       return "bg-success/10 text-success border-success/25";
    case "AUTHORISED": return "bg-secondary/10 text-secondary border-secondary/25";
    case "OVERDUE":    return "bg-destructive/10 text-destructive border-destructive/25";
    case "DRAFT":      return "bg-muted text-muted-foreground border-border";
    case "SUBMITTED":  return "bg-warning/10 text-warning border-warning/25";
    default:           return "bg-muted text-muted-foreground border-border";
  }
}

const XERO_INVOICE_URL = (invoiceId: string) =>
  `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${invoiceId}`;

// "Pays into…" default account behaviour
//
//   This deployment has a factoring account (Xero code 971) that all
//   incoming customer payments should hit by default. The picker now
//   initialises to whatever the user has saved as their default; if
//   they haven't saved one yet, it falls back to 971 so a fresh
//   browser/incognito session still picks the right account.
//
//   Override per-payment via the dropdown. Tick "Save as default for
//   future payments" to update the sticky default to the new pick.
const DEFAULT_PAYMENT_ACCOUNT_CODE = "971";
const DEFAULT_PAYMENT_ACCOUNT_STORAGE_KEY = "defaultPaymentAccountCode";

function getDefaultAccountCode(): string {
  if (typeof window === "undefined") return DEFAULT_PAYMENT_ACCOUNT_CODE;
  return (
    localStorage.getItem(DEFAULT_PAYMENT_ACCOUNT_STORAGE_KEY) ||
    DEFAULT_PAYMENT_ACCOUNT_CODE
  );
}
function setDefaultAccountCode(code: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DEFAULT_PAYMENT_ACCOUNT_STORAGE_KEY, code);
}

export function InvoiceActionsDrawer({ invoice, open, onOpenChange, onActionTaken }: InvoiceActionsDrawerProps) {
  const [accounts, setAccounts] = useState<XeroBankAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  // Inline mark-as-paid form. Hidden until the user taps the button.
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState("");
  // Pre-fill with the saved default (or the 971 fallback) so the user
  // doesn't have to pick. They can still override per-payment.
  const [payAccountCode, setPayAccountCode] = useState<string>(getDefaultAccountCode());
  // When ticked on submit, the chosen account becomes the new sticky
  // default for future payments.
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [paying, setPaying] = useState(false);

  // Per-action busy flags.
  const [voiding, setVoiding] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Reset the inline form whenever a new invoice loads. Bank accounts
  // are only fetched once per drawer-open since they don't change per
  // invoice — picker stays populated if the user switches between
  // invoice rows.
  useEffect(() => {
    if (!open) return;
    setPayOpen(false);
    setPayAmount(invoice?.amountDue?.toString() ?? "");
    setPayDate(format(new Date(), "yyyy-MM-dd"));
    // Re-read the default each open in case the user changed it on a
    // previous invoice in the same session.
    setPayAccountCode(getDefaultAccountCode());
    setSaveAsDefault(false);
  }, [open, invoice?.invoiceId]);

  const loadAccounts = async () => {
    setAccountsLoading(true);
    setAccountsError(null);
    try {
      const list = await listXeroBankAccounts();
      setAccounts(list);
      // Reconcile the saved default with the live list. If the saved
      // code matches one of the accounts, keep it (the picker will
      // resolve to the real name). If it doesn't match (e.g. the user
      // hasn't set one yet and the 971 fallback isn't in their chart),
      // fall back to list[0] so the dropdown isn't empty.
      const saved = getDefaultAccountCode();
      const found = list.find((a) => a.code === saved);
      if (!found && list[0]?.code) {
        setPayAccountCode(list[0].code);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load bank accounts";
      // Keep the raw error in the console for diagnosis; surface a
      // friendlier note in the UI. Common cause: the xero-bank-accounts
      // Edge Function hasn't deployed yet (404 from Lovable's deploy
      // lag on a brand-new function). The user can still proceed —
      // xero-apply-payment falls back to Xero's default bank account
      // when no bankAccountCode is supplied.
      // eslint-disable-next-line no-console
      console.warn("[InvoiceActionsDrawer] listXeroBankAccounts failed:", msg);
      setAccountsError(msg);
    } finally {
      setAccountsLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => onOpenChange(false);

  const openInXero = () => {
    if (!invoice) return;
    window.open(XERO_INVOICE_URL(invoice.invoiceId), "_blank", "noopener,noreferrer");
  };

  const downloadPdf = async () => {
    if (!invoice) return;
    setDownloading(true);
    try {
      await downloadInvoicePdf(invoice.invoiceId, invoice.invoiceNumber);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "PDF download failed";
      toast.error("Couldn't download PDF", { description: msg });
    } finally {
      setDownloading(false);
    }
  };

  const submitPayment = async () => {
    if (!invoice) return;
    const amount = parseFloat(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid payment amount");
      return;
    }
    if (!payDate) {
      toast.error("Pick a payment date");
      return;
    }
    setPaying(true);
    try {
      const result = await applyInvoicePayment({
        invoiceId: invoice.invoiceId,
        amount,
        date: payDate,
        bankAccountCode: payAccountCode || null,
      });
      // Update the sticky default if the user ticked the box. This
      // changes what every future invoice pre-selects, not just the
      // next one — matches the "factoring account" reading where one
      // account is the standing rule until you explicitly change it.
      if (saveAsDefault && payAccountCode) {
        setDefaultAccountCode(payAccountCode);
      }
      // Also persist as "last used" for backwards-compat with the
      // previous behaviour — anything else reading that key still works.
      if (payAccountCode) {
        localStorage.setItem("lastPaymentAccountCode", payAccountCode);
      }
      // The Edge Function echoes the actual account Xero credited
      // (result.payment.bankAccount). Prefer that over the picker
      // label — it tells the truth even when the supplied code
      // didn't match and Xero fell back to its default.
      const actualAccount =
        result?.payment?.bankAccount
        ?? accounts.find((a) => a.code === payAccountCode)?.name
        ?? "Xero's default bank account";
      toast.success("Payment recorded", {
        description: `£${amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} → ${actualAccount}`,
        duration: 6000,
      });
      onActionTaken?.();
      close();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't record payment";
      toast.error("Couldn't record payment", { description: msg });
    } finally {
      setPaying(false);
    }
  };

  const handleVoid = async () => {
    if (!invoice) return;
    if (!confirm(`Void invoice ${invoice.invoiceNumber}? This can't be undone in Xero.`)) return;
    setVoiding(true);
    try {
      await voidInvoice(invoice.invoiceId);
      toast.success("Invoice voided in Xero");
      onActionTaken?.();
      close();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Void failed";
      toast.error("Couldn't void invoice", { description: msg });
    } finally {
      setVoiding(false);
    }
  };

  const canMarkPaid = invoice?.status === "AUTHORISED" || invoice?.status === "SUBMITTED";
  const canVoid = invoice && (invoice.status === "DRAFT" || invoice.status === "AUTHORISED") && invoice.amountPaid === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="text-lg pr-6">
            {invoice ? `Invoice ${invoice.invoiceNumber}` : "Invoice"}
          </SheetTitle>
          <SheetDescription asChild>
            <div className="space-y-2 mt-2">
              {invoice ? (
                <>
                  <p className="text-sm">{invoice.contactName}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn(
                      "inline-flex text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border",
                      invoiceTone(invoice.status),
                    )}>
                      {invoice.status}
                    </span>
                    {invoice.isOverdue && (
                      <span className="inline-flex text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border bg-destructive/10 text-destructive border-destructive/25">
                        Overdue
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground pt-1">
                    <div>
                      <p className="font-semibold uppercase tracking-wider text-[10px]">Total</p>
                      <p className="text-foreground font-semibold mt-0.5">
                        £{invoice.total.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold uppercase tracking-wider text-[10px]">Outstanding</p>
                      <p className="text-foreground font-semibold mt-0.5">
                        £{invoice.amountDue.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold uppercase tracking-wider text-[10px]">Issued</p>
                      <p className="text-foreground mt-0.5">
                        {invoice.date ? format(parseISO(invoice.date), "d MMM yyyy") : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold uppercase tracking-wider text-[10px]">Due</p>
                      <p className="text-foreground mt-0.5">
                        {invoice.dueDate ? format(parseISO(invoice.dueDate), "d MMM yyyy") : "—"}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <span>Invoice not loaded.</span>
              )}
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-2">
          {/* "Pays into…" indicator. Shows the standing-default account
              before the user expands the form so they can press Record
              without thinking about which account it'll land in. Falls
              back to "Account <code>" when the list hasn't loaded yet
              (the code itself is still what gets sent to Xero). */}
          {canMarkPaid && !payOpen && (
            <div className="text-xs text-muted-foreground px-1 -mb-1">
              Will pay into:{" "}
              <span className="font-semibold text-foreground">
                {(() => {
                  const matched = accounts.find((a) => a.code === payAccountCode);
                  if (matched) return matched.name;
                  if (payAccountCode) return `Account ${payAccountCode}`;
                  return "Xero's default bank account";
                })()}
              </span>
            </div>
          )}

          {/* Mark as paid — inline form so the user picks the bank
              account without leaving the drawer. */}
          {canMarkPaid && !payOpen && (
            <ActionRow
              icon={CheckCircle2}
              label="Mark as paid"
              description="Record a payment and reconcile to a bank account."
              onClick={() => setPayOpen(true)}
              tone="success"
            />
          )}

          {canMarkPaid && payOpen && (
            <div className="rounded-md border border-success/30 bg-success/5 p-3 space-y-3">
              <p className="text-sm font-semibold text-success flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Record payment
              </p>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="pay-amount" className="text-xs">Amount (£)</Label>
                  <Input
                    id="pay-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    disabled={paying}
                  />
                </div>
                <div>
                  <Label htmlFor="pay-date" className="text-xs">Date</Label>
                  <Input
                    id="pay-date"
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    disabled={paying}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="pay-account" className="text-xs">Pay into account</Label>
                {accountsLoading ? (
                  <Skeleton className="h-9 w-full mt-1" />
                ) : accountsError ? (
                  // Most likely cause: the xero-bank-accounts Edge
                  // Function hasn't deployed yet on a brand-new
                  // function. We still send the saved default code
                  // ({payAccountCode}) to xero-apply-payment though,
                  // so Xero will match it by Code if the account
                  // exists in their chart. Calm hint + retry.
                  <div className="mt-1 flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5">
                    <p className="text-xs text-muted-foreground">
                      Couldn't load account list — sending code{" "}
                      <strong>{payAccountCode || "(none)"}</strong> to Xero.
                    </p>
                    <button
                      type="button"
                      onClick={loadAccounts}
                      className="text-xs font-semibold text-primary hover:underline shrink-0"
                    >
                      Retry
                    </button>
                  </div>
                ) : accounts.length === 0 ? (
                  <p className="text-xs text-muted-foreground mt-1">
                    No active bank accounts found — Xero will use its default.
                  </p>
                ) : (
                  <Select value={payAccountCode} onValueChange={setPayAccountCode} disabled={paying}>
                    <SelectTrigger id="pay-account" className="mt-1">
                      <SelectValue placeholder="Pick an account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.account_id} value={a.code ?? a.account_id}>
                          {a.name}{a.bank_account_number ? ` · …${a.bank_account_number.slice(-4)}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Stickify the chosen account so future invoices
                  pre-fill the same way. Only meaningful when the
                  user actually changed the picker, so we hide it
                  when the current selection already equals the
                  saved default. */}
              {payAccountCode && payAccountCode !== getDefaultAccountCode() && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border accent-primary"
                    checked={saveAsDefault}
                    onChange={(e) => setSaveAsDefault(e.target.checked)}
                    disabled={paying}
                  />
                  Save as default for future payments
                </label>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPayOpen(false)}
                  disabled={paying}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={submitPayment}
                  disabled={paying}
                  className="flex-1"
                >
                  {paying ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
                  Record
                </Button>
              </div>
            </div>
          )}

          {invoice && (
            <ActionRow
              icon={Eye}
              label="View in Xero"
              description="Open this invoice in a new tab in Xero."
              onClick={openInXero}
            />
          )}

          {invoice && (
            <ActionRow
              icon={FileDown}
              label={downloading ? "Downloading…" : "Download PDF"}
              description="Save the rendered Xero invoice PDF."
              onClick={downloadPdf}
              disabled={downloading}
            />
          )}

          {canVoid && (
            <ActionRow
              icon={Ban}
              label={voiding ? "Voiding…" : "Void invoice"}
              description="Cancel this invoice in Xero. Cannot be undone."
              onClick={handleVoid}
              disabled={voiding}
              tone="destructive"
            />
          )}

          {invoice?.status === "PAID" && (
            <div className="flex items-center gap-2 mt-3 p-3 rounded-md bg-success/10 border border-success/25 text-success text-sm">
              <CheckCircle2 className="w-4 h-4" />
              This invoice is fully paid.
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ActionRow({
  icon: Icon,
  label,
  description,
  onClick,
  disabled,
  tone = "default",
}: {
  icon: typeof Eye;
  label: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "success" | "destructive";
}) {
  const toneClass =
    tone === "success" ? "border-success/30 hover:bg-success/5"
    : tone === "destructive" ? "border-destructive/30 hover:bg-destructive/5"
    : "border-border hover:border-foreground/25";
  return (
    <Button
      variant="outline"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full h-auto py-3 px-3 justify-start text-left flex items-center gap-3 disabled:opacity-50",
        toneClass,
      )}
    >
      <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-foreground/70" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground truncate">{description}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </Button>
  );
}

