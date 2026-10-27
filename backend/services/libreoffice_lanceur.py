"""Lanceur de LibreOffice : exécuté par ``python -I -S`` AVANT ``soffice`` (jamais importé par l'API).

Il pose, dans le processus qui va devenir ``soffice``, ce que Python ne sait pas faire sans
``preexec_fn`` (qui n'est pas sûr dans un processus à threads) :

- ``PR_SET_PDEATHSIG`` : si l'API meurt, ``soffice`` meurt avec elle ;
- ``RLIMIT_AS`` (mémoire virtuelle, héritée par ``soffice.bin``), ``RLIMIT_FSIZE`` (taille d'un
  fichier écrit : le PDF), ``RLIMIT_CORE`` à 0 ;
- SANS RÉSEAU NI SOCKET VERS L'EXTÉRIEUR, par deux protections empilées :
  1. un espace de noms réseau VIDE (``unshare(CLONE_NEWUSER | CLONE_NEWNET)``) : aucune interface,
     même pas ``lo``. Refusé sur Ubuntu 24.04 quand AppArmor restreint les espaces de noms
     utilisateur non privilégiés (``kernel.apparmor_restrict_unprivileged_userns=1``). Il N'ISOLE
     PAS les sockets Unix à chemin du système de fichiers : ceux de Postgres
     (``/var/run/postgresql``, authentification « peer » pour l'utilisateur du service) ou de
     Redis restent joignables. Il ne suffit donc jamais seul ;
  2. un filtre seccomp, TOUJOURS posé : ``connect()`` est refusé (EPERM) pour toute famille, IP
     comme Unix, chemin ou abstrait ; ``socket(AF_INET)`` et ``socket(AF_INET6)`` aussi ; ``io_uring``
     aussi. Le filtre est hérité par tout programme que LibreOffice lancerait (``psql`` y
     compris). MESURÉ : LibreOffice convertit normalement sans ``connect()`` (ses sockets Unix
     internes ne servent qu'à ``bind``/``listen``/``accept``) ; il ne démarre PAS si ``socket()``
     est refusé pour AF_UNIX, d'où le filtre sur ``connect`` et non sur ``socket``. Non couvert :
     l'envoi sans connexion (``sendto`` datagramme vers un socket Unix à datagrammes comme
     ``/dev/log``), sans objet pour Postgres et Redis, qui sont des sockets à flux.

Le résultat est écrit dans le fichier d'état (``reseau=netns+seccomp`` …) pour que l'appelant
le journalise, puis ``soffice`` prend la place du lanceur (``execve``). Bibliothèque standard seule.
Code de sortie 97 : mode ``exige`` mais le filtre seccomp n'a pas pu être posé.
"""
import ctypes
import json
import os
import platform
import resource
import signal
import struct
import sys

CODE_ISOLATION_IMPOSSIBLE = 97

_PR_SET_PDEATHSIG = 1
_PR_SET_NO_NEW_PRIVS = 38
_PR_SET_SECCOMP = 22
_SECCOMP_MODE_FILTER = 2

# (constante d'architecture AUDIT_ARCH_*, numéro de l'appel système socket, numéro de connect)
_ARCHITECTURES = {
    "x86_64": (0xC000003E, 41, 42),
    "aarch64": (0xC00000B7, 198, 203),
}
_NR_IO_URING_SETUP = 425          # identique sur x86_64 et aarch64
_AF_INET, _AF_INET6 = 2, 10
_BPF_LD_ABS, _BPF_JEQ, _BPF_RET = 0x20, 0x15, 0x06
_RET_AUTORISER = 0x7FFF0000
_RET_EPERM = 0x00050000 | 1
_RET_TUER = 0x80000000


def programme_seccomp(arch: int, nr_socket: int, nr_connect: int) -> bytes:
    """Programme BPF : ``connect`` (toute famille), ``socket`` IP et ``io_uring_setup`` refusés
    (EPERM), le reste autorisé ; une autre architecture (appels 32 bits) est tuée."""
    def ins(code, jt, jf, k):
        return struct.pack("HBBI", code, jt, jf, k)
    return b"".join([
        ins(_BPF_LD_ABS, 0, 0, 4),                      # 0 : architecture
        ins(_BPF_JEQ, 1, 0, arch),                      # 1
        ins(_BPF_RET, 0, 0, _RET_TUER),                 # 2
        ins(_BPF_LD_ABS, 0, 0, 0),                      # 3 : numéro d'appel
        ins(_BPF_JEQ, 6, 0, _NR_IO_URING_SETUP),        # 4 : -> 11 (refus)
        ins(_BPF_JEQ, 5, 0, nr_connect),                # 5 : -> 11
        ins(_BPF_JEQ, 0, 3, nr_socket),                 # 6 : socket ? sinon -> 10 (autoriser)
        ins(_BPF_LD_ABS, 0, 0, 16),                     # 7 : 1er argument (famille)
        ins(_BPF_JEQ, 2, 0, _AF_INET),                  # 8 : -> 11
        ins(_BPF_JEQ, 1, 0, _AF_INET6),                 # 9 : -> 11, sinon 10
        ins(_BPF_RET, 0, 0, _RET_AUTORISER),            # 10
        ins(_BPF_RET, 0, 0, _RET_EPERM),                # 11
    ])


def poser_seccomp() -> None:
    arch, nr_socket, nr_connect = _ARCHITECTURES[platform.machine()]   # KeyError : architecture non prévue
    programme = programme_seccomp(arch, nr_socket, nr_connect)
    tampon = ctypes.create_string_buffer(programme, len(programme))

    class SockFprog(ctypes.Structure):
        _fields_ = [("len", ctypes.c_ushort), ("filter", ctypes.c_void_p)]

    fprog = SockFprog(len(programme) // 8, ctypes.cast(tampon, ctypes.c_void_p))
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(_PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0:
        raise OSError(ctypes.get_errno(), "PR_SET_NO_NEW_PRIVS")
    if libc.prctl(_PR_SET_SECCOMP, _SECCOMP_MODE_FILTER, ctypes.byref(fprog), 0, 0) != 0:
        raise OSError(ctypes.get_errno(), "PR_SET_SECCOMP")


def poser_espace_reseau_vide() -> None:
    uid, gid = os.getuid(), os.getgid()
    os.unshare(os.CLONE_NEWUSER | os.CLONE_NEWNET)
    # Les identifiants restent les nôtres (sinon « nobody » : HOME ne nous appartiendrait plus).
    for chemin, texte in (("/proc/self/setgroups", "deny"),
                          ("/proc/self/uid_map", f"{uid} {uid} 1"),
                          ("/proc/self/gid_map", f"{gid} {gid} 1")):
        try:
            with open(chemin, "w") as f:
                f.write(texte)
        except OSError:
            pass    # l'espace réseau est déjà vide ; seul l'affichage des identifiants change


def isoler_reseau(mode: str) -> str:
    """Pose les protections réseau demandées ; renvoie le NIVEAU obtenu (journalisé par l'appelant) :

    - ``netns+seccomp`` : espace réseau vide + connect() refusé (le meilleur) ;
    - ``seccomp`` : IP et connect() Unix refusés, sans espace réseau (repli) ;
    - ``netns`` : espace réseau vide SEUL (mode ``netns`` explicite : les sockets Unix à chemin
      restent joignables) ;
    - ``aucune``.
    Suivi de ``(refus …)`` si une protection demandée a été refusée par le noyau."""
    if mode == "aucun":
        return "aucune (désactivée par réglage)"
    actives, refus = [], []
    if mode in ("auto", "exige", "netns"):
        try:
            poser_espace_reseau_vide()
            actives.append("netns")
        except (OSError, AttributeError) as e:
            refus.append("netns:" + (getattr(e, "strerror", None) or type(e).__name__))
    if mode in ("auto", "exige", "seccomp"):
        try:
            poser_seccomp()
            actives.append("seccomp")
        except (OSError, KeyError, AttributeError) as e:
            refus.append("seccomp:" + (getattr(e, "strerror", None) or type(e).__name__))
    return ("+".join(actives) if actives else "aucune") + (f" (refus {', '.join(refus)})" if refus else "")


def main() -> None:
    cfg = json.loads(sys.argv[1])
    try:
        ctypes.CDLL(None).prctl(_PR_SET_PDEATHSIG, signal.SIGKILL, 0, 0, 0)
    except (OSError, AttributeError):
        pass
    for ressource, valeur in ((resource.RLIMIT_AS, cfg.get("as_octets", 0)),
                              (resource.RLIMIT_FSIZE, cfg.get("fichier_octets", 0))):
        if valeur and valeur > 0:
            resource.setrlimit(ressource, (valeur, valeur))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    etat = isoler_reseau(cfg.get("reseau", "auto"))
    try:
        with open(cfg["fichier_etat"], "w") as f:
            f.write(etat)
    except OSError:
        pass
    if cfg.get("reseau") == "exige" and "seccomp" not in etat.split(" ")[0]:
        os._exit(CODE_ISOLATION_IMPOSSIBLE)
    os.execv(cfg["cmd"][0], cfg["cmd"])


if __name__ == "__main__":
    main()
