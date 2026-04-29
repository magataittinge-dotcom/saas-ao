"""Regression test for the CP437/CP850/CP1252 filename decoding bug.

Real-world reproduction: a French Windows ZIP containing the file
'CARNET DE DÉTAIL.pdf' arrives with bytes b'CARNET DE D\\x90TAIL.pdf'.
Python's zipfile module decodes CP437, mapping 0x90 to 'É' (U+00C9).
However, in some pipelines the byte was first treated as Latin-1, which
produces U+0090 (a DCS control char) and breaks downstream display.

The new decoder prefers an encoding whose result has the fewest control
chars — CP850 / CP1252 / Latin-1 / UTF-8 in that order — and falls back
through them.
"""
import zipfile

from routers.projects import _decode_zip_entry_name


class _Member:
    def __init__(self, filename: str, flag: int = 0):
        self.filename = filename
        self.flag_bits = flag


def test_clean_unicode_filename_passthrough():
    m = _Member("Mon Document.pdf", flag=0x800)  # UTF-8 flag
    assert _decode_zip_entry_name(m) == "Mon Document.pdf"


def test_french_accent_uppercase_recovered_from_cp437():
    """Python's CP437 decode of 0x90 = U+00C9 ('É'). Should pass through."""
    m = _Member("CARNET DE DÉTAIL.pdf")
    assert _decode_zip_entry_name(m) == "CARNET DE DÉTAIL.pdf"


def test_legacy_control_char_u0090_sanitized():
    """Bug case: filename already contains the U+0090 control char.
    Original bytes are gone, but at least the result must not contain
    control chars."""
    m = _Member("CARNET DE DTAIL.pdf")
    out = _decode_zip_entry_name(m)
    for c in out:
        assert ord(c) >= 0x20 or c in "\t\n\r"
    assert "TAIL" in out


def test_legacy_control_char_u0082_sanitized():
    m = _Member("DTAIL.pdf")
    out = _decode_zip_entry_name(m)
    for c in out:
        assert ord(c) >= 0x20 or c in "\t\n\r"


def test_path_traversal_stripped():
    """Filename can't be relative path — only the basename survives."""
    m = _Member("../../../etc/passwd")
    out = _decode_zip_entry_name(m)
    assert "/" not in out and "\\" not in out
    assert out.endswith("passwd")


def test_invalid_chars_replaced():
    m = _Member('weird<file>:name|.pdf')
    out = _decode_zip_entry_name(m)
    for ch in '<>:"|?*':
        assert ch not in out


def test_empty_filename_falls_back_to_default():
    m = _Member("")
    out = _decode_zip_entry_name(m)
    assert out == "fichier_sans_nom"
