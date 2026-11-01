from training.parsing import parse_persian_number, parse_rooms, parse_year


def test_digits():
    assert parse_persian_number("۱۴۰۳") == 1403


def test_before_1370():
    assert parse_year("قبل از ۱۳۷۰") == 1369


def test_rooms():
    assert parse_rooms("دو") == 2
    assert parse_rooms("بدون اتاق") == 0
    assert parse_rooms("پنج یا بیشتر") == 5


def test_blank():
    assert parse_year("") is None
