# Template Field Mapping — Verified

Verification of the original Template Field Mapping checklist against the
actual Supabase schema (`src/integrations/supabase/types.ts`, regenerated
after the Service Report vNext and Visit Documents schema work).

**Status legend:**
- ✅ Exists with the expected name
- 🔄 Exists under a different name (noted in the row)
- ⚠️ Missing — needs a migration before code-gen of that template is faithful
- 🆓 Static / boilerplate

**Big-picture finding:** the original checklist's working assumption was
*"system info lives on `sites`."* It doesn't. The `sites` table is thin —
address, contact, parking, gate code, status. System info (panel make /
model, BS 5839 category, zones, devices, ARC) is **scattered across three
tables** today:
- `service_reports` — panel_manufacturer, panel_model, panel_location,
  system_type, system_status, arc_connected, zones_count, devices_count
- `quotations` — system_manufacturer, system_panel, system_type,
  building_type, occupancy_type, loop_count, device_count, system_features
- `site_assets` — per-panel asset rows (manufacturer, model, zones_count,
  loops_count, serial_number)

That scatter is the single biggest blocker to faithful code-gen across
multiple templates. Recommended fix at the bottom.

---

## 1. Quote Template

| Field | Source | Status | Notes |
|---|---|---|---|
| Logo / brand chassis | hardcoded | 🆓 | |
| Quote ref (BHO-Q-…) | `quotations.quotation_number` | 🔄 | Column is `quotation_number`, not `ref` |
| Date issued | `quotations.created_at` | 🔄 | No `issued_at` — use `created_at`, or `site_visit_date` for the visit |
| Valid until | `quotations.valid_until` | ✅ | |
| Client info | `customers.*` | ✅ | |
| Project name | `quotations.title` | 🔄 | Column is `title`, not `project_name` |
| Site name / address | `sites.*` | ✅ | |
| System (panel make/model) | `quotations.system_manufacturer` / `.system_panel` | ✅ | On quotations, not sites |
| Standard (BS 5839-1 Cat …) | `quotations.system_type` | 🔄 | Stores L1/L2/etc. directly |
| Enquiry ref / client ref | `quotations.client_po_number` | 🔄 | Closest field; no explicit `client_ref` |
| Summary paragraph | `quotations.summary` | ✅ | |
| System description | `quotations.existing_system_description` | ✅ | |
| Detailed scope | `quotations.scope` | ✅ | |
| Phasing & Programme | n/a (AI-gen, lives inside `scope`) | ⚠️ | No dedicated column; brief's "Round 5 fix" still applies |
| Line items | `quotation_line_items.*` | ✅ | |
| Subtotal / VAT / TOTAL | calculated | ✅ | `vat_rate` on quotations |
| Exclusions / Assumptions | `quotations.exclusions` / `.assumptions` | ✅ | |
| Static template sections | hardcoded | 🆓 | |
| Issued by (Name / Position / Email) | `profiles.*` via `quotations.created_by` | ✅ | |

**Quote: substantially complete.** Cosmetic name mismatches but the data is there.

---

## 2. Service Report — substantially complete after Chunk 1

The original checklist marked ~25 fields as ⚠️. After the Service Report vNext Chunk 1 migration this has flipped — most exist now.

| Field | Source | Status | Notes |
|---|---|---|---|
| Header / footer | hardcoded | 🆓 | |
| Service ref | `service_reports.report_number` | ✅ | JOB/CERT prefix via `get_next_report_number` |
| Date of visit | `service_visits.visit_date` | ✅ | |
| Visit type | `service_visits.visit_type` | ✅ | Old enum preserved (subcontract etc.) |
| Client / site / engineer info | joined | ✅ | |
| Arrival / departure | `service_reports.arrival_time` / `.departure_time` | ✅ | Added Chunk 1. Also `service_visits.arrived_at`/`departed_at` (engineer mobile flow) |
| Mileage | `service_reports.mileage_miles` | ✅ | Added Chunk 1 |
| Panel make / model / location | `service_reports.panel_manufacturer` / `.panel_model` / `.panel_location` | ✅ | On service_reports today (see scatter note) |
| BS 5839 category | `service_reports.system_type` | 🔄 | Stores L1 etc. |
| Year installed | — | ⚠️ | Not stored anywhere |
| Zones / devices | `service_reports.zones_count` / `.devices_count` | ✅ | Loops not explicit (on `site_assets.loops_count` per panel) |
| ARC connected | `service_reports.arc_connected` | ✅ | Added Chunk 1 |
| Last service date | derived from `service_visits` | ✅ | `MAX(visit_date)` for this site |
| 17-section / 80-item activity checklist | `service_reports.checklist` JSONB | ✅ | Full BS5839 + BAFE shape |
| Battery tests (per PSU) | `service_report_battery_tests` | ✅ | Child table from Chunk 1 |
| Defects (Cat 1/2/3) | `site_defects` | ✅ | Already existed with Cat 1/2/3 enum |
| Works carried out | `service_reports.work_carried_out` | ✅ | |
| Materials used | `service_reports.parts_used` | 🔄 | Free text. Catalogue-linked materials table was deferred to v2 |
| System status on departure | `service_reports.system_status` | ✅ | Added Chunk 1, with CHECK constraint |
| Isolation details | `service_reports.isolation_details` | ✅ | Added Chunk 1 |
| Recommendations | `service_reports.recommendations` | ✅ | (AI generation is Chunk 5, unbuilt) |
| Next service due | `service_reports.next_service_due` | ✅ | |
| Client signature + name + position | `service_reports.client_signature` / `.client_sign_name` / `.client_sign_position` | ✅ | Added Chunk 1 |
| Engineer signature | `service_reports.engineer_signature` (+ `profiles.engineer_signature` for default) | ✅ | Chunk 4 |

**Service Report status:** mostly complete. **2 genuine gaps** left:
- Year installed (not stored anywhere)
- Catalogue-linked materials (free text today; was deferred to v2)

---

## 3. Maintenance Proposal — greenfield

No `maintenance_proposals` table. No customer-level SLA or per-customer pricing. Almost every operational field ⚠️ missing.

| Field | Source | Status |
|---|---|---|
| Proposal ref / date issued | new table | ⚠️ |
| Client / site | `customers` / `sites` | ✅ |
| Site contact / FRP / Duty Holder / Responsible Person | `sites.contact_name` (single contact, no FRP/DH distinction) | 🔄 partial |
| Access hours | `sites.access_notes` (free text only) | 🔄 |
| Panel / category / zones / loops / devices | see scatter note above | 🔄 |
| Year installed | — | ⚠️ |
| AI-generated proposal summary | new column | ⚠️ |
| Service schedule (intervals from BS 5839 cat) | derivable logic | 🆓 |
| SLA tiers (P1/P2/P3 response times) | new table `customer_sla` or static config | ⚠️ |
| Annual investment £ | calculated from devices × category × per-device rate | ⚠️ Pricing rules missing |
| Additional charges (callout, OOH, parts markup) | new `pricing_rates` config table | ⚠️ |
| Contract / Exclusions / Reporting / Standards | static | 🆓 |
| Acceptance signature | new fields | ⚠️ |

**Verdict:** Maintenance Proposal needs a whole new domain — `maintenance_proposals` row per proposal, plus customer-level SLA, plus pricing config. The doc itself can be **manually authored** from the static template today; **code-gen needs a dedicated planning chunk**.

---

## 4. BS 5839-1 Certificate — partial cert tracking only

`site_bafe_certificates` exists with `certificate_number`, `certificate_type`, `issued_date`, `expiry_date`, `status`, `linked_form_submission_id`, `linked_report_id` — that's **metadata tracking**, not the full cert data the template needs.

| Field | Source | Status |
|---|---|---|
| Cert ref / date issued / expiry | `site_bafe_certificates.*` | ✅ |
| Premises / client info | joined | ✅ partial |
| Premises type / occupancy | `quotations.building_type` / `.occupancy_type` (exists on quotations, not sites) | 🔄 |
| Contractor / Project manager | hardcoded + `profiles.*` | ✅ |
| Project ref (BHO-J-…) | no `jobs` table — closest is `service_visits.job_number` (text) | 🔄 |
| System category / panel make/model | see scatter — currently on quotations or service_reports | 🔄 |
| Panel software version | — | ⚠️ |
| Cable type (Standard / Enhanced FR) | — | ⚠️ |
| PSU capacity (Ah) | — | ⚠️ |
| Areas covered / not covered | — | ⚠️ |
| Variations from standard | — | ⚠️ |
| Part A Design — designer name/sig/org | no `commissioning` table | ⚠️ |
| Part B Installation — installer name/sig/org | — | ⚠️ |
| Part C Commissioning — 19 test results + actual readings | — | ⚠️ |
| Part D Acceptance — acceptor sig + documents checklist | — | ⚠️ |
| Part E Verification — third-party verifier | — | ⚠️ |

**Verdict:** Certificate code-gen needs a `commissioning` schema (Parts A–E with sigs + 19 test results) plus the "system spec" gaps (cable, PSU, software version, coverage). Substantial.

---

## 5. PAVA System Record — entirely greenfield

Zero PAVA-related tables in the schema (`grep ^      pava_` against `types.ts` returns nothing). Every PAVA-specific field is ⚠️.

If PAVA becomes a meaningful business unit, the cleanest model is its own
parallel mini-schema: `pava_systems` (site-level spec), `pava_visits` (or
reuse `service_visits` with a `pava_*` `visit_type`), `pava_stipa_results`,
`pava_modifications`, `pava_commissioning_activities`. If PAVA stays a
side-line, a few `pava_*` columns on `sites` would do.

---

## 6. Callout Report — needs visit metadata

Shares ~70% of fields with Service Report (which is mostly there). The
callout-specific bits are missing on `service_visits`:

| Field | Source | Status |
|---|---|---|
| Callout ref | `service_reports.report_number` | ✅ |
| Date of attendance | `service_visits.visit_date` | ✅ |
| Priority (P1/P2/P3/OOH/Weekend) | — | ⚠️ Not on `service_visits` |
| Commercial classification (PPM / Chargeable / Quote required) | — | ⚠️ **Important for billing** |
| Time call received | — | ⚠️ |
| Reported by / report method | — | ⚠️ |
| Engineer assigned at | — | ⚠️ |
| Engineer on site at | `service_visits.arrived_at` | ✅ |
| Total response time / SLA met | calculated | ✅ |
| Affected zones / loops | — | ⚠️ |
| ARC notified at | — | ⚠️ |
| Fault as reported / Status on arrival / Fault found / Action taken | `service_visits.engineer_notes` (single free-text field today) | 🔄 |
| Materials / labour / signatures | as Service Report | ✅ |

**Verdict:** Callout Report = Service Report + a callout-metadata block on `service_visits`. Single migration, ~10 columns. The free-text fault sections could be one JSONB or four columns; one JSONB is more flexible.

---

## Missing fields grouped by table — recommended migrations

This is the actionable shape. Each block is one PR's migration.

### Migration A — consolidate system info on `sites` (highest payoff)

This single migration unblocks faithful code-gen across **5 templates** (Service Report, Maintenance Proposal, Certificate, PAVA, Callout). The same data is currently duplicated across `service_reports`, `quotations` and `site_assets` — pulling it onto `sites` makes it the single source of truth.

```sql
ALTER TABLE public.sites
  ADD COLUMN panel_make_model       text,
  ADD COLUMN bs5839_category        text,        -- 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'M' | 'P1' | 'P2'
  ADD COLUMN year_installed         integer,
  ADD COLUMN num_zones              integer,
  ADD COLUMN num_loops              integer,
  ADD COLUMN num_devices            integer,
  ADD COLUMN arc_connected          boolean,
  ADD COLUMN cable_type             text,        -- 'standard' | 'enhanced_fr'
  ADD COLUMN psu_capacity_ah        numeric(5,2),
  ADD COLUMN panel_software_version text,
  ADD COLUMN areas_covered          text,
  ADD COLUMN areas_not_covered      text,
  ADD COLUMN building_type          text,
  ADD COLUMN occupancy_type         text;
```

Then write a one-shot data migration that backfills these from the latest
`service_reports` row per site (where present), so existing sites carry
their last-known system info forward.

### Migration B — callout metadata on `service_visits`

Unblocks the Callout Report template.

```sql
ALTER TABLE public.service_visits
  ADD COLUMN priority                  text,    -- 'p1' | 'p2' | 'p3' | 'ooh' | 'weekend'
  ADD COLUMN commercial_classification text,    -- 'ppm' | 'chargeable' | 'quote_required'
  ADD COLUMN call_received_at          timestamptz,
  ADD COLUMN reported_by               text,
  ADD COLUMN report_method             text,    -- 'phone' | 'email' | 'portal' | 'arc'
  ADD COLUMN engineer_assigned_at      timestamptz,
  ADD COLUMN affected_zones            text[],
  ADD COLUMN affected_loops            text[],
  ADD COLUMN arc_notified_at           timestamptz,
  ADD COLUMN fault_details             jsonb;   -- { reported, on_arrival, found, action_taken }
ALTER TABLE public.service_visits
  ADD CONSTRAINT service_visits_priority_check
  CHECK (priority IS NULL OR priority IN ('p1','p2','p3','ooh','weekend'));
ALTER TABLE public.service_visits
  ADD CONSTRAINT service_visits_commercial_classification_check
  CHECK (commercial_classification IS NULL
         OR commercial_classification IN ('ppm','chargeable','quote_required'));
```

### Migration C — Maintenance Proposal domain

Own planning chunk; sketched here so you know the shape:

```sql
CREATE TABLE public.customer_sla (
  customer_id        uuid PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  p1_response_hours  numeric(5,2) DEFAULT 4,
  p2_response_hours  numeric(5,2) DEFAULT 24,
  p3_response_text   text         DEFAULT 'Next scheduled visit',
  callout_rate       numeric(8,2),
  ooh_multiplier     numeric(3,2) DEFAULT 1.5,
  parts_markup_pct   numeric(5,2) DEFAULT 30
);

CREATE TABLE public.maintenance_proposals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_ref       text UNIQUE NOT NULL,
  customer_id        uuid NOT NULL REFERENCES customers(id),
  site_id            uuid NOT NULL REFERENCES sites(id),
  issued_at          timestamptz NOT NULL DEFAULT now(),
  duty_holder_name   text,
  responsible_person text,
  access_hours       text,
  summary_paragraph  text,
  annual_investment  numeric(10,2),
  status             text NOT NULL DEFAULT 'draft',
  acceptance_signed_at timestamptz,
  acceptance_signature text,
  created_by         uuid REFERENCES auth.users(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);
```

### Migration D — Certificate commissioning data

Big chunk. Sketched only — needs its own planning brief:

```sql
CREATE TABLE public.commissioning_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         uuid NOT NULL REFERENCES sites(id),
  cert_id         uuid REFERENCES site_bafe_certificates(id),
  -- Part A
  designer_name   text, designer_position text, designer_org text, designer_signature text,
  -- Part B
  installer_name  text, installer_position text, installer_org text, installer_signature text,
  -- Part C
  commissioner_signature text,
  commissioning_tests    jsonb,   -- the 19 test pass/fail + readings
  -- Part D
  acceptor_signature text, acceptance_documents jsonb,
  -- Part E
  verifier_signature text, verifier_independent boolean,
  variations             text[],
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### Migration E — PAVA (only if PAVA work is meaningful)

Skip if PAVA is rare. Otherwise its own planning brief.

---

## Practical recommendation

1. **Do Migration A first** — single biggest unblock. Also: write the
   backfill from `service_reports` so existing sites carry their last-known
   system info. Once done, **Service Report code-gen is fully unblocked**
   (it'll prefer `sites` values over `service_reports`-stored copies on
   future visits, eliminating duplication).
2. **Do Migration B next** — small, opens the Callout Report template
   without much new code.
3. **Maintenance Proposal, Certificate, PAVA** — each needs its own
   planning brief like the Service Report one. Don't try to do them
   inline with the schema audit.

All migrations deliver via Lovable prompt (per the workflow we settled
on), not via repo `supabase/migrations/*.sql` files.
