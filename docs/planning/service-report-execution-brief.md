# Service Report — Claude Code Execution Brief

**Prerequisite:** Quote Refactor stable in production. Do not start before.
**Branch:** new feature branch off `main`, named `feat/service-report-vNext`.
**Target rollout:** chunked, each chunk independently shippable behind a feature flag.

---

## Mission

Replace the engineer's manual template-filling workflow with a guided
mobile-first capture flow that produces a BS 5839-1:2025 service report PDF,
records defects in the `site_defects` register, and queues them for the quote
pipeline. Build on top of what's already in the codebase — do **not** rewrite
the existing checklist, PDF generator, or defect register.

---

## Decisions — locked

### From the reconciliation sheet

| # | Decision |
|---|---|
| 1 | BS 5839-1:**2025** throughout. Replace the one stale "2017" string in `CHECKLIST_LABELS.certification.bs5839CertIssued`. |
| 2 | Defect severity is **Cat 1/2/3**. The persistent store (`site_defects`) already uses this; rewrite the smart-form payload + PDF generator's severity vocabulary to match. |
| 3 | **Keep `report_number` JOB/CERT** scheme. Drop `service_ref` from the design. |
| 4 | **Dual storage.** Photos and in-flight drafts: Supabase Storage. Final signed PDF: SharePoint via the existing `certSharePointUpload` path. |
| 5 | **Keep `src/lib/serviceReportGenerator.ts` (jsPDF)** as the renderer. Extend it; do not rewrite to DOCX. |

### From the seven open design questions

| # | Decision |
|---|---|
| Offline | Required. PWA + IndexedDB queue for visit drafts and photos. Sync on reconnect. |
| Photo storage | Supabase Storage. Folder: `service-photos/{site_id}/{visit_id}/`. |
| Signature | HTML5 canvas, stored as PNG data URL in `service_reports.{engineer,client}_signature`. Existing field shape. |
| Output format | **PDF only** for v1. No DOCX. |
| Auto-email | Explicit "Send Now" / "Save Draft" buttons. **No grace-period auto-send.** |
| Engineer sig | Stored once on the user profile, re-used per visit, re-sign option. |
| Scheduling | `next_service_due` field only. No calendar integration in v1. |

---

## Out of scope (state explicitly to prevent sprawl)

- Native iOS/Android app — PWA only
- Voice-to-text dictation
- AI photo analysis of defects
- Customer self-service portal
- ARC-direct alarm integration
- Calendar / scheduling automation
- DOCX output of any kind

---

## Schema changes — single migration

Add to `service_reports`:

```sql
ALTER TABLE public.service_reports
  ADD COLUMN arrival_time        timestamptz,
  ADD COLUMN departure_time      timestamptz,
  ADD COLUMN mileage_miles       integer,
  ADD COLUMN arc_connected       boolean,
  ADD COLUMN system_status       text CHECK (system_status IN
    ('fully_operational','advisory_only','partial_operation','not_operational')),
  ADD COLUMN isolation_details   text,
  ADD COLUMN client_sign_name    text,
  ADD COLUMN client_sign_position text,
  ADD COLUMN panel_id            uuid REFERENCES public.panels(id);
```

Update `visits.visit_type` CHECK constraint:

```sql
ALTER TABLE public.visits DROP CONSTRAINT visits_visit_type_check;
ALTER TABLE public.visits ADD CONSTRAINT visits_visit_type_check
  CHECK (visit_type IN
    ('routine_3mo','routine_6mo','annual','reactive','commissioning'));
-- Plus a data migration: quarterly_service→routine_3mo, annual_inspection→annual,
-- emergency→reactive, remedial→reactive
```

New child table — battery tests (the only one current schema can't represent):

```sql
CREATE TABLE public.service_report_battery_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_report_id uuid NOT NULL REFERENCES public.service_reports(id) ON DELETE CASCADE,
  panel_or_psu_label text NOT NULL,
  install_date date,
  terminal_voltage_v numeric(4,2),
  charge_current_ma integer,
  load_test_result text CHECK (load_test_result IN ('pass','fail','not_tested')),
  recommendation text CHECK (recommendation IN ('retain','replace')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Attach photos to defects via the existing `file_uploads` table:

```sql
ALTER TABLE public.file_uploads
  ADD COLUMN defect_id uuid REFERENCES public.site_defects(id) ON DELETE SET NULL;
```

Add engineer signature to user profile:

```sql
ALTER TABLE public.profiles ADD COLUMN engineer_signature text; -- PNG data URL
```

**Materials** stay as a free-text field in `parts_used` for v1.
Catalogue-linked materials capture deferred to v2.

**Activities checklist** stays in `service_reports.checklist` JSONB.
The existing 17-section, ~58-item `BS5839Checklist` is correct and complete.

---

## Build plan — 7 shippable chunks

Each chunk merges to `main` behind a feature flag (`flag.service_report_v_next`).
Acceptance criteria are testable; if they don't pass, don't merge.

### Chunk 1 — Schema + service layer (3 days)

**Deliverables:**
- Migration file with everything in the section above
- Extend `src/services/serviceReportService.ts` with the new columns
- Add `src/services/batteryTestService.ts` (CRUD for the new child table)
- Update `BS5839Payload` in `src/services/smartFormService.ts`: rename
  `severity` values Critical/Major/Minor/Advisory → `1`/`2`/`3`/null
- Backfill script: existing `service_reports.defects_found` free text stays as-is
  (no automated parse), but any rows already in `site_defects` keep their Cat 1/2/3

**Acceptance:**
- Migration applies clean against a copy of prod
- `createServiceReport()` and `updateServiceReport()` round-trip the new fields
- Existing service report tests still green

### Chunk 2 — Mobile capture form (1 week)

**Deliverables:**
- New route `/visits/:visitId/service-report/capture` rendering a 9-step wizard
  (matches the brief's Step 1–9 flow)
- Each step is its own component under `src/features/serviceReport/steps/`
- Tap-friendly Yes/No/NA tiles for the 58-item checklist, one section at a time,
  progress indicator
- "Add Defect" form posting to `site_defects` via `defectService.createDefect()`
  with `visit_id` and `report_id` populated
- Battery test form per panel/PSU
- System status + isolation details on departure

**Acceptance:**
- A new visit can be captured end-to-end on a phone (Chrome DevTools mobile
  emulation is the test surface; physical device sign-off before flag flip)
- All 58 checklist items render and persist
- Defects created in the wizard appear in `site_defects` with the correct
  category

### Chunk 3 — Offline + photo upload queue (1 week)

**Deliverables:**
- Service worker that caches the wizard route shell
- IndexedDB store for in-flight visits and queued photos
  (`src/lib/offlineQueue.ts`)
- Photo capture writes to IndexedDB immediately, uploads to Supabase Storage on
  reconnect with exponential backoff
- Background sync of visit-draft mutations when connection returns
- UI badge showing "Offline — N items pending sync"

**Acceptance:**
- Capture a full visit with airplane mode on, re-enable network, watch the
  visit and photos sync without engineer intervention
- No data loss across browser refresh while offline
- Photo URLs in `file_uploads` resolve after sync

### Chunk 4 — Signature capture (2 days)

**Deliverables:**
- Canvas signature component (`src/features/serviceReport/SignaturePad.tsx`)
  using `signature_pad` library or hand-rolled
- Output: PNG data URL stored on `service_reports.engineer_signature` /
  `client_signature`
- Engineer signature option to "use saved signature" pulling from
  `profiles.engineer_signature`
- "Save as my default" toggle on engineer signature
- Client signature mandatory before sign-off if `client_present=true`;
  "Client not present on site" option writes literal `"absent"` (PDF generator
  already handles this — line 463–467)

**Acceptance:**
- Engineer can save a signature once and re-use it on subsequent visits
- Client signature capture works on touch input (test on phone)
- Both signatures render correctly in the PDF

### Chunk 5 — AI recommendations (2 days)

**Deliverables:**
- New Supabase edge function `generate-service-recommendations`
- Prompt below, called on "Generate Recommendations" button press
- Inserts into `service_reports.recommendations` field
- Engineer edits before sign-off — the AI output is a draft, not final

**Prompt:**

```
You are generating the "Recommendations & Next Service" paragraph for a
BS 5839-1:2025 service report. Write 2-4 sentences in professional UK
English, based on the defects and activity results captured during the
visit.

Inputs:
- visit_type: one of routine_3mo / routine_6mo / annual / reactive / commissioning
- defects: array of { description, location, category (1|2|3), action_required }
- checklist_summary: counts of yes / no / na results across all 17 sections
- next_service_due: ISO date

Rules:
- Reference defects by Category count (e.g. "two Category 2 defects")
- Cite BS 5839-1:2025 clauses where relevant (Cl.45 routine, Cl.46 non-routine)
- State the next service due date
- If any Category 1 defects exist, lead with the urgency of rectification
- If no defects, state the system is fully compliant
- Do NOT exceed 4 sentences
- Do NOT include legal advice, warranty language, or speculation
- Return JSON: { "recommendations": "<text>" }
```

**Acceptance:**
- 5 sample visit inputs (zero defects / 1 Cat 1 / 2 Cat 2 / mixed / annual)
  produce coherent, non-hallucinated paragraphs
- Output stays inside 4 sentences in every sample
- Engineer can edit and the edited version persists

### Chunk 6 — PDF generator extension (2 days)

**Deliverables:**
- Extend `src/lib/serviceReportGenerator.ts`:
  - Add arrival/departure/mileage to the SERVICE block
  - Add "System status on departure" line with isolation details when non-operational
  - Render battery tests as a small table after DEVICE TESTING
  - Update severity colour-coding to use Cat 1/2/3 (line 421–427 today is
    Critical/Major/Minor)
  - Insert AI recommendations paragraph between WORK CARRIED OUT and DEFECTS
- Fix the one stale "BS5839-1:2017" string in `CHECKLIST_LABELS`
- SharePoint upload on visit completion uses existing `certSharePointUpload`

**Acceptance:**
- Generated PDF for a sample visit visually matches the existing report
  layout, with the new sections in place
- All 17 checklist sections still render with correct colour coding
- Two regression visits from before the change still produce identical PDFs
  (excluding the new fields, which are blank)

### Chunk 7 — Quote pipeline seam (1 day)

**Deliverables:**
- On visit completion, every defect in `site_defects` with `quotation_id IS NULL`
  and `status = 'open'` becomes visible in the estimator's dashboard as
  "Defects awaiting quote: SR-XXXX"
- Add a "Flag for quote" toggle on the defect capture step. When on,
  `site_defects.status` stays `open` (already the default — no schema change).
  When off, defect is captured as `accepted_risk` (no quote needed).
- Notification (in-app, optionally email) to the estimator role on completion
  of a visit that produced ≥1 quoteable defect

**Acceptance:**
- Complete a test visit with 2 Cat 2 defects flagged for quote → both appear
  in the estimator dashboard within 60s
- When the estimator generates a quote from one, `site_defects.quotation_id`
  populates and the defect's status moves to `quoted`

### Chunk 8 — Regression, polish, flag flip (3-5 days)

**Deliverables:**
- E2E test: book visit → capture offline → sign → sync → PDF → SharePoint →
  defects in dashboard
- Visual regression on 5 historical reports
- Engineer training note (one-pager, separate from this brief)
- Flip the feature flag for one engineer for 2 weeks of real visits, then GA

**Acceptance:**
- Two weeks of real-engineer visits with zero data loss
- No regression in existing certificate or report flows
- BHO Fire admin signs off on the SharePoint archive shape

---

## Realistic total: 5-6 weeks elapsed

Not 4. The planning brief's 4-week estimate assumed greenfield; the truthful
estimate factors in:

- The 3-day schema chunk (was 1 week — bones exist)
- The 1-week offline chunk (was bundled into "polish")
- Real-engineer field validation (chunk 8) replaces "1 week testing"

---

## Anti-sprawl guardrails — things Claude Code must NOT do

- Do not rewrite `BS5839Checklist`, `serviceReportService.ts`, or
  `serviceReportGenerator.ts` from scratch. Extend.
- Do not introduce a new defect table. `site_defects` is the register.
- Do not introduce `quote_drafts` or `work_items`. The quote pipeline already
  uses `quotations` + `quotation_line_items` and `site_defects.quotation_id`
  is the FK seam.
- Do not add DOCX generation.
- Do not add scheduling/calendar features.
- Do not auto-email without an explicit "Send" button.
- Do not refactor adjacent code "while we're here." Each chunk's diff stays
  inside its own scope.

---

## Files that change vs files that stay

**Change:**
- `src/services/serviceReportService.ts` — extend
- `src/services/smartFormService.ts` — severity vocabulary
- `src/lib/serviceReportGenerator.ts` — extend
- `supabase/migrations/<new>.sql` — single migration

**New:**
- `src/services/batteryTestService.ts`
- `src/features/serviceReport/` (wizard + steps + signature pad + offline queue)
- `supabase/functions/generate-service-recommendations/`

**Stay (do not touch):**
- `BS5839Checklist` interface and `CHECKLIST_LABELS` (except the one 2017 typo)
- `defectService.ts` — already correct
- `certSharePointUpload.ts` — reuse as-is
- All other certificate / quote / customer-form flows

---

## Sign-off

Ben signed off on 2026-05-21:

- [x] 5 reconciliation decisions confirmed
- [x] 7 design decisions confirmed
- [x] 5-6 week timeline accepted (vs original 4)
- [x] Chunk 8's "2 weeks of real-engineer visits before GA" accepted

**Still gated:** Quote Refactor must be stable in production before kickoff.
Reconfirm that gate at the moment of starting Chunk 1, not on the basis of
this document.
