"""Fonctions de niveau module exécutées DANS le processus pdfium par les tests
(elles voyagent par référence : le processus enfant les importe)."""
import os
import resource
import signal
import time

from services import pdfium_processus


def pid():
    return os.getpid()


def ajouter(a, b):
    return a + b


def dormir(secondes):
    time.sleep(secondes)
    return "reveille"


def lever(message):
    raise ValueError(message)


def mourir():
    os.kill(os.getpid(), signal.SIGKILL)


def abandonner():
    """Arrêt natif par SIGABRT : ce que fait PDFium quand malloc échoue sous RLIMIT_AS."""
    os.abort()


def allouer(mo):
    """Alloue ``mo`` Mo : MemoryError si le plafond RLIMIT_AS est posé plus bas."""
    return len(bytearray(mo * 1024 * 1024))


def plafond_as():
    return resource.getrlimit(resource.RLIMIT_AS)[0]


def compter(n):
    for i in range(n):
        pdfium_processus.signaler(("etape", i))
    return n


def non_transmissible():
    return lambda: 1


def environnement():
    """L'environnement tel que le voit l'enfant."""
    return dict(os.environ)


def dumpable():
    import ctypes
    return ctypes.CDLL(None).prctl(3, 0, 0, 0, 0)       # PR_GET_DUMPABLE


def lire_environ_du_parent():
    """Ce que verrait un code hostile qui s'exécuterait dans l'enfant : l'environ de l'API."""
    try:
        with open(f"/proc/{os.getppid()}/environ", "rb") as f:
            return f.read().decode(errors="replace")
    except OSError as e:
        return "refuse:" + type(e).__name__


def lire_fichier(chemin):
    try:
        with open(chemin, "rb") as f:
            f.read(1)
        return "LU"
    except OSError:
        return "refuse"


def ecrire_fichier(chemin):
    try:
        with open(chemin, "w") as f:
            f.write("x")
        return "ECRIT"
    except OSError:
        return "refuse"


def connecter_unix(chemin):
    import socket
    try:
        s = socket.socket(socket.AF_UNIX)
        s.connect(chemin)
        s.close()
        return "connecte"
    except OSError as e:
        return "bloque " + type(e).__name__


# ─── Un enfant COMPROMIS : il écrit directement sur le tuyau (tests du canal, bloc 6) ───

class _Piege:
    """Objet dont la désérialisation exécute ``commande`` : ce que ferait un enfant compromis."""

    def __init__(self, commande):
        self.commande = commande

    def __reduce__(self):
        import os as _os
        return (_os.system, (self.commande,))


def envoyer_pickle_forge(temoin):
    """L'enfant envoie, comme réponse, un pickle dont le chargement crée le fichier ``temoin``."""
    from services import pdfium_processus as pp
    pp._conn_enfant.send_bytes(pickle_dumps(("ok", _Piege(f"touch '{temoin}'"), 0)))
    time.sleep(30)


def pickle_dumps(objet):
    import pickle
    return pickle.dumps(objet, protocol=4)


def envoyer_octets(octets):
    from services import pdfium_processus as pp
    pp._conn_enfant.send_bytes(octets)
    time.sleep(30)


def annoncer_un_message_enorme(mo):
    """Annonce ``mo`` Mo dans l'en-tête de trame, sans les envoyer."""
    import struct
    from services import pdfium_processus as pp
    os.write(pp._conn_enfant.fileno(), struct.pack("!i", mo * 1024 * 1024))
    time.sleep(30)


def message_partiel_puis_silence():
    """Annonce 1 000 octets, n'en envoie que 3 : la lecture du parent attendrait sans fin."""
    import struct
    from services import pdfium_processus as pp
    os.write(pp._conn_enfant.fileno(), struct.pack("!i", 1000) + b"abc")
    time.sleep(30)


def lever_pdf_illisible():
    from services.pdf_lecture import PdfIllisible
    raise PdfIllisible(3, "format")


def lever_rendu_trop_grand():
    from services.pdf_rendu import RenduTropGrand
    raise RenduTropGrand("trop")


def lever_oserror():
    raise FileNotFoundError(2, "absent", "/x")


class ErreurMaison(Exception):
    """Hors liste fermée : doit arriver chez l'appelant en RuntimeError, pas en pickle."""


def lever_maison():
    raise ErreurMaison("maison")


def octets(mo):
    return b"x" * (mo * 1024 * 1024)
