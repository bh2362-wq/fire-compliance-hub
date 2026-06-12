// Markdown cleanup helpers for the AI-generated scope-of-works content.
//
// Used by:
//   - AIDefectQuoteDialog: clean scope before INSERT so quotations.introduction
//     and quotations.scope[] never carry raw markdown into the DB.
//   - QuotationDetailDialog: derive a scope[] from quotations.introduction
//     when the scope column is empty (covers quotes inserted before PR #217
//     when AIDefectQuoteDialog didn't yet populate the scope column).
//
// Mirrors the Deno helpers in supabase/functions/generate-quote-docx/index.ts —
// keep the regex set in sync if either side changes.

export function stripScopeMarkdown(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

export function parseScopeNumberedItems(text: string): string[] {
  const cleaned = stripScopeMarkdown(text);
  // "1. ", "2)" at line start or after blank/double-space; lookahead caps
  // each item at the next numbered marker.
  const re = /(?:^|\n\s*|\s{2,})(\d{1,2})[.)]\s+([\s\S]+?)(?=(?:\n\s*|\s{2,})\d{1,2}[.)]\s|$)/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    const body = m[2].trim().replace(/\s+/g, " ");
    if (body) out.push(body);
  }
  return out;
}
