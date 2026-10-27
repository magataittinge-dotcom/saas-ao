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
