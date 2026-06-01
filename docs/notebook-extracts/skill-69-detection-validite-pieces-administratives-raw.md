# Raw extract — Skill #69 `detection-validite-pieces-administratives`

**Captured:** 2026-06-01 — réutilise la table de validité de la skill #35 (N2).
<!-- Skill technique : réutilise les durées de validité capturées en #35 / coffre-fort (N2). -->

Vérifier que chaque pièce administrative est **encore valide à la date de remise** (et le restera le jour du dépôt) :
- Comparer `date_emission + duree_validite` à la `date_remise`.
- Signaler les pièces **expirées** et celles **bientôt expirées** (avant le jour du dépôt).
- Exemples de validités (cf. #35) : attestations fiscales/sociales (généralement annuelles / 6 mois), Kbis (≤ 3 mois), assurances (date d'échéance annuelle). Valeur inconnue → `[À COMPLÉTER — durée de validité, cf. #35]`.
- Objectif : **100 % de détection des expirations**.
