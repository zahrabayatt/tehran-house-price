"""Repository checks: the delivery files exist and say what the brief requires."""
from __future__ import annotations

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent

REQUIRED = [
    "README.md",
    "docs/DATA_CARD.md",
    "docs/CHANGELOG.md",
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


def test_changelog():
    changelog = (ROOT / "docs/CHANGELOG.md").read_text(encoding="utf-8")
    assert re.search(r"1\.0\.0.*2026-11-03", changelog)


def test_private_notes_stay_out_of_the_repo():
    """The spec, study notes and progress tracker are kept outside this public repository."""
    for name in ["PROJECT_SPEC.md", "LEARNING_NOTES.md", "LEARNING_PROGRESS_TRACKER.md"]:
        assert not (ROOT / "docs" / name).exists(), name


def test_readme_numbers_match_the_data_card():
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    assert "0.82 billion" in readme and "12.1%" in readme and "40.1%" in readme
    card = (ROOT / "docs/DATA_CARD.md").read_text(encoding="utf-8")
    assert "0.82 billion toman, or 12.1%" in card
