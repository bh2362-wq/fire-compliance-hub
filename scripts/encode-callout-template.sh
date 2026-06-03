#!/usr/bin/env bash
# Re-encode the callout DOCX template into the base64 sidecar file the
# generate-callout-docx edge function reads at runtime. Run this
# whenever you edit assets/callout-template-baseline.docx.
#
# Usage: ./scripts/encode-callout-template.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

python3 "$ROOT/scripts/_encode_callout_template.py" \
  "$ROOT/assets/callout-template-baseline.docx" \
  "$ROOT/supabase/functions/generate-callout-docx/_template-data.ts"
