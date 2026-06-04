#!/usr/bin/env python3
"""Build the four BHO-branded BS 5839-1 certificate templates from
scratch using python-docx. Outputs go to assets/ and are committed
as binary alongside the encode tooling.

Templates produced:
  bs5839-installation-cert-template.docx   — BS 5839-1 §43.2 (A056)
  bs5839-commissioning-cert-template.docx  — BS 5839-1 §43.4 (A051), 3 pages
                                              including 33-item checklist
  bs5839-acceptance-cert-template.docx     — BS 5839-1 §43.5 (A038)
  bs5839-battery-calc-template.docx        — BS 5839-1 §25.4 (A058)

Structural choice: every field that varies is a square-bracketed
placeholder ([Site Address], [Cert Number], etc) rather than a Word
form field. The same substitution engine the callout / C&E /
quote templates use (replaceWtText in the edge functions) fills
these by exact <w:t> match — no extra logic per cert type.

Company branding (name / address / logo) comes through placeholders
too — the edge function pulls from company_settings. This means the
same template renders correctly for any company using the CRM, not
just BHO. The build script embeds public/bho-fire-logo.png as the
default logo so the as-built template looks right out of the box;
the edge function can swap it for a different company's logo by
replacing the image relationship before sending to MS Graph for
PDF conversion (future PR).

Run with: ./scripts/build-bs5839-templates.sh
"""
from __future__ import annotations

import sys
from pathlib import Path

from docx import Document
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from docx.shared import Cm, Pt, RGBColor

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
LOGO = ROOT / "public" / "bho-fire-logo.png"

# Brand accent — picked off the existing callout/C&E templates so
# the BS 5839-1 certs sit visually alongside them in a folder.
ACCENT = RGBColor(0xC5, 0x30, 0x30)         # red, used for headings + dividers
LABEL_GREY = RGBColor(0x6B, 0x72, 0x80)    # secondary text
FIELD_FILL = "EFF1F4"                       # grey-blue cell shading for "input" cells

CHECKBOX_EMPTY = "☐"                        # filled to ☑ at render time when known


# ── Helpers ──────────────────────────────────────────────────────────

def set_cell_shading(cell, hex_color: str) -> None:
    """Apply a background fill to a single <w:tc>. python-docx doesn't
    expose shading directly; drop the raw OOXML in."""
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_color)
    tc_pr.append(shd)


def add_logo(doc: Document) -> None:
    """Centred BHO logo at the top of the document. Falls back to a
    text marker when the PNG is missing (e.g. running this on a
    machine that doesn't have public/ checked out)."""
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    if LOGO.exists():
        p.add_run().add_picture(str(LOGO), width=Cm(4.5))
    else:
        run = p.add_run("[BHO LOGO]")
        run.bold = True
        run.font.color.rgb = ACCENT
        run.font.size = Pt(14)


def add_title(doc: Document, code: str, title: str) -> None:
    """Form code + bold red title bar — mirrors the Churches layout
    so engineers familiar with the source forms find the same
    visual anchor."""
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(f"{code}   {title}")
    run.bold = True
    run.font.size = Pt(14)
    run.font.color.rgb = ACCENT
    # Thin spacer underneath.
    sep = doc.add_paragraph()
    sep_run = sep.add_run("")
    sep_run.font.size = Pt(2)


def add_section_label(doc: Document, text: str) -> None:
    """Red mini-heading used between form sections. Distinct from
    add_title so the eye reads it as "subsection" not "another
    document"."""
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.bold = True
    run.font.size = Pt(10)
    run.font.color.rgb = ACCENT
    p.paragraph_format.space_after = Pt(2)


def add_field_row(
    doc: Document,
    label: str,
    placeholder: str,
    label_width: Cm = Cm(4.5),
    field_width: Cm = Cm(11.5),
) -> None:
    """A "Label: [placeholder]" form line as a 2-column borderless
    table. Field cell is shaded so it reads as input space."""
    tbl = doc.add_table(rows=1, cols=2)
    tbl.alignment = WD_TABLE_ALIGNMENT.LEFT
    tbl.autofit = False
    label_cell, field_cell = tbl.rows[0].cells
    label_cell.width = label_width
    field_cell.width = field_width

    set_cell_shading(field_cell, FIELD_FILL)

    label_para = label_cell.paragraphs[0]
    lr = label_para.add_run(label)
    lr.font.color.rgb = LABEL_GREY
    lr.font.size = Pt(9)

    field_para = field_cell.paragraphs[0]
    fr = field_para.add_run(placeholder)
    fr.font.size = Pt(10)

    # Remove all borders on the wrapper table so the labels read as
    # form lines, not a tabular grid.
    set_table_borders_none(tbl)


def add_two_field_row(
    doc: Document,
    label_a: str,
    placeholder_a: str,
    label_b: str,
    placeholder_b: str,
) -> None:
    """Two "Label: [placeholder]" pairs side-by-side. Used for
    Name/Position and Signature/Date pairings that appear on most
    BS 5839-1 forms."""
    tbl = doc.add_table(rows=1, cols=4)
    tbl.alignment = WD_TABLE_ALIGNMENT.LEFT
    tbl.autofit = False
    cells = tbl.rows[0].cells
    cells[0].width = Cm(3.5)
    cells[1].width = Cm(4.5)
    cells[2].width = Cm(3.5)
    cells[3].width = Cm(4.5)
    for i, (label, placeholder) in enumerate(
        [(label_a, placeholder_a), (label_b, placeholder_b)]
    ):
        label_cell = cells[i * 2]
        field_cell = cells[i * 2 + 1]
        set_cell_shading(field_cell, FIELD_FILL)
        lr = label_cell.paragraphs[0].add_run(label)
        lr.font.color.rgb = LABEL_GREY
        lr.font.size = Pt(9)
        fr = field_cell.paragraphs[0].add_run(placeholder)
        fr.font.size = Pt(10)
    set_table_borders_none(tbl)


def add_freeform_box(doc: Document, label: str, placeholder: str, rows: int = 3) -> None:
    """A labelled free-text area: red label on its own line, then a
    shaded single-cell table that gives the look of an input box.
    `rows` controls visible height by repeating the placeholder run
    with blank paragraphs."""
    add_section_label(doc, label)
    tbl = doc.add_table(rows=1, cols=1)
    cell = tbl.rows[0].cells[0]
    set_cell_shading(cell, FIELD_FILL)
    first_para = cell.paragraphs[0]
    first_para.add_run(placeholder).font.size = Pt(10)
    for _ in range(rows - 1):
        cell.add_paragraph()
    set_table_borders_none(tbl)


def set_table_borders_none(tbl) -> None:
    """Strip the default table grid borders. Used on every "form
    line" wrapper table so the labels read as inline text."""
    tblPr = tbl._tbl.tblPr
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        b = OxmlElement(f"w:{edge}")
        b.set(qn("w:val"), "nil")
        borders.append(b)
    tblPr.append(borders)


def add_paragraph(doc: Document, text: str, size: int = 10, italic: bool = False) -> None:
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.font.size = Pt(size)
    run.italic = italic


def add_certify_block(doc: Document, body: str) -> None:
    """The boilerplate certification paragraph that appears near the
    top of every BS 5839-1 cert. Rendered in a slightly smaller
    font so it reads as standing legal text rather than a heading."""
    p = doc.add_paragraph()
    run = p.add_run(body)
    run.font.size = Pt(9)
    p.paragraph_format.space_after = Pt(8)


# ── Cert builders ────────────────────────────────────────────────────


def build_installation_cert(out: Path) -> None:
    """BS 5839-1 §43.2 — Installation certificate (A056 equivalent).
    One page, fairly slim form. Installer certifies the install
    complies with Section 4 of BS 5839-1 except for stated variations."""
    doc = Document()
    set_a4_margins(doc)

    add_logo(doc)
    add_title(doc, "BHO A056", "Fire Alarm Installation Certificate")

    add_section_label(doc, "Certification of Installation for the Fire Alarm System at:")
    add_field_row(doc, "Address", "[Site Address]")
    add_field_row(doc, "Postcode", "[Site Postcode]")

    add_certify_block(
        doc,
        "I/We being the competent person(s) responsible (as indicated by my/our "
        "signature(s) below) for the installation of the Fire Alarm System, particulars "
        "of which are set out below, CERTIFY that the said installation for which I/we "
        "have been responsible complies to the best of my/our knowledge and belief with "
        "the specification described below and with the recommendations of Section 4 of "
        "BS 5839-1 except for the variations, if any, stated in this certificate.",
    )

    add_two_field_row(doc, "Name", "[Engineer Name]", "Position", "[Engineer Position]")
    add_two_field_row(doc, "Signature", "[Engineer Signature]", "Date", "[Date]")
    add_field_row(
        doc,
        "For and behalf of",
        "[Company Name], [Company Address]",
    )
    add_two_field_row(
        doc,
        "Category of system",
        "[Category of System]",
        "Certificate no",
        "[Certificate Number]",
    )

    add_freeform_box(
        doc,
        "The extent of liability of the signatory is limited to the system described below:",
        "[Extent of Liability]",
        rows=3,
    )

    add_freeform_box(
        doc,
        "Agreed variations from the specification and/or Section 4 of BS 5839-1 "
        "(see clause 7). Must be agreed by all parties:",
        "[Agreed Variations]",
        rows=3,
    )

    add_section_label(doc, "Inspection and testing of wiring systems")
    add_paragraph(
        doc,
        "Unless supplied by others, the 'as fitted' drawings have been supplied to the "
        "person responsible for commissioning the system (see 36.2m of the current "
        "BS 5839-1). Test results have been recorded above.",
        size=9,
    )

    add_freeform_box(
        doc,
        "Agreed variations from the specification — continuation page:",
        "[Variations Continuation]",
        rows=8,
    )

    doc.save(out)


def build_commissioning_cert(out: Path) -> None:
    """BS 5839-1 §43.4 — Commissioning certificate (A051 equivalent).
    Three pages. Page 2 carries the 33-item BS 5839-1 commissioning
    checklist as a Y/N/N/A table — the bulk of this template."""
    doc = Document()
    set_a4_margins(doc)

    # ── Page 1 ──────────────────────────────────────────────────────
    add_logo(doc)
    add_title(doc, "BHO A051", "Fire Alarm Commissioning Certificate")

    add_section_label(doc, "Details of Client")
    add_field_row(doc, "Name", "[Customer Name]")
    add_field_row(doc, "Address", "[Customer Address]")
    add_field_row(doc, "Postcode", "[Customer Postcode]")

    add_section_label(doc, "Details of the Fire Alarm and Detection System")
    add_field_row(doc, "Address", "[Site Address]")
    add_field_row(doc, "Extent of system covered by this certificate", "[Extent of System]")
    add_two_field_row(
        doc,
        "The system is",
        "[New / Modification]",
        "Category",
        "[Category of System]",
    )

    # System examinations checklist — six items + soak test field.
    add_section_label(doc, "System Examinations and Recommendations")
    add_paragraph(
        doc,
        "Tick boxes or insert N/A (not applicable) as appropriate.",
        size=8,
        italic=True,
    )
    for label in [
        "All equipment operates correctly",
        "Installation work is, as far as can reasonably be ascertained, of an "
        "acceptable standard",
        "The entire system has been inspected and tested in accordance with the "
        "recommendations of clause 39.2c of the current BS 5839-1",
        "The system performs as required by the specification prepared by",
        "Taking into account the guidance in section 3 of the current BS 5839-1, "
        "I/we have not identified any obvious potential for any unacceptable rate of "
        "false alarms",
        "The documentation described in clause 40 of the standard has been provided "
        "to the user",
    ]:
        add_checkbox_line(doc, label)

    add_field_row(
        doc,
        "Specification prepared by",
        "[Specifier]",
        label_width=Cm(5.5),
        field_width=Cm(10.5),
    )

    add_freeform_box(
        doc,
        "The following work should be completed before/after (delete as applicable) "
        "the system becomes operational:",
        "[Outstanding Work]",
        rows=2,
    )

    add_freeform_box(
        doc,
        "The following potential causes of false alarm should be considered at the "
        "time of the next service:",
        "[False Alarm Risks]",
        rows=2,
    )

    add_two_field_row(
        doc,
        "Soak test period (weeks)",
        "[Soak Test Weeks]",
        "or",
        "[N/A]",
    )

    add_section_label(doc, "Certificate of Commissioning")
    add_certify_block(
        doc,
        "I/We being the competent person(s) responsible (as indicated by my/our "
        "signature(s) below) for the commissioning of the fire alarm system, particulars "
        "of which are set out above, certify that the said work for which I/we have "
        "been responsible complies to the best of my/our knowledge and belief with the "
        "recommendations of clause 39 of BS 5839-1:2025, except for the variations, "
        "if any, stated in this certificate.",
    )

    add_freeform_box(
        doc,
        "Variations from the recommendations of clause 39 of the current BS 5839-1:",
        "[Cl 39 Variations]",
        rows=2,
    )

    add_two_field_row(
        doc,
        "Commissioning Engineer Name",
        "[Engineer Name]",
        "Position",
        "[Engineer Position]",
    )
    add_two_field_row(
        doc, "Signature", "[Engineer Signature]", "Date", "[Date]"
    )

    add_section_label(doc, "Particulars of the Organisation Commissioning the System")
    add_field_row(doc, "Organisation", "[Company Name], [Company Address]")
    add_two_field_row(
        doc,
        "Design certificate no",
        "[Design Cert Number]",
        "Installation certificate no",
        "[Installation Cert Number]",
    )
    add_two_field_row(
        doc,
        "Design drawings no",
        "[Design Drawings]",
        "As fitted drawings no",
        "[As Fitted Drawings]",
    )

    # ── Page 2 — 33-item checklist ──────────────────────────────────
    doc.add_page_break()
    add_logo(doc)
    add_title(doc, "BHO A051", "Fire Alarm Commissioning Certificate")
    add_section_label(doc, "Commissioning Checklist (BS 5839-1 §39)")
    add_paragraph(
        doc,
        "Tick the appropriate column for each item. Items the wizard "
        "marks N/A render with an explanatory note inline.",
        size=8,
        italic=True,
    )

    items = COMMISSIONING_CHECKLIST_ITEMS
    tbl = doc.add_table(rows=1 + len(items), cols=5)
    tbl.style = "Table Grid"
    # Column widths — number / description / Y / N / N/A
    widths = [Cm(0.8), Cm(12.8), Cm(1.0), Cm(1.0), Cm(1.0)]
    for col_idx, w in enumerate(widths):
        for row in tbl.rows:
            row.cells[col_idx].width = w

    header = tbl.rows[0].cells
    for cell, label in zip(header, ["#", "Description", "Y", "N", "N/A"]):
        set_cell_shading(cell, "1F2937")
        run = cell.paragraphs[0].add_run(label)
        run.bold = True
        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        run.font.size = Pt(9)
        cell.paragraphs[0].alignment = (
            WD_ALIGN_PARAGRAPH.CENTER if label in ("Y", "N", "N/A") else WD_ALIGN_PARAGRAPH.LEFT
        )

    for row_idx, (item_num, description) in enumerate(items, start=1):
        row_cells = tbl.rows[row_idx].cells
        num_p = row_cells[0].paragraphs[0]
        num_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        num_p.add_run(str(item_num)).font.size = Pt(9)

        desc_run = row_cells[1].paragraphs[0].add_run(description)
        desc_run.font.size = Pt(9)

        for box_col in (2, 3, 4):
            p = row_cells[box_col].paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p.add_run(CHECKBOX_EMPTY)
            run.font.size = Pt(11)

    # ── Page 3 — incomplete work + sign-off ─────────────────────────
    doc.add_page_break()
    add_logo(doc)
    add_title(doc, "BHO A051", "Fire Alarm Commissioning Certificate")

    add_freeform_box(
        doc,
        "The following work could not be completed for reasons beyond the control "
        "of the company:",
        "Details: [Incomplete Work Details]",
        rows=3,
    )
    add_freeform_box(doc, "Reasons:", "[Incomplete Work Reasons]", rows=3)

    add_freeform_box(
        doc,
        "A further visit is required by an engineer to complete the installation "
        "(insert N/A if not needed):",
        "[Further Visit Required]",
        rows=4,
    )

    add_certify_block(
        doc,
        "I certify that the above checks & functional tests have been completed in "
        "accordance with the equipment manufacturer's recommendations and/or applicable "
        "codes of practice.",
    )
    add_two_field_row(
        doc,
        "Signature",
        "[Engineer Signature]",
        "Print",
        "[Engineer Name]",
    )

    doc.save(out)


def build_acceptance_cert(out: Path) -> None:
    """BS 5839-1 §43.5 — Acceptance certificate (A038 equivalent).
    Customer-signed handover. One page."""
    doc = Document()
    set_a4_margins(doc)

    add_logo(doc)
    add_title(doc, "BHO A038", "Fire Alarm Acceptance Certificate")

    add_section_label(
        doc, "Certificate of Installation (to BS 5839-1:2025) for the fire alarm system at:"
    )
    add_field_row(doc, "Address", "[Site Address]")
    add_field_row(doc, "Postcode", "[Site Postcode]")

    add_certify_block(
        doc,
        "I/We being the competent person(s) responsible (as indicated by my/our "
        "signatures below) for the acceptance of the fire alarm system, particulars of "
        "which are set out below, ACCEPT the system on behalf of:",
    )

    add_two_field_row(
        doc,
        "Customer Name",
        "[Customer Name]",
        "Position",
        "[Customer Position]",
    )
    add_two_field_row(
        doc, "Signature", "[Customer Signature]", "Date", "[Date]"
    )
    add_field_row(doc, "For and on behalf of", "[Customer Organisation]")

    add_freeform_box(
        doc,
        "The extent of the liability of the signatory is limited to the system "
        "described below:",
        "[Extent of System]",
        rows=2,
    )

    add_freeform_box(
        doc,
        "The following work is required before the system can be accepted:",
        "[Work Required]",
        rows=2,
    )

    add_freeform_box(
        doc,
        "Variations from the recommendations of clause 39 of BS 5839-1:2025:",
        "[Cl 39 Variations]",
        rows=3,
    )

    add_section_label(
        doc,
        "Persons trained on the use of the fire alarm system, and how to prevent "
        "false alarms",
    )
    add_two_field_row(doc, "Name", "[Trained Person 1]", "Name", "[Trained Person 2]")
    add_two_field_row(doc, "Name", "[Trained Person 3]", "Name", "[Trained Person 4]")

    add_paragraph(doc, "")
    add_paragraph(doc, "— All installation work appears to be satisfactory.", size=9)
    add_paragraph(doc, "— The system is capable of giving a fire alarm signal.", size=9)
    add_paragraph(
        doc,
        "— The facility for remote transmission of alarms to an alarm receiving centre "
        "operates correctly.",
        size=9,
    )

    add_section_label(doc, "The following documents have been provided to the purchaser or user:")
    for line in [
        "— 'As fitted' drawings.",
        "— Operating and maintenance instructions.",
        "— Certificates of design, installation and commissioning.",
        "— A log book.",
        "— Sufficient representatives of the user have been properly instructed in the "
        "use of the system; including, at least, all means of triggering fire signals, "
        "silencing and resetting the system and avoidance of false alarms.",
        "— All relevant tests, defined in the purchasing specification, have been witnessed.",
    ]:
        add_paragraph(doc, line, size=9)

    doc.save(out)


def build_battery_calc(out: Path) -> None:
    """BS 5839-1 §25.4 — Battery calculation worksheet (A058 equivalent).
    One panel per sheet; multi-panel systems use an additional sheet
    per extra panel."""
    doc = Document()
    set_a4_margins(doc)

    add_logo(doc)
    add_title(doc, "BHO A058", "Customer Fire Alarm Battery Calculation")

    add_section_label(doc, "Fire alarm battery calculations for")
    add_field_row(doc, "Address", "[Site Address]")
    add_field_row(doc, "Postcode", "[Site Postcode]")

    add_section_label(doc, "Battery calculation")
    add_field_row(doc, "Job number", "[Job Number]")

    add_two_field_row(
        doc,
        "Standby current 1 (A)",
        "[Standby Current]",
        "Standby time (hrs)",
        "[Standby Hours]",
    )
    add_two_field_row(
        doc,
        "+ Alarm current 2 (A)",
        "[Alarm Current]",
        "=  Sub-total (Ah)",
        "[Battery Subtotal]",
    )
    add_field_row(
        doc,
        "× 1.25  =  Minimum battery capacity (Ah)",
        "[Min Battery Capacity]",
        label_width=Cm(7.0),
        field_width=Cm(9.0),
    )

    add_paragraph(
        doc,
        "Round up to the nearest standard battery size in Ah (e.g. 5.6 → 7 Ah).",
        size=8,
        italic=True,
    )

    add_two_field_row(
        doc,
        "Design battery size (Ah)",
        "[Design Battery]",
        "Installed battery size (Ah)",
        "[Installed Battery]",
    )

    # Warning callout
    warn = doc.add_paragraph()
    wr = warn.add_run(
        "If the calculation requires larger than the provided batteries, please contact "
        "your PM or line manager."
    )
    wr.bold = True
    wr.font.size = Pt(9)
    wr.font.color.rgb = ACCENT

    add_section_label(doc, "Fire alarm loop calculations for")
    add_two_field_row(
        doc,
        "Panel located",
        "[Panel Location]",
        "Number of loops",
        "[Loop Count]",
    )
    add_paragraph(
        doc,
        "For systems with multiple control panels, please complete an additional A058 "
        "sheet per panel.",
        size=8,
        italic=True,
    )

    add_section_label(doc, "Test carried out by")
    add_two_field_row(doc, "Name", "[Test Engineer Name]", "Test meter", "[Test Meter Model]")
    add_two_field_row(
        doc,
        "Signature",
        "[Test Engineer Signature]",
        "Serial number",
        "[Test Meter Serial]",
    )
    add_field_row(doc, "Date", "[Test Date]")

    doc.save(out)


# ── Misc helpers ─────────────────────────────────────────────────────


def set_a4_margins(doc: Document) -> None:
    """A4 with 1.5cm margins — tighter than Word's default 2.54cm so
    the forms fit on a single page where the Churches versions did."""
    for section in doc.sections:
        section.left_margin = Cm(1.5)
        section.right_margin = Cm(1.5)
        section.top_margin = Cm(1.2)
        section.bottom_margin = Cm(1.2)


def add_checkbox_line(doc: Document, label: str) -> None:
    """Single checkbox + inline label row for the System Examinations
    section (6 items on commissioning page 1)."""
    p = doc.add_paragraph()
    box = p.add_run(CHECKBOX_EMPTY + "   ")
    box.font.size = Pt(11)
    label_run = p.add_run(label)
    label_run.font.size = Pt(9)
    p.paragraph_format.space_after = Pt(2)


# 33-item commissioning checklist — verbatim from BS 5839-1 §39 as
# reflected in the A051 source form. Kept inline so it ships with
# the script (no JSON sidecar).
COMMISSIONING_CHECKLIST_ITEMS: list[tuple[int, str]] = [
    (1,  "The system complies with the original specification / design and the use of the building has not changed."),
    (2,  "The 'as fitted' drawing accurately reflects the building structure (any changes recorded and passed to PM)."),
    (3,  "System has been installed to meet the requirements of category L1 / L2 / L3 / L4 / L5 / P1 / P2 / M (state)."),
    (4,  "Variations to the defined category have been identified and the schedule of variations agreed by the client and a nominated designer."),
    (5,  "Cables meet requirements for standard / enhanced / mixed (BS 5839-1 §26.2)."),
    (6,  "Cables are segregated as required and suitably supported (where visibly checked, §26.2)."),
    (7,  "Cables are mechanically protected as required where necessary (§26.2)."),
    (8,  "Junction boxes correctly labelled and identified on drawings (where visibly checked)."),
    (9,  "All cable insulation and continuity resistance measurements are logged."),
    (10, "All cable penetrations are sleeved and fire-stopped (where visibly checked)."),
    (11, "Mains supply is dedicated, key-switched, correctly fused and labelled 'fire alarm — do not switch off' (red, accessible with a special tool only)."),
    (12, "Mains supply identified at ALL distribution boards with a 'fire alarm — do not switch off' label in red."),
    (13, "230V suppliers' installation covered by a certificate (request the EICR). If not seen, log variation as '230VAC supply test records not seen during commissioning BS 5839-1 §38.2c.'"),
    (14, "Standby battery verification calculation has been carried out for ALL panels / power supplies. If calculation requires larger batteries than provided, contact PM or line manager."),
    (15, "All batteries are clearly marked and labelled with date of installation (§25.4)."),
    (16, "Field wiring is labelled and correctly terminated in all control and ancillary equipment."),
    (17, "Detector removal fault indication has been checked and tested (§12.2.1)."),
    (18, "Short circuit fault indication has been checked and tested."),
    (19, "ALL detection, MCPs, warning and ancillary devices have been tested for control operation and results recorded."),
    (20, "Cause and effect on the system has been tested and results recorded."),
    (21, "Provision of sounder circuits is appropriate (§16.2)."),
    (22, "Sound pressure levels have been checked and recorded (§16.2)."),
    (23, "Detector type and spacing is appropriate to the system category (§22.2)."),
    (24, "MCPs are located correctly and travel distances do not exceed 45 m (§22.2)."),
    (25, "Remote signalling has been checked and tested for correct operation to ARC (fire and fault)."),
    (26, "Radio signal strength (where applicable) exceeds manufacturer's minimum requirements."),
    (27, "Cause and effects have been checked and verified."),
    (28, "Zone charts have been fitted in appropriate locations and with the correct orientation (e.g. adjacent to control equipment and repeaters); search distances do not exceed limits; emergency lighting above."),
    (29, "'As fitted' drawings are complete and updated where required including cable type and sizes, cable routing, 230V supply, location of all MCPs / detectors / sounders / isolators."),
    (30, "User handbook and operating instructions have been issued to the 'responsible person'."),
    (31, "The 'responsible person' has been adequately trained in the use of the fire alarm system; details recorded."),
    (32, "Premises have been left in a tidy condition and all surplus materials and equipment removed from site."),
    (33, "Signage — correct signage has been installed (call points and fire action signs)."),
]


# ── Driver ───────────────────────────────────────────────────────────


def main() -> int:
    if not ASSETS.exists():
        print(f"assets/ not found: {ASSETS}", file=sys.stderr)
        return 1
    targets = [
        ("bs5839-installation-cert-template.docx",  build_installation_cert),
        ("bs5839-commissioning-cert-template.docx", build_commissioning_cert),
        ("bs5839-acceptance-cert-template.docx",    build_acceptance_cert),
        ("bs5839-battery-calc-template.docx",       build_battery_calc),
    ]
    for filename, builder in targets:
        out = ASSETS / filename
        builder(out)
        print(f"  ✓ {filename:<48} {out.stat().st_size:>6} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
