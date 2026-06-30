"""Calculateurs déterministes (0 appel LLM, 0 coût) — autonomes.

Logique financière/juridique pure (retenue de garantie, OAB), extraite des skills
Synorix v2 vers des modules standalone (Pydantic Input/Output + fonction `compute`),
sans dépendance à `synorix/` (Skill/registry/Client). Exposés à l'app via
`services/synorix_calc.py` → `routers/calculators.py`.
"""
