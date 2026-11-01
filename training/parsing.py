"""Parsers for Persian-formatted numeric fields in the Divar dataset.

Every parser returns None for blank or unparseable input. Nothing here is
silently dropped as missing when it carries a value (Persian digits, the
"before 1370" bucket, word-form room counts).
"""
from __future__ import annotations

import math
import re

# Persian (U+06F0..) and Arabic-Indic (U+0660..) digits to ASCII.
_DIGIT_MAP = {ord(c): str(i) for i, c in enumerate("۰۱۲۳۴۵۶۷۸۹")}
_DIGIT_MAP.update({ord(c): str(i) for i, c in enumerate("٠١٢٣٤٥٦٧٨٩")})
# Thousands separators and decimal marks used in Persian text.
_SEPARATORS = dict.fromkeys(map(ord, ",٬،"), None)
_DECIMAL = {ord("٫"): "."}

_ROOM_WORDS = {
    "بدون اتاق": 0,
    "یک": 1,
    "دو": 2,
    "سه": 3,
    "چهار": 4,
    "پنج": 5,
    "پنج یا بیشتر": 5,
}

_BEFORE_MARKER = "قبل از"


def _normalize(s) -> str:
    if s is None:
        return ""
    if isinstance(s, float) and math.isnan(s):
        return ""
    if type(s).__name__ == "NAType":  # pandas.NA, without importing pandas here
        return ""
    text = str(s).translate(_DIGIT_MAP).translate(_SEPARATORS).translate(_DECIMAL)
    # Normalize Arabic yeh/kaf and the zero-width non-joiner to plain forms.
    text = text.replace("ي", "ی").replace("ك", "ک").replace("‌", " ")
    return re.sub(r"\s+", " ", text).strip()


def parse_persian_number(s) -> float | None:
    """Parse a number written with Persian/Arabic digits or separators."""
    text = _normalize(s)
    if not text:
        return None
    match = re.fullmatch(r"-?\d+(?:\.\d+)?", text)
    if match is None:
        return None
    return float(text)


def parse_rooms(s) -> float | None:
    """Parse a room-count label by exact match. 'پنج یا بیشتر' (five or more) maps to 5."""
    text = _normalize(s)
    if not text:
        return None
    number = parse_persian_number(text)
    if number is not None:
        return number
    value = _ROOM_WORDS.get(text)
    return None if value is None else float(value)


def parse_year(s) -> int | None:
    """Parse a Solar Hijri construction year. 'قبل از ۱۳۷۰' maps to 1369."""
    text = _normalize(s)
    if not text:
        return None
    if text.startswith(_BEFORE_MARKER):
        number = parse_persian_number(text[len(_BEFORE_MARKER):])
        return None if number is None else int(number) - 1
    number = parse_persian_number(text)
    return None if number is None else int(number)
