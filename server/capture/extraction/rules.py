"""Fills a form from the OCR text with plain rules: no model, no GPU.

A rule that finds nothing leaves the field blank for the doctor, so a gap is likelier than a wrong answer. Each value
carries the line it came from and that line's OCR score; a doubtful choice gets a low confidence, so the form asks the
doctor to check it. Handwriting is not expected to read well.
"""

import re
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from capture.extraction.crosscheck import dates_in, source_of
from capture.extraction.ocr import OcrLine
from capture.formschema.model import TemplateDef

RULES_MODEL = "ocr-rules"
UNSURE = 0.5  # below the amber threshold


def _rx(pattern: str) -> re.Pattern[str]:
    return re.compile(pattern, re.IGNORECASE)


_OTHER_DATE = _rx(r"birth|\bdob\b|d\.o\.b|admi(t|ssion)|discharge|previous|prior|compar|follow")
_DATE_LABEL = _rx(r"date|study|scan|exam|report")
_EARLIER_SCAN = _rx(r"compar|previous|prior|follow")
_PET = _rx(r"\bPET\s*[-/]?\s*CT\b")
_MODALITIES = {
    "MRI": _rx(r"\bMRI\b|\bM\.R\.I\b|magnetic resonance"),
    "CT": _rx(r"\b(?:HR|CE|NC)?CT\b|computed tomography"),
    "X-ray": _rx(r"\bX\s*-?\s*RAY\b|\bCXR\b|radiograph|skiagram"),
}
_NO_CONTRAST = _rx(r"without\s+(iv\s+)?contrast|non[-\s]?contrast|non[-\s]?enhanced|\bNCCT\b|\bplain\s+(ct|scan|study)\b|\bno\s+contrast")
_CONTRAST = _rx(r"\bwith\s+(iv\s+)?contrast|contrast[-\s]enhanced|post[-\s]?contrast|\bCECT\b|\(\s*P\s*\+\s*C\s*\)")
_NUMBER = r"\d+(?:[.,·]\d+)?"
_TIMES = r"\s*(?:cm|mm)?\s*[x×*]\s*"
_SIZE = _rx(rf"(?<![\d.,])({_NUMBER})(?:{_TIMES}({_NUMBER}))?(?:{_TIMES}{_NUMBER})?\s*(cm|mm)\b")
_LESION_WORD = r"mass|nodule|lesion|opacity|consolidation|tumou?r|growth|cavity"
_DESCRIPTION = _rx(rf"((?:[a-z-]+\s+){{0,2}})\b({_LESION_WORD})\b")
_FILLER = {"a", "an", "the", "is", "of", "and", "with", "seen", "there", "in"}
_NOT_A_LESION = _rx(r"lymph|\bnodes?\b|effusion")
_LOBE_NAMED = _rx(r"\b(right|rt|left|lt)\.?\s+(upper|middle|lower)\s+lobe\b")
_LOBE_OF_LUNG = _rx(r"\b(upper|middle|lower)\s+lobe\s+of\s+(?:the\s+)?(right|left)\b")
_LOBE_CODE = _rx(r"\b(RUL|RML|RLL|LUL|LLL)\b")
_LOBES = {"RU": "RUL", "RM": "RML", "RL": "RLL", "LU": "LUL", "LL": "LLL"}
_NODES = _rx(r"lymph\s*nodes?|lymphadenopathy")
_SPREAD = _rx(r"metasta")
_NO = _rx(r"\b(no|absent|without)\b")
_BOTH = _rx(r"bilateral|\bboth\b")
_LEFT = _rx(r"\b(left|lt)\b")
_RIGHT = _rx(r"\b(right|rt)\b")
_CHANGES = {
    "stable": _rx(r"\bstable\b|unchanged|no\s+(significant\s+|interval\s+)?change"),
    "new": _rx(r"\bnew\b|\bnewly\b"),
    "increased": _rx(r"increas|larger|progress"),
    "decreased": _rx(r"decreas|reduc|smaller|regress"),
}
_COMPARING = _rx(r"lesion|mass|nodule|tumou?r|compar|previous|prior|since|interval")
_IMPRESSION = _rx(r"^\s*(?:impression|conclusion|opinion)\b\s*[:\-–]?\s*(.*)$")
_SIGNATURE = _rx(r"consultant|radiologist|signature|reported\s+by|\bdr\b\.?|mbbs|fcps|\bmd\b|page\s+\d")
_VIEWS = {"PA": _rx(r"\bP/?A\b|postero"), "AP": _rx(r"\bA/?P\b|antero"), "lateral": _rx(r"\bLAT\b|\blateral\b")}
_SIDES = {"L": "L", "LT": "L", "R": "R", "RT": "R"}
_SLICE = _rx(r"\b(IM|IMG|IMA|IMAGE|SLICE|SL)\s*[:#.]?\s*(\d+)\b")


@dataclass
class RuleResult:
    values: dict[str, Any] = field(default_factory=dict)
    confidences: dict[str, float] = field(default_factory=dict)
    sources: dict[str, list[dict[str, Any]]] = field(default_factory=dict)

    def note(self, path: str, lines: list[OcrLine], unsure: bool = False) -> None:
        score = min(line.score for line in lines)
        self.confidences[path] = min(score, UNSURE) if unsure else score
        self.sources[path] = [source_of(lines)]

    def put(self, key: str, value: Any, lines: list[OcrLine], unsure: bool = False) -> None:
        self.values[key] = value
        self.note(key, lines, unsure)


def _first(lines: list[OcrLine], pattern: re.Pattern[str]) -> OcrLine | None:
    return next((line for line in lines if pattern.search(line.text)), None)


def _read_date(found: RuleResult, key: str, lines: list[OcrLine]) -> None:
    candidates = []
    for i, line in enumerate(lines):
        before = lines[i - 1].text if i > 0 else ""
        label_above = _OTHER_DATE.search(before) and not re.search(r"\d", before)
        if _OTHER_DATE.search(line.text) or label_above:
            continue
        candidates.extend((day, line) for day in sorted(dates_in(line.text)) if day.year >= 2000)
    labelled = [c for c in candidates if _DATE_LABEL.search(c[1].text)]
    pool = labelled or candidates
    if pool:
        day, line = pool[0]
        found.put(key, day.isoformat(), [line], unsure=len({d for d, _ in pool}) > 1)


def _read_modality(found: RuleResult, lines: list[OcrLine], allowed: tuple[str, ...] = ("PET-CT", "MRI", "CT", "X-ray")) -> None:
    """The first line naming exactly one kind of scan: a letterhead lists several, and a comparison names an earlier scan."""
    for line in lines:
        if _EARLIER_SCAN.search(line.text):
            continue
        hits = ["PET-CT"] if _PET.search(line.text) else []
        rest = _PET.sub(" ", line.text)
        hits += [name for name, pattern in _MODALITIES.items() if pattern.search(rest)]
        if len(hits) == 1:
            if hits[0] in allowed:
                found.put("modality", hits[0], [line])
            return


def _read_contrast(found: RuleResult, lines: list[OcrLine]) -> None:
    for line in lines:
        if _NO_CONTRAST.search(line.text):
            found.put("contrast", False, [line])
            return
        if _CONTRAST.search(line.text):
            found.put("contrast", True, [line])
            return


def _lobe_in(text: str) -> str | None:
    if match := _LOBE_CODE.search(text):
        return match.group(1).upper()
    if match := _LOBE_NAMED.search(text):
        side, level = match.groups()
    elif match := _LOBE_OF_LUNG.search(text):
        level, side = match.groups()
    else:
        return None
    return _LOBES.get(side[0].upper() + level[0].upper())


def _number(text: str) -> float:
    return float(text.replace(",", ".").replace("·", "."))


def _description(line: str, size: re.Match[str]) -> str | None:
    match = _DESCRIPTION.search(line[size.end() :]) or _DESCRIPTION.search(line[: size.start()])
    if not match:
        return None
    words = [word for word in match.group(1).split() if word.lower() not in _FILLER]
    return " ".join([*words, match.group(2)])


def _read_lesions(found: RuleResult, lines: list[OcrLine]) -> None:
    lesions: list[dict[str, Any]] = []
    for i, line in enumerate(lines):
        size = _SIZE.search(line.text)
        if not size or _NOT_A_LESION.search(line.text):
            continue
        lobe, lobe_lines = _lobe_in(line.text.replace("Rt.", "Rt").replace("Lt.", "Lt")), [line]
        following = lines[i + 1] if i + 1 < len(lines) and lines[i + 1].page == line.page else None
        if lobe is None and following and not _SIZE.search(following.text):  # the sentence wraps onto the next line
            lobe = _lobe_in(f"{line.text} {following.text}")
            lobe_lines = [line, following]
        description = _description(line.text, size)
        if lobe is None and description is None:
            continue
        scale = 0.1 if size.group(3).lower() == "mm" else 1
        sizes = sorted((round(_number(g) * scale, 2) for g in size.groups()[:2] if g), reverse=True)
        path = f"lesions[{len(lesions)}]"
        lesion: dict[str, Any] = {}
        if lobe:
            lesion["lobe"] = lobe
            found.note(f"{path}.lobe", lobe_lines)
        lesion["long_axis_cm"] = sizes[0]
        found.note(f"{path}.long_axis_cm", [line])
        if len(sizes) > 1:
            lesion["short_axis_cm"] = sizes[1]
            found.note(f"{path}.short_axis_cm", [line])
        if description:
            lesion["description"] = description
            found.note(f"{path}.description", [line])
        lesions.append(lesion)
    if lesions:
        found.values["lesions"] = lesions


def _copy_lines(found: RuleResult, key: str, lines: list[OcrLine], pattern: re.Pattern[str]) -> None:
    matching = [line for line in lines if pattern.search(line.text)]
    if matching:
        found.put(key, " ".join(line.text.strip() for line in matching), matching)


def _read_effusion(found: RuleResult, lines: list[OcrLine]) -> None:
    for line in lines:
        text = line.text
        if not re.search("effusion", text, re.IGNORECASE):
            continue
        if _NO.search(text):
            side = "none"
        elif _BOTH.search(text) or (_LEFT.search(text) and _RIGHT.search(text)):
            side = "bilateral"
        elif _LEFT.search(text):
            side = "left"
        elif _RIGHT.search(text):
            side = "right"
        else:
            continue
        found.put("pleural_effusion", side, [line])
        return


def _read_change(found: RuleResult, findings: list[OcrLine], impression: list[OcrLine]) -> None:
    for line in [*findings, *impression]:
        if not _COMPARING.search(line.text) or _NOT_A_LESION.search(line.text):
            continue
        for change, pattern in _CHANGES.items():
            if pattern.search(line.text):
                found.put("reported_change", change, [line])
                return


def _split_impression(lines: list[OcrLine]) -> tuple[list[OcrLine], list[OcrLine]]:
    """(the lines before the impression, the lines of the impression, without its heading's empty line or the signature)."""
    for i, line in enumerate(lines):
        match = _IMPRESSION.match(line.text)
        if not match:
            continue
        body = [line] if match.group(1).strip() else []
        for following in lines[i + 1 : i + 5]:
            if _SIGNATURE.search(following.text):
                break
            body.append(following)
        return lines[:i], body
    return lines, []


def _read_report(found: RuleResult, tpl: TemplateDef, lines: list[OcrLine]) -> None:
    findings, impression = _split_impression(lines)
    _read_modality(found, findings)
    _read_date(found, "study_date", findings)
    _read_contrast(found, findings)
    _read_lesions(found, findings)
    _copy_lines(found, "lymph_nodes", findings, _NODES)
    _copy_lines(found, "metastasis_sites", findings, _SPREAD)
    _read_effusion(found, findings)
    _read_change(found, findings, impression)
    if impression:
        parts = [_IMPRESSION.sub(r"\1", line.text).strip() for line in impression]
        found.put("impression", " ".join(part for part in parts if part), impression)


def _read_xray_film(found: RuleResult, tpl: TemplateDef, lines: list[OcrLine]) -> None:
    _read_date(found, "study_date", lines)
    for view, pattern in _VIEWS.items():
        if line := _first(lines, pattern):
            found.put("view", view, [line])
            break
    for line in lines:
        side = _SIDES.get(line.text.strip().upper())
        if side:
            found.put("side_marker", side, [line])
            break


def _read_ct_film(found: RuleResult, tpl: TemplateDef, lines: list[OcrLine]) -> None:
    _read_modality(found, lines, allowed=("CT", "MRI"))
    _read_date(found, "study_date", lines)
    for window, word in (("lung", r"\blung\b"), ("mediastinal", r"mediastin")):
        if line := _first(lines, _rx(word)):
            found.put("window", window, [line])
            break
    if line := _first(lines, _SLICE):
        match = _SLICE.search(line.text)
        found.put("slice_label", f"{match.group(1)} {match.group(2)}", [line])


_READERS: dict[str, Callable[[RuleResult, TemplateDef, list[OcrLine]], None]] = {
    "radiology_report": _read_report,
    "xray_film_photo": _read_xray_film,
    "ct_mri_film_photo": _read_ct_film,
}


def read_by_rules(tpl: TemplateDef, lines: list[OcrLine]) -> RuleResult:
    """What the rules can read for this form. Forms without rules of their own get their date and nothing else."""
    found = RuleResult()
    reader = _READERS.get(tpl.key)
    if reader:
        reader(found, tpl, lines)
    else:
        _read_date(found, tpl.document_date_key, lines)
    return found
