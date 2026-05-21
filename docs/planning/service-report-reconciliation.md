# Service Report — Reconciliation Decisions

Sign these off before we draft the Claude Code execution brief.
The planning brief reads as greenfield, but `service_reports`, `BS5839Checklist`,
the smart-form pipeline, and a jsPDF generator already exist in production.
Each row below is one decision that unblocks the brief.

---

## 1. BS 5839-1 version — **2017 or 2025?**

- Planning brief says 2017 throughout.
- `src/services/serviceReportService.ts` header says 2025.
- `src/lib/serviceReportGenerator.ts` PDF title renders "BS 5839-1:2025".
- `CHECKLIST_LABELS.certification.bs5839CertIssued` still says "BS5839-1:2017".

**Recommendation: 2025.** Code already targets it; reverting means re-titling
every artifact and rewriting the certification labels.

**Consequence if 2025:** Update the planning brief's AI prompt and replace the
one stale "2017" label in `CHECKLIST_LABELS`. ~10 minutes.

**Consequence if 2017:** Rewrite the PDF generator header, the service header
comment, and the BAFE SP203-1 reference line. ~1 day plus regression on existing
reports already produced under "2025".

---

## 2. Defect severity vocabulary — **Cat 1/2/3 or Critical/Major/Minor?**

- Planning brief uses BS 5839-1 native: Category 1 / 2 / 3.
- PDF generator (`generateServiceReport` lines 421–427) colour-codes
  Critical / Major / Minor.
- `BS5839Payload.defects[].severity` is the current shape carrying the data.

**Recommendation: Cat 1/2/3.** Matches the standard, matches what engineers
say on site, matches what the quote pipeline will receive ("Cat 2 detector
contamination" reads like a quote line item; "Major detector contamination"
doesn't).

**Consequence:** Migration script to rename existing values
(Critical→Cat 1, Major→Cat 2, Minor→Cat 3) and update the PDF generator's
colour-coding switch. Half a day. Audit any in-flight reports first.

---

## 3. Report numbering — **`SR-YYYY-NNNN` or existing JOB/CERT scheme?**

- Planning brief proposes `service_ref` as `SR-YYYY-NNNN`.
- `service_reports.report_number` exists, populated by `get_next_report_number`
  RPC with a `report_type` of 'JOB' or 'CERT'.
- Production data already uses the RPC scheme.

**Recommendation: keep the existing JOB/CERT scheme.** Don't break the RPC,
don't renumber historical reports, don't confuse the SharePoint folder
convention that's already keyed on it.

**Consequence:** Drop `service_ref` from the planning brief, reuse
`report_number`. Zero migration work. Brief needs one paragraph rewriting.

---

## 4. Storage backend — **Supabase Storage or SharePoint?**

- Planning brief proposes Supabase Storage for photos and report archive.
- `certSharePointUpload.ts` exists; `service_reports.sharepoint_folder` and
  `sharepoint_url` columns exist; `sites.sharepoint_folder` exists.
- The SharePoint integration is the BHO Fire admin's filing system of record.

**Recommendation: dual.** Photos captured on site → Supabase Storage
(latency, offline queue, edit-before-finalise). Final signed report PDF →
SharePoint (system of record for the business). This matches what the
codebase is already doing for certificates.

**Consequence:** No new infrastructure. Photo upload queue is Supabase only;
SharePoint upload only fires on visit completion, same pattern as certs.

---

## 5. Output format & rendering pipeline — **DOCX template (like quotes) or keep jsPDF?**

- Planning brief says "use the same template-loading approach as the quote
  refactor" — implying DOCX-from-template via `docxtemplater` or similar.
- Existing `src/lib/serviceReportGenerator.ts` renders PDF directly with jsPDF
  + autoTable, hand-laid 4-page layout. ~500 lines. Working in production.

**Recommendation: keep jsPDF for v1, revisit DOCX in v2.** The existing
generator works, matches the BHO style, handles defect tables and signature
blocks correctly. Rebuilding against a DOCX master template is a 1-week
rewrite for an artifact that's already shipping.

**Consequence if kept:** Drop the "DOCX/PDF" language from the brief, make it
"PDF primary" (per decision 4 in the original brief anyway). Skip DOCX
generation entirely until/unless a client demands editability.

**Consequence if rewritten:** Add 1 week to the estimate, plus a regression
loop for visual parity with the current PDF. Throw away ~500 lines of working
code.

---

## Knock-on effects once the 5 are signed

- **Checklist count.** Brief says "18 items"; existing `BS5839Checklist` is
  17 sections, ~58 items, BAFE SP203-1 Cl.9.8 aligned. Decision 1 (version)
  doesn't resolve this — needs a separate confirmation that we're keeping the
  comprehensive checklist, not trimming to 18.
- **Visit type enum.** Existing `visits.visit_type` CHECK constraint is
  `quarterly_service / annual_inspection / emergency / remedial`. Brief
  proposes `routine_3mo / routine_6mo / annual / reactive / commissioning`.
  Brief's enum is more useful for scheduling; needs a migration step. Confirm
  separately.
- **Photo storage shape.** `file_uploads` already FKs to `visits`. Add a
  nullable `defect_id` column rather than a `photo_urls` array on the new
  defects table.

---

## Sign-off

| # | Decision | Picked |
|---|---|---|
| 1 | BS 5839-1 version | ☐ 2017  ☐ 2025 (rec) |
| 2 | Defect severity | ☐ Cat 1/2/3 (rec)  ☐ Critical/Major/Minor |
| 3 | Report numbering | ☐ Keep JOB/CERT (rec)  ☐ New SR-YYYY-NNNN |
| 4 | Storage | ☐ Dual: Supabase + SharePoint (rec)  ☐ Supabase only |
| 5 | Output pipeline | ☐ Keep jsPDF (rec)  ☐ DOCX template rewrite |

Once these 5 are ticked, the planning brief converts to a paste-ready
Claude Code execution brief.
