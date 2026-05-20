# Small Fixes Queue

## 2026-05-21 — §6 gap renumbering

**File:** `supabase/functions/generate-quote-docx/index.ts`
**What:** When §6 PROGRAMME is removed via `removeSectionUntilNext`, renumber §§7-9 to §§6-8.

### Why
Template sections after removal currently show:
- 1-5 intact
- (gap — no §6)
- §7 PAYMENT TERMS
- §8 STANDARDS
- §9 TERMS

Should be 1-2-3-4-5-6-7-8.

### Where to patch
After line 899:
```ts
xml = removeSectionUntilNext(xml, "6. PROGRAMME", "7. PAYMENT TERMS");
```

Add a helper `renumberSectionsAfterRemoval(xml)` that does string replacements on the document XML:
- `"7. PAYMENT TERMS"` → `"6. PAYMENT TERMS"`
- `"8. STANDARDS &amp; ACCREDITATIONS"` → `"7. STANDARDS &amp; ACCREDITATIONS"`
- `"9. QUOTATION VALIDITY &amp; ACCEPTANCE"` → `"8. QUOTATION VALIDITY &amp; ACCEPTANCE"`

(Or a generic helper that takes a map of old→new heading numbers.)

### Acceptance
Generate a quote with no `programme_paragraph`. Verify rendered DOCX shows 1-2-3-4-5-6-7-8 with no gaps.

---

## 2026-05-20 — §2.3 prefix conditional (deferred)
> User explicitly deferred this. Do not action without explicit go-ahead.
