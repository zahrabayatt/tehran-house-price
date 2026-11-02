import json
from pathlib import Path

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
    on_disk = json.loads(E.FIXTURES_PATH.read_text(encoding="utf-8"))
    assert on_disk == E.build_fixtures(MODEL), "rerun python -m training.export_fixtures"
