import json
from pathlib import Path

import pytest

from training import export_fixtures as E

ROOT = Path(__file__).resolve().parent.parent
MODEL = json.loads((ROOT / "model" / "model.json").read_text(encoding="utf-8"))


def test_fixtures_are_deterministic_and_cover_fallbacks():
    a = E.build_fixtures(MODEL)
    assert a == E.build_fixtures(MODEL)
    assert len(a["cases"]) >= 20
    unknown = [c for c in a["cases"]
               if c["input"]["neighborhood"] not in MODEL["location"]["lookup"]]
    assert len(unknown) >= 3


def test_committed_fixtures_match_the_model():
    """Inputs must match exactly; prices to 1e-12. The model ends in exp, whose last digit can
    differ between operating systems (the fixtures are written on Windows, CI runs on Linux)."""
    on_disk = json.loads(E.FIXTURES_PATH.read_text(encoding="utf-8"))
    fresh = E.build_fixtures(MODEL)
    hint = "rerun python -m training.export_fixtures"
    assert {k: v for k, v in on_disk.items() if k != "cases"} == \
        {k: v for k, v in fresh.items() if k != "cases"}, hint
    assert [c["input"] for c in on_disk["cases"]] == [c["input"] for c in fresh["cases"]], hint
    for disk, new in zip(on_disk["cases"], fresh["cases"]):
        assert disk["expected"] == pytest.approx(new["expected"], rel=1e-12), hint
