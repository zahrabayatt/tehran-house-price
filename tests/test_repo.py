"""Repository checks: the delivery files exist and say what the brief requires."""
from __future__ import annotations

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent

REQUIRED = [
    "README.md",
    "docs/PROJECT_SPEC.md",
    "docs/LEARNING_NOTES.md",
    "docs/DATA_CARD.md",
    "docs/CHANGELOG.md",
    "docs/LEARNING_PROGRESS_TRACKER.md",
    ".github/workflows/ci.yml",
    ".github/workflows/pages.yml",
]


@pytest.mark.parametrize("name", REQUIRED)
def test_required_file_exists(name):
    assert (ROOT / name).is_file()


@pytest.mark.parametrize("workflow", [".github/workflows/ci.yml", ".github/workflows/pages.yml"])
def test_actions_are_pinned(workflow):
    text = (ROOT / workflow).read_text(encoding="utf-8")
    uses = re.findall(r"^\s*-?\s*uses:\s*(\S+)", text, re.MULTILINE)
    assert uses, "workflow uses no actions"
    for ref in uses:
        _, _, version = ref.partition("@")
        assert re.fullmatch(r"v\d+\.\d+\.\d+|[0-9a-f]{40}", version), f"{ref} is not pinned to an exact version"


def test_ci_runs_every_check():
    text = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")
    for needle in ["pytest", "3.10", "typecheck", "pnpm test", "pnpm build", "playwright install", "pnpm e2e"]:
        assert needle in text, needle


def test_pages_deploys_only_after_ci_succeeds_on_main():
    text = (ROOT / ".github/workflows/pages.yml").read_text(encoding="utf-8")
    assert re.search(r"workflow_run:\s*\n\s*workflows:\s*\[\s*CI\s*\]", text)
    assert re.search(r"types:\s*\[\s*completed\s*\]", text)
    assert re.search(r"branches:\s*\[\s*main\s*\]|branches:\s*\n\s*-\s*main", text)
    assert "github.event.workflow_run.conclusion == 'success'" in text
    assert "ref: ${{ github.event.workflow_run.head_sha }}" in text
    assert not re.search(r"^\s*push:", text, re.MULTILINE), "pages must not deploy straight from a push"
    assert "deploy-pages" in text and "upload-pages-artifact" in text


def test_tracker_and_changelog():
    tracker = (ROOT / "docs/LEARNING_PROGRESS_TRACKER.md").read_text(encoding="utf-8")
    assert "tehran-air-risk" in tracker
    assert "2026-11-03" in tracker
    changelog = (ROOT / "docs/CHANGELOG.md").read_text(encoding="utf-8")
    assert re.search(r"1\.0\.0.*2026-11-03", changelog)


def test_learning_notes_leave_the_authors_words_empty():
    notes = (ROOT / "docs/LEARNING_NOTES.md").read_text(encoding="utf-8")
    sections = re.split(r"^## ", notes, flags=re.MULTILINE)[1:]
    assert len(sections) >= 10
    for s in sections:
        assert "### In my own words" in s, s.splitlines()[0]
        after = s.split("### In my own words", 1)[1].strip()
        assert after == "", f"{s.splitlines()[0]}: the author's section must stay empty"


def test_readme_numbers_match_the_data_card():
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    assert "0.82 billion" in readme and "12.1%" in readme and "40.1%" in readme
    card = (ROOT / "docs/DATA_CARD.md").read_text(encoding="utf-8")
    assert "0.82 billion toman, or 12.1%" in card
