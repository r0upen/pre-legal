"""Checks that templates/catalog.json matches the template files on disk."""

import json
from pathlib import Path

import pytest

from app.fields import NdaFields

TEMPLATES_DIR = Path(__file__).resolve().parents[2] / "templates"
REQUIRED_FIELDS = {"id", "name", "description", "version", "files", "source", "source_commit"}


@pytest.fixture(scope="module")
def catalog():
    return json.loads((TEMPLATES_DIR / "catalog.json").read_text())


def test_catalog_is_non_empty_list(catalog):
    assert isinstance(catalog, list)
    assert catalog


def test_entries_have_required_fields(catalog):
    for entry in catalog:
        missing = REQUIRED_FIELDS - entry.keys()
        assert not missing, f"{entry.get('id')} is missing {missing}"
        assert entry["files"], f"{entry['id']} lists no files"


def test_ids_are_unique(catalog):
    ids = [entry["id"] for entry in catalog]
    assert len(ids) == len(set(ids))


def test_listed_files_exist(catalog):
    for entry in catalog:
        for name in entry["files"]:
            assert (TEMPLATES_DIR / name).is_file(), f"{entry['id']}: {name} not found"


def test_every_template_is_listed(catalog):
    listed = {name for entry in catalog for name in entry["files"]}
    on_disk = {p.name for p in TEMPLATES_DIR.glob("*.md")} - {"LICENSE.md"}
    assert on_disk == listed


# Every document except the Mutual NDA (which has its own cover page) describes the cover
# page the chat fills in: the two parties and the terms, in interview order. Routine
# terms carry Common Paper's usual default instead of being asked.
def test_cover_page_specs_are_well_formed(catalog):
    for entry in catalog:
        if entry["id"] == "mutual-nda":
            assert "coverPage" not in entry
            continue
        spec = entry["coverPage"]
        assert len(spec["parties"]) == 2, entry["id"]
        keys = [f["key"] for f in spec["fields"]]
        assert len(keys) == len(set(keys)), entry["id"]
        for field in spec["fields"]:
            assert field["key"].isidentifier() and field["key"] not in {"party1", "party2"}, field
            assert field["label"] and field["ask"], field
            assert field.get("type", "text") in {"text", "date", "law", "percent"}, field
            assert set(field) <= {"key", "label", "ask", "complete", "vague", "type", "default"}, field
            assert field["ask"].endswith("?"), field
            assert not (field.get("type") == "date" and "default" in field), field


# PL-14: every field says what a complete answer is, so a new document cannot leave it out.
def _requirements(entry):
    return entry["requirements"] if entry["id"] == "mutual-nda" else entry["coverPage"]["fields"]


def test_every_field_defines_a_complete_answer(catalog):
    for entry in catalog:
        for field in _requirements(entry):
            assert field["complete"].endswith((".", '."')), field
            assert field["vague"] and all(field["vague"]), field


def test_definitions_have_no_braces_the_prompt_format_would_choke_on(catalog):
    for entry in catalog:
        for field in _requirements(entry):
            assert not set("{}") & set(field["complete"] + "".join(field["vague"])), field


def test_the_nda_requirements_cover_exactly_its_fields(catalog):
    entry = next(e for e in catalog if e["id"] == "mutual-nda")
    keys = [f["key"] for f in entry["requirements"]]
    assert set(keys) == set(NdaFields.model_fields) - {"party1", "party2"}
    assert len(keys) == len(set(keys))


def test_fields_that_code_checks_keep_their_type(catalog):
    for entry in catalog:
        for field in entry.get("coverPage", {}).get("fields", []):
            if field["key"] == "governingLaw":
                assert field["type"] == "law", entry["id"]
            if field["key"] == "targetUptime":
                assert field["type"] == "percent", entry["id"]
