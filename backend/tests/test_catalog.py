"""Checks that templates/catalog.json matches the template files on disk."""

import json
from pathlib import Path

import pytest

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
