import { supabase } from "@/integrations/supabase/client";

export interface BankTransaction {
  transactionId: string;
  date: string;
  amount: number;
  contactId: string | null;
  contactName: string | null;
  reference: string;
  bankAccount: string | null;
  status: string;
  isReconciled: boolean;
  matchedInvoice: {
    invoiceId: string;
    invoiceNumber: string;
    amount: number;
    reference: string | null;
  } | null;
  matchConfidence: number;
}

export interface BankReconciliationSummary {
  totalTransactions: number;
  matchedCount: number;
  unmatchedCount: number;
  totalReceived: number;
  totalMatched: number;
  totalUnmatched: number;
}

export interface BankReconciliationResult {
  transactions: BankTransaction[];
  matched: BankTransaction[];
  unmatched: BankTransaction[];
  summary: BankReconciliationSummary;
}

export async function fetchBankTransactions(options?: {
  fromDate?: string;
  toDate?: string;
}): Promise<BankReconciliationResult> {
  const { data, error } = await supabase.functions.invoke("xero-bank-transactions", {
    body: {
      fromDate: options?.fromDate,
      toDate: options?.toDate,
    },
  });

  if (error) throw new Error(error.message);
  if (data.error) throw new Error(data.error);

  return {
    transactions: data.transactions || [],
    matched: data.matched || [],
    unmatched: data.unmatched || [],
    summary: data.summary || {
      totalTransactions: 0,
      matchedCount: 0,
      unmatchedCount: 0,
      totalReceived: 0,
      totalMatched: 0,
      totalUnmatched: 0,
    },
  };
}

export interface ApplyPaymentResult {
  success: boolean;
  payment: {
    paymentId: string;
    invoiceId: string;
    amount: number;
    date: string;
    status: string;
  };
}

export async function applyPaymentToInvoice(options: {
  invoiceId: string;
  bankTransactionId?: string;
  amount: number;
  date?: string;
}): Promise<ApplyPaymentResult> {
  const { data, error } = await supabase.functions.invoke("xero-apply-payment", {
    body: {
      invoiceId: options.invoiceId,
      bankTransactionId: options.bankTransactionId,
      amount: options.amount,
      date: options.date,
    },
  });

  if (error) throw new Error(error.message);
  if (data.error) throw new Error(data.error);

  return data;
}
