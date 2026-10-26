"""Un PDF piégé (bombe de décompression) ne fait pas exploser la mémoire du repli pypdf.

Un DCE vient d'un acheteur public. Si PDFium ne lit pas un PDF, la détection des
lots se replie sur pypdf (`lot_detector._extract_pdf_text_limited`). Jusqu'à
pypdf 6.0, un flux FlateDecode était décompressé en entier : un PDF de 400 Ko
peut contenir un flux de 400 Mo, voire plus, et figer le seul processus de l'API.
Depuis pypdf 6.0 (« Limit decompressed size for FlateDecode filter »), la
décompression s'arrête à 75 Mo (LimitReachedError), que le repli attrape.

Le repli est appelé dans un sous-processus (fonction réelle, lecteur PDFium
forcé en échec comme dans test_s3_pdf_pypdf.py), dont un fil suit la mémoire
résidente (/proc) : au-delà de +150 Mo, le processus est coupé et le test échoue
en quelques secondes au lieu de saturer la machine.
"""
import os
import subprocess
import sys
import textwrap
import threading
import time
import zlib
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent
TAILLE_DECOMPRESSEE_MO = 400
HAUSSE_MAX_MO = 150  # pypdf >= 6 s'arrête à 75 Mo ; sans plafond, le flux entier (400 Mo) est alloué

pytestmark = pytest.mark.skipif(
    not Path("/proc/self/status").exists(), reason="mesure de la mémoire par /proc (Linux)"
)

ENFANT = textwrap.dedent('''
    import sys
    from pathlib import Path
    sys.path.insert(0, {backend!r})
    from services import lot_detector, pdf_lecture

    def _illisible(*a, **k):
        raise pdf_lecture.PdfIllisible(pdf_lecture.ERREUR_FORMAT)

    pdf_lecture.lire_pages = _illisible  # PDFium en échec : le repli pypdf prend le relais
    print("PRET", flush=True)
    sys.stdin.readline()                 # attend le signal du test
    texte = lot_detector._extract_pdf_text_limited(Path(sys.argv[1]), max_pages=10)
    print("FINI", len(texte), flush=True)
''')


def _pdf_bombe(chemin: Path) -> None:
    """PDF d'une page dont le flux de contenu se décompresse en 400 Mo d'espaces."""
    comp = zlib.compressobj(9)
    morceaux = [comp.compress(b" " * (1024 * 1024)) for _ in range(TAILLE_DECOMPRESSEE_MO)]
    flux = b"".join(morceaux) + comp.flush()
    objets = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << >> >>",
        b"<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(flux) + flux + b"\nendstream",
    ]
    sortie, positions = bytearray(b"%PDF-1.7\n"), []
    for numero, corps in enumerate(objets, start=1):
        positions.append(len(sortie))
        sortie += b"%d 0 obj\n" % numero + corps + b"\nendobj\n"
    debut_xref = len(sortie)
    sortie += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objets) + 1)
    sortie += b"".join(b"%010d 00000 n \n" % p for p in positions)
    sortie += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (
        len(objets) + 1, debut_xref)
    chemin.write_bytes(bytes(sortie))


def _rss_mo(pid: int):
    try:
        with open(f"/proc/{pid}/status") as f:
            for ligne in f:
                if ligne.startswith("VmRSS:"):
                    return int(ligne.split()[1]) / 1024
    except OSError:
        return None
    return None


def test_bombe_de_decompression_bornee_dans_le_repli_pypdf(tmp_path):
    pdf = tmp_path / "dce-piege.pdf"
    _pdf_bombe(pdf)
    (tmp_path / "enfant.py").write_text(ENFANT.format(backend=str(BACKEND)))
    env = dict(os.environ, DATABASE_URL=f"sqlite:///{tmp_path / 'jetable.db'}", TMPDIR=str(tmp_path))
    proc = subprocess.Popen([sys.executable, str(tmp_path / "enfant.py"), str(pdf)], cwd=tmp_path,
                            env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, text=True)
    try:
        assert proc.stdout.readline().strip() == "PRET", "le sous-processus n'a pas démarré"
        depart = _rss_mo(proc.pid)
        etat = {"max": depart, "depasse": False}

        def surveiller():
            while proc.poll() is None:
                rss = _rss_mo(proc.pid)
                if rss is None:
                    return
                etat["max"] = max(etat["max"], rss)
                if rss - depart > HAUSSE_MAX_MO:
                    etat["depasse"] = True
                    proc.kill()  # pypdf sans plafond : on coupe avant de saturer la machine
                    return
                time.sleep(0.02)

        fil = threading.Thread(target=surveiller, daemon=True)
        fil.start()
        proc.stdin.write("go\n")
        proc.stdin.flush()
        fin = proc.stdout.readline().strip()
        proc.wait(timeout=60)
        fil.join(timeout=5)
        hausse = round(etat["max"] - depart, 1)
        assert not etat["depasse"], f"+{hausse} Mo pendant la lecture du PDF piégé : processus coupé"
        assert fin.startswith("FINI"), fin
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait()
