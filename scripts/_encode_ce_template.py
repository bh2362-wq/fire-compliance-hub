#!/usr/bin/env python3
"""Re-encode the C&E DOCX template into the base64 sidecar consumed by
the generate-cause-effect-docx edge function. Called by
scripts/encode-ce-template.sh — keeping the Python separate from the
shell script avoids escape-quoting bugs inside bash heredocs."""
import base64
import os
import sys

if len(sys.argv) != 3:
    sys.exit("usage: _encode_ce_template.py <src.docx> <dst.ts>")
src, dst = sys.argv[1], sys.argv[2]

with open(src, "rb") as f:
    b64 = base64.b64encode(f.read()).decode()

header = (
    "// AUTO-GENERATED — base64 of assets/cause-effect-template-baseline.docx.\n"
    "// Regenerate via scripts/encode-ce-template.sh after updating the .docx.\n"
    "// Inline rather than in storage so the generator works without any\n"
    "// out-of-band upload step.\n\n"
)
out = header + "export const CE_TEMPLATE_BASE64 = `\\\n"
for i in range(0, len(b64), 76):
    out += b64[i:i+76] + "\\\n"
out += "`.replace(/\\s+/g, \"\");\n"

with open(dst, "w") as f:
    f.write(out)

print(f"Re-encoded {os.path.getsize(src)} bytes → {len(b64)} base64 chars")
