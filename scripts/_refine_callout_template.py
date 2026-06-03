#!/usr/bin/env python3
"""Refine the callout template by rewriting top-level section heading
text from C&E-flavoured to callout-flavoured, in place inside the
existing .docx. Preserves every other styling decision — fonts,
colours, table layout, info cards, the §9 sign-off ENGINEER /
CLIENT anchors that the signature embedder keys off.

The substitutions are exact whole-string matches on <w:t> text
content. Anything that doesn't match exactly is left alone. Each
replacement is logged so a future maintainer can diff what changed.

Runs over assets/callout-template-baseline.docx, writes back to the
same path. Run scripts/encode-callout-template.sh afterwards to
refresh the base64 sidecar."""
import re
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCX_PATH = ROOT / "assets" / "callout-template-baseline.docx"

# Title row + subtitle — the very top of the document. Keeps the
# big-text styling intact; only the words change.
TITLE_RENAMES = [
    ("Cause &amp; Effect Test Report", "Callout Report"),
    ("BS 5839-1:2017", "Reactive Fire Alarm Service"),
]

# Top-level section headings — the wizard's 6 steps map onto the
# template's 6 numbered sections in this order:
#
#   wizard step 1 (Intake)         ← template §1
#   wizard step 2 (On arrival)     ← template §2
#   wizard step 3 (Investigation)  ← template §3
#   wizard step 4 (Materials)      ← template §4
#   wizard step 5 (Departure)      ← template §5
#   wizard step 6 (Sign-off)       ← template §9 (preserved anchor)
#
# C&E sections 6/7/8/10 (Remedials / Compliance / Recommendations /
# Attachments) keep their original headings — engineers will see them
# print empty until a follow-up Word edit removes them. That follow-up
# can drop the sub-section text and table rows without breaking the
# substitution engine, which only matches placeholders inside <w:t>.
HEADING_RENAMES = [
    ("1. Purpose of visit",            "1. Callout intake"),
    ("2. System details",              "2. System on arrival"),
    ("3. Cause and effect test results", "3. Investigation &amp; actions"),
    ("4. Full audibility test results", "4. Materials &amp; time"),
    ("5. Findings &amp; observations", "5. Departure &amp; follow-up"),
    # §9 keeps its "Sign-off" wording but the embedder still finds it
    # via the "ENGINEER" / "CLIENT / RESPONSIBLE PERSON" anchors, so
    # renumbering to "6. Sign-off" doesn't affect that lookup.
    ("9. Sign-off",                    "6. Sign-off"),
]

# Sub-section labels that meaningfully change for callout. Each
# rename is conservative — only replaces when the wizard has a
# semantically equivalent field. Sub-sections we don't rename keep
# their C&E wording; they're slated for removal in a follow-up Word
# edit (which doesn't need a code change since they don't drive any
# placeholder substitution).
SUBSECTION_RENAMES = [
    ("3.1 Test methodology",           "3.1 Fault found / diagnosis"),
    ("3.3 Output functions",           "3.3 Action taken"),
    ("5.3 General observations",       "5.3 Recommendations &amp; follow-up"),
    # §4 was "Full audibility test results"; we repurpose 4.1 for the
    # materials/labour/mileage trio. The placeholder names get renamed
    # below too so the edge function's fill calls stay aligned to what
    # the labels actually mean.
    ("4.1 Test equipment",             "4.1 Materials used"),
    # Trailing space matters — these labels are stored with
    # xml:space="preserve" and an explicit trailing space.
    ("Sound level meter: ",            "Parts list: "),
    ("Serial number: ",                "Labour hours: "),
    ("Calibration due: ",              "Mileage (miles): "),
]

# Placeholder name renames — the substitution engine in the edge
# function fills <w:t>[Name]</w:t> nodes by exact text match, so we
# rename the placeholders here to names that reflect their NEW
# meaning in the callout report. The fillTemplate() in
# generate-callout-docx/index.ts targets these new names.
PLACEHOLDER_RENAMES = [
    # §3.1 was Test Methodology — now Fault Diagnosis.
    ("[Test Methodology]",             "[Fault Diagnosis]"),
    # §4.1 trio — repurposed from sound-meter fields.
    ("[Sound Meter Make Model]",       "[Parts List]"),
    ("[Sound Meter Serial]",           "[Labour Hours]"),
    ("[Calibration Due]",              "[Mileage Miles]"),
    # §5.3 was General Observations — now holds the Recommendations
    # narrative + follow-up notes.
    ("[General Observations]",         "[Recommendations Block]"),
]

# Body prose that's specifically C&E ("conduct cause and effect
# testing…") replaced with callout-appropriate intro text. The
# placeholder substitution engine in the edge function does the
# variable bits; this rename just fixes the static prose.
PROSE_RENAMES = [
    (
        "To conduct cause and effect testing and full audibility "
        "testing of the fire alarm system in accordance with "
        "BS 5839-1:2017.",
        "To attend a reactive fire alarm callout, diagnose the "
        "reported fault, restore the system to a safe operating "
        "state, and document the visit for compliance with "
        "BS 5839-1:2017 §45.",
    ),
]

ALL_RENAMES = (
    TITLE_RENAMES
    + HEADING_RENAMES
    + SUBSECTION_RENAMES
    + PLACEHOLDER_RENAMES
    + PROSE_RENAMES
)


def rewrite_document_xml(xml: str) -> tuple[str, list[tuple[str, str, int]]]:
    """Run each rename as an exact-match replace inside any <w:t>
    element. Returns the new XML + a log of (old, new, count) tuples.

    The regex matches `<w:t [attrs]>OLD</w:t>` so we only edit text
    nodes, never element names or attribute values. OLD is escaped so
    a heading like "3. Cause and effect test results" doesn't get
    misinterpreted as regex syntax."""
    log: list[tuple[str, str, int]] = []
    for old, new in ALL_RENAMES:
        pattern = re.compile(
            r"(<w:t(?:\s[^>]*)?>)" + re.escape(old) + r"(</w:t>)"
        )
        new_xml, count = pattern.subn(r"\g<1>" + new + r"\g<2>", xml)
        log.append((old, new, count))
        xml = new_xml
    return xml, log


def main() -> int:
    if not DOCX_PATH.exists():
        print(f"Template missing: {DOCX_PATH}", file=sys.stderr)
        return 1

    # Read the .docx (which is a zip), find word/document.xml, run
    # the rewriter, then write a new zip with the substituted content.
    # Two-step write via a tempfile so a midway crash doesn't corrupt
    # the original .docx.
    with tempfile.NamedTemporaryFile(
        delete=False, suffix=".docx", dir=str(DOCX_PATH.parent)
    ) as tmp:
        tmp_path = Path(tmp.name)

    try:
        with zipfile.ZipFile(DOCX_PATH, "r") as src, zipfile.ZipFile(
            tmp_path, "w", zipfile.ZIP_DEFLATED
        ) as dst:
            for item in src.namelist():
                data = src.read(item)
                if item == "word/document.xml":
                    new_xml, log = rewrite_document_xml(data.decode("utf-8"))
                    data = new_xml.encode("utf-8")
                    for old, new, count in log:
                        marker = "✓" if count > 0 else "·"
                        # Truncate long renames so the log stays terse.
                        old_short = old if len(old) <= 60 else old[:57] + "..."
                        new_short = new if len(new) <= 60 else new[:57] + "..."
                        print(
                            f"  {marker} x{count}  {old_short!r} → {new_short!r}"
                        )
                dst.writestr(item, data)

        shutil.move(str(tmp_path), str(DOCX_PATH))
        print(f"Refined → {DOCX_PATH}")
        return 0
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise


if __name__ == "__main__":
    raise SystemExit(main())
