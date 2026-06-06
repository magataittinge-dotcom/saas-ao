# JOURNAL — Mission Nuit 4 (2026-06-06)

Compteur API : **0/0** (mission 0-API)

## Log
- [start] Bloc 1 — extraction design system Synorix.
- [BLOC1] Design system extrait → docs/design/DESIGN_SYSTEM.md (palette 4-rôles cyan/slate/rouge/émeraude, DM Sans, tokens ds-*, classes glass-card/btn-primary/input-dual/pill/table-dark, animations, inventaire composants + pages, conventions génération). Commit+push.
- [BLOC2] Audit UI (lecture seule) → docs/design/AUDIT_UI.md. Hors-charte : amber/orange (warnings candidature/vault/upload — devrait être slate), indigo (upload/memoire). Intentionnel : navy auth/landing/viewer, marque PaymentCard. Pro : StepExport (modèle), Tools, MemoireConfig. À refondre demain : Landing, Billing/Pricing, Dashboard. Quick wins : couleurs hors-charte. Commit+push.
- [BLOC3] Quick wins sûrs : 1 appliqué (StepMemoire accent indigo→cyan charte, build vert). Amber "Expire bientôt" + icône docx + thèmes sombres = laissés (sémantique/intentionnel, décision design demain). Doc : QUICK_WINS_appliques.md. Commit+push.
- [BLOC4] Organisation : docs/INDEX.md (carte de toute la doc), docs/DETTE_TECHNIQUE.md (7 items priorisés : dist tracké, pas d'ESLint, bundle mono, couleurs, scripts, bouton mort References, interpolation progress), scripts/README.md (12 scripts jetables documentés). .gitignore : +frontend/dist/ (stoppe churn build). .claude/ OK (skills produit relocalisées). 0 TODO code, 0 secret. Commit+push.
