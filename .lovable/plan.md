

# BAFE SP203-1 Accreditation Integration Plan

BAFE SP203-1 covers four scheme areas: **Design, Installation, Commissioning, and Maintenance**. Your system already has solid coverage for Maintenance (BS 5839 checklist) and partial coverage for Installation/Commissioning (certificates exist as customer forms). This plan fills the gaps to make the system fully BAFE-audit-ready.

---

## What You Already Have

| BAFE Area | Current Coverage |
|-----------|-----------------|
| **Maintenance** | BS 5839-1 checklist (17 sections), BAFE cert checkbox, service reports |
| **Installation** | Installation Certificate form (A056-G), cable readings |
| **Commissioning** | Commissioning Certificate form (A051-G, 32-item checklist), acceptance cert |
| **Design** | Limited — no design certificate or specification tracking |

---

## Plan

### 1. Add Design Certificate Form Template
Add a new form template to `CHURCHES_FIRE_TEMPLATES` for the **Design Certificate (BS 5839-1 Annex H)** covering:
- System category (L1–L5, P1, P2, M)
- Building description and occupancy
- Detection coverage specification
- Variations from standard with justification
- Designer name, qualifications, BAFE registration number
- Designer signature and date

### 2. Add BAFE Scheme Tracking to Sites
New database table `site_bafe_certificates` to track which BAFE certificates have been issued per site:
- `site_id`, `certificate_type` (design/installation/commissioning/maintenance)
- `certificate_number`, `issued_date`, `issued_by`, `expiry_date`
- `linked_form_submission_id` (links to existing customer form submissions)
- `status` (valid/expired/superseded)

This gives a single view of BAFE compliance status per site.

### 3. BAFE Compliance Dashboard Widget
Add a new card to the **QMS Dashboard** showing:
- Count of sites with all 4 certificates vs missing certificates
- Certificates expiring within 30 days
- Quick link to generate missing certificates

### 4. BAFE Certificate Number Auto-Generation
Add a new auto-number prefix `BAFE-D`, `BAFE-I`, `BAFE-C`, `BAFE-M` using the existing `get_next_qms_number` RPC function, so each certificate gets a unique traceable number.

### 5. Site Detail — BAFE Tab
Add a "BAFE Certificates" section to the Site Detail page showing:
- Status of each of the 4 certificate types (Design, Installation, Commissioning, Maintenance)
- Links to view/download each certificate
- Button to generate missing certificates (opens the relevant customer form pre-filled with site data)

### 6. Visit Workflow Integration
When a visit is completed and a service report is saved:
- If the checklist item "16.2 Has a BAFE SP203-1 Section 5 certificate been issued?" is marked YES, prompt to create/link the BAFE maintenance certificate record
- For installation/commissioning visit types, prompt to complete the relevant BAFE certificate forms

---

## Technical Details

### Database Migration
```sql
CREATE TABLE public.site_bafe_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  certificate_type text NOT NULL, -- 'design','installation','commissioning','maintenance'
  certificate_number text NOT NULL,
  issued_date date NOT NULL,
  issued_by uuid NOT NULL,
  expiry_date date,
  linked_form_submission_id uuid,
  linked_report_id uuid,
  status text NOT NULL DEFAULT 'valid',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(site_id, certificate_type, certificate_number)
);

ALTER TABLE public.site_bafe_certificates ENABLE ROW LEVEL SECURITY;
-- RLS: elevated users can CRUD
```

### Files to Create/Modify
- **New**: `src/services/bafeCertificateService.ts` — CRUD for certificate tracking
- **New**: `src/components/sites/SiteBafeCertificates.tsx` — BAFE tab on site detail
- **Modify**: `src/services/customerFormService.ts` — add Design Certificate template
- **Modify**: `src/pages/qms/QMSDashboard.tsx` — add BAFE compliance widget
- **Modify**: `src/pages/SiteDetail.tsx` — add BAFE certificates tab
- **Modify**: `src/components/reports/ServiceReportDialog.tsx` — add post-save BAFE prompt

