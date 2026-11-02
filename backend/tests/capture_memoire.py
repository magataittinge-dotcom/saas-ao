"""Outil de test (pas un test) : capture les requêtes que le générateur de mémoire enverrait au modèle.

Aucun appel réseau : le client est simulé. Les référentiels (skills) et le prompt système sont figés par des
chaînes inventées pour que la capture ne dépende que du code du générateur. Données entièrement inventées.
Sert à B3 : égalité octet pour octet avec la base 0572366 quand il n'y a pas de plan validé, et préfixe mis en
cache identique avec ou sans plan.
"""
import asyncio
import hashlib
import json
from types import SimpleNamespace

from services.ai import memoire_generator as mg

SYSTEME_FIGE = "PROMPT SYSTEME DE TEST (fige)."
SKILLS_FIGES = "REFERENTIEL DE TEST A\nREFERENTIEL DE TEST B"
REF_METHODO_FIGEE = "METHODOLOGIE DE TEST"


class _Flux:
    def __init__(self, texte):
        self._t = texte

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    @property
    def text_stream(self):
        yield self._t

    def get_final_message(self):
        usage = SimpleNamespace(input_tokens=10, output_tokens=20,
                                cache_read_input_tokens=0, cache_creation_input_tokens=5)
        return SimpleNamespace(stop_reason="end_turn", usage=usage)


def segment_de(consigne: str) -> str:
    for cle in ("partie_a", "partie_b", "partie_c"):
        if f"« {cle} »" in consigne:
            return cle
    return "preambule"


def organisation():
    return SimpleNamespace(
        id="org-test", name="ENTREPRISE INVENTEE", siret="12345678901234", address="1 rue des Tests, 75000 Ville",
        historique="Entreprise fondee en 1999.", activites="Facade, ITE", organigramme="Gerant et un conducteur",
        moyens_informatiques="Tablettes", vehicules="3 utilitaires", materiel="Echafaudages", fournisseurs="Fournisseur X",
    )


def arguments(**plus):
    base = dict(
        organization=organisation(),
        memoire_config=None,
        project_name="Marche invente",
        maitre_ouvrage="Commune inventee",
        selected_lot_name="Lot 05 - Revetement de facade ITE",
        all_docs=[
            SimpleNamespace(type="cctp", file_name="cctp.pdf", extracted_text="CCTP invente : isolation thermique par l'exterieur."),
            SimpleNamespace(type="rc", file_name="rc.pdf", extracted_text="RC invente : jugement des offres."),
        ],
        compliance_items=[
            SimpleNamespace(category="technique", exigence_text="Echafaudage conforme a la norme inventee.", priority="obligatoire"),
            SimpleNamespace(category="offre", exigence_text="Remettre un memoire technique.", priority="obligatoire"),
        ],
        references=[SimpleNamespace(
            id="r1", intitule="ITE ecole inventee", maitre_ouvrage="Ville inventee", lot="Facade ITE", montant_ht=120000,
            annee=2024, description="Chantier invente", client_type=None, client_nom_complet=False)],
        variables={"nb_ouvriers": 8},
        criteres_jugement=[{"nom": "Valeur technique", "poids": 60, "sous_criteres": [
            {"nom": "Moyens humains et materiels", "poids": 30}, {"nom": "Gestion des dechets", "poids": 30}]},
            {"nom": "Prix", "poids": 40}],
        reference_template_text=None,
        project_id=None,
        raison_sociale="ENTREPRISE INVENTEE",
    )
    base.update(plus)
    return base


def corps_reponse(consigne: str) -> str:
    """Une réponse JSON valide pour la consigne reçue (sous-sections lues dans la consigne)."""
    seg = segment_de(consigne)
    if seg == "preambule":
        return json.dumps({"preambule": "Preambule de test."})
    cles = [ln.strip()[2:].split(" ")[0] for ln in consigne.splitlines() if ln.startswith("  - ")]
    return json.dumps({seg: {c: f"contenu {c}" for c in cles}})


def capturer(monkeypatch, **plus):
    """Lance `generate` avec un client simulé ; rend (résultat, requêtes triées par segment)."""
    monkeypatch.setattr(mg, "MEMOIRE_GENERATION_SYSTEM", SYSTEME_FIGE)
    monkeypatch.setattr(mg, "load_skills_bundle", lambda noms: SKILLS_FIGES)
    monkeypatch.setattr(mg, "load_skill_reference", lambda skill, fichier: REF_METHODO_FIGEE)
    gen = mg.MemoireGenerator()
    requetes = []

    def flux(**kw):
        requetes.append(kw)
        return _Flux(corps_reponse(kw["messages"][0]["content"][-1]["text"]))

    monkeypatch.setattr(gen.client.messages, "stream", flux)
    resultat = asyncio.run(gen.generate(**arguments(**plus)))
    requetes.sort(key=lambda kw: segment_de(kw["messages"][0]["content"][-1]["text"]))
    return resultat, requetes


def _bloc(b):
    sortie = {"cache": b.get("cache_control"), "longueur": len(b["text"]),
              "sha256": hashlib.sha256(b["text"].encode("utf-8")).hexdigest()}
    return sortie


def empreinte(requete: dict) -> dict:
    """Tout ce qui part au modèle, sous forme comparable : hachage + longueur de chaque bloc, texte intégral de
    la consigne (dernier bloc, non mis en cache)."""
    contenu = requete["messages"][0]["content"]
    return {
        "modele": requete["model"],
        "max_tokens": requete["max_tokens"],
        "autres_arguments": sorted(k for k in requete if k not in ("model", "max_tokens", "system", "messages")),
        "extra_body": requete.get("extra_body"),
        "system": [_bloc(b) for b in requete["system"]],
        "user": [_bloc(b) for b in contenu],
        "consigne": contenu[-1]["text"],
    }
