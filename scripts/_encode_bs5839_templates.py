#!/usr/bin/env python3
"""Encode the four BS 5839-1 DOCX templates into base64 TypeScript
sidecars consumed by the generate-bs5839-cert-docx edge function.
Mirrors scripts/_encode_callout_template.py (one constant per cert
type, no embedded binary blob in the edge function source).

Run via scripts/encode-bs5839-templates.sh after running
scripts/build-bs5839-templates.sh."""
import base64
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
OUT_DIR = ROOT / "supabase" / "functions" / "generate-bs5839-cert-docx"

# (filename in assets/, sidecar filename, exported constant name)
TARGETS = [
    ("bs5839-installation-cert-template.docx",
     "_installation-template.ts",
     "INSTALLATION_TEMPLATE_BASE64"),
    ("bs5839-commissioning-cert-template.docx",
     "_commissioning-template.ts",
     "COMMISSIONING_TEMPLATE_BASE64"),
    ("bs5839-acceptance-cert-template.docx",
     "_acceptance-template.ts",
     "ACCEPTANCE_TEMPLATE_BASE64"),
    ("bs5839-battery-calc-template.docx",
     "_battery-calc-template.ts",
     "BATTERY_CALC_TEMPLATE_BASE64"),
]


def encode_one(src: Path, dst: Path, const_name: str) -> None:
    b64 = base64.b64encode(src.read_bytes()).decode()
    header = (
        f"// AUTO-GENERATED — base64 of assets/{src.name}.\n"
        f"// Regenerate via scripts/encode-bs5839-templates.sh after\n"
        f"// updating the .docx via scripts/build-bs5839-templates.sh.\n\n"
    )
    body = header + f"export const {const_name} = `\\\n"
    for i in range(0, len(b64), 76):
        body += b64[i:i + 76] + "\\\n"
    body += "`.replace(/\\s+/g, \"\");\n"
    dst.write_text(body)
    print(f"  ✓ {src.name:<48} → {dst.name:<32} ({len(b64):>6} chars)")


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for src_name, dst_name, const_name in TARGETS:
        src = ASSETS / src_name
        if not src.exists():
            print(f"  ✗ missing source: {src}")
            return 1
        encode_one(src, OUT_DIR / dst_name, const_name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
