#!/usr/bin/env bash
# Encode all four BS 5839-1 DOCX templates into base64 TypeScript
# sidecars the generate-bs5839-cert-docx edge function reads.
# Run after editing the templates via build-bs5839-templates.sh.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
python3 "$ROOT/scripts/_encode_bs5839_templates.py"
