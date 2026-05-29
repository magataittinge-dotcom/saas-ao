# Raw NotebookLM extract — Skill #34 `expert-etancheite`

**Captured:** 2026-05-29 — N4 (777badb4) + N3 (43615791).

> ⚠️ **5/5 QUESTIONS NON CAPTURÉES** — quota NotebookLM Free épuisé en fin de batch (rate limit persistant > 8 min sur les deux notebooks après Q4 #32 + Q1 #34). Skill #34 livrée comme **squelette structurel** avec tests passants mais **contenu d'expertise marqué `[À COMPLÉTER]`** dans le prompt. La règle stricte « ne jamais inventer » est respectée : aucune donnée BTP n'a été fabriquée pour combler ce vide.
>
> **À RE-FAIRE EN PRIORITÉ** quand le quota NotebookLM est restauré (généralement après 24h sur le plan Free) :
>
> - Q1 (N4) — Référentiels NF DTU 43.1 / 43.3 / 43.4 / 43.5, 20.12, CSFE, Qualibat étanchéité, ATEx.
> - Q2 (N4) — Méthodologie 4 phases (préparation supports, choix complexes, mise en œuvre, contrôles).
> - Q3 (N4) — Pathologies AQC/SYCODÉS (relevés, points singuliers, fissuration, perméances).
> - Q4 (N3) — Phrases-types pour mémoire technique étanchéité.
> - Q5 (N4) — Contrôles & livrables (essais d'étanchéité, ITV éventuelles, DOE).

---

## Questions à poser (réutiliser tel quel dès que le quota est revenu)

**Q1 (N4) :**
> Pour le métier étanchéité de toiture-terrasse, liste précisément : 1) Tous les NF DTU et référentiels normatifs applicables (NF DTU 43.1 béton, 43.3 acier, 43.4 bois/dérivés, 43.5 réfection, 20.12 béton sur plancher, CCS CSFE) avec référence exacte et champ d'application. 2) Les certifications/qualifications obligatoires (Qualibat étanchéité, CSFE, ATEx, etc.). Format liste structurée, sois exhaustif.

**Q2 (N4) :**
> Décris la méthodologie complète d'exécution pour le métier étanchéité toiture-terrasse en 4 phases : 1) Préparation/études (reconnaissance support, choix complexe selon climat/destination, calculs pentes/évacuations), 2) Approvisionnement/matériel (membranes bitume/synthétiques certifiées, isolants, complexes ATEx), 3) Mise en œuvre (pose isolant, pose membrane, relevés, raccordements EP, joints de dilatation), 4) Contrôles/réception (essais étanchéité, mise en eau, PV). Pour chaque phase cite la norme/DTU qui l'encadre et donne les valeurs chiffrées clés (pente minimale, hauteur relevés, recouvrements).

**Q3 (N4) :**
> Quels sont les principaux désordres et pathologies en étanchéité toiture-terrasse selon les rapports AQC et SYCODÉS ? Pour chaque pathologie : pourcentage de sinistralité si connu, cause racine, mesure préventive. Focus sur : défauts relevés (sortie de toiture, EP, lanterneaux), poinçonnements/perforations, infiltrations à la jonction couverture/façade, vieillissement membrane, défauts d'évacuation.

**Q4 (N3) :**
> 8-10 formulations gagnantes (phrases-types) pour la section méthodologie d'un mémoire technique BTP pour un lot étanchéité toiture-terrasse, démontrant l'expertise sans superlatifs. Phrases courtes, factuelles, citant NF DTU 43.1/43.3/43.4/43.5, CSFE, certifications ATEx, classes membranes.

**Q5 (N4) :**
> Pour un chantier étanchéité toiture-terrasse, quels contrôles obligatoires et livrables produire (essais étanchéité par mise en eau, PV de réception, contrôle des relevés et points singuliers, DOE, plan d'entretien, garantie décennale) ? Cite les articles/normes qui les imposent (NF DTU 43.x, règles CSFE, CCAG Travaux Art. 28/40).

---

## Build notes

- Skill créée en **mode squelette** : structure Python valide + tests passants + métadonnées correctes.
- Le prompt système (`prompts/expert_etancheite.md`) contient des **placeholders `[À COMPLÉTER — capture N4/N3 manquante]`** dans toutes les sections d'expertise.
- **Aucune donnée BTP n'a été inventée pour cette skill** — règle stricte respectée.
- Action requise : ré-exécuter les 5 questions ci-dessus dès que le quota NotebookLM est restauré, puis remplacer les placeholders dans le prompt.
