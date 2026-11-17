import pytest

from capture.formschema.model import TemplateDef
from capture.formschema.store import load_templates

FORM = """\
key: {key}
version: 1
phase: 1
kind: form
title: Flag form
{flags}
fields:
  - {{key: seen_on, type: date, required: true, document_date: true}}
  - {{key: note, type: text}}
"""


@pytest.fixture
def flag_form(db, tmp_path, team):
    """Load one extra typed form with the given flags; `team` has already loaded the repository's forms."""

    def _load(key: str, flags: str = "") -> str:
        folder = tmp_path / key
        folder.mkdir()
        (folder / f"{key}.yaml").write_text(FORM.format(key=key, flags=flags), encoding="utf-8")
        with db.begin() as s:
            load_templates(s, folder)
        return key

    return _load


def start(team, upload, key, reg_no="RC1"):
    return upload(team.doctor, template_key=key, reg_no=reg_no, pages=())


def test_flags_default_to_false():
    tpl = TemplateDef.model_validate(
        {
            "key": "plain",
            "version": 1,
            "phase": 1,
            "kind": "form",
            "title": "Plain",
            "fields": [{"key": "seen_on", "type": "date", "required": True, "document_date": True}],
        }
    )
    assert (tpl.hospital, tpl.repeats, tpl.retired) == (False, False, False)


def test_a_retired_form_cannot_be_started(team, upload, flag_form):
    key = flag_form("old_form", "retired: true")
    r = start(team, upload, key)
    assert r.status_code == 410
    assert r.json()["detail"] == "This form is no longer used"


def test_a_repeating_form_allows_many_per_patient(team, upload, flag_form):
    key = flag_form("visit_form", "repeats: true")
    assert start(team, upload, key).status_code == 201
    assert start(team, upload, key).status_code == 201


def test_a_non_repeating_form_is_still_once_per_patient(team, upload, flag_form):
    key = flag_form("once_form")
    assert start(team, upload, key).status_code == 201
    r = start(team, upload, key)
    assert r.status_code == 409
    assert r.json()["detail"] == "This patient already has this form"
