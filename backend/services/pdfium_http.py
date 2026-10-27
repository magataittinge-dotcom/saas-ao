"""Réponse HTTP d'un travail PDF qui n'a pas pu être fait : 503 propre avec ``Retry-After``.

Installée une fois sur l'appli (``installer_gestionnaire``) : toute route qui laisse passer
``TravailPdfiumEchoue`` (aperçu de page, ancre au premier clic) répond 503 au lieu d'une
erreur interne, et le front réessaie après le délai indiqué. Aucun contenu du DCE dans le message.
"""
from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from services.pdfium_processus import TravailPdfiumEchoue

# Secondes avant de réessayer, selon la cause : l'attente d'une place se règle vite ; un travail
# interrompu (délai, mémoire, plantage) a remplacé son processus mais le même fichier échouerait
# de nouveau tout de suite.
_RETRY_APRES_S = {"attente": 5, "indisponible": 15}
_RETRY_DEFAUT_S = 30


async def _gestionnaire(_request: Request, exc: TravailPdfiumEchoue) -> JSONResponse:
    retry = _RETRY_APRES_S.get(exc.raison, _RETRY_DEFAUT_S)
    if exc.raison == "attente":
        detail = "L'aperçu se prépare, le serveur traite d'autres documents. Réessayez dans quelques secondes."
    else:
        detail = "Cet aperçu n'a pas pu être préparé pour le moment. Réessayez dans quelques instants."
    return JSONResponse(status_code=503, content={"detail": detail}, headers={"Retry-After": str(retry)})


def installer_gestionnaire(app: FastAPI) -> None:
    app.add_exception_handler(TravailPdfiumEchoue, _gestionnaire)
