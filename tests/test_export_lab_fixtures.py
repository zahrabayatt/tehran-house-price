import json
import math

from training import export_lab_fixtures as E

SAMPLE = json.loads(E.SAMPLE_PATH.read_text(encoding="utf-8"))


def test_fixtures_are_deterministic():
    assert E.build_fixtures(SAMPLE) == E.build_fixtures(SAMPLE)


def test_committed_fixtures_match_the_sample():
    on_disk = json.loads(E.FIXTURES_PATH.read_text(encoding="utf-8"))
    assert_close_tree(json.loads(json.dumps(E.build_fixtures(SAMPLE))), on_disk, "rerun python -m training.export_lab_fixtures")


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


def assert_close_tree(a, b, path="fixtures", rel=1e-9, abs_=1e-12):
    """Equal structure and strings; numbers equal within a relative tolerance.

    Exact float equality fails across platforms: NumPy on Linux CI and on Windows can differ in the
    last bits of a sum, so regenerated fixtures are compared with a tolerance far below anything shown.
    """
    if isinstance(a, dict) and isinstance(b, dict):
        assert a.keys() == b.keys(), f"{path}: keys differ"
        for k in a:
            assert_close_tree(a[k], b[k], f"{path}.{k}", rel, abs_)
    elif isinstance(a, list) and isinstance(b, list):
        assert len(a) == len(b), f"{path}: lengths differ"
        for i, (x, y) in enumerate(zip(a, b)):
            assert_close_tree(x, y, f"{path}[{i}]", rel, abs_)
    elif isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool):
        assert math.isclose(a, b, rel_tol=rel, abs_tol=abs_), f"{path}: {a} != {b}"
    else:
        assert a == b, f"{path}: {a!r} != {b!r}"
