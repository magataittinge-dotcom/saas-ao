"""API de Synorix servie avec une IA SIMULÉE, pour le test de bout en bout (frontend/e2e).

Rien dans le code du produit : ce lanceur remplace `anthropic.Anthropic` (la couture unique de tous
les appels de modèle : `services/ai/*`, `services/points_eclaircir.py`, `services/rag/*`) par un faux
client qui rend des réponses écrites à la main, au format attendu par chaque étape, puis sert l'appli.

    cd backend && E2E_PORT=8127 python -m tests.e2e.api_simulee

Garde-fous : refus de démarrer si une clé d'IA est posée (environnement ou backend/.env), ou si la base
ne s'appelle pas synorix_fin_*. La clé posée en mémoire (« simulee-e2e ») n'ouvre aucun compte réel.

Mesure : chaque appel simulé est ajouté à E2E_APPELS (JSON lignes : horodatage, type, modèle).
Panne : si le fichier E2E_PANNE existe et contient « analyse », les appels de lecture du dossier
lèvent l'erreur réseau du fournisseur (anthropic.APIConnectionError).
"""
from __future__ import annotations

import json
import os
import re
import sys
import threading
import time
from pathlib import Path
from types import SimpleNamespace

ICI = Path(__file__).resolve()
BACKEND = ICI.parents[2]
CLES_IA = ("ANTHROPIC_API_KEY", "VOYAGE_API_KEY")


def _lire_env(cle: str) -> str:
    try:
        for ligne in (BACKEND / ".env").read_text(encoding="utf-8").splitlines():
            if ligne.split("=", 1)[0].strip() == cle and "=" in ligne:
                return ligne.split("=", 1)[1].strip().strip("\"'")
    except FileNotFoundError:
        pass
    return ""


def verifier_garde_fous() -> None:
    for cle in CLES_IA:
        if os.environ.get(cle, "").strip() or _lire_env(cle):
            sys.exit(f"refus : {cle} est posée ; l'IA simulée ne tourne que sans clé d'IA")
    url = os.environ.get("DATABASE_URL") or _lire_env("DATABASE_URL")
    m = re.search(r"/([^/?]+)(\?.*)?$", url or "")
    if not m or not m.group(1).startswith("synorix_fin_"):
        sys.exit("refus : la base n'est pas une base jetable synorix_fin_*")


# ── Journal des appels et panne ─────────────────────────────────────────────
_VERROU = threading.Lock()


def _noter(genre: str, modele: str) -> None:
    chemin = os.environ.get("E2E_APPELS")
    if not chemin:
        return
    with _VERROU, open(chemin, "a", encoding="utf-8") as f:
        f.write(json.dumps({"t": time.time(), "genre": genre, "modele": modele}) + "\n")


def _en_panne(genre: str) -> bool:
    chemin = os.environ.get("E2E_PANNE")
    if not chemin or not os.path.exists(chemin):
        return False
    try:
        return genre.startswith(Path(chemin).read_text(encoding="utf-8").strip() or "-")
    except OSError:
        return False


# ── Réponses écrites à la main ──────────────────────────────────────────────
def _texte(contenu) -> str:
    if isinstance(contenu, str):
        return contenu
    if isinstance(contenu, list):
        return "\n".join(_texte(b.get("text", "") if isinstance(b, dict) else b) for b in contenu)
    return str(contenu or "")


def _exigence(cle: str, doc: str, page: int, categorie: str, exigence: str, **autres) -> dict:
    from tests.e2e.dce_invente import PHRASES
    return {"exigence": exigence, "source_document": doc, "source_page": page,
            "source_excerpt": PHRASES[cle], "category": categorie, "priority": "obligatoire", **autres}


def reponse_passe1() -> dict:
    from tests.e2e import dce_invente as d
    return {
        "requirements": [
            _exigence("dc1", "RC", 2, "candidature", "Fournir le formulaire DC1 complété et signé"),
            _exigence("dc2", "RC", 2, "candidature", "Fournir le formulaire DC2"),
            _exigence("assurance", "RC", 2, "candidature", "Joindre l'attestation d'assurance décennale"),
            _exigence("memoire", "RC", 2, "offre", "Remettre un mémoire technique (méthodologie, moyens, planning)"),
            _exigence("criteres", "RC", 2, "criteres_notation", "Valeur technique 60 %, prix 40 %"),
            _exigence("delai", "CCAP", 1, "planning", "Délai global d'exécution de six mois"),
            _exigence("penalites", "CCAP", 1, "offre", "Pénalités de retard de 1/3000 par jour calendaire"),
            _exigence("retenue", "CCAP", 1, "offre", "Retenue de garantie de 5 %"),
        ],
        "criteres_jugement": [
            {"nom": "Valeur technique", "poids": 60, "sous_criteres": []},
            {"nom": "Prix", "poids": 40, "sous_criteres": []},
        ],
        "infos_marche": {
            "objet": d.OBJET,
            "maitre_ouvrage": d.ACHETEUR,
            "maitre_oeuvre": None,
            "lieu_execution": {"adresse": d.ADRESSE, "document": "RC", "article": "1",
                               "extrait": f"La consultation porte sur l'{d.OBJET.lower()}, {d.ADRESSE}."},
            "lots": [d.LOT1, d.LOT2],
            "date_limite_reponse": d.date_remise().isoformat(),
            "duree_marche": "6 mois",
            "montant_estime": None,
            "type_procedure": "procédure adaptée",
            "conditions_paiement": {"delai_jours": 30, "avance_pct": None, "acomptes": None},
            "penalites_retard": "1/3000 du montant du marché par jour calendaire",
            "retenue_garantie_pct": 5,
            "caution_remplacante": None,
            "validite_offres_jours": None,
            "visite_site": {"obligatoire": False, "details": None},
            "variantes_autorisees": None,
            "conditions_sous_traitance": None,
            "assurances_specifiques": ["Décennale"],
        },
    }


def reponse_passe2() -> dict:
    return {"requirements": [
        _exigence("beton", "CCTP", 1, "technique", "Bétons de fondation C25/30 conformes à la NF EN 206"),
        _exigence("coffrage", "CCTP", 1, "technique", "Parements vus soignés, sans reprise apparente"),
        _exigence("planning", "CCTP", 1, "planning", "Remettre un planning détaillé sous quinze jours"),
    ]}


def reponse_points() -> dict:
    return {"points": [{
        "question": "Le planning détaillé attendu sous quinze jours doit-il couvrir aussi les phases de préparation du chantier ?",
        "pourquoi": "Le CCTP fixe le délai de remise sans préciser l'étendue du planning.",
        "source_document": "CCTP", "source_page": 1,
        "extrait": "L'entreprise remet un planning détaillé des travaux de son lot sous quinze jours.",
    }]}


def reponse_segment(consigne: str) -> dict:
    """Une partie du mémoire, au format exact demandé par la consigne de l'appel."""
    if "UNIQUEMENT le préambule" in consigne:
        return {"preambule": "Notre entreprise présente ici sa réponse au lot, établie à partir du dossier de consultation."}
    m = re.search(r"UNIQUEMENT la partie « ([^»]+) »", consigne)
    cle = (m.group(1).strip() if m else "partie")
    bloc = consigne[m.end():] if m else consigne
    fin = bloc.find("Ne génère AUCUNE")
    sous = re.findall(r"^\s+- (\S+)\s*$", bloc[: fin if fin > 0 else None], re.M)
    return {cle: {s: (f"Paragraphe simulé de la sous-section {s.replace('_', ' ')}. "
                      "Les bétons de fondation sont de classe C25/30 ; le planning détaillé est remis sous quinze jours.")
                  for s in sous}}


def repondre(kw: dict) -> tuple[str, str]:
    """(genre, texte) pour un appel `messages.create` / `messages.stream`."""
    from services.ai import prompts

    systeme = _texte(kw.get("system"))
    message = _texte((kw.get("messages") or [{}])[-1].get("content"))
    if kw.get("max_tokens") == 1 and message.strip() == "ping":
        return "pre-vol", "ok"
    if "CONSIGNE DE CET APPEL" in message and "génère UNIQUEMENT" in message:
        return "redaction", json.dumps(reponse_segment(message), ensure_ascii=False)
    debut = systeme[:400]
    if getattr(prompts, "DCE_PASS1_SYSTEM", "\0")[:400] == debut:
        return "analyse-passe1", json.dumps(reponse_passe1(), ensure_ascii=False)
    if getattr(prompts, "DCE_PASS2_SYSTEM", "\0")[:400] == debut:
        return "analyse-passe2", json.dumps(reponse_passe2(), ensure_ascii=False)
    from services import points_eclaircir
    if points_eclaircir._SYSTEM[:400] == debut:
        return "analyse-points", json.dumps(reponse_points(), ensure_ascii=False)
    from services.ai import passage_rewriter
    if passage_rewriter._SYSTEM[:400] == debut:
        return "reecriture", "Passage réécrit par l'IA simulée."
    return "inconnu:" + re.sub(r"\s+", " ", systeme[:60]), "{}"


class _Flux:
    def __init__(self, texte: str):
        self._texte = texte
        self.text_stream = (self._texte[i:i + 400] for i in range(0, len(self._texte), 400))

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def get_final_message(self):
        return _message(self._texte)


def _message(texte: str):
    usage = SimpleNamespace(input_tokens=0, output_tokens=0, cache_read_input_tokens=0,
                            cache_creation_input_tokens=0)
    return SimpleNamespace(content=[SimpleNamespace(type="text", text=texte)], stop_reason="end_turn",
                           usage=usage, model="simule")


class _Messages:
    def _appel(self, kw: dict) -> str:
        import anthropic
        import httpx
        genre, texte = repondre(kw)
        _noter(genre, str(kw.get("model", "")))
        if _en_panne(genre):
            raise anthropic.APIConnectionError(request=httpx.Request("POST", "https://api.anthropic.invalid/v1/messages"))
        return texte

    def create(self, **kw):
        return _message(self._appel(kw))

    def stream(self, **kw):
        return _Flux(self._appel(kw))


class FauxAnthropic:
    def __init__(self, *a, **kw):
        self.messages = _Messages()
        self.beta = SimpleNamespace(messages=self.messages)


def main() -> None:
    verifier_garde_fous()
    os.chdir(BACKEND)
    sys.path.insert(0, str(BACKEND))
    os.environ["ANTHROPIC_API_KEY"] = "simulee-e2e"
    # Les plafonds du jour restent ACTIFS (jamais 0) : relevés seulement, pour qu'une journée de passages du test (quatre
    # lancements par passage) ne bute pas sur les 20 lancements d'une vraie entreprise. Le budget d'IA reste tel quel :
    # l'usage simulé vaut 0 jeton, la réservation se libère à la fin de chaque travail.
    os.environ.setdefault("PLAFOND_JOUR_ANALYSES", "500")
    os.environ.setdefault("PLAFOND_JOUR_MEMOIRES", "500")
    os.environ.setdefault("PLAFOND_JOUR_QUESTIONS", "500")   # « Préparer les questions » (second test), jamais coupé
    import anthropic
    anthropic.Anthropic = FauxAnthropic  # la couture : tout `anthropic.Anthropic(...)` du produit
    import uvicorn
    from main import app
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("E2E_PORT", "8127")), log_level="warning")


if __name__ == "__main__":
    main()
