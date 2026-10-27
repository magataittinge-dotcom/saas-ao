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
