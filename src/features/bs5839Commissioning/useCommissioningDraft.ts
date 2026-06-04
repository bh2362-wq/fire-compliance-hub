import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type {
  Bs5839CheckResponse,
  Bs5839CommissioningCert,
  Bs5839SystemState,
} from "@/types/bs5839";

// State + persistence for the BS 5839-1 §39 commissioning wizard.
// Manages three rows in sync:
//   site_bafe_certificates       — parent cert (bs5839_cert_type='commissioning')
//   bs5839_commissioning_certs   — A051 header (1:1 with parent)
//   bs5839_commissioning_checks  — 33 Y/N/NA responses
//
// On mount the hook tries to find an existing draft for this visit
// (bs5839_cert_type='commissioning' AND visit_id matches). If found,
// loads it. If not, eagerly creates a new parent + header on first
// successful save so the engineer doesn't have a "no row yet" UX.

export interface ParentCert {
  id: string;
  certificate_number: string;
  bs5839_install_category: string | null;
  variations_list: string | null;
  issued_date: string | null;
  voided: boolean;
}

export type CommissioningHeader = Omit<Bs5839CommissioningCert, "id" | "cert_id" | "created_at" | "updated_at">;

export interface CommissioningCheckState {
  item_number: number;
  response: Bs5839CheckResponse | null;
  notes: string | null;
}

interface VisitContext {
  site_id: string | null;
  customer_id: string | null;
  job_number: string | null;
  visit_date: string | null;
}

const EMPTY_HEADER: CommissioningHeader = {
  customer_name: null,
  customer_address: null,
  customer_postcode: null,
  system_state: null,
  extent_of_system: null,
  exam_all_equipment_operates: null,
  exam_install_acceptable: null,
  exam_inspected_per_39_2c: null,
  exam_performs_to_spec: null,
  exam_no_false_alarm_potential: null,
  exam_documentation_provided: null,
  specifier: null,
  soak_test_weeks: null,
  outstanding_work: null,
  false_alarm_risks: null,
  design_cert_number: null,
  design_drawings_ref: null,
  installation_cert_number: null,
  as_fitted_drawings_ref: null,
  incomplete_work_details: null,
  incomplete_work_reasons: null,
  further_visit_required: null,
};

function makeEmptyChecks(): CommissioningCheckState[] {
  return Array.from({ length: 33 }, (_, i) => ({
    item_number: i + 1,
    response: null,
    notes: null,
  }));
}

export interface CommissioningDraft {
  loading: boolean;
  saving: boolean;
  error: Error | null;
  visit: VisitContext;
  cert: ParentCert | null;
  header: CommissioningHeader;
  checks: CommissioningCheckState[];
  /** Update one field on the header. */
  patchHeader: (p: Partial<CommissioningHeader>) => void;
  /** Update one checklist response. */
  patchCheck: (itemNumber: number, response: Bs5839CheckResponse, notes?: string | null) => void;
  /** Update Cl 39 variations on the parent cert (variations_list). */
  patchVariations: (text: string) => void;
  /** Set the install category on the parent cert. */
  patchCategory: (text: string) => void;
  /** Bulk-set every checklist item to the same response. */
  bulkPatchChecks: (response: Bs5839CheckResponse) => void;
  /** Persist everything to the DB. Creates the cert row if it doesn't
   *  exist yet. Returns the cert id (existing or newly created). */
  save: () => Promise<string>;
}

export function useCommissioningDraft(visitId: string): CommissioningDraft {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [visit, setVisit] = useState<VisitContext>({
    site_id: null, customer_id: null, job_number: null, visit_date: null,
  });
  const [cert, setCert] = useState<ParentCert | null>(null);
  const [header, setHeader] = useState<CommissioningHeader>(EMPTY_HEADER);
  const [checks, setChecks] = useState<CommissioningCheckState[]>(makeEmptyChecks());
  // Variations + install category live on the parent cert row — we
  // hold draft state for them separately and flush during save().
  const [variationsDraft, setVariationsDraft] = useState<string | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // 1. Load visit context (need site_id + job_number for cert
        //    creation later).
        const { data: visitData, error: visitErr } = await supabase
          .from("service_visits")
          .select("site_id, job_number, visit_date, sites(customer_id)")
          .eq("id", visitId)
          .maybeSingle();
        if (visitErr) throw visitErr;
        if (!visitData) throw new Error("Visit not found");
        if (cancelled) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const v = visitData as any;
        setVisit({
          site_id: v.site_id ?? null,
          customer_id: v.sites?.customer_id ?? null,
          job_number: v.job_number ?? null,
          visit_date: v.visit_date ?? null,
        });

        // 2. Find existing commissioning cert for this visit.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: existingCert, error: certErr } = await (supabase as any)
          .from("site_bafe_certificates")
          .select("id, certificate_number, bs5839_install_category, " +
                  "variations_list, issued_date, voided")
          .eq("visit_id", visitId)
          .eq("bs5839_cert_type", "commissioning")
          .eq("voided", false)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (certErr) throw certErr;

        if (existingCert) {
          if (cancelled) return;
          setCert(existingCert);
          setVariationsDraft(existingCert.variations_list ?? null);
          setCategoryDraft(existingCert.bs5839_install_category ?? null);

          // Load header + checks.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: headerData } = await (supabase as any)
            .from("bs5839_commissioning_certs")
            .select("*")
            .eq("cert_id", existingCert.id)
            .maybeSingle();
          if (cancelled) return;
          if (headerData) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const h = headerData as any;
            const filled: CommissioningHeader = { ...EMPTY_HEADER };
            (Object.keys(EMPTY_HEADER) as (keyof CommissioningHeader)[]).forEach((k) => {
              if (k in h) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (filled as any)[k] = h[k];
              }
            });
            setHeader(filled);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: checkData } = await (supabase as any)
              .from("bs5839_commissioning_checks")
              .select("item_number, response, notes")
              .eq("commissioning_cert_id", headerData.id);
            if (cancelled) return;
            if (checkData && checkData.length > 0) {
              const next = makeEmptyChecks();
              for (const row of checkData) {
                const idx = row.item_number - 1;
                if (idx >= 0 && idx < 33) {
                  next[idx] = {
                    item_number: row.item_number,
                    response: row.response,
                    notes: row.notes ?? null,
                  };
                }
              }
              setChecks(next);
            }
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error(String(e)));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visitId]);

  const patchHeader = useCallback((p: Partial<CommissioningHeader>) => {
    setHeader((s) => ({ ...s, ...p }));
  }, []);

  const patchCheck = useCallback((
    itemNumber: number,
    response: Bs5839CheckResponse,
    notes?: string | null,
  ) => {
    setChecks((s) =>
      s.map((c) =>
        c.item_number === itemNumber
          ? { ...c, response, notes: notes !== undefined ? notes : c.notes }
          : c,
      ),
    );
  }, []);

  const bulkPatchChecks = useCallback((response: Bs5839CheckResponse) => {
    setChecks((s) => s.map((c) => ({ ...c, response })));
  }, []);

  const patchVariations = useCallback((text: string) => {
    setVariationsDraft(text);
  }, []);

  const patchCategory = useCallback((text: string) => {
    setCategoryDraft(text);
  }, []);

  const save = useCallback(async (): Promise<string> => {
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;

      // 1. Ensure parent cert exists. Lazy-create on first save so
      //    abandoned drafts don't litter the register with empty rows.
      let certId = cert?.id ?? null;
      if (!certId) {
        if (!visit.site_id) throw new Error("Visit has no site — cannot create cert");
        if (!uid) throw new Error("Not signed in");
        // Number convention: A051-<job_number>, or A051-<visit_id_prefix>
        // when no job number. Mirrors the form code on the printed cert.
        const numPart = visit.job_number ?? visitId.slice(0, 8);
        const certNumber = `A051-${numPart}`;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: inserted, error: insErr } = await (supabase as any)
          .from("site_bafe_certificates")
          .insert({
            site_id: visit.site_id,
            customer_id: visit.customer_id,
            visit_id: visitId,
            certificate_type: "commissioning",
            certificate_number: certNumber,
            bs5839_cert_type: "commissioning",
            bs5839_install_category: categoryDraft,
            variations_list: variationsDraft,
            completion_date: visit.visit_date,
            issued_date: null,
            issued_by: uid,
            status: "draft",
          })
          .select("id, certificate_number, bs5839_install_category, " +
                  "variations_list, issued_date, voided")
          .single();
        if (insErr) throw insErr;
        certId = inserted.id;
        setCert(inserted);
      } else {
        // Existing cert — push the variations + category drafts up.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updErr } = await (supabase as any)
          .from("site_bafe_certificates")
          .update({
            bs5839_install_category: categoryDraft,
            variations_list: variationsDraft,
          })
          .eq("id", certId);
        if (updErr) throw updErr;
      }

      // 2. Upsert commissioning header row.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existingHeader } = await (supabase as any)
        .from("bs5839_commissioning_certs")
        .select("id")
        .eq("cert_id", certId)
        .maybeSingle();
      let headerId: string;
      if (existingHeader?.id) {
        headerId = existingHeader.id;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updErr } = await (supabase as any)
          .from("bs5839_commissioning_certs")
          .update(header)
          .eq("id", headerId);
        if (updErr) throw updErr;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: newHeader, error: insErr } = await (supabase as any)
          .from("bs5839_commissioning_certs")
          .insert({ cert_id: certId, ...header })
          .select("id")
          .single();
        if (insErr) throw insErr;
        headerId = newHeader.id;
      }

      // 3. Upsert all 33 checklist responses that have a non-null
      //    response. Items the engineer left blank stay absent from
      //    the table so we can distinguish "didn't answer" from
      //    "answered N/A".
      const answeredChecks = checks.filter((c) => c.response !== null);
      if (answeredChecks.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: chkErr } = await (supabase as any)
          .from("bs5839_commissioning_checks")
          .upsert(
            answeredChecks.map((c) => ({
              commissioning_cert_id: headerId,
              item_number: c.item_number,
              response: c.response,
              notes: c.notes,
            })),
            { onConflict: "commissioning_cert_id,item_number" },
          );
        if (chkErr) throw chkErr;
      }

      return certId!;
    } finally {
      setSaving(false);
    }
  }, [cert, visit, visitId, categoryDraft, variationsDraft, header, checks]);

  return {
    loading, saving, error, visit, cert, header, checks,
    patchHeader, patchCheck, patchVariations, patchCategory, bulkPatchChecks, save,
  };
}
