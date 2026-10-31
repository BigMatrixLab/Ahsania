from datetime import date

import pytest

from capture.records.pairing import StudyRow, pairing_of

JAN, MAR, MAY = date(2026, 1, 10), date(2026, 3, 1), date(2026, 5, 1)


def ct_film(when=JAN) -> StudyRow:
    return StudyRow("ct_mri_film_photo", {"modality": "CT"}, when)


def xray_film(when=MAR) -> StudyRow:
    return StudyRow("xray_film_photo", {"view": "PA"}, when)


def report(modality: str, when=JAN) -> StudyRow:
    return StudyRow("radiology_report", {"modality": modality}, when)


def test_a_ct_film_and_a_later_xray_film_are_a_pair():
    pairing = pairing_of([xray_film(), ct_film()])
    assert pairing.paired is True
    assert pairing.baseline.date == JAN
    assert pairing.baseline.days_after_baseline == 0
    assert [(x.date, x.days_after_baseline) for x in pairing.xrays] == [(MAR, 50)]


@pytest.mark.parametrize("modality", ["CT", "MRI"])
def test_a_ct_or_mri_report_counts_as_a_baseline_study(modality):
    assert pairing_of([report(modality)]).baseline.date == JAN


def test_an_xray_report_counts_as_a_follow_up_study():
    assert [x.date for x in pairing_of([ct_film(), report("X-ray", MAR)]).xrays] == [MAR]


def test_a_pet_ct_report_is_neither_side_of_a_pair():
    pairing = pairing_of([report("PET-CT")])
    assert (pairing.baseline, pairing.xrays) == (None, [])


def test_a_report_alone_does_not_make_a_pair():
    pairing = pairing_of([report("CT"), xray_film()])
    assert pairing.paired is False
    assert (pairing.baseline.image, pairing.baseline.report) == (False, True)


def test_an_xray_report_without_a_film_does_not_make_a_pair():
    pairing = pairing_of([ct_film(), report("X-ray", MAR)])
    assert pairing.paired is False
    assert (pairing.xrays[0].image, pairing.xrays[0].report) == (False, True)


def test_a_report_and_a_film_of_one_date_are_one_study():
    pairing = pairing_of([ct_film(), report("CT"), xray_film(), report("X-ray", MAR)])
    assert (pairing.baseline.image, pairing.baseline.report) == (True, True)
    assert [(x.image, x.report) for x in pairing.xrays] == [(True, True)]


def test_an_xray_before_the_baseline_is_not_a_follow_up():
    pairing = pairing_of([xray_film(JAN), ct_film(MAR)])
    assert pairing.xrays == []
    assert pairing.paired is False


def test_a_same_day_xray_pairs_with_zero_days():
    pairing = pairing_of([ct_film(), xray_film(JAN)])
    assert pairing.paired is True
    assert pairing.xrays[0].days_after_baseline == 0


def test_follow_ups_come_earliest_first():
    pairing = pairing_of([ct_film(), xray_film(MAY), xray_film(MAR)])
    assert [x.days_after_baseline for x in pairing.xrays] == [50, 111]


def test_the_earliest_ct_or_mri_is_the_baseline():
    assert pairing_of([ct_film(MAR), ct_film(JAN)]).baseline.date == JAN


def test_a_later_scan_with_an_image_beats_an_earlier_report_as_the_baseline():
    pairing = pairing_of([report("CT", JAN), ct_film(MAR), xray_film(MAY)])
    assert pairing.baseline.date == MAR
    assert pairing.paired is True


def test_xrays_are_still_listed_when_there_is_no_baseline():
    pairing = pairing_of([xray_film()])
    assert pairing.baseline is None
    assert [(x.date, x.days_after_baseline) for x in pairing.xrays] == [(MAR, None)]
    assert pairing.paired is False


def test_a_record_without_a_date_is_ignored():
    pairing = pairing_of([ct_film(when=None), xray_film()])
    assert pairing.baseline is None


def test_other_forms_are_ignored():
    pairing = pairing_of([StudyRow("lab_report", {}, JAN)])
    assert (pairing.baseline, pairing.xrays) == (None, [])


@pytest.mark.parametrize("modality", ["CT", "MR"])
def test_dicom_ct_and_mr_are_baseline_images(modality):
    pairing = pairing_of([StudyRow("dicom_series", {"modality": modality}, JAN)])
    assert (pairing.baseline.image, pairing.baseline.report) == (True, False)


@pytest.mark.parametrize("modality", ["CR", "DX", "RG"])
def test_dicom_radiographs_are_follow_up_images(modality):
    pairing = pairing_of([ct_film(), StudyRow("dicom_series", {"modality": modality}, MAR)])
    assert pairing.paired is True


def test_other_dicom_modalities_are_ignored():
    pairing = pairing_of([StudyRow("dicom_series", {"modality": "US"}, JAN)])
    assert (pairing.baseline, pairing.xrays) == (None, [])
