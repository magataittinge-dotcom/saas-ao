# Raw NotebookLM extract — Skill #89 `cotraitance-groupement`

**Captured:** 2026-06-01 — Notebook N8 `Coach Conseil` (5574a7d1). Reformulé downstream; non chargé au runtime.

## Q1+Q2 — GME conjoint vs solidaire (R2142-20 CCP) + formulaires

**R2142-20 CCP :**
- **Groupement conjoint** : chaque membre s'engage **uniquement à exécuter la/les prestations (lots) qui lui sont attribuées**.
- **Groupement solidaire** : chaque membre est **engagé financièrement pour la totalité du marché** (couvre les défaillances des autres).
- **Régime imposable** : si les documents du marché le prévoient, l'acheteur peut exiger que **le mandataire d'un groupement conjoint soit solidaire** des autres membres → compromis fréquent (sécurité acheteur + souplesse PME).

**Intérêt du GME pour une PME** : accéder à des marchés au-delà de sa capacité individuelle ; mutualiser des compétences techniques complémentaires (façade + plomberie + électricité) ; gagner en crédibilité.

**Formulaires :**
- **DC1 (lettre de candidature)** : document cadre du groupement — identifie tous les cotraitants, précise la forme (conjoint/solidaire), **désigne le mandataire**.
- **DC2** : rempli **individuellement par chaque membre** (mandataire ET chaque cotraitant) — capacités propres.
- **DC4** : ⚠️ **PAS pour la cotraitance** — réservé exclusivement à la **sous-traitance** (régimes de responsabilité différents). Ne pas confondre.

**Déclenchement proactif (registry #89)** : si `lot_amount > 0.6 × company.revenue_3y[-1]` OU capacité R2142-1 manquante seul mais accessible jointement.
