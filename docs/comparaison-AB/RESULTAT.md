# Comparaison A/B — Analyse DCE : RÉSULTAT factuel

**Date :** 2026-06-01 · **Aucun code de prod modifié.** Scripts de mesure jetables dans `scripts/compare_*.py`.

## DCE de test retenu
**École primaire de Gueux** (`projects/0200d0e9-…`), DCE réel multi-lots (100 fichiers : AE, CCAP, 13 lots DPGF+CCTP, plans ARCH, PGC SPS, diagnostics). **Pas de RC** dans le dossier.
**Entrée identique aux deux systèmes :**
- **CCAP** — 120 635 chars / 48 p (volet administratif, passe 1)
- **CCTP lot 02 Étanchéité-couverture** — 69 437 chars / 25 p (volet technique, passe 2)

---

## Tableau comparatif (critères objectifs)

| Critère | Système A (prod) | Système B (91 skills) |
|---|---|---|
| **Exigences admin (CCAP) livrées** | **28** | **0** (skill admin → prose/refus, non parsé) |
| **Exigences techniques (CCTP) livrées** | **49** | **0** (JSON tronqué + fences, non parsé) |
| **Total exigences livrées** | **77** | **0** |
| **Sources/refs citées** | 77/77 avec `source_page` + `source_excerpt` **verbatim** | 0 livrée (prompts conçus pour citer, mais rien ne sort) |
| **Réfs vérifiables verbatim (exemples)** | « pénalité 300 € HT / absence réunion » · Chorus Pro p.17 · « art. 36.2.1 traçabilité déchets » · DTU 43.3 · NF EN 12101 | (fragment non livré) « Rw+Ctr ≥ 40 dB » · résistance thermique laine de roche · « étanchéité sur maçonnerie » |
| **Exigences trouvées par A et PAS par B** | **les 77** (B n'a rien livré) | — |
| **Exigences trouvées par B et PAS par A** | **0 livrée** (le fragment B suggère des seuils acoustiques/thermiques que A structure moins, mais non livrés) | — |
| **Erreurs factuelles repérables** | Taxonomie imprécise (clauses exécution CCAP classées `technique`) ; pas de chiffre/DTU faux | n/a (aucune sortie) |
| **Granularité** | 1 exigence = 1 item (fin, 77 items) | n/a |
| **Coût** | 2 appels sonnet-4-6 streaming, prompt caching (system+skills mis en cache), ~47K tokens in + ~10K out | 4 appels sonnet-4-6 non-streaming, **pas de cache**, plein-doc à chaque appel → **429 (30K TPM)** |
| **Temps** | **204,7 s** (77,9 + 124,8 s) | échec ; 35–52 s/appel avant crash |

---

## Synthèse honnête

1. **Qui extrait PLUS ?** → **A, sans comparaison possible : 77 exigences livrées vs 0 pour B.** B s'est planté sur les 4 skills.
2. **Qui cite MIEUX ses sources ?** → **A en livraison réelle** (77/77 avec extrait verbatim + page). Les **prompts** de B sont conçus pour citer des seuils normatifs (le fragment technique montrait `Rw+Ctr ≥ 40 dB`, résistance thermique) — potentiellement plus riches sur les **valeurs-seuils normées** — **mais rien n'est livré**.
3. **Erreurs factuelles ?** → A : imprécision de **catégorisation** (clauses d'exécution CCAP rangées en `technique`), aucune erreur de chiffre/norme. B : aucune sortie à évaluer.
4. **Pourquoi B échoue (cause racine, ≠ qualité des prompts)** — défauts du **runtime/orchestration** `synorix/ai/client.py`, que A possède déjà côté `dce_analyzer` :
   - pas de **strip des fences ```json** → crash de parsing ;
   - `max_tokens=4096` **fixe sans continuation** → JSON technique **tronqué** ;
   - **aucun découpage** ni budget tokens → **rate limit 30K TPM** ;
   - aucune gestion du **refus en prose** (légitime quand le RC manque) ;
   - aucun **retry/backoff** 429.

## Verdict factuel
Sur l'analyse DCE de bout en bout, **B est actuellement TRÈS INFÉRIEUR à A en résultat livré : 77 exigences traçables vs 0.** Ce n'est PAS prouvé comme un déficit de qualité des *prompts* B (le fragment technique généré était pertinent et normé), mais un **déficit de couche d'exécution** : le `Client` synorix est un wrapper « happy-path » qui ne survit pas à un DCE réel (fences, troncature, rate limit, refus). A embarque toute cette robustesse (streaming, caching, retries, 2-pass, troncature gérée, source verbatim).

## Recommandation (sur preuves)
- **Migration vers B en l'état : NON justifiée.** Branché tel quel, B livrerait **0 exigence** sur un DCE réel comme Gueux.
- **Ce que les preuves justifient :** avant toute décision A vs B, **durcir la couche runtime de B** pour atteindre la parité fonctionnelle avec A :
  1. `synorix/ai/client.py` : strip des fences ```json + tolérance prose/erreur ;
  2. `max_tokens` ≥ 8192 **+ continuation** (ou sortie en flux) pour les extractions volumineuses ;
  3. **découpage** du document + budget tokens (rester < 30K TPM) ;
  4. **retry/backoff** sur 429 ;
  5. gestion du cas « RC absent » (le skill admin refuse correctement — il faut router le bon document).
- **Re-test équitable** seulement après ce durcissement : on pourra alors comparer le **contenu** (A semble fort en traçabilité verbatim ; B *semble* fort en seuils normés) sur une base où les deux livrent réellement.

## Atout de B à ne pas jeter
Les **prompts** B (v2, corpus enrichi : CCAG 1/3000, R.4532, REP PMCB, KPI ISO 9001…) et leur discipline anti-invention sont un **actif réel** (le skill admin a *correctement* refusé d'inventer sans RC). Le travail restant est d'**orchestration/robustesse**, pas de ré-écriture des prompts.
