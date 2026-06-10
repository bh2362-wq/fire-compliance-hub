"""
Build the BHO Fire BS 5839-1 Modification Certificate as a Word .docx
template matching the Churches CFS reference layout the user uploaded.

Same generation approach as the H&S Policy: assemble document.xml +
header1.xml + footer1.xml from string templates and zip with the
shared assets. Output is intentionally a one-page form — concise,
professional, and matching the "single sheet" feel the user prefers.

Placeholders (so a downstream edge function can fill via simple text
substitution — same convention as generate-bs5839-cert-docx):
  [PREMISES_NAME]        — site name
  [PREMISES_ADDRESS]     — single-line address
  [PREMISES_POSTCODE]
  [JOB_NUMBER]
  [ENGINEER_NAME]
  [ENGINEER_POSITION]
  [ENGINEER_SIGNED_DATE]
  [COMPANY_NAME_ADDRESS] — full "For and behalf of …" line
  [MODIFICATIONS_DESC]   — Extent of system modifications block
  [VARIATIONS_DESC]      — Variations from Cl. 46.4 block
  [TESTED_BOX]           — "X" or " " for the post-mod testing checkbox
  [RECORDS_BOX]          — "X" or " " for the records-updated checkbox
  [CUSTOMER_NAME]        — Signed customer
  [CUSTOMER_PRINT]       — Print name
  [CUSTOMER_POSITION]
  [CUSTOMER_DATE]
"""
import base64
import io
import zipfile
from pathlib import Path

OUT = Path("/tmp/BHO_Modification_Certificate_Template.docx")
LOGO_PATH = Path("/home/user/fire-compliance-hub/public/bho-fire-logo.png")

# Colours / fonts borrowed from the QMS PR-002 sample so the BHO QMS
# corpus stays visually coherent across cert + procedure documents.
NAVY = "1A1A2E"
RED  = "C0392B"
GREY = "7F8C8D"
BG   = "F5F5F5"   # light grey block backgrounds (matches Churches layout)
WHITE = "FFFFFF"

NAMESPACES = (
    'xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" '
    'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" '
    'xmlns:o="urn:schemas-microsoft-com:office:office" '
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
    'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" '
    'xmlns:v="urn:schemas-microsoft-com:vml" '
    'xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" '
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
    'xmlns:w10="urn:schemas-microsoft-com:office:word" '
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
    'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" '
    'xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" '
    'xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" '
    'xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" '
    'xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" '
    'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"'
)


def xe(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def blank(after: int = 120) -> str:
    return f'<w:p><w:pPr><w:spacing w:after="{after}"/></w:pPr><w:r><w:t xml:space="preserve"></w:t></w:r></w:p>'


def text_run(text: str, *, bold=False, color=NAVY, size_pt=10) -> str:
    sz = size_pt * 2  # docx half-points
    bold_tag = '<w:b/><w:bCs/>' if bold else ''
    return (
        '<w:r><w:rPr>'
        '<w:rFonts w:ascii="Arial" w:cs="Arial" w:eastAsia="Arial" w:hAnsi="Arial"/>'
        f'{bold_tag}<w:color w:val="{color}"/><w:sz w:val="{sz}"/><w:szCs w:val="{sz}"/>'
        '</w:rPr>'
        f'<w:t xml:space="preserve">{xe(text)}</w:t></w:r>'
    )


def para(*runs, align="left", after=120, shading=None, indent=None):
    align_xml = f'<w:jc w:val="{align}"/>'
    shading_xml = f'<w:shd w:val="clear" w:fill="{shading}"/>' if shading else ''
    indent_xml = f'<w:ind w:left="{indent}" w:right="{indent}"/>' if indent else ''
    return (
        '<w:p><w:pPr>'
        f'<w:spacing w:after="{after}"/>{align_xml}{indent_xml}{shading_xml}'
        '</w:pPr>'
        + ''.join(runs)
        + '</w:p>'
    )


def _placeholder():
    return None
    align_xml = f'<w:jc w:val="{align}"/>'
    shading_xml = f'<w:shd w:val="clear" w:fill="{shading}"/>' if shading else ''
    indent_xml = f'<w:ind w:left="{indent}" w:right="{indent}"/>' if indent else ''
    return (
        '<w:p><w:pPr>'
        f'<w:spacing w:after="{after}"/>{align_xml}{indent_xml}{shading_xml}'
        '</w:pPr>'
        + ''.join(runs)
        + '</w:p>'
    )


def centered_logo(emu_w=1066800, emu_h=831850) -> str:
    """Centered cover logo. Sized similarly to BHO H&S cover (~3in wide).
    The rId9 image rel is wired below in document.xml.rels."""
    return (
        '<w:p><w:pPr><w:spacing w:after="120"/><w:jc w:val="center"/></w:pPr>'
        '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
        f'<wp:extent cx="{emu_w}" cy="{emu_h}"/>'
        '<wp:effectExtent t="0" r="0" b="0" l="0"/>'
        '<wp:docPr id="1" name="logo" descr="BHO Fire" title=""/>'
        '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>'
        '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
        '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        '<pic:nvPicPr><pic:cNvPr id="0" name=""/><pic:cNvPicPr><a:picLocks noChangeAspect="1" noChangeArrowheads="1"/></pic:cNvPicPr></pic:nvPicPr>'
        '<pic:blipFill><a:blip r:embed="rId9" cstate="none"/><a:srcRect/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
        f'<pic:spPr bwMode="auto"><a:xfrm><a:off x="0" y="0"/><a:ext cx="{emu_w}" cy="{emu_h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
        '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
    )


def _cell(content_xml: str, *, width: int, fill: str | None = None,
          borders=True, vmerge=None) -> str:
    fill_xml = f'<w:shd w:fill="{fill}" w:val="clear"/>' if fill else ''
    if borders:
        borders_xml = (
            '<w:tcBorders>'
            f'<w:top w:val="single" w:color="DDDDDD" w:sz="4"/>'
            f'<w:left w:val="single" w:color="DDDDDD" w:sz="4"/>'
            f'<w:bottom w:val="single" w:color="DDDDDD" w:sz="4"/>'
            f'<w:right w:val="single" w:color="DDDDDD" w:sz="4"/>'
            '</w:tcBorders>'
        )
    else:
        borders_xml = (
            '<w:tcBorders>'
            '<w:top w:val="nil"/><w:left w:val="nil"/>'
            '<w:bottom w:val="nil"/><w:right w:val="nil"/>'
            '</w:tcBorders>'
        )
    vmerge_xml = f'<w:vMerge w:val="{vmerge}"/>' if vmerge else ''
    return (
        '<w:tc><w:tcPr>'
        f'<w:tcW w:type="dxa" w:w="{width}"/>'
        f'{borders_xml}{fill_xml}{vmerge_xml}'
        '<w:tcMar><w:top w:type="dxa" w:w="100"/><w:left w:type="dxa" w:w="140"/>'
        '<w:bottom w:type="dxa" w:w="100"/><w:right w:type="dxa" w:w="140"/></w:tcMar>'
        '<w:vAlign w:val="center"/>'
        '</w:tcPr>'
        + content_xml
        + '</w:tc>'
    )


# Section block widths (twentieths of a point: full page width ≈ 9000)
LBL_W = 2400
VAL_W = 6700
ROW2_LBL_W = 1300
ROW2_VAL_W = 3000


def label_value_row(label: str, value_xml: str, *, fill=BG) -> str:
    """Standard two-column row matching the Churches layout — small
    label cell on the left, wider value cell on the right."""
    label_run = text_run(label, bold=False, color=NAVY, size_pt=10)
    return (
        '<w:tr>'
        + _cell(para(label_run, after=0), width=LBL_W, fill=fill)
        + _cell(value_xml, width=VAL_W, fill=fill)
        + '</w:tr>'
    )


def two_pair_row(left_label, left_val_xml, right_label, right_val_xml, *, fill=BG) -> str:
    """Row with two label/value pairs side by side."""
    ll = text_run(left_label, color=NAVY, size_pt=10)
    rl = text_run(right_label, color=NAVY, size_pt=10)
    return (
        '<w:tr>'
        + _cell(para(ll, after=0), width=ROW2_LBL_W, fill=fill)
        + _cell(left_val_xml, width=ROW2_VAL_W, fill=fill)
        + _cell(para(rl, after=0), width=ROW2_LBL_W, fill=fill)
        + _cell(right_val_xml, width=ROW2_VAL_W, fill=fill)
        + '</w:tr>'
    )


def open_table(grid_widths: list[int]) -> str:
    cols = ''.join(f'<w:gridCol w:w="{w}"/>' for w in grid_widths)
    total = sum(grid_widths)
    return (
        '<w:tbl><w:tblPr>'
        f'<w:tblW w:type="dxa" w:w="{total}"/>'
        '<w:tblBorders>'
        '<w:top w:val="single" w:color="DDDDDD" w:sz="4"/>'
        '<w:left w:val="single" w:color="DDDDDD" w:sz="4"/>'
        '<w:bottom w:val="single" w:color="DDDDDD" w:sz="4"/>'
        '<w:right w:val="single" w:color="DDDDDD" w:sz="4"/>'
        '<w:insideH w:val="single" w:color="DDDDDD" w:sz="4"/>'
        '<w:insideV w:val="single" w:color="DDDDDD" w:sz="4"/>'
        '</w:tblBorders>'
        '</w:tblPr>'
        f'<w:tblGrid>{cols}</w:tblGrid>'
    )


CLOSE_TABLE = '</w:tbl>'


def free_text_box(placeholder: str) -> str:
    """Multi-line free-text block — three blank-line-height paragraphs
    inside a single bordered cell so a downstream substitution can wrap
    long values without breaking the layout."""
    inner = para(text_run(f"[{placeholder}]", color=NAVY, size_pt=10), after=0)
    return (
        '<w:tbl><w:tblPr>'
        '<w:tblW w:type="dxa" w:w="9100"/>'
        '<w:tblBorders>'
        '<w:top w:val="single" w:color="DDDDDD" w:sz="4"/>'
        '<w:left w:val="single" w:color="DDDDDD" w:sz="4"/>'
        '<w:bottom w:val="single" w:color="DDDDDD" w:sz="4"/>'
        '<w:right w:val="single" w:color="DDDDDD" w:sz="4"/>'
        '</w:tblBorders>'
        '</w:tblPr>'
        '<w:tblGrid><w:gridCol w:w="9100"/></w:tblGrid>'
        '<w:tr><w:trPr><w:trHeight w:val="900" w:hRule="atLeast"/></w:trPr>'
        + _cell(inner, width=9100, fill=None, borders=False)
        + '</w:tr></w:tbl>'
    )


# ── Content build ────────────────────────────────────────────────────

body_parts: list[str] = []

# Cover: centered BHO logo
body_parts.append(centered_logo())

# Title
body_parts.append(
    para(
        text_run("Fire Alarm Modification Certificate", bold=True,
                 color=NAVY, size_pt=20),
        align="center", after=200,
    )
)
# Sub-line
body_parts.append(
    para(
        text_run(
            "Certification of modification (to BS 5839-1:2025) for the fire "
            "detection and fire alarm system at:",
            color=RED, size_pt=10,
        ),
        align="left", after=120,
        shading=BG,
    )
)

# Site identification block — Name, Address, Postcode + Job number
body_parts.append(open_table([LBL_W, VAL_W]))
body_parts.append(label_value_row(
    "Name",
    para(text_run("[PREMISES_NAME]", color=NAVY, size_pt=10), after=0),
))
body_parts.append(label_value_row(
    "Address",
    para(text_run("[PREMISES_ADDRESS]", color=NAVY, size_pt=10), after=0),
))
body_parts.append(CLOSE_TABLE)
# Postcode / Job number split row
body_parts.append(open_table([ROW2_LBL_W, ROW2_VAL_W, ROW2_LBL_W, ROW2_VAL_W]))
body_parts.append(two_pair_row(
    "Postcode",
    para(text_run("[PREMISES_POSTCODE]", color=NAVY, size_pt=10), after=0),
    "Job number",
    para(text_run("[JOB_NUMBER]", color=NAVY, size_pt=10), after=0),
))
body_parts.append(CLOSE_TABLE)

# Compliance statement
body_parts.append(
    para(
        text_run(
            "I/We being the competent person(s) responsible (as indicated by "
            "my/our signature(s) below) for the modifications of the fire "
            "detection and fire alarm system, particulars of which are set out "
            "below, CERTIFY that the said modification work for which I/we have "
            "been responsible has been to the best of my/our knowledge and "
            "belief been carried out in accordance with the recommendations of "
            "46.4 of BS 5839-1:2025, except for the variations, if any, stated "
            "in this certificate:",
            color=GREY, size_pt=8,
        ),
        align="left", after=120, shading=BG,
    )
)

# Technician name / Position + Signature / Date
body_parts.append(open_table([ROW2_LBL_W, ROW2_VAL_W, ROW2_LBL_W, ROW2_VAL_W]))
body_parts.append(two_pair_row(
    "Technician name",
    para(text_run("[ENGINEER_NAME]", color=NAVY, size_pt=10), after=0),
    "Position",
    para(text_run("[ENGINEER_POSITION]", color=NAVY, size_pt=10), after=0),
))
body_parts.append(two_pair_row(
    "Signature",
    para(text_run("[ENGINEER_SIGNATURE]", color=GREY, size_pt=9), after=0),
    "Date",
    para(text_run("[ENGINEER_SIGNED_DATE]", color=NAVY, size_pt=10), after=0),
))
body_parts.append(CLOSE_TABLE)

# Company line
body_parts.append(
    para(
        text_run("For and behalf of  ", color=NAVY, size_pt=9, bold=True),
        text_run("[COMPANY_NAME_ADDRESS]", color=NAVY, size_pt=9),
        align="left", after=240, shading=BG,
    )
)

# Spacer
body_parts.append(blank(after=120))

# Red note — extent of liability
body_parts.append(
    para(
        text_run(
            "The extent of the liability of the signatory is limited to the "
            "system described below:",
            color=RED, size_pt=10,
        ),
        align="left", after=120,
    )
)

# Extent heading + free text
body_parts.append(
    para(
        text_run(
            "Extent of the system modifications covered by this certificate — "
            "list modifications (description of works)",
            color=RED, size_pt=10,
        ),
        align="left", after=80,
    )
)
body_parts.append(free_text_box("MODIFICATIONS_DESC"))

# Variations heading + free text
body_parts.append(blank(after=80))
body_parts.append(
    para(
        text_run(
            "Variations from the recommendations of clause 46.4 of BS 5839-1:2025",
            color=RED, size_pt=10,
        ),
        align="left", after=80,
    )
)
body_parts.append(free_text_box("VARIATIONS_DESC"))

body_parts.append(blank(after=160))

# Confirmation checkbox rows — checkboxes use [TESTED_BOX] / [RECORDS_BOX]
# which the downstream code substitutes with "X" or " ".
def checkbox_row(text: str, placeholder: str) -> str:
    return (
        '<w:tr>'
        + _cell(
            para(text_run(text, color=NAVY, size_pt=9), after=0),
            width=8200, fill=BG, borders=False,
        )
        + _cell(
            para(
                text_run("[", color=NAVY, size_pt=12, bold=True),
                text_run(f"[{placeholder}]", color=NAVY, size_pt=12, bold=True),
                text_run("]", color=NAVY, size_pt=12, bold=True),
                align="center", after=0,
            ),
            width=900, fill=BG, borders=True,
        )
        + '</w:tr>'
    )


body_parts.append(open_table([8200, 900]))
body_parts.append(checkbox_row(
    "Following the modifications, the system has been tested in accordance with "
    "the recommendations of 46.4.2 of BS 5839-1:2025.",
    "TESTED_BOX",
))
body_parts.append(checkbox_row(
    "Following the modifications, battery calculation test sheet, as-fitted "
    "drawings and other system records have been updated as appropriate.",
    "RECORDS_BOX",
))
body_parts.append(CLOSE_TABLE)

# Customer confirmation
body_parts.append(
    para(
        text_run(
            "I/We the undersigned, confirm that the modifications have introduced "
            "no additional variations from the recommendations of BS 5839-1:2025, "
            "other than those recorded above:",
            color=NAVY, size_pt=9,
        ),
        align="left", after=120, shading=BG,
    )
)

body_parts.append(open_table([ROW2_LBL_W, ROW2_VAL_W, ROW2_LBL_W, ROW2_VAL_W]))
body_parts.append(two_pair_row(
    "Signed customer",
    para(text_run("[CUSTOMER_NAME]", color=GREY, size_pt=9), after=0),
    "Print name",
    para(text_run("[CUSTOMER_PRINT]", color=NAVY, size_pt=10), after=0),
))
body_parts.append(two_pair_row(
    "Position",
    para(text_run("[CUSTOMER_POSITION]", color=NAVY, size_pt=10), after=0),
    "Date",
    para(text_run("[CUSTOMER_DATE]", color=NAVY, size_pt=10), after=0),
))
body_parts.append(CLOSE_TABLE)


DOC_OPEN = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    f'<w:document mc:Ignorable="w14 w15 wp14" {NAMESPACES}>'
    '<w:body>'
)

SECT_PR = (
    '<w:sectPr>'
    '<w:pgSz w:w="11906" w:h="16838" w:orient="portrait"/>'
    '<w:pgMar w:top="900" w:right="800" w:bottom="900" w:left="800" '
    'w:header="500" w:footer="500" w:gutter="0"/>'
    '<w:docGrid w:linePitch="360"/>'
    '</w:sectPr>'
    '</w:body></w:document>'
)

document_xml = DOC_OPEN + ''.join(body_parts) + SECT_PR


# Standard supporting files for a Word doc ─────────────────────────────

CONTENT_TYPES = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>
'''

ROOT_RELS = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
'''

DOC_RELS = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/bho-logo.png"/>
</Relationships>
'''

STYLES = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>
        <w:sz w:val="20"/>
        <w:szCs w:val="20"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr><w:spacing w:after="120"/></w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>
</w:styles>
'''

# ── Zip everything ───────────────────────────────────────────────────

buf = io.BytesIO()
with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", CONTENT_TYPES)
    z.writestr("_rels/.rels", ROOT_RELS)
    z.writestr("word/_rels/document.xml.rels", DOC_RELS)
    z.writestr("word/styles.xml", STYLES)
    z.writestr("word/document.xml", document_xml)
    z.write(LOGO_PATH, "word/media/bho-logo.png")

OUT.write_bytes(buf.getvalue())
print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")
