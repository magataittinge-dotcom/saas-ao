import json
import asyncio
import time
import anthropic
from json_repair import repair_json
from config import get_settings

settings = get_settings()

IMPORT_SYSTEM = (
    "Tu es un expert en appels d'offres BTP. "
    "Tu analyses des mémoires techniques et en extrais les informations structurées. "
    "Tu réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après."
)

_IMPORT_PROMPT_TEMPLATE = (
    "Analyse ce mémoire technique BTP et extrais les informations suivantes au format JSON :\n"
    '{\n'
    '  "date_creation": "date de création de l\'entreprise (ex: 2005, Octobre 2020...)",\n'
    '  "gerant_nom": "nom complet du gérant",\n'
    '  "gerant_titre": "titre ou fonction du gérant (ex: Gérant, PDG...)",\n'
    '  "zone_intervention": "zone géographique d\'intervention",\n'
    '  "historique": "historique et parcours de l\'entreprise (texte complet)",\n'
    '  "activites": "activités principales (texte complet)",\n'
    '  "chiffre_affaires": [{"annee": "2023", "montant": "1 200 000 €"}],\n'
    '  "organigramme_description": "description de l\'organigramme et des équipes",\n'
    '  "postes_cles": [{"poste": "Gérant", "nom": "Jean Dupont", "role": "description du rôle"}],\n'
    '  "moyens_informatiques": "liste des moyens informatiques",\n'
    '  "vehicules": "liste des véhicules",\n'
    '  "materiel": "liste du matériel",\n'
    '  "demarche_qualite": "démarche qualité de l\'entreprise",\n'
    '  "procedure_demarrage": "procédure de démarrage de chantier",\n'
    '  "gestion_securite": "dispositions relatives à la sécurité",\n'
    '  "traitement_dechets": "traitement des déchets",\n'
    '  "mesures_environnementales": "mesures environnementales",\n'
    '  "fournisseurs_principaux": "liste des fournisseurs principaux"\n'
    '}\n\n'
    "Règles :\n"
    "- Extrais uniquement ce qui est présent dans le document\n"
    "- Pour les champs absents, utilise null\n"
    "- Pour chiffre_affaires, extrais tous les chiffres trouvés\n"
    "- Pour postes_cles, extrais tous les postes mentionnés avec leur description\n"
    "- Conserve le texte original, ne paraphrase pas\n"
    "- Retourne le JSON et rien d'autre\n\n"
    "DOCUMENT :\n"
)


class MemoireImporter:
    MODEL = "claude-sonnet-4-6"

    def __init__(self):
        # Synchronous client — more reliable for long-running calls
        self.client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    async def extract(self, text: str) -> dict:
        prompt = _IMPORT_PROMPT_TEMPLATE + text[:60_000]
        return await asyncio.to_thread(self._sync_call, prompt)

    def _sync_call(self, prompt: str) -> dict:
        """Synchronous streaming Claude call — runs in a thread."""
        t0 = time.monotonic()
        print(f"[Memoire Importer] Streaming à Claude: {len(prompt)} chars", flush=True)

        collected = ""
        with self.client.messages.stream(
            model=self.MODEL,
            max_tokens=4000,
            temperature=0,
            system=IMPORT_SYSTEM,
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            for text in stream.text_stream:
                collected += text

        elapsed = time.monotonic() - t0
        raw = collected.strip()
        print(f"[TIMING] Memoire Import streaming: {elapsed:.1f}s, {len(raw)} chars", flush=True)

        start = raw.find("{")
        if start == -1:
            raise ValueError(f"Pas de JSON dans la réponse : {raw[:200]}")

        try:
            decoder = json.JSONDecoder()
            try:
                result, _ = decoder.raw_decode(raw, start)
            except json.JSONDecodeError:
                repaired = repair_json(raw[start:], return_objects=True)
                if not isinstance(repaired, dict):
                    raise ValueError("json_repair a échoué")
                result = repaired
        except ValueError:
            raise
        except Exception as e:
            raise ValueError(f"JSON invalide : {e}")

        return result
