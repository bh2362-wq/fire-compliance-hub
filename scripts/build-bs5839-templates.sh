#!/usr/bin/env bash
# Build the four BHO-branded BS 5839-1 certificate templates from
# scratch. Outputs go to assets/bs5839-*-template.docx. Run after
# editing scripts/_build_bs5839_templates.py.
#
# Requires python-docx and lxml (`pip install python-docx`).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
python3 "$ROOT/scripts/_build_bs5839_templates.py"
