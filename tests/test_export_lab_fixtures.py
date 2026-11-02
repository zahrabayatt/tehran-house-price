import json
import math

from training import export_lab_fixtures as E

SAMPLE = json.loads(E.SAMPLE_PATH.read_text(encoding="utf-8"))


def test_fixtures_are_deterministic():
    assert E.build_fixtures(SAMPLE) == E.build_fixtures(SAMPLE)


def test_committed_fixtures_match_the_sample():
    on_disk = json.loads(E.FIXTURES_PATH.read_text(encoding="utf-8"))
    assert on_disk == E.build_fixtures(SAMPLE), "rerun python -m training.export_lab_fixtures"


def test_every_number_is_finite():
    def walk(v):
        if isinstance(v, dict):
            for x in v.values():
                walk(x)
        elif isinstance(v, list):
            for x in v:
                walk(x)
        elif isinstance(v, float):
            assert math.isfinite(v)
    walk(E.build_fixtures(SAMPLE))


def test_covers_converging_and_diverging_runs():
    fx = E.build_fixtures(SAMPLE)
    for key in ("runOne", "runMulti"):
        diverged = [c["divergedAt"] is not None for c in fx[key]]
        assert any(diverged) and not all(diverged), key
    assert len(fx["polyFit"]) >= 3


def test_diverged_at_is_the_first_state_over_the_limit():
    fx = E.build_fixtures(SAMPLE)
    for case in fx["runOne"] + fx["runMulti"]:
        at = case["divergedAt"]
        if at is None:
            assert len(case["jHistory"]) == case["iters"]
        else:
            assert 1 <= at <= case["iters"]
            assert all(k < at for k in (c["k"] for c in case["checkpoints"]))
