"""1.10 — Quand le mémoire est prêt, Synorix prévient par e-mail : la
génération détachée émet « Mémoire technique prêt — {AO} » et l'envoie par
SMTP (serveur simulé ici ; la réception réelle se vérifie en recette, avec les
variables SMTP_* de production)."""
import threading

import pytest

from models.project import Project, ProjectDocument

CONTENU = {"preambule": "Préambule.", "partie_a": {"implantation": "Reims."}, "partie_b": {}, "partie_c": {}}


class _SmtpSimule:
    """Remplace smtplib.SMTP : garde les messages au lieu de les envoyer."""
    envoyes: list = []

    def __init__(self, hote, port, timeout=None):
        self.hote, self.port = hote, port

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self):
        pass

    def login(self, user, password):
        pass

    def send_message(self, msg):
        _SmtpSimule.envoyes.append(msg)


@pytest.fixture(autouse=True)
def no_rate_limit(monkeypatch):
    import routers.memoire as memoire_mod
    monkeypatch.setattr(memoire_mod.limiter, "enabled", False, raising=False)


def test_memoire_pret_envoie_un_email(client, db_session, test_org, test_user, monkeypatch):
    import smtplib

    import routers.memoire as memoire_mod
    from config import get_settings

    async def _generation(self, **kwargs):
        return dict(CONTENU)
    monkeypatch.setattr(memoire_mod.MemoireGenerator, "generate", _generation)

    reglages = get_settings()
    monkeypatch.setattr(reglages, "SMTP_HOST", "smtp.recette.invalid")
    monkeypatch.setattr(reglages, "SMTP_FROM", "noreply@synorix.fr")
    monkeypatch.setattr(smtplib, "SMTP", _SmtpSimule)
    _SmtpSimule.envoyes = []

    test_org.plan = "pro"
    db_session.add(Project(id="proj-mail", organization_id=test_org.id, name="Groupe scolaire",
                           selected_lot="lot1", selected_lot_name="Lot 1 — Gros œuvre", current_step=5))
    db_session.add(ProjectDocument(project_id="proj-mail", type="rc", file_url="x", file_name="rc.pdf",
                                   extracted_text="Règlement de consultation. " * 30))
    db_session.commit()

    assert client.post("/api/projects/proj-mail/memoire/generate", json={}).status_code == 200
    for t in threading.enumerate():
        if t.name.startswith("synorix-memoire-"):
            t.join(timeout=30)

    assert len(_SmtpSimule.envoyes) == 1
    msg = _SmtpSimule.envoyes[0]
    assert msg["Subject"] == "Mémoire technique prêt — Groupe scolaire"
    assert msg["To"] == "test@synorix.fr"
    assert "est généré" in msg.get_content()
