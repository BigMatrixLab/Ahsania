from datetime import date

import pytest
import yaml

from capture.extraction.assemble import build_extraction, conform
from capture.extraction.ocr import OcrLine
from capture.extraction.rules import RULES_MODEL, UNSURE, read_by_rules
from capture.formschema.model import TemplateDef
from capture.formschema.validate import validate_values
from constants import PHOTO, TEMPLATES_DIR
from fakes import FakeOcr, run_once
from capture.worker.process import Engines


def template(key: str) -> TemplateDef:
    return TemplateDef.model_validate(yaml.safe_load((TEMPLATES_DIR / f"{key}.yaml").read_text(encoding="utf-8")))


REPORT = template("radiology_report")
XRAY = template("xray_film_photo")
CT_FILM = template("ct_mri_film_photo")


def lines(*texts: str, score: float = 0.99) -> list[OcrLine]:
    return [OcrLine(1, text, (10, 40 * i, 500, 40 * i + 30), score) for i, text in enumerate(texts)]


def read(tpl: TemplateDef, *texts: str):
    return read_by_rules(tpl, lines(*texts))


# What PaddleOCR really reads off page 1 of eval/test-sheet.pdf.
SHEET = (
    "AHSANIA MISSION CANCER & GENERAL HOSPITAL",
    "Department of Radiology & Imaging · SYNTHETIC TEST DOCUMENT — NOT A REAL PATIENT",
    "Patient Name:",
    "Test Patient One",
    "Reg No:",
    "RC204518",
    "Age / Sex:",
    "56 / M",
    "CT CHEST WITH CONTRAST",
    "Date: 14/08/2026",
    "FINDINGS",
    "A 3.2 x 2.4 cm spiculated mass in the right upper lobe.",
    "A 1.1 x 0.9 cm ground-glass nodule in the left lower lobe.",
    "Enlarged right hilar lymph node, 1.4 cm.",
    "Small left pleural effusion.",
    "The lesion has increased in size since the previous study.",
    "No distant metastasis seen.",
    "IMPRESSION",
    "Suspicious for primary lung malignancy.",
    "Consultant Radiologist",
)


def test_the_test_sheet_is_read_field_by_field():
    assert read(REPORT, *SHEET).values == {
        "modality": "CT",
        "study_date": "2026-08-14",
        "contrast": True,
        "lesions": [
            {"lobe": "RUL", "long_axis_cm": 3.2, "short_axis_cm": 2.4, "description": "spiculated mass"},
            {"lobe": "LLL", "long_axis_cm": 1.1, "short_axis_cm": 0.9, "description": "ground-glass nodule"},
        ],
        "lymph_nodes": "Enlarged right hilar lymph node, 1.4 cm.",
        "metastasis_sites": "No distant metastasis seen.",
        "pleural_effusion": "left",
        "reported_change": "increased",
        "impression": "Suspicious for primary lung malignancy.",
    }


def test_a_page_with_nothing_recognisable_stays_blank():
    assert read(REPORT, "Thank you for choosing our hospital").values == {}
    assert read_by_rules(REPORT, []).values == {}


def test_no_name_or_id_from_the_page_lands_in_a_field():
    found = read(REPORT, *SHEET)
    assert "Test Patient One" not in str(found.values)
    assert "RC204518" not in str(found.values)


class TestStudyDate:
    def test_a_date_of_birth_is_never_the_study_date(self):
        assert read(REPORT, "Date of Birth: 12/03/2001", "CT CHEST", "Date: 14/08/2026").values["study_date"] == "2026-08-14"

    def test_nor_when_its_label_is_on_the_line_before(self):
        assert read(REPORT, "DOB:", "12/03/2001", "CT CHEST", "14/08/2026").values["study_date"] == "2026-08-14"

    def test_a_date_from_long_ago_is_not_a_study(self):
        assert read(REPORT, "12/03/1965", "CT CHEST", "14/08/2026").values["study_date"] == "2026-08-14"

    def test_an_earlier_scan_is_not_this_study(self):
        assert read(REPORT, "Compared with previous CT of 01/02/2026", "Date: 14/08/2026").values["study_date"] == "2026-08-14"

    def test_a_labelled_date_wins_over_an_unlabelled_one(self):
        found = read(REPORT, "10/08/2026", "Study date: 14/08/2026")
        assert found.values["study_date"] == "2026-08-14"
        assert found.confidences["study_date"] == pytest.approx(0.99)

    def test_several_dates_with_no_label_ask_the_doctor_to_check(self):
        found = read(REPORT, "10/08/2026", "14/08/2026")
        assert found.values["study_date"] == "2026-08-10"
        assert found.confidences["study_date"] == UNSURE

    def test_the_same_date_twice_is_no_doubt(self):
        assert read(REPORT, "14/08/2026", "Date: 14/08/2026").confidences["study_date"] == pytest.approx(0.99)

    @pytest.mark.parametrize(
        ("text", "expected"),
        [
            ("Date: 03/04/2026", "2026-04-03"),  # day first, as written in Bangladesh
            ("Date: 14-08-2026", "2026-08-14"),
            ("Date: 14.08.2026", "2026-08-14"),
            ("Date: 14 Aug 2026", "2026-08-14"),
            ("Date: August 14, 2026", "2026-08-14"),
            ("Date: 2026-08-14", "2026-08-14"),
        ],
    )
    def test_the_ways_a_date_is_written(self, text, expected):
        assert read(REPORT, text).values["study_date"] == expected


class TestModality:
    @pytest.mark.parametrize(
        ("title", "expected"),
        [
            ("CT CHEST", "CT"),
            ("HRCT OF CHEST", "CT"),
            ("CECT THORAX", "CT"),
            ("CT SCAN OF CHEST", "CT"),
            ("MRI THORAX", "MRI"),
            ("CHEST X-RAY", "X-ray"),
            ("X RAY CHEST PA VIEW", "X-ray"),
            ("CXR PA", "X-ray"),
            ("PET-CT WHOLE BODY", "PET-CT"),
            ("PET CT", "PET-CT"),
        ],
    )
    def test_the_report_title(self, title, expected):
        assert read(REPORT, title).values["modality"] == expected

    @pytest.mark.parametrize("texts", [("CHEST X-RAY", "Compared with previous CT of 01/02/2026."), ("Compared with the prior CT.", "CHEST X-RAY")])
    def test_a_mention_of_an_earlier_scan_does_not_set_it(self, texts):
        assert read(REPORT, *texts).values["modality"] == "X-ray"

    def test_a_letterhead_listing_every_service_is_ignored(self):
        assert read(REPORT, "CT, MRI, X-ray and Ultrasound services", "MRI THORAX").values["modality"] == "MRI"


class TestContrast:
    @pytest.mark.parametrize(
        ("title", "expected"),
        [
            ("CT CHEST WITH CONTRAST", True),
            ("CONTRAST ENHANCED CT", True),
            ("CECT CHEST", True),
            ("CT CHEST (P+C)", True),
            ("CT CHEST WITHOUT CONTRAST", False),
            ("NON-CONTRAST CT", False),
            ("NCCT CHEST", False),
            ("PLAIN CT CHEST", False),
        ],
    )
    def test_read_from_the_title(self, title, expected):
        assert read(REPORT, title).values["contrast"] is expected

    def test_not_said_is_left_blank(self):
        assert "contrast" not in read(REPORT, "CT CHEST").values


class TestLesions:
    @pytest.mark.parametrize(
        ("text", "expected"),
        [
            ("A 32 x 24 mm lobulated mass in the left upper lobe.", {"lobe": "LUL", "long_axis_cm": 3.2, "short_axis_cm": 2.4, "description": "lobulated mass"}),
            ("A 1.8 x 2.3 cm cavitating lesion in the right middle lobe.", {"lobe": "RML", "long_axis_cm": 2.3, "short_axis_cm": 1.8, "description": "cavitating lesion"}),
            ("A 3.2 × 2.4 cm part-solid nodule in the RLL.", {"lobe": "RLL", "long_axis_cm": 3.2, "short_axis_cm": 2.4, "description": "part-solid nodule"}),
            ("A 3,2 x 2,4 cm mass in the LLL.", {"lobe": "LLL", "long_axis_cm": 3.2, "short_axis_cm": 2.4, "description": "mass"}),
            ("A 3 cm nodule in the RML.", {"lobe": "RML", "long_axis_cm": 3.0, "description": "nodule"}),
            ("Spiculated mass measuring 3.2 x 2.4 cm in right upper lobe.", {"lobe": "RUL", "long_axis_cm": 3.2, "short_axis_cm": 2.4, "description": "Spiculated mass"}),
            ("A 3.2cm x 2.4cm mass in the Rt. upper lobe.", {"lobe": "RUL", "long_axis_cm": 3.2, "short_axis_cm": 2.4, "description": "mass"}),
            ("A 3.2 x 2.4 x 2.0 cm mass in the upper lobe of the left lung.", {"lobe": "LUL", "long_axis_cm": 3.2, "short_axis_cm": 2.4, "description": "mass"}),
        ],
    )
    def test_the_ways_a_lesion_is_written(self, text, expected):
        assert read(REPORT, text).values["lesions"] == [expected]

    def test_a_sentence_that_wraps_onto_the_next_line(self):
        found = read(REPORT, "A 3.2 x 2.4 cm spiculated mass in the right", "upper lobe.")
        assert found.values["lesions"][0]["lobe"] == "RUL"

    def test_a_lesion_with_no_lobe_keeps_its_sizes(self):
        assert read(REPORT, "A 3.2 x 2.4 cm mass in the chest.").values["lesions"] == [{"long_axis_cm": 3.2, "short_axis_cm": 2.4, "description": "mass"}]

    @pytest.mark.parametrize("text", ["Enlarged right hilar lymph node, 1.4 cm.", "Heart size 12 cm.", "Trachea measures 2.1 cm.", "Pleural effusion of 3 cm depth."])
    def test_other_measurements_are_not_lesions(self, text):
        assert "lesions" not in read(REPORT, text).values

    def test_each_value_points_at_its_own_line(self):
        found = read(REPORT, "CT CHEST", "A 3.2 x 2.4 cm mass in the RUL.", "A 1 cm nodule in the LLL.")
        assert found.sources["lesions[1].lobe"] == [{"page": 1, "box": [10, 80, 500, 110]}]


class TestLymphNodesAndSpread:
    @pytest.mark.parametrize("text", ["Subcarinal lymphadenopathy.", "No significant lymph nodes."])
    def test_lymph_nodes_are_copied_as_written(self, text):
        assert read(REPORT, text).values["lymph_nodes"] == text

    def test_spread_is_copied_as_written(self):
        assert read(REPORT, "Liver metastases are seen.").values["metastasis_sites"] == "Liver metastases are seen."


class TestEffusion:
    @pytest.mark.parametrize(
        ("text", "expected"),
        [
            ("No pleural effusion.", "none"),
            ("Small left pleural effusion.", "left"),
            ("Moderate right pleural effusion.", "right"),
            ("Bilateral pleural effusions.", "bilateral"),
            ("Rt. sided pleural effusion.", "right"),
            ("Pleural effusion on both sides.", "bilateral"),
            ("Left and right pleural effusions.", "bilateral"),
        ],
    )
    def test_read_with_its_side(self, text, expected):
        assert read(REPORT, text).values["pleural_effusion"] == expected

    def test_no_side_is_left_for_the_doctor(self):
        assert "pleural_effusion" not in read(REPORT, "Pleural effusion is seen.").values

    def test_no_effusion_points_at_its_line_though_the_word_none_is_not_on_the_page(self):
        assert read(REPORT, "CT CHEST", "No pleural effusion.").sources["pleural_effusion"] == [{"page": 1, "box": [10, 40, 500, 70]}]


class TestChange:
    @pytest.mark.parametrize(
        ("text", "expected"),
        [
            ("This lesion is new compared with the previous study.", "new"),
            ("The lesion has increased in size since the previous study.", "increased"),
            ("The lesion has decreased in size since the previous study.", "decreased"),
            ("The lesion is stable compared with the previous study.", "stable"),
            ("No significant change in the mass since the prior scan.", "stable"),
        ],
    )
    def test_read_from_a_comparison(self, text, expected):
        assert read(REPORT, text).values["reported_change"] == expected

    def test_an_enlarged_node_is_not_a_change(self):
        assert "reported_change" not in read(REPORT, "Enlarged right hilar lymph node, 1.4 cm.").values

    def test_the_findings_outrank_the_impression(self):
        found = read(REPORT, "The lesion is stable compared with the previous study.", "Impression: Interval progression of the known lesion.")
        assert found.values["reported_change"] == "stable"


class TestImpression:
    def test_on_the_same_line_as_its_heading(self):
        assert read(REPORT, "Impression: Suspicious for primary lung malignancy.").values["impression"] == "Suspicious for primary lung malignancy."

    def test_on_the_lines_under_its_heading_stopping_at_the_signature(self):
        found = read(REPORT, "IMPRESSION", "Suspicious for primary", "lung malignancy.", "Dr. A. Rahman", "Consultant Radiologist")
        assert found.values["impression"] == "Suspicious for primary lung malignancy."

    def test_opinion_and_conclusion_count_too(self):
        assert read(REPORT, "CONCLUSION: Stable disease.").values["impression"] == "Stable disease."

    def test_with_no_heading_it_stays_blank(self):
        assert "impression" not in read(REPORT, "Suspicious for primary lung malignancy.").values


class TestFilms:
    def test_an_xray_film(self):
        found = read(XRAY, "AMCGH RADIOLOGY (SYNTHETIC)", "28-12-2025", "PA", "L")
        assert found.values == {"study_date": "2025-12-28", "view": "PA", "side_marker": "L"}

    @pytest.mark.parametrize(("text", "expected"), [("AP", "AP"), ("A/P", "AP"), ("LAT", "lateral"), ("LATERAL VIEW", "lateral"), ("P/A", "PA")])
    def test_the_views(self, text, expected):
        assert read(XRAY, text).values["view"] == expected

    def test_no_side_marker_is_left_for_the_doctor(self):
        assert "side_marker" not in read(XRAY, "28-12-2025", "PA").values

    def test_a_ct_film(self):
        found = read(CT_FILM, "CT 14/08/2026", "LUNG WINDOW W:1500 L:-600", "IM 45")
        assert found.values == {"modality": "CT", "study_date": "2026-08-14", "window": "lung", "slice_label": "IM 45"}

    def test_an_mri_film_in_the_mediastinal_window(self):
        found = read(CT_FILM, "MRI 14/08/2026", "MEDIASTINAL WINDOW W:350 L:40")
        assert (found.values["modality"], found.values["window"]) == ("MRI", "mediastinal")


def test_any_other_form_gets_its_date_and_nothing_invented():
    assert read(template("lab_report"), "Report date: 14/08/2026", "CEA 4.2 ng/mL").values == {"report_date": "2026-08-14"}


def test_a_blurry_line_lowers_the_confidence_of_what_was_read_from_it():
    assert read_by_rules(REPORT, lines("CT CHEST", score=0.6)).confidences["modality"] == pytest.approx(0.6)


def colours(found, source_lines):
    values = conform(REPORT, found.values)
    errors = validate_values(REPORT, values, date(2026, 10, 1))
    extraction = build_extraction(REPORT, values, found.confidences, source_lines, errors, 0.85, RULES_MODEL, found.sources)
    return {path: field["colour"] for path, field in extraction["fields"].items()}


def test_clear_text_is_green_and_blurry_text_is_amber():
    clear = lines("CT CHEST", "No pleural effusion.")
    blurry = lines("CT CHEST", "No pleural effusion.", score=0.6)
    assert colours(read_by_rules(REPORT, clear), clear)["pleural_effusion"] == "green"
    assert colours(read_by_rules(REPORT, blurry), blurry)["pleural_effusion"] == "amber"


def test_a_misread_size_shows_red_instead_of_passing_quietly():
    page = lines("A 99 x 24 cm mass in the RUL.")
    assert colours(read_by_rules(REPORT, page), page)["lesions[0].long_axis_cm"] == "red"


def test_a_doubtful_date_is_amber():
    page = lines("10/08/2026", "14/08/2026")
    assert colours(read_by_rules(REPORT, page), page)["study_date"] == "amber"


def test_the_worker_fills_a_draft_with_rules_and_no_model(db, ai_settings, ai_doctor, upload):
    body = upload(ai_doctor, pages=(PHOTO,)).json()
    assert run_once(db, ai_settings, Engines(FakeOcr(*SHEET), None)) == "done"
    record = ai_doctor.get(f"/api/records/{body['id']}").json()
    assert (record["status"], record["extraction_status"]) == ("draft", "done")
    assert record["values"]["modality"] == "CT"
    assert record["document_date"] == "2026-08-14"
    assert record["extraction"]["model"] == RULES_MODEL
    fields = record["extraction"]["fields"]
    assert fields["modality"]["colour"] == "green"
    assert fields["lesions[1].lobe"]["colour"] == "green"
    assert fields["contrast"]["sources"] != []


def test_a_page_the_rules_cannot_read_still_reaches_the_doctor(db, ai_settings, ai_doctor, upload):
    body = upload(ai_doctor, pages=(PHOTO,)).json()
    assert run_once(db, ai_settings, Engines(FakeOcr("illegible"), None)) == "done"
    record = ai_doctor.get(f"/api/records/{body['id']}").json()
    assert (record["status"], record["values"]) == ("draft", {})
