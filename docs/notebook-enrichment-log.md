# Log d'enrichissement NotebookLM — sources ajoutées

**Exécuté le :** 2026-06-01
**Opérateur :** Claude Code (session enrichissement)
**Auth NotebookLM :** OK (Pro, token_fetch true)
**Périmètre :** 6 sujets de manque corpus → 4 notebooks (N1, N3, N4, N7). Sujet DPI/PDF-A (#63) exclu (technique pur, pas de notebook).

> ⚠️ Aucune source existante supprimée. Aucune skill régénérée (mission séparée).

---

## Tableau détaillé des ajouts

| Notebook | Sujet | Source tentée | Méthode | Statut | Note |
|---|---|---|---|---|---|
| **N1** (08531eb6) | CCAG-Travaux 2021 (art. 19 pénalités) | legifrance.gouv.fr/.../LEGIARTI000043315697 | add (URL) | ❌ **Échec** | Cloudflare → page « Just a moment... » ingérée (id `12af2131`). À **supprimer manuellement**. |
| **N1** | CCAG-Travaux 2021 (art. 19) | code-commande-publique.com/ccag-travaux-2021-article-19/ | add (URL) | ✅ Ajouté | Titre réel OK (id `21a85714`). Fallback prévu → couvre le sujet. |
| **N1** | Code du travail R.4532 / coordination SPS | inrs.fr/metiers/btp/coordination-sps/reglementation.html | add (URL) | ✅ Ajouté | « Cadre réglementaire de la coordination de sécurité - INRS » (id `5e23ec93`). |
| **N1** | Code du travail R.4532 / PPSPS | preventionbtp.fr/.../article-l4532-9-du-code-du-travail_... | add (URL) | ✅ Ajouté | « Article L4532-9 du Code du travail - PPSPS » (id `80fc7301`). |
| **N1** | — | *(fallback Discover SPS)* | research | ⏭️ Non utilisé | Les 2 URL directes ayant réussi, le fallback Discover n'était pas nécessaire. |
| **N4** (777badb4) | REP PMCB / déchets bâtiment | filieres-rep.ademe.fr/filieres-REP/filiere-PMCB | add (URL) | ✅ Ajouté | « PMCB \| Filières REP » (id `08780c53`). |
| **N4** | REP PMCB (ministère) | ecologie.gouv.fr/.../produits-materiaux-construction-...-pmcb | add (URL) | ✅ Ajouté | « PMCB \| Ministères Transition écologique » (id `316191b3`). |
| **N4** | CSFE / e-Cahiers CSTB (étanchéité #34) | Discover « règles professionnelles CSFE étanchéité toiture-terrasse e-Cahiers CSTB SEL végétalisation » | add-research 🔄 | ✅ Importé | **+11 sources** (Règles pro CSFE 2018/2024, Cahier CSTB 3680_V2, SEL, EPDM/TPO, végétalisation…). Erreur RPC sur le dernier doublon, mais le lot a bien été importé. |
| **N3** (43615791) | KPI qualité PAQ/SOPAQ | Discover « indicateurs qualité chantier BTP PAQ SOPAQ KPI ISO 9001 taux non-conformité points d'arrêt » | add-research 🔄 | ✅ Importé | **+12 sources** (check-lists ISO 9001, tableaux de bord BTP, guides non-conformité…). Erreur RPC sur 2 sources restantes, lot principal importé. |
| **N7** (8ff1cdc4) | Certifications RSE | Discover « certification BBCA bâtiment bas carbone label Effinergie NF Habitat HQE critères RSE marché public » | add-research 🔄 | ✅ Importé | **« Imported 10 sources »** proprement (IFPEB rénovation bas carbone, labels & certifications, etc.). |

---

## Sources à ajouter / corriger MANUELLEMENT par Mohamed

1. **N1 — supprimer la source parasite** : id `12af2131` titre « Just a moment... » (challenge Cloudflare de Légifrance, contenu inutile/polluant pour le RAG).
   - `notebooklm source delete 12af2131 --notebook 08531eb6` (commande destructive → laissée à Mohamed).
2. **N1 — texte officiel CCAG-Travaux 2021 (optionnel)** : Légifrance bloque l'ajout automatique (Cloudflare). Le sujet est **déjà couvert** par le fallback `code-commande-publique.com` (art. 19) + une source CCAG-Travaux arrêté ECOM2106871A présente dans N1. Si le texte Légifrance brut est souhaité : l'ajouter via le navigateur (copier-coller ou upload PDF du JO).

---

## Confirmation des compteurs (avant → après)

| Notebook | Avant | Après | Δ utile | Détail |
|---|---|---|---|---|
| **N1** (08531eb6) | 15 | 20 | **+4** | CCAG fallback + INRS + L4532-9 + 1 doublon INRS ; **+1 parasite** (`12af2131` à retirer). |
| **N3** (43615791) | 20 | 32 | **+12** | KPI qualité (Discover). |
| **N4** (777badb4) | 48 | 61 | **+13** | REP PMCB ×2 (URL) + CSFE/CSTB ×11 (Discover). |
| **N7** (8ff1cdc4) | 24 | 34 | **+10** | Certifs RSE (Discover). |

Total sources ajoutées : **~39** (dont 1 parasite à retirer côté N1).

---

## Notes à logger

- ⚠️ **N4 / REP PMCB — filière EN RÉFORME 2026** : consultation publique du **23/04→19/05/2026**. Le contenu réglementaire REP PMCB ajouté est susceptible d'évoluer → **re-vérifier dans ~6 mois** (les sources ADEME/ecologie.gouv reflètent l'état pré-réforme).
- **Pattern d'import Discover** : `source add-research` ne fait que **découvrir** ; l'import nécessite `research wait --import-all`. Sur N3 et N4, l'import a renvoyé une erreur RPC `Failed precondition` sur les **derniers** doublons/sources, mais le **lot principal a bien été importé** (vérifié via le compteur). Sur N7, import propre (« Imported 10 sources »).
- **Légifrance = Cloudflare** : les URL `legifrance.gouv.fr` ne sont pas ingérables automatiquement (challenge JS). Toujours prévoir un fallback (code-commande-publique, doctrine) ou un upload PDF manuel.

---

## Prochaine étape (mission séparée)

Régénérer / mettre à jour les skills concernées pour exploiter le nouveau corpus et lever les marqueurs `[À COMPLÉTER]` :
- **N1** → #24 `calculatrice-retenue-garantie`, #15 `detection-cautionnement-garanties`, #46 `redacteur-securite-ppsps`, #53 `generateur-ppsps`.
- **N4** → #47 `redacteur-environnement-soged`, #54 `generateur-soged`, #34 `expert-etancheite`.
- **N3** → #48 `redacteur-qualite-paq`, #55 `generateur-paq`.
- **N7** → #92 `criteres-RSE-2026`.
