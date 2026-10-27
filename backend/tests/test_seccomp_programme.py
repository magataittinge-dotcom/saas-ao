"""Le programme seccomp du lanceur LibreOffice (services/libreoffice_lanceur.py) : décisions vérifiées
par un petit interpréteur BPF (aucun noyau nécessaire), puis effets réels sur un sous-processus."""
from __future__ import annotations

import json
import platform
import struct
import subprocess
import sys
from pathlib import Path

import pytest

from services import libreoffice_lanceur as L

ARCH = platform.machine()
needs_arch = pytest.mark.skipif(ARCH not in L._ARCHITECTURES, reason="architecture sans filtre")
needs_linux = pytest.mark.skipif(not sys.platform.startswith("linux"), reason="Linux seulement")
KILL, EPERM, ALLOW = L._RET_TUER, L._RET_EPERM, L._RET_AUTORISER


def decision(programme: bytes, arch: int, nr: int, arg0: int = 0) -> int:
    """Exécute le programme BPF sur une struct seccomp_data (nr, arch, ip, args[6])."""
    donnees = struct.pack("<IIQ6Q", nr & 0xFFFFFFFF, arch, 0, arg0, 0, 0, 0, 0, 0)
    instructions = [struct.unpack("<HBBI", programme[i:i + 8]) for i in range(0, len(programme), 8)]
    a, pc = 0, 0
    while True:
        code, jt, jf, k = instructions[pc]
        pc += 1
        if code == 0x20:                          # LD abs
            a = struct.unpack("<I", donnees[k:k + 4])[0]
        elif code == 0x15:                        # JEQ k
            pc += jt if a == k else jf
        elif code == 0x35:                        # JGE k (non signé)
            pc += jt if a >= k else jf
        elif code == 0x06:                        # RET k
            return k
        else:
            raise AssertionError(f"instruction BPF inattendue {code:#x}")


@needs_arch
@pytest.mark.parametrize("machine", sorted(L._ARCHITECTURES))
def test_decisions_du_programme(machine):
    arch, nr_socket, refuses = L._ARCHITECTURES[machine]
    prog = L.programme_seccomp(arch, nr_socket, refuses)
    af_inet, af_inet6, af_unix = 2, 10, 1
    # appels refusés sans condition : connect, io_uring, lecture de la mémoire d'un autre processus, vol de fd
    for nom, numero in refuses.items():
        assert decision(prog, arch, numero) == EPERM, nom
    assert set(refuses) == {"connect", "io_uring_setup", "ptrace", "process_vm_readv", "process_vm_writev",
                            "kcmp", "pidfd_open", "pidfd_getfd"}
    # socket : IP refusé, Unix permis
    assert decision(prog, arch, nr_socket, af_inet) == EPERM
    assert decision(prog, arch, nr_socket, af_inet6) == EPERM
    assert decision(prog, arch, nr_socket, af_unix) == ALLOW
    # un appel ordinaire passe
    assert decision(prog, arch, 0) == ALLOW and decision(prog, arch, 1) == ALLOW
    # ABI x32 : le bit 0x40000000 ne contourne rien, il tue le processus (même sur un numéro refusé ou permis)
    for numero in list(refuses.values()) + [nr_socket, 0, 1]:
        assert decision(prog, arch, numero | 0x40000000) == KILL, numero
    # autre architecture (appels 32 bits) : tué
    assert decision(prog, 0x40000003, 1) == KILL


@needs_arch
@needs_linux
def test_ptrace_et_lecture_de_memoire_refuses_pour_de_vrai():
    """Sous le filtre posé par le lanceur : ptrace, process_vm_readv et pidfd_open répondent EPERM."""
    arch, nr_socket, refuses = L._ARCHITECTURES[ARCH]
    client = f"""
import ctypes, os, errno
libc = ctypes.CDLL(None, use_errno=True)
res = {{}}
for nom, nr in {refuses!r}.items():
    if nom in ("connect", "io_uring_setup"):
        continue
    r = libc.syscall(nr, 0, 0, 0, 0, 0, 0)
    res[nom] = errno.errorcode.get(ctypes.get_errno()) if r == -1 else "pas refuse"
print(res)
"""
    cfg = {"cmd": [sys.executable, "-c", client], "reseau": "seccomp", "fichier_etat": "/dev/null"}
    r = subprocess.run([sys.executable, "-I", "-S", str(Path(L.__file__)), json.dumps(cfg)],
                       capture_output=True, text=True, timeout=30)
    assert r.returncode == 0, r.stderr
    assert eval(r.stdout.strip()) == {n: "EPERM" for n in refuses if n not in ("connect", "io_uring_setup")}


@pytest.mark.skipif(ARCH != "x86_64", reason="ABI x32 : x86_64 seulement")
@needs_linux
def test_un_appel_x32_tue_le_processus_au_lieu_de_passer():
    client = "import ctypes; ctypes.CDLL(None).syscall(0x40000000 + 101, 0, 0, 0, 0, 0, 0); print('survecu')"
    cfg = {"cmd": [sys.executable, "-c", client], "reseau": "seccomp", "fichier_etat": "/dev/null"}
    r = subprocess.run([sys.executable, "-I", "-S", str(Path(L.__file__)), json.dumps(cfg)],
                       capture_output=True, text=True, timeout=30)
    assert "survecu" not in r.stdout and r.returncode == -31, (r.returncode, r.stdout)   # SIGSYS
