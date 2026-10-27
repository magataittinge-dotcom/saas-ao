"""/tmp privé de LibreOffice et disque 9p (WSL /mnt/c).

Constat du coordinateur (après la fusion 352e474) : depuis /mnt/c/saas-ao/backend (appli locale), le dossier
jetable de LibreOffice (backend/cache/libreoffice) est sur 9p ; monté sur /tmp, il doit recevoir le socket
OSL_PIPE de soffice, que 9p refuse (« Operation not supported », errno 95) : soffice sortait en code 1, tout
Word déposé restait sans aperçu. Le /tmp privé n'est donc posé que si le dossier jetable accepte un socket
Unix ; sinon repli sur le /tmp partagé (déjà testé), journalisé.
"""
import errno
import glob
import logging
import os
import shutil
import socket

import pytest

from services import landlock
from services import libreoffice_isole as lo


def test_un_dossier_qui_accepte_les_sockets_unix_permet_le_tmp_prive(tmp_path):
    assert lo.tmp_prive_possible(tmp_path) is True
    assert list(tmp_path.iterdir()) == []          # la sonde ne laisse rien


def test_un_dossier_sans_socket_unix_force_le_tmp_partage(tmp_path, monkeypatch):
    def refus(self, adresse):
        raise OSError(errno.EOPNOTSUPP, "Operation not supported")
    monkeypatch.setattr(socket.socket, "bind", refus)
    assert lo.tmp_prive_possible(tmp_path) is False


GUEUX_DOCX = sorted(glob.glob(
    "/mnt/c/saas-ao/backend/uploads/projects/5006460b-b568-4622-a9c3-6e0b5fd70db6/dce/*.docx"))


@pytest.mark.skipif(not (shutil.which("soffice") or shutil.which("libreoffice")), reason="LibreOffice absent")
@pytest.mark.skipif(not os.path.isdir("/mnt/c/saas-ao/backend/cache")
                    or landlock.type_systeme_fichiers("/mnt/c/saas-ao/backend/cache") != "9p" or not GUEUX_DOCX,
                    reason="pas de disque 9p (WSL) avec le DCE de démonstration sur cette machine")
def test_vrai_dossier_jetable_sur_9p_la_conversion_passe_en_tmp_partage(monkeypatch, caplog):
    dossier = "/mnt/c/saas-ao/backend/cache/libreoffice-essai-9p"
    monkeypatch.setenv("SYNORIX_LIBREOFFICE_DIR", dossier)
    try:
        with caplog.at_level(logging.INFO, logger="services.libreoffice_isole"):
            pdf = lo.convertir_en_pdf(GUEUX_DOCX[0], ".docx")
        assert pdf[:5] == b"%PDF-"
        assert "tmp partagé" in caplog.text
    finally:
        shutil.rmtree(dossier, ignore_errors=True)
