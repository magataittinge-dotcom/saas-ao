# Raw NotebookLM extracts — Skills #65, #70, #71, #86 (scoring N7)

**Captured:** 2026-06-01 — Notebook N7 `Scoring Evaluation Offres MP BTP` (8ff1cdc4) + réutilisation de la capture #13. Reformulé downstream; non chargé au runtime.

## Critères & pondérations (réutilise #13, N7)
- **Triptyque** : prix – valeur technique – délais. Valeur technique en sous-critères barémés :
  - méthodologie / procédés ; moyens humains + matériels ; prévention / nuisances / environnement (SOGED) ; hygiène / sécurité / accès site occupé.
- Échelle de notation : « Très satisfaisant » → « Absence d'information », ou **0-5**.
- ⚠️ Pondérations exactes propres au marché = dans le RC ; ne jamais inventer → `ponderations_explicites=false` si absentes.

## Justification de note par axe (0-5), verbatim (N7)
La commission doit rédiger un commentaire **prouvant qu'elle a lu les détails**. Exemples :
- **Environnement / Nuisances** — 5/5 : « liste et détaille toutes les sources de nuisances (sonores, visuelles, pollution air, poussières, boues sur voirie) et explique les moyens concrets pour chacune. » ; 1/5 : « évoque seulement le respect de la directive bruit des engins, rien sur poussières/vibrations/boues. »
- **Méthodologie** — 5/5 : « décrit précisément les méthodologies par phase (terrassements, réseaux humides), avec moyens humains/matériels et contrôles qualité spécifiques par tâche. » ; 2/5 : « tâches abordées sans profondeur, explications générales non adaptées au site. »
- **Qualité (essais/contrôles)** — 5/5 : « détaille les essais ponctuels et continus : tests d'étanchéité des réseaux, pénétromètre pour compactage, portance. » ; 2/5 : « n'évoque que la démarche qualité théorique, occulte l'organisation concrète des essais. »
- **Sécurité / RH** — 5/5 : « détail hygiène des bases-vie ; système d'avertissement carton rouge/jaune ; astreinte 24/7 avec roulement de 3 personnes dédiées. »

## Implications produit
- **#65 recherche-criteres-evaluation-memoire** (Sonnet) : restitue axes + pondérations indicatives + échelle 0-5.
- **#70 synorix-score-evaluateur** (Opus) : note /100 ventilée par axe + justification type 0-5, reproductible, pondérations depuis le RC (sinon indicatives).
- **#71 synorix-score-suggestions** (Opus) : 1-3 suggestions actionnables/positives par axe sous seuil.
- **#86 RAO-predictif** (Sonnet) : grille notée **0-5 par sous-critère** + pondération + classement probable + écarts critiques. Jurisprudence R2152-6 à R2152-8 CCP. Reproductibilité ≥ 90 %.
