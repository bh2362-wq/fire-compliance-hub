#!/usr/bin/env bash
# Re-encode the C&E DOCX template into the base64 sidecar file the
# generate-cause-effect-docx edge function reads at runtime. Run this
# whenever you tweak assets/cause-effect-template-baseline.docx.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/assets/cause-effect-template-baseline.docx"
DST="$ROOT/supabase/functions/generate-cause-effect-docx/_template-data.ts"

python3 - <<PY
import base64, os
src = "$SRC"
dst = "$DST"
with open(src, "rb") as f:
    b64 = base64.b64encode(f.read()).decode()
header = (
    "// AUTO-GENERATED — base64 of assets/cause-effect-template-baseline.docx.\n"
    "// Regenerate via scripts/encode-ce-template.sh after updating the .docx.\n"
    "// Inline rather than in storage so the generator works without any\n"
    "// out-of-band upload step.\n\n"
)
out = header + 'export const CE_TEMPLATE_BASE64 = `\\\n'
for i in range(0, len(b64), 76):
    out += b64[i:i+76] + '\\\n'
out += '`.replace(/\\\\s+/g, "");\n'
with open(dst, "w") as f:
    f.write(out)
print(f"Re-encoded {os.path.getsize(src)} bytes → {len(b64)} base64 chars")
PY
