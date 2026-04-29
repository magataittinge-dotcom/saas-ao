# Roadmap produit Synorix — issue de la veille concurrentielle

**Date :** 2026-04-29
**Sources :** `COMPETITIVE_INTELLIGENCE.md`, `MARKETING_STRATEGY.md`, état actuel du repo (audit du `backend/` et `frontend/`).

**Convention :**
- **P0 = cette nuit** (mission autonome 24-36h)
- **P1 = semaine prochaine** (max 7 jours)
- **P2 = mois prochain** (~30 jours)
- **Effort :** XS (≤ 1h), S (≤ 4h), M (≤ 1j), L (≤ 3j), XL (≤ 7j)
- **Impact :** high / medium / low (sur conversion ou rétention)

---

## P0 — Cette nuit (autonome)

| # | Item | Description | Impact | Effort | Dépend |
|---|---|---|---|---|---|
| P0.1 | Audit sécurité complet | Cf. brief Phase 2.1 — secrets, headers, rate limit, validation, path traversal, CORS, authorization, SQL inj, XSS. Rapport SECURITY_AUDIT_REPORT.md | high | L | — |
| P0.2 | Robustesse + audit_logs | Try/except cohérent, transactions atomiques, soft-delete, structlog, table audit_logs | high | M | — |
| P0.3 | Performance N+1 / indexes / cache | joinedload, indexes DB, cursor pagination, Redis/cachetools | medium | M | — |
| P0.4 | Optimisation coûts API mémoire | Prompt caching Anthropic + fragments DB + mode incrémental + modèle dégradé. Cible <0.10€/mémoire | high | L | — |
| P0.5 | Auto-injection profil entreprise → mémoire | Vérifier que le profil entreprise est lu sans ressaisie pour chaque mémoire | high | S | — |
| P0.6 | CRUD complet (mémoire/projet/doc/ref/checklist/fragment) | Audit endpoints, complétion soft-delete + restore + duplicate | medium | M | P0.2 |
| P0.7 | Tests 350+ verts | Couverture tests, intégration end-to-end, sécurité, performance | high | L | P0.1-P0.6 |
| P0.8 | Observabilité (structlog, /health, /metrics) | Logs structurés + endpoints monitoring + Sentry-ready | medium | S | P0.2 |
| P0.9 | DEPLOYMENT.md + BACKUP_RECOVERY.md | Doc déploiement Hostinger VPS Ubuntu + rollback + restore | medium | S | — |
| P0.10 | Migration Alembic | Remplacer `_ensure_schema_columns` par Alembic versionné | medium | M | — |
| P0.11 | Bug encodage CP437 ZIP | Fix noms fichiers (`` etc.) + backfill v4 | low | S | — |
| P0.12 | Reminder attestations expirantes | Cron + email/notif si attestation expire dans <30j | medium | S | P0.2 |
| P0.13 | Détecteur pièges DCE en interface | Endpoint + UI step "vérification finale" — utilise skill existant | high | S | — |
| P0.14 | Conseils contextuels post-mémoire | 3-5 suggestions d'amélioration spécifiques après chaque génération | medium | S | P0.5 |
| P0.15 | Mode incrémental (template AO précédents) | Réutiliser le mémoire d'un AO gagné comme base pour un similaire | high | M | P0.4 |

**Total P0 :** 15 items, ~30-40h estimés. Réaliste sur 24-36h en parallélisant.

---

## P1 — Semaine prochaine

| # | Item | Description | Impact | Effort | Dépend |
|---|---|---|---|---|---|
| P1.1 | Go/No-Go scoring IA (endpoint + UI) | Skill `scoring-offres-expert` → endpoint `/projects/:id/scoring` + UI badge | high | M | — |
| P1.2 | Templates de mémoire partagés (org-level) | Mémoires-types validés réutilisables au sein de l'org. Plan Pro+ | medium | M | P0.6 |
| P1.3 | Bibliothèque DTU/normes publique (SEO) | Pages publiques /normes/dtu-XX-X exposant le skill normes-dtu-btp | high (SEO) | L | — |
| P1.4 | Veille BOAMP minimale | Ingestion API gratuite data.gouv.fr → alertes paramétrées par lot/zone | medium | L | — |
| P1.5 | Comparaison auto avec AO précédents | Si un AO façade est uploadé, suggérer le mémoire du précédent AO façade gagné. Couplé P0.15 | high | M | P0.15 |
| P1.6 | Auto-remplissage DC1/DC2/DUME PDF | Génération formulaires standardisés depuis profil entreprise | high | L | P0.5 |
| P1.7 | Bench DPGF (ingestion DECP) | Importer dataset DECP (data.gouv.fr) → fourchettes de prix par CPV/lot | medium | L | — |
| P1.8 | API publique v1 | Documentation OpenAPI + clés API + rate limiting tier-based | low (mais nécessaire Plan Entreprise) | M | P0.3 |
| P1.9 | Site landing pages (10 pages frontend) | Cf. MARKETING_STRATEGY.md §3 | high | XL | — |
| P1.10 | Free tier (1 DCE gratuit/mois) | Limite quota côté backend + UI nudge upgrade | high | M | P0.6 |

**Total P1 :** 10 items, ~50-70h estimés.

---

## P2 — Mois prochain

| # | Item | Description | Impact | Effort | Dépend |
|---|---|---|---|---|---|
| P2.1 | SSO SAML | Plan Entreprise — Auth0 ou Clerk Enterprise | low | L | — |
| P2.2 | Webhooks org-level | Notifier Slack/email à chaque AO terminé/exporté | low | M | P0.8 |
| P2.3 | Annuaire sous-traitants | Base BTP française + scoring complémentarité | medium | XL | — |
| P2.4 | Génération Gantt depuis CCTP | Extraction durées + dépendances → export Gantt PDF | medium | L | — |
| P2.5 | Multi-langue (EN, ES) | i18n frontend + prompts IA bilingues | low | XL | — |
| P2.6 | Marketplace de templates | Mémoires anonymisés partageables entre orgs (royalties) | medium | XL | P1.2 |
| P2.7 | App mobile (PWA) | Lecture-seule pour suivi terrain + notifications | low | L | — |
| P2.8 | Audit trimestriel taux de gain | Dashboard analytics gain/perte + recommandations IA | medium | L | P1.1 |
| P2.9 | Intégration Sage Batigest / Codial / Onaya | Export DPGF compatibles ERP BTP | medium | L | — |
| P2.10 | Mode "double signature" pour candidatures groupées | Co-traitance + sous-traitance gérées en bibliothèque | low | L | — |
| P2.11 | Détection automatique de qualifications manquantes | Match Qualibat/RGE requis vs détenu, alertes | high | M | — |
| P2.12 | Comparateur public Synorix vs Doaken vs SPIGAO | Tableau interactif — lead magnet | medium | M | — |
| P2.13 | Programme partenariat fédérations (FFB, CAPEB, FNTP) | Partenariat distribution institutionnelle | high (acquisition) | XL | — |
| P2.14 | Webinaires hebdomadaires "Mémoire 5/5" | Live + replay évergreen | medium | M | — |
| P2.15 | Système d'avis utilisateurs (G2, Capterra, Trustpilot) | Demander des avis aux clients trial qui convertissent | high | S | — |

**Total P2 :** 15 items, ~80-120h estimés.

---

## Synthèse priorités

**Phases d'exécution recommandées :**

1. **Sprint 1 (cette nuit, autonome) :** P0.1 → P0.15
2. **Sprint 2 (semaine 1, Mohamed) :** P0 finitions + P1.1 (Go/No-Go) + P1.10 (free tier) + P1.9 (landing pages prioritaires)
3. **Sprint 3 (semaines 2-4) :** P1.2-P1.8 + lancement SEO/contenu
4. **Sprint 4 (mois 2) :** P2.11 (qualifications) + P2.12 (comparateur) + P2.15 (avis utilisateurs)
5. **Sprint 5 (mois 3) :** P2.13 (partenariats fédérations)

**KPI à suivre :**
- Taux de conversion trial → payant (cible : >15%)
- Coût IA / mémoire (cible : <0.10 €)
- Time-to-first-value : du signup au 1er ZIP exporté (cible : <30 min)
- Net Promoter Score (cible : >50)
- Churn mensuel (cible : <5 %)

---

## Dépendances critiques

```
P0.1 (audit sécu) ──┐
                    ├─→ Production-ready
P0.2 (robustesse) ──┤
P0.3 (perf) ────────┘
                    
P0.4 (coûts IA) ─────→ P0.15 (mode incrémental) ──→ P1.5 (compar AO)
                    
P0.5 (profil) ───────→ P0.14 (conseils) ──→ P1.6 (DC1/DC2 auto)
                    
P0.6 (CRUD) ─────────→ P1.2 (templates) ──→ P1.10 (free tier)
                    
P0.10 (Alembic) ─────→ P1.1, P1.4, P1.7 (toutes nouvelles tables)
```

---

## Notes finales

**Ne pas surinvestir sur :**
- Veille AO complète (commodité, segment saturé) — un module BOAMP minimal suffit
- Dépôt dématérialisé natif (intégrations coûteuses, hétérogènes) — exporter un ZIP propre suffit
- Multi-langue (marché FR de 233Md€/an largement suffisant) — repousser en P3+

**Investir massivement sur :**
- Qualité du mémoire technique (50-70 % de la note acheteur — c'est *le* livrable client)
- Skills BTP (DTU, normes, méthodologie, pièges) — c'est la moat technique
- SEO long-tail (50 articles + 10 LP en 6 mois)
- Pricing transparent (différenciateur unique en France)
