"""RESTES-2, point 7 — `services.budget_ia` s'importe seul (DEPLOIEMENT, bug vu en route).

Avant : `import services.budget_ia` échouait (import circulaire) : budget_ia → routers.auth → le paquet `routers`,
dont le `__init__` importait tous les routeurs, dont analysis → `from services.budget_ia import exiger_budget_ia`
(module à moitié chargé). Tout script devait d'abord `import routers` (contournement de JOUR-J 3.9).
Le test tourne dans un processus neuf : dans celui de pytest, les routeurs sont déjà chargés.
"""
import os
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent


@pytest.mark.parametrize("module", ["services.budget_ia", "services.depot_budget", "routers.analysis"])
def test_module_importable_seul(module):
    r = subprocess.run([sys.executable, "-c", f"import {module}"], cwd=BACKEND, env=os.environ.copy(),
                       capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, r.stderr[-1500:]


def test_la_commande_de_jour_j_sans_contournement():
    """La vérification 3.9 du jour J, sans `import routers` devant."""
    code = ("from services import quota as q, plafonds_ia as p, stockage as s, budget_ia as b; "
            "print(p.plafond('jour.analyse'), p.plafond('jour.memoire'), b.budget_jour_eur(), "
            "s.quota_octets('pro')//2**30, q.essai_exige_siret())")
    env = {k: v for k, v in os.environ.items() if not k.startswith(("PLAFOND_", "BUDGET_IA_", "QUOTA_STOCKAGE_", "ESSAI_"))}
    r = subprocess.run([sys.executable, "-c", code], cwd=BACKEND, env=env, capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, r.stderr[-1500:]
    assert r.stdout.split() == ["20", "20", "60.0", "20", "False"]
