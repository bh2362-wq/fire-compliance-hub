#!/usr/bin/env bash
# Re-encode the C&E DOCX template into the base64 sidecar file the
# generate-cause-effect-docx edge function reads at runtime. Run this
# whenever you edit assets/cause-effect-template-baseline.docx.
#
# Usage: ./scripts/encode-ce-template.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

python3 "$ROOT/scripts/_encode_ce_template.py" \
  "$ROOT/assets/cause-effect-template-baseline.docx" \
  "$ROOT/supabase/functions/generate-cause-effect-docx/_template-data.ts"
