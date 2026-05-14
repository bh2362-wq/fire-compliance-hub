## Goal

Rewrite all 8 remaining smart forms into the same single-page document-style layout used by `BS5839CertificateForm`, and expand each form's fields to match its underlying paper sheet (using the existing PDF generators as the source of truth for the canonical field set).

## Forms in scope

1. ASDCommissioningForm — `asdCommissioningPdfGenerator.ts`
2. ASDServiceForm — `asdChecklistService.ts` / `commissioningCertificatePdfGenerator.ts`
3. CommissioningCertificateForm — `commissioningCertificatePdfGenerator.ts`
4. DeclinationForm — `declinationPdfGenerator.ts` (currently a 5-step wizard)
5. DryRiserForm — `dryRiserPdfGenerator.ts`
6. EmergencyLightingForm — `emergencyLightingPdfGenerator.ts`
7. InstallationCertificateForm — `installationCertificatePdfGenerator.ts`
8. ModificationCertificateForm — `modificationCertificatePdfGenerator.ts`

## Shared layout pattern (from BS5839)

Every rewritten form will use this skeleton inside a `Dialog`:

```text
+-----------------------------------------------------------+
| Sticky header                                             |
|   Title  | Cert ref + status badge | Save Draft | Complete & PDF
+-----------------------------------------------------------+
| Scrollable document body                                  |
|   1. Title block                                          |
|   2. Site / Customer grid                                 |
|   3. System / Installation details bar                    |
|   4. Sectioned content (checklist / tests / readings)     |
|   5. Work carried out                                     |
|   6. Defects register (DefectImportPanel where relevant)  |
|   7. Signatures (engineer + client, SmartSignature)       |
|   8. Client Summary (AI) panel                            |
+-----------------------------------------------------------+
| Sticky footer                                             |
|   Company text | Close | Complete & Download PDF          |
+-----------------------------------------------------------+
```

- Same status pill colour rules used in BS5839 (YES green / NO red / N/A grey, with `invert` flag for items where YES = defect).
- Reuse `SitePrefillPanel`, `HintPanel`, `ClientSummaryPanel`, `DefectImportPanel`, `SmartSignature`, `ComplianceChecker` where applicable.
- All save/persist/PDF/SharePoint/autoRegister/pushDefects logic preserved exactly as-is per form.

## Field expansion approach (per form)

For each form I will:

1. Read the matching `*PdfGenerator.ts` and any related service to enumerate every field the paper sheet renders.
2. Diff against the form's current payload type and add missing fields to the payload + UI.
3. Group fields into the document sections above.

Specific paper-sheet sections per form (high level):

- **DeclinationForm**: collapse the 5-step wizard into one document. Sections: Premises, Works declined + standard ref + risk, Auto-fill statement, BHO + client signatures, preview.
- **InstallationCertificateForm / CommissioningCertificateForm / ModificationCertificateForm**: BS 5839 cert structure — installer details, system extent, design/install/commissioning/acceptance signatories, variations, declarations, deviations, test results.
- **ASDCommissioningForm / ASDServiceForm**: aspirating smoke detector — pipework/sampling-point map, hole sizes, transport time, sensitivity test, alarm thresholds, fault thresholds, cumulative test results, 4-stage commissioning checklist.
- **EmergencyLightingForm**: BS 5266 — luminaire schedule, monthly/6-monthly/annual test grid, duration test (1hr or 3hr), battery condition, defects.
- **DryRiserForm**: annual dry-riser test sheet — outlet pressure readings per floor, wet test, visual inspection, valves, drain test.

## Execution order

1. Audit pass: read all 8 PDF generators + current forms in parallel batches to gather field lists.
2. Rewrite forms in 4 batches of 2 (parallel writes per batch) to keep diffs reviewable:
   - Batch A: Declination, EmergencyLighting
   - Batch B: DryRiser, ASDService
   - Batch C: ASDCommissioning, Installation
   - Batch D: Commissioning, Modification
3. After each batch: TS check via build signal, fix any compile errors before next batch.
4. No DB schema changes — all new fields live inside the existing `payload` JSONB on `smart_form_submissions`.

## Out of scope

- No changes to `smartFormService.ts` checklist data (already done in prior turn).
- No changes to PDF generators themselves unless a newly added field has nowhere to render (in which case I'll append a minimal section to that generator).
- No changes to routing, navigation, or the design system.

## Risks / notes

- Some PDF generators may already render fields the form never collected — those will become new inputs (good).
- Some forms may expose fields the paper sheet doesn't actually have — those stay as-is to avoid scope creep.
- This is a large multi-file change (8 full rewrites). Expect ~8 long file writes plus targeted edits.
