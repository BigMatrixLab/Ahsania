"""Writes report.pdf: the same made-up report as report.jpg, as a 2-page text PDF (no real patient).

Built by hand with the standard Helvetica font, so it needs nothing beyond Python itself.
"""

from pathlib import Path

PAGES = [
    [
        "AHSANIA MISSION CANCER & GENERAL HOSPITAL (DEMO)",
        "Patient Name: Test Person",
        "Reg No: AMH-00123",
        "",
        "CT CHEST REPORT",
        "Date: 01/09/2026",
        "Findings: 2.3 x 1.8 cm spiculated mass in right upper lobe.",
        "Impression: Suspicious for primary lung malignancy.",
    ],
    ["Page 2 of 2", "Reported by: Demo Radiologist"],
]


def page_stream(lines: list[str]) -> bytes:
    out = ["BT", "/F1 16 Tf", "60 780 Td", "24 TL"]
    for line in lines:
        text = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        out.append(f"({text}) Tj T*")
    out.append("ET")
    return "\n".join(out).encode("latin-1")


objects: list[bytes] = []
kids = " ".join(f"{3 + 2 * i} 0 R" for i in range(len(PAGES)))
objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
objects.append(f"<< /Type /Pages /Kids [{kids}] /Count {len(PAGES)} >>".encode())
font_ref = 3 + 2 * len(PAGES)
for i, lines in enumerate(PAGES):
    content = page_stream(lines)
    objects.append(
        f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 {font_ref} 0 R >> >> /Contents {4 + 2 * i} 0 R >>".encode()
    )
    objects.append(b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream")
objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

pdf = bytearray(b"%PDF-1.4\n")
offsets = []
for n, body in enumerate(objects, start=1):
    offsets.append(len(pdf))
    pdf += f"{n} 0 obj\n".encode() + body + b"\nendobj\n"
xref = len(pdf)
pdf += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
pdf += b"".join(f"{o:010d} 00000 n \n".encode() for o in offsets)
pdf += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
Path(__file__).with_name("report.pdf").write_bytes(bytes(pdf))
