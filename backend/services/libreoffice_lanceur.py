"""Lanceur de LibreOffice : exécuté par ``python -I -S`` AVANT ``soffice`` (jamais importé par l'API).

Il pose, dans le processus qui va devenir ``soffice``, ce que Python ne sait pas faire sans
``preexec_fn`` (qui n'est pas sûr dans un processus à threads) :

- ``PR_SET_PDEATHSIG`` : si l'API meurt, ``soffice`` meurt avec elle ;
- ``RLIMIT_AS`` (mémoire virtuelle, héritée par ``soffice.bin``), ``RLIMIT_FSIZE`` (taille d'un
  fichier écrit : le PDF), ``RLIMIT_CORE`` à 0 ;
- FICHIERS EN LISTE BLANCHE par Landlock (``services/landlock.py``, règles données par ``cfg["landlock"]``,
  posées APRÈS le réseau et juste avant l'``exec``) : du code natif exécuté dans LibreOffice ne lit ni ``.env``
  ni ``uploads/``. Landlock ne filtre pas ``connect()`` vers un socket Unix à chemin avant l'ABI 9 : c'est le
  seccomp ci-dessous qui ferme ``/run/postgresql`` et ``/run/redis`` ; Landlock ferme les fichiers (et, dès l'ABI 4,
  le TCP). Niveau écrit dans le fichier d'état : ``netns+seccomp+landlock``, ou ``… (landlock: absent (raison))``.
- /tmp PRIVÉ (``cfg["tmp_prive"]``) : soffice crée son socket ``OSL_PIPE_<uid>_…`` dans ``/tmp`` (chemin codé en
  dur dans sal, ``TMPDIR`` n'y change rien) ; sous systemd (``PrivateTmp=true``) c'est le ``/tmp`` de l'API. Quand l'espace
  de noms utilisateur est permis, le lanceur y ajoute un espace de noms de MONTAGE et monte le dossier jetable de
  la conversion sur ``/tmp`` : le vrai ``/tmp`` n'est plus visible, plus aucun droit Landlock n'y est accordé. Sinon (AppArmor
  d'Ubuntu 24.04 : repli probable du VPS), Landlock accorde ``cfg["landlock"]["tmp_partage"]`` (``MAKE_SOCK | REMOVE_FILE``,
  sans ``READ_DIR`` : soffice efface le socket avant de le créer, EACCES sans ``REMOVE_FILE`` — mesuré) et l'API balaie le
  socket laissé. Niveau écrit dans le fichier d'état : jeton ``tmp-prive`` (absent = partagé).
- SANS RÉSEAU NI SOCKET VERS L'EXTÉRIEUR, par deux protections empilées :
  1. un espace de noms réseau VIDE (``unshare(CLONE_NEWUSER | CLONE_NEWNET)``) : aucune interface,
     même pas ``lo``. Refusé sur Ubuntu 24.04 quand AppArmor restreint les espaces de noms
     utilisateur non privilégiés (``kernel.apparmor_restrict_unprivileged_userns=1``). Il N'ISOLE
     PAS les sockets Unix à chemin du système de fichiers : ceux de Postgres
     (``/var/run/postgresql``, authentification « peer » pour l'utilisateur du service) ou de
     Redis restent joignables. Il ne suffit donc jamais seul ;
  2. un filtre seccomp, TOUJOURS posé : ``connect()`` est refusé (EPERM) pour toute famille, IP
     comme Unix, chemin ou abstrait ; ``socket(AF_INET)`` et ``socket(AF_INET6)`` aussi ; ``io_uring``
     aussi. Le filtre refuse en plus ``ptrace``, ``process_vm_readv``/``process_vm_writev``,
     ``pidfd_open``, ``pidfd_getfd`` et ``kcmp`` (LibreOffice tourne sous le même utilisateur que
     l'API : pas de lecture de sa mémoire ni de vol d'un de ses descripteurs), et tue le processus
     pour tout numéro d'appel >= 0x40000000 (ABI x32, qui échappe aux comparaisons de numéros) ou
     toute autre architecture. Le filtre est hérité par tout programme que LibreOffice lancerait
     (``psql`` y compris). MESURÉ : LibreOffice convertit normalement sans ``connect()`` (ses sockets Unix
     internes ne servent qu'à ``bind``/``listen``/``accept``) ; il ne démarre PAS si ``socket()``
     est refusé pour AF_UNIX, d'où le filtre sur ``connect`` et non sur ``socket``. Non couvert :
     l'envoi sans connexion (``sendto`` datagramme vers un socket Unix à datagrammes comme
     ``/dev/log``), sans objet pour Postgres et Redis, qui sont des sockets à flux.

Le résultat est écrit dans le fichier d'état (``reseau=netns+seccomp`` …) pour que l'appelant
le journalise, puis ``soffice`` prend la place du lanceur (``execve``). Bibliothèque standard seule.
Code de sortie 97 : mode ``exige`` mais le filtre seccomp (ou Landlock, s'il est demandé) n'a pas pu être posé.
"""
import ctypes
import json
import os
import platform
import resource
import signal
import struct
import sys
from typing import Optional

CODE_ISOLATION_IMPOSSIBLE = 97

_PR_SET_PDEATHSIG = 1
_PR_SET_NO_NEW_PRIVS = 38
_PR_SET_SECCOMP = 22
_SECCOMP_MODE_FILTER = 2

# Par architecture : constante AUDIT_ARCH_*, numéro de ``socket`` et numéros des appels refusés
# sans condition (EPERM). Numéros du noyau Linux (x86_64 : arch/x86/entry/syscalls/syscall_64.tbl ;
# aarch64 : include/uapi/asm-generic/unistd.h).
#   connect                       : aucune connexion sortante, IP comme Unix
#   io_uring_setup                : io_uring sait connecter sans passer par connect()
#   ptrace, process_vm_readv/writev : lire ou écrire la mémoire d'un autre processus du même utilisateur (l'API)
#   pidfd_open, pidfd_getfd       : prendre un descripteur (une connexion à la base) à un autre processus
#   kcmp                          : comparer les ressources de deux processus (sert à retrouver un fd)
_ARCHITECTURES = {
    "x86_64": (0xC000003E, 41, {"connect": 42, "io_uring_setup": 425, "ptrace": 101, "process_vm_readv": 310,
                                "process_vm_writev": 311, "kcmp": 312, "pidfd_open": 434, "pidfd_getfd": 438}),
    "aarch64": (0xC00000B7, 198, {"connect": 203, "io_uring_setup": 425, "ptrace": 117, "process_vm_readv": 270,
                                  "process_vm_writev": 271, "kcmp": 272, "pidfd_open": 434, "pidfd_getfd": 438}),
}
_AF_INET, _AF_INET6 = 2, 10
_BPF_LD_ABS, _BPF_JEQ, _BPF_JGE, _BPF_RET = 0x20, 0x15, 0x35, 0x06
_RET_AUTORISER = 0x7FFF0000
_RET_EPERM = 0x00050000 | 1
_RET_TUER = 0x80000000
_BIT_ABI_ALTERNATIVE = 0x40000000       # x32 : numéro | 0x40000000 échappe aux comparaisons de numéros


def programme_seccomp(arch: int, nr_socket: int, refuses: dict) -> bytes:
    """Programme BPF (struct sock_filter, 8 octets l'instruction) :
    - autre architecture (appels 32 bits) ou numéro >= 0x40000000 (ABI x32) : processus tué ;
    - appels de ``refuses`` : EPERM ; ``socket(AF_INET|AF_INET6)`` : EPERM ;
    - tout le reste : autorisé (dont ``socket(AF_UNIX)``, ``bind``, ``listen``, ``accept``, ``socketpair``)."""
    numeros = sorted(refuses.values())
    n = len(numeros)
    i_socket, i_autoriser = 5 + n, 9 + n
    i_refuser, i_tuer = i_autoriser + 1, i_autoriser + 2

    def ins(code, jt, jf, k):
        return struct.pack("HBBI", code, jt, jf, k)

    def saut(position, code, k, si_vrai, si_faux):       # cibles = indices absolus
        return ins(code, si_vrai - position - 1, si_faux - position - 1, k)

    prog = [
        ins(_BPF_LD_ABS, 0, 0, 4),                                  # 0 : architecture
        saut(1, _BPF_JEQ, arch, 3, 2),                              # 1
        ins(_BPF_RET, 0, 0, _RET_TUER),                             # 2 : autre architecture
        ins(_BPF_LD_ABS, 0, 0, 0),                                  # 3 : numéro d'appel
        saut(4, _BPF_JGE, _BIT_ABI_ALTERNATIVE, i_tuer, 5),         # 4 : x32
    ]
    for j, numero in enumerate(numeros):
        position = 5 + j
        prog.append(saut(position, _BPF_JEQ, numero, i_refuser, position + 1))
    prog += [
        saut(i_socket, _BPF_JEQ, nr_socket, i_socket + 1, i_autoriser),     # socket ?
        ins(_BPF_LD_ABS, 0, 0, 16),                                         # 1er argument : la famille
        saut(i_socket + 2, _BPF_JEQ, _AF_INET, i_refuser, i_socket + 3),
        saut(i_socket + 3, _BPF_JEQ, _AF_INET6, i_refuser, i_autoriser),
        ins(_BPF_RET, 0, 0, _RET_AUTORISER),
        ins(_BPF_RET, 0, 0, _RET_EPERM),
        ins(_BPF_RET, 0, 0, _RET_TUER),
    ]
    return b"".join(prog)


def poser_seccomp() -> None:
    arch, nr_socket, refuses = _ARCHITECTURES[platform.machine()]   # KeyError : architecture non prévue
    programme = programme_seccomp(arch, nr_socket, refuses)
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
    """Espace de noms utilisateur + réseau (vide) + MONTAGE (le montage ne change rien tant qu'on ne monte
    rien : il sert à ``poser_tmp_prive``). Refusé : ``OSError`` (aucun des trois n'est alors posé)."""
    uid, gid = os.getuid(), os.getgid()
    try:
        os.unshare(os.CLONE_NEWUSER | os.CLONE_NEWNET | os.CLONE_NEWNS)
    except OSError:
        os.unshare(os.CLONE_NEWUSER | os.CLONE_NEWNET)      # sans montage privé : /tmp restera partagé
    # Les identifiants restent les nôtres (sinon « nobody » : HOME ne nous appartiendrait plus).
    for chemin, texte in (("/proc/self/setgroups", "deny"),
                          ("/proc/self/uid_map", f"{uid} {uid} 1"),
                          ("/proc/self/gid_map", f"{gid} {gid} 1")):
        try:
            with open(chemin, "w") as f:
                f.write(texte)
        except OSError:
            pass    # l'espace réseau est déjà vide ; seul l'affichage des identifiants change


_MS_BIND, _MS_REC, _MS_PRIVATE = 4096, 16384, 1 << 18


def poser_tmp_prive(source: str) -> None:
    """Monte ``source`` (dossier jetable de la conversion) sur ``/tmp``, dans l'espace de noms de montage posé par
    ``poser_espace_reseau_vide``. Rien ne se propage hors de cet espace : l'API voit toujours son ``/tmp``. Lève
    ``OSError`` si le noyau refuse (pas d'espace de montage, montage interdit)."""
    libc = ctypes.CDLL(None, use_errno=True)
    for cible, source_montage, drapeaux in ((b"/", b"none", _MS_REC | _MS_PRIVATE), (b"/tmp", source.encode(), _MS_BIND)):
        if libc.mount(source_montage, cible, None, ctypes.c_ulong(drapeaux), None) != 0:
            e = ctypes.get_errno()
            raise OSError(e, f"mount {cible.decode()}: {os.strerror(e)}")


def isoler_reseau(mode: str, tmp_prive: Optional[str] = None) -> str:
    """Pose les protections réseau demandées ; renvoie le NIVEAU obtenu (journalisé par l'appelant) :

    - ``netns+seccomp`` : espace réseau vide + connect() refusé (le meilleur) ;
    - ``seccomp`` : IP et connect() Unix refusés, sans espace réseau (repli) ;
    - ``netns`` : espace réseau vide SEUL (mode ``netns`` explicite : les sockets Unix à chemin
      restent joignables) ;
    - ``aucune``.
    ``tmp_prive`` : dossier à monter sur ``/tmp`` une fois l'espace de noms posé ; le jeton ``tmp-prive`` s'ajoute alors
    après ``netns``. Suivi de ``(refus …)`` si une protection demandée a été refusée par le noyau."""
    if mode == "aucun":
        return "aucune (désactivée par réglage)"
    actives, refus = [], []
    if mode in ("auto", "exige", "netns"):
        try:
            poser_espace_reseau_vide()
            actives.append("netns")
        except (OSError, AttributeError) as e:
            refus.append("netns:" + (getattr(e, "strerror", None) or type(e).__name__))
        else:
            if tmp_prive:
                try:
                    poser_tmp_prive(tmp_prive)
                    actives.append("tmp-prive")
                except OSError as e:
                    refus.append("tmp:" + (getattr(e, "strerror", None) or type(e).__name__))
    if mode in ("auto", "exige", "seccomp"):
        try:
            poser_seccomp()
            actives.append("seccomp")
        except (OSError, KeyError, AttributeError) as e:
            refus.append("seccomp:" + (getattr(e, "strerror", None) or type(e).__name__))
    return ("+".join(actives) if actives else "aucune") + (f" (refus {', '.join(refus)})" if refus else "")


def poser_landlock(cfg_landlock: dict, commande: str, tmp_prive: bool = False) -> str:
    """Pose les règles Landlock (liste blanche) ; renvoie ``"landlock"`` ou la raison de l'absence
    (``"landlock: absent"``…). Le programme lancé (``commande``) reste lisible et exécutable. ``/tmp`` : le
    dossier jetable monté dessus (``tmp_prive``), sinon les droits du vrai ``/tmp`` (``tmp_partage``)."""
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import landlock                                     # importé AVANT la restriction
        regles = [(chemin, int(droits)) for chemin, droits in cfg_landlock.get("regles", [])]
        # Landlock juge le fichier atteint à travers le montage : la règle porte sur le dossier monté lui-même
        regles += [(chemin, int(droits)) for chemin, droits
                   in cfg_landlock.get("tmp_prive" if tmp_prive else "tmp_partage", [])]
        regles.append((commande, landlock.LECTURE_EXEC))
        landlock.restreindre(regles)
        return "landlock"
    except Exception as e:                                  # noqa: BLE001 — jamais d'échec muet : l'état le dit
        raison = getattr(e, "strerror", None) or type(e).__name__
        return f"landlock: absent ({raison})"


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
    try:                                                    # ouvert AVANT Landlock : le fichier d'état peut être hors zone
        fichier_etat = open(cfg["fichier_etat"], "w")
    except OSError:
        fichier_etat = None
    etat = isoler_reseau(cfg.get("reseau", "auto"), cfg.get("tmp_prive"))
    landlock_ok = True
    if cfg.get("landlock"):
        resultat = poser_landlock(cfg["landlock"], cfg["cmd"][0], "tmp-prive" in etat.split(" ")[0].split("+"))
        landlock_ok = resultat == "landlock"
        jeton, _, reste = etat.partition(" ")
        if landlock_ok:
            etat = ("landlock" if jeton == "aucune" else jeton + "+landlock") + (" " + reste if reste else "")
        else:
            etat = etat + f" ({resultat})"
    if fichier_etat is not None:
        try:
            fichier_etat.write(etat)
            fichier_etat.close()
        except OSError:
            pass
    if cfg.get("reseau") == "exige" and ("seccomp" not in etat.split(" ")[0] or not landlock_ok):
        os._exit(CODE_ISOLATION_IMPOSSIBLE)
    os.execv(cfg["cmd"][0], cfg["cmd"])


if __name__ == "__main__":
    main()
