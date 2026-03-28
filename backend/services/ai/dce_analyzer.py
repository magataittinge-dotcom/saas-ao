import json
import asyncio
import anthropic
from json_repair import repair_json
from config import get_settings
from .prompts import DCE_ANALYSIS_SYSTEM
import logging

logger = logging.getLogger(__name__)
settings = get_settings()

_PLACEHOLDER_KEY = "sk-ant-placeholder"

_DEMO_CRITERES = [
    {"nom": "Prix", "poids": 60, "sous_criteres": []},
    {"nom": "Valeur technique", "poids": 40, "sous_criteres": [
        {"nom": "Méthodologie d'exécution", "poids": 20},
        {"nom": "Moyens humains et matériels", "poids": 10},
        {"nom": "Planning", "poids": 10},
    ]},
]

_DEMO_INFOS_MARCHE = {
    "objet": "Rénovation bâtiment administratif Mairie",
    "maitre_ouvrage": "Commune Test",
    "maitre_oeuvre": None,
    "lots": ["Lot unique"],
    "date_limite_reponse": None,
    "duree_marche": "8 semaines",
    "montant_estime": None,
    "type_procedure": "procédure adaptée",
}

_DEMO_REQUIREMENTS = [
    {
        "exigence": "Fournir une attestation de régularité fiscale datant de moins de 6 mois",
        "source_document": "RC", "source_page": 4,
        "source_excerpt": "Le candidat devra fournir une attestation fiscale datant de moins de 6 mois",
        "category": "candidature", "priority": "obligatoire",
    },
]


class DCEAnalyzer:
    def __init__(self):
        key = settings.ANTHROPIC_API_KEY
        self._demo_mode = not key or key == _PLACEHOLDER_KEY or key.startswith("sk-ant-placeholder")
        if not self._demo_mode:
            # Client SYNCHRONE — plus fiable que async pour les longues requêtes
            self.client = anthropic.Anthropic(
                api_key=key,
                timeout=300.0,
            )

    async def extract_full_analysis(self, dce_text: str) -> dict:
        if self._demo_mode:
            return {
                "requirements": _DEMO_REQUIREMENTS,
                "criteres_jugement": _DEMO_CRITERES,
                "infos_marche": _DEMO_INFOS_MARCHE,
            }

        max_chars = 60_000
        if len(dce_text) > max_chars:
            dce_text = dce_text[:max_chars] + "\n\n[Document tronqué pour analyse]"

        print(f"[DCE Analyzer] Envoi à Claude: {len(dce_text)} chars, max_tokens=12000")

        # Appel synchrone dans un thread séparé pour ne pas bloquer l'event loop
        try:
            message = await asyncio.to_thread(
                self.client.messages.create,
                model="claude-sonnet-4-20250514",
                max_tokens=12000,
                system=DCE_ANALYSIS_SYSTEM,
                messages=[{"role": "user", "content": f"Voici les documents DCE à analyser :\n\n{dce_text}"}],
            )
        except anthropic.AuthenticationError:
            self._demo_mode = True
            return {
                "requirements": _DEMO_REQUIREMENTS,
                "criteres_jugement": _DEMO_CRITERES,
                "infos_marche": _DEMO_INFOS_MARCHE,
            }
        except (anthropic.APITimeoutError, anthropic.APIConnectionError) as e:
            # Retry une fois
            logger.warning(f"Premier essai échoué, retry: {e}")
            try:
                await asyncio.sleep(3)
                message = await asyncio.to_thread(
                    self.client.messages.create,
                    model="claude-sonnet-4-20250514",
                    max_tokens=12000,
                    system=DCE_ANALYSIS_SYSTEM,
                    messages=[{"role": "user", "content": f"Voici les documents DCE à analyser :\n\n{dce_text}"}],
                )
            except Exception as e2:
                raise Exception(f"Échec après retry. Erreur: {str(e2)}")
        except anthropic.APIStatusError as e:
            raise Exception(f"Erreur API Claude (status {e.status_code}): {e.message}")

        raw = message.content[0].text.strip()
        print(f"[DCE Analyzer] Réponse reçue: {len(raw)} chars")

        start = raw.find("{")
        if start == -1:
            return {"requirements": [], "criteres_jugement": [], "infos_marche": {}}

        try:
            decoder = json.JSONDecoder()
            result, _ = decoder.raw_decode(raw, start)
        except json.JSONDecodeError:
            try:
                result = repair_json(raw[start:], return_objects=True)
                if not isinstance(result, dict):
                    return {"requirements": [], "criteres_jugement": [], "infos_marche": {}}
            except Exception:
                return {"requirements": [], "criteres_jugement": [], "infos_marche": {}}

        reqs = result.get("requirements", [])
        print(f"[DCE Analyzer] {len(reqs)} exigences extraites")

        return {
            "requirements": reqs,
            "criteres_jugement": result.get("criteres_jugement", []),
            "infos_marche": result.get("infos_marche", {}),
        }

    @property
    def is_demo(self) -> bool:
        return self._demo_mode
