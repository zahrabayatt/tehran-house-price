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


def test_rooms_exact_match_not_prefix():
    # A startswith match used to turn longer strings into room counts.
    assert parse_rooms("دو اتاقه") is None
    assert parse_rooms("یکی") is None
    assert parse_rooms("پنج یا بیشتر از این") is None
    assert parse_rooms("پنج") == 5
    assert parse_rooms("  دو  ") == 2


def test_rooms_numeric_text():
    assert parse_rooms("۳") == 3
    assert parse_rooms("٣") == 3


def test_nan_and_none():
    nan = float("nan")
    assert parse_persian_number(nan) is None
    assert parse_rooms(nan) is None
    assert parse_year(nan) is None
    assert parse_rooms(None) is None
    assert parse_year(None) is None


def test_arabic_indic_digits():
    assert parse_persian_number("١٤٠٣") == 1403
    assert parse_year("١٣٩٥") == 1395
    assert parse_year("قبل از ١٣٧٠") == 1369


def test_separators_and_decimal():
    assert parse_persian_number("۱٬۲۰۰") == 1200
    assert parse_persian_number("۱٫۵") == 1.5


def test_garbage_is_none():
    assert parse_persian_number("abc") is None
    assert parse_year("قبل از") is None
    assert parse_year("سال ۱۳۹۵") is None
