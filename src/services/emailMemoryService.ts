// Cross-document email recipient memory.
//
// On every successful email send (quote / report / RAMS / PO) the
// dialogs call rememberLastRecipients() with the list that actually
// went out. The next time *any* email dialog opens for the same
// customer, the default recipients prefer this list over the
// type-specific columns — so an address typed once carries through
// every following document. Backed by the customers.last_email_recipients
// column added in 20260603150000.

import { supabase } from "@/integrations/supabase/client";

export async function rememberLastRecipients(
  customerId: string | null | undefined,
  recipients: string[],
): Promise<void> {
  if (!customerId) return;
  const list = recipients.map((e) => e.trim()).filter(Boolean).join(", ");
  if (!list) return;
  // Best-effort — never throw. A failed remember mustn't block the
  // actual send-success flow (lock the quote, log the email, etc.).
  // Older deployments where the migration hasn't applied will see
  // a column-missing error here; we log and move on.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("customers")
    .update({ last_email_recipients: list })
    .eq("id", customerId);
  if (error) {
    console.warn("[emailMemory] couldn't persist last recipients:", error.message);
  }
}
