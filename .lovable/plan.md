# Audit: AI / Prefill Surfaces

The system already has a partial prefill capability (`smartPrefillService` for Smart Forms, `quotationToQuoteInput` for DOCX). But the **AI-generation surfaces** below either ask the engineer to retype everything, or pull from the quotation row only — they never harvest the site file.

## AI / form surfaces that should be auto-prefilled from site data

| # | Surface | Where | Currently prefilled from | Gap |
|---|---|---|---|---|
| 1 | **AI Scope Writer (BS 5839)** | `ScopeWriterDialog.tsx` → `generate-bs5839-scope` | Quotation row fields only | No site_assets, no prior cert, no contract category |
| 2 | **AI RAMS** | `RamsJobSelectorDialog` → `generate-rams-ai` | Just visit_type + notes | No panel make, no access notes, no asset count |
| 3 | **AI Defect Quote** | `AIDefectQuoteDialog` → `generate-defect-quote` | Defect text only | No system context |
| 4 | **AI Pricing Narrative** | `usePricingNarrative` → `generate-pricing-narrative` | Job text | No site asset baseline |
| 5 | **Quotation DOCX export** | `useGenerateQuoteDocx` | Quotation row | Could enrich with system spec block |
| 6 | **Smart Form prefill** | `smartPrefillService` | Last cert + service report + site | **Does NOT read `site_assets`** — biggest miss |
| 7 | **Job Sheets (visit notes / RAMS engineer briefing)** | `RamsEngineerBriefing` | Visit row | No asset summary, no access notes, no battery age |

## Single source of truth: `getSiteIntelligence(siteId)`

A new service `src/services/siteIntelligenceService.ts` will return one normalised object that every surface above can layer in:

```text
SiteIntelligence {
  site:        { name, address, postcode, contact_*, access_notes, parking_notes, gate_code }
  contract:    { category, frequency, service_type, included_visits } | null    // from site_service_contracts (fire_alarm)
  panel:       { manufacturer, model, loops_count, zones_count, location, age_years } | null  // from site_assets where asset_type='fire_panel'
  devices:     { total, by_type, manufacturers[] }                              // aggregated from site_assets + sites.total_devices
  battery:     { fitted_year, age_years, suggested_replace_year } | null        // from site_assets notes / latest cert
  features:    { arc_signal, voice_alarm, wireless, bms_interface, lift_recall } // inferred from latest cert payload + asset notes
  building:    { type, occupancy, storeys } | null                              // from latest cert payload
  latest_cert: { reference, date, form_type, has_defects }                      // for "last serviced" line
  latest_defects: string[]                                                      // top 3 open from defects table
  tagging:     { protocol, scheme }                                             // from site_assets.notes JSON
}
```

Single round-trip: one Postgres call per source (`sites`, `site_assets`, `site_service_contracts`, `smart_form_submissions`, `defects`) in parallel, then merged client-side. Cached per-session via React Query (`["site-intel", siteId]`).

## Phased rollout

**Phase 1 — Foundation (this PR)**
1. Create `src/services/siteIntelligenceService.ts` returning the shape above.
2. Create `src/hooks/useSiteIntelligence.ts` (React Query wrapper, 5 min stale).
3. Extend `smartPrefillService` to also layer `site_assets` data (panel, devices, ARC) under the existing precedence rules — fixes the biggest current gap.

**Phase 2 — Scope Writer**
4. In `ScopeWriterDialog`, on open, fetch `useSiteIntelligence(q.site_id)` and prefill any blank field (manufacturer, panel, loops, building type, ARC, voice alarm, etc.). Show a small "Prefilled from site file" pill, like the existing `SitePrefillPanel` pattern. Never overwrite a non-empty quotation field.
5. Forward the same payload into the `generate-bs5839-scope` request body under a new `site_context` key so the AI also sees device counts, last service date, and known defects.

**Phase 3 — RAMS + other AI generators**
6. `RamsJobSelectorDialog` / `generate-rams-ai`: pass site intelligence (panel make, access notes, asset list) so generated method statements and site-specific hazards are accurate from the first run.
7. `AIDefectQuoteDialog` / `generate-defect-quote`: include panel + device baseline so quoted parts match the actual system.
8. `usePricingNarrative`: include device counts for normalisation.

**Phase 4 — Job sheets & briefings**
9. `RamsEngineerBriefing` and visit detail views show a compact "Site at a glance" panel sourced from `useSiteIntelligence` (panel, loops, devices, ARC, last service, gate code, parking).
10. Quotation DOCX: optionally append a "System overview" paragraph derived from the same payload.

## Technical notes (for the dev)

- All reads are pure-SELECT against existing tables — **no schema migration required**.
- Battery age = `EXTRACT(YEAR FROM age(now(), (site_assets.notes::jsonb->>'battery_fitted_date')::date))` when present, else inferred from latest cert. Falls back to `null`.
- Tagging protocol lives in `site_assets.notes` JSON (per Asset Tags memory) — parse defensively.
- Features (`arc_signal`, `voice_alarm`, etc.) are merged with precedence: latest cert payload > asset notes > false.
- Every consumer treats the result as **suggestions only** — engineer can still overwrite any field before generation. Empty / null fields silently skip prefill, never write "Unknown".
- Add a new memory `mem://features/ai/site-intelligence-prefill` documenting the service shape and precedence rules once Phase 1 lands.

## Out of scope (per your answer — site_assets only for now)

- Pulling from quotation history, service contracts categorisation beyond `category`, defect history beyond "top 3 open", or external sources (SharePoint photos, Companies House). Easy to add later by extending the single service.

## Deliverable for Phase 1 (next reply if you approve)

Files I will create / edit:
- **new** `src/services/siteIntelligenceService.ts`
- **new** `src/hooks/useSiteIntelligence.ts`
- **edit** `src/services/smartPrefillService.ts` — layer in `site_assets` data
- **edit** `src/features/quotes/ScopeWriterDialog.tsx` — call the hook, prefill blanks, show pill

Estimated ~250 LoC, no DB changes, no edge function changes for Phase 1.
