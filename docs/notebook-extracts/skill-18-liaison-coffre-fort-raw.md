# Raw NotebookLM extract — Skill #18 `liaison-coffre-fort`

**Captured:** 2026-05-31 — réutilise le référentiel pièces admin de la skill #10 (N2 7a661d76). Pas de nouvelle requête (logique d'appariement).

## Principe
- Appariement par type canonique (Kbis, URSSAF, fiscale, RCD, RC Pro, DC1/DC2/DC4, RIB, qualifications) — référentiel + durées de validité = skill #10 (N2).
- Règle d'or : **0 faux positif** → `unmatched` si doute.
- Pièges : RC Pro vs RC Décennale ; fiscale vs URSSAF ; Kbis périmé.
- Statuts : matched_valid / matched_expired / unmatched (selon date_expiration vs remise).

## Build notes
- Haiku (appariement déterministe + sémantique léger). notebook_sources=["N2"] (hérité #10).
