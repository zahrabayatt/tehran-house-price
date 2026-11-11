import json
from pathlib import Path

import pytest

from training import compare_targets as C
from tests.test_train import synthetic

ROOT = Path(__file__).resolve().parent.parent
FILE = ROOT / "web" / "public" / "data" / "lab-logprice.json"
SMALL = ((("log(location)",), 0.0), (("log(location)", "age"), 0.0))


def test_plain_names_are_the_version_1_spelling():
    assert C.plain_names(("log(area)", "log(location)^2", "age")) == ("area", "location^2", "age")


def test_comparison_never_uses_the_held_out_months(monkeypatch):
    monkeypatch.setattr(C, "CANDIDATES", SMALL)
    monkeypatch.setattr(C, "ITERATIONS", 300)
    base = synthetic()
    changed = base.copy()
    mask = changed["month"].isin(["2024-11", "2024-12"])
    changed.loc[mask, "price"] *= 9
    a, b = C.compare(base), C.compare(changed)
    assert a == b
    assert [x["key"] for x in a["approaches"]] == ["price", "log_price", "log_both"]
    assert all(sum(q["ads"] for q in x["quarters"]) >= a["ads"] for x in a["approaches"])


@pytest.mark.skipif(not FILE.exists(), reason="run python -m training.compare_targets")
def test_saved_comparison_backs_the_choice_of_log_price():
    d = json.loads(FILE.read_text(encoding="utf-8"))
    by = {a["key"]: a for a in d["approaches"]}
    assert d["month"] == "2024-10" and d["candidates"] == 100
    best = by["log_both"]
    for other in ("price", "log_price"):
        assert best["median_share_of_price"] < by[other]["median_share_of_price"]
        assert best["p90_share_of_price"] < by[other]["p90_share_of_price"]
        assert best["cost_billions"] < by[other]["cost_billions"]
