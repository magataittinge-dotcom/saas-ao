# TASKS — Synorix (backlog)

Backlog cochable. Chaque tâche a un **critère de « fini » objectif** (test vert / comportement vérifiable).
Source d'extraction : `SECURITY_AUDIT_REPORT.md` (29 avr 2026) et `IMPROVEMENT_ROADMAP.md` (29 avr 2026), supprimés après report ici.

Convention priorité : **P1** = court terme · **P2** = moyen terme · **P3** = plus tard.

---

## 🔒 Sécurité (résidus de l'audit du 29 avr — failles critiques/hautes déjà corrigées)

- [ ] **SEC-RESID-1 — Tests d'intégration cross-org** (P1)
  Fini = un test `backend/tests/test_file_serve_cross_org_blocked.py` est VERT : un user de l'org A reçoit `403/404` en accédant à un fichier (`/api/files/view/...`) et à un projet de l'org B.
- [ ] **SEC-RESID-2 — Audit XSS frontend exhaustif** (P1)
  Fini = `grep -rn "dangerouslySetInnerHTML\|innerHTML" frontend/src` revu ; chaque occurrence est sanitisée ou justifiée par écrit ; rendu de l'éditeur de mémoire vérifié sur un payload `<script>`/`<img onerror>` (pas d'exécution).
- [ ] **SEC-RESID-5 — Alerting exceptions (Sentry)** (P1)
  Fini = `SENTRY_DSN` câblé, une exception non gérée déclenchée volontairement apparaît dans Sentry (capture d'écran/issue).
- [ ] **SEC — Validators stricts Pydantic** (P1)
  Fini = `email` (email-validator) et `siret` (14 chiffres) rejetés avec `422` sur entrée invalide dans un test ; câblés sur les endpoints de création profil/organisation.
- [ ] **SEC-RESID-4 — Rate limit par `user.id`** (P2)
  Fini = `key_func` du limiter utilise `user.id` (fallback IP si anonyme) ; bucket dédié `auth/sync` à `5/min` ; test de dépassement renvoie `429`.
- [ ] **SEC-RESID-3 — CSP report endpoint** (P2)
  Fini = endpoint `/api/csp-report` reçoit un POST de violation et le logge ; directive `report-uri`/`report-to` ajoutée à la CSP.
- [ ] **SEC — Durcissement déploiement prod** (P1, cf. `docs/DEPLOYMENT.md`)
  Fini = fail2ban actif sur le VPS + Cloudflare (DDoS/WAF) devant l'app, vérifiés en prod.
- [ ] **RGPD** (P1)
  Fini = hébergement confirmé en UE ; DPA Anthropic signé ; mentions légales + politique de confidentialité publiées et liées dans le footer.

---

## 💶 Coût & robustesse IA

- [ ] **Coût IA / mémoire < 0,10 €** (P1)
  Fini = mesure réelle sur une génération complète (prompt caching Anthropic + fragments DB) loggée sous 0,10 €.

---

## 🚀 Produit — court terme (P1)

- [ ] **Go/No-Go scoring IA** — endpoint `POST /projects/:id/scoring` + badge UI. Fini = score retourné pour un DCE test + badge affiché.
- [ ] **Templates de mémoire org-level** — réutilisation de mémoires-types validés (plan Pro+). Fini = un mémoire marqué « référence » est proposé puis réutilisé sur un nouveau projet.
- [ ] **Free tier (1 DCE gratuit/mois)** — quota backend + nudge upgrade UI. Fini = le 2ᵉ DCE du mois sur plan gratuit est bloqué avec message d'upgrade (test).
- [ ] **Auto-remplissage DC1/DC2/DUME** depuis profil entreprise. Fini = un PDF DC1 généré et rempli sans ressaisie sur un profil test.
- [ ] **Comparaison auto avec AO précédent gagné** (couplé mode incrémental). Fini = sur upload d'un AO façade, le mémoire du précédent AO façade gagné est suggéré.
- [ ] **Veille BOAMP minimale** — ingestion API data.gouv.fr + alertes par lot/zone. Fini = une alerte e-mail/notif déclenchée par un AO correspondant aux filtres.
- [ ] **API publique v1** — OpenAPI + clés API + rate limiting par tier. Fini = un appel authentifié par clé API documenté fonctionne + rate limit testé.
- [ ] **Landing pages (SEO)** — cf. stratégie marketing (hors repo). Fini = pages publiques en ligne et indexables.

---

## 🧭 Produit — moyen/long terme (P2/P3)

- [ ] **Détection qualifications manquantes** (Qualibat/RGE requis vs détenu) + alertes. Fini = alerte affichée quand une qualif requise par le DCE manque au profil.
- [ ] **Bench DPGF (ingestion DECP data.gouv.fr)** — fourchettes de prix par CPV/lot. Fini = fourchette affichée pour un code CPV test.
- [ ] **Comparateur public Synorix vs concurrents** (lead magnet). Fini = tableau interactif public en ligne.
- [ ] **Système d'avis utilisateurs** (G2/Capterra/Trustpilot) post-conversion. Fini = demande d'avis automatisée déclenchée après conversion.
- [ ] **Webhooks org-level** (Slack/email à chaque AO terminé/exporté). Fini = webhook reçu à la fin d'un export.
- [ ] **Génération Gantt depuis CCTP**. Fini = Gantt PDF généré depuis un CCTP test.
- [ ] **Intégration ERP BTP** (Sage Batigest / Codial / Onaya) — export DPGF compatible. Fini = export ouvert sans erreur dans un ERP cible.
- [ ] **SSO SAML** (plan Entreprise). Fini = login SSO test réussi.
- [ ] **Multi-langue (EN/ES)** — i18n + prompts bilingues. *(P3 — repoussé : marché FR prioritaire.)*

---

## 🗄️ RAG réglementaire (en cours)

- [ ] **Ingestion du corpus `backend/rag_corpus/`** (PDF Code de la commande publique). Fini = `rag_chunks` peuplée + une requête hybride (vector + FTS) retourne un article pertinent.
- [ ] **Migration 0003 en prod** — `CREATE EXTENSION vector` validé. Fini = `alembic upgrade head` passe sur la prod avec pgvector installé (cf. `docs/rag/PHASE0-*`).
