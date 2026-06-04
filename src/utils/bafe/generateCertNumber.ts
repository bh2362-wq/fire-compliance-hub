// BAFE SP203-1 — TypeScript wrapper for the get_next_bafe_cert_number
// Postgres function. Surfaces the same one-call ergonomics an edge
// function would have, without the HTTP roundtrip.
//
// Format returned: BHO-{COC|MOD|MNT|MOF}-{YYYY}-{NNNNN}
//   - COC = compliance, MOD = modular, MNT = maintenance,
//     MOF = modification.
//   - YYYY resets the sequence per calendar year.
//   - NNNNN is zero-padded to 5 digits, atomic per (type, year).

import { supabase } from "@/integrations/supabase/client";
import type { BafeCertType } from "@/types/bafe";

export async function getNextBafeCertNumber(
  certType: BafeCertType,
): Promise<string> {
  // RPC name + arg shape match the Postgres function signature
  // declared in migration 20260604220000_bafe_cert_number_generator.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(
    "get_next_bafe_cert_number",
    { p_cert_type: certType },
  );
  if (error) {
    throw new Error(
      `Couldn't generate BAFE certificate number: ${error.message ?? error}`,
    );
  }
  if (typeof data !== "string" || data.length === 0) {
    // RPC returned but with no value — usually means the function
    // wasn't deployed yet (migration not applied). Surface a clear
    // message so the caller can route the user to a manual
    // workaround rather than crash.
    throw new Error(
      "BAFE certificate number generator returned no value — " +
      "verify migration 20260604220000 has been applied",
    );
  }
  return data;
}
