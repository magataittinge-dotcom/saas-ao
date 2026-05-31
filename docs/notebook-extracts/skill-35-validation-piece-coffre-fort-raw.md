# Raw NotebookLM extract — Skill #35 `validation-piece-coffre-fort`

**Captured:** 2026-05-31 — réutilise le tableau de validité de la skill #10 (N2 7a661d76). Pas de nouvelle requête.

## Tableau de validité
- Kbis/RNE < 3 mois (vigilance ≤ 6 mois) ; URSSAF < 6 mois ; fiscale = année en cours ; salariés étrangers < 6 mois ; RCD valable à l'ouverture chantier ; RC Pro annuelle ; qualifications selon certificat.

## Build notes
- Haiku. expires_at = émission + durée ; is_valid = expires_at ≥ remise ; warning si expire avant remise ; is_valid=false si émission inconnue.
