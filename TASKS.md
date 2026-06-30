# TASKS — Synorix (backlog)

Backlog cochable. Chaque tâche a un **critère de « fini » objectif** (test vert / comportement vérifiable).
Convention priorité : **P0** = en cours / prochaine étape · **P1** = court terme · **P2** = moyen terme · **P3** = plus tard.

---

## 🗄️ P0 — Phase 1 RAG réglementaire (PROCHAINE ÉTAPE)

Objectif : brancher le corpus réglementaire (Code de la commande publique d'abord) pour que la génération mémoire et l'analyse DCE citent des articles **réels et sourcés**. Socle posé : migration `0003_rag_corpus_pgvector` (table `rag_chunks`, extension `vector`, index HNSW + GIN FTS). PDF en place : `backend/rag_corpus/reglementation-marches-publics/`. Mesures de référence : `docs/rag/PHASE0-*`.

- [ ] **1. Ingestion CCP (extraction texte)**
  Fini = un loader lit le PDF `backend/rag_corpus/reglementation-marches-publics/Code de la commande publique.pdf` et produit un texte structuré (parties/livres/articles) ; test sur ≥1 article connu (ex. `R2143-3`) retrouve son texte intégral.
- [ ] **2. Chunking par article**
  Fini = le découpage produit un chunk par article (pas de troncature mi-article) ; un test vérifie qu'un article long n'est pas coupé et que `article_ref` est renseigné.
- [ ] **3. Contextualisation (Haiku)**
  Fini = chaque chunk reçoit un `contexte` court généré (contextual retrieval) ; test : le contexte mentionne le titre/section parent de l'article.
- [ ] **4. Embeddings Voyage**
  Fini = chaque chunk a un `embedding` de dimension `VECTOR_DIM` (1024) via le modèle Voyage retenu ; test : appel embeddings renvoie un vecteur de bonne dimension (clé API mockée en CI).
- [ ] **5. Indexation pgvector**
  Fini = les chunks (contenu + contexte + embedding + FTS) sont insérés dans `rag_chunks` ; `SELECT count(*)` > 0 et l'index HNSW est utilisé (`EXPLAIN` montre l'index).
- [ ] **6. Retriever hybride (vector + FTS + RRF + rerank)**
  Fini = une fonction `retrieve(query, k)` combine ANN cosine + FTS français, fusionne par **RRF**, puis **rerank** ; test : top-k contient l'article attendu pour une requête test.
- [ ] **7. Validation bout-en-bout**
  Fini = une requête réglementaire réelle (ex. « assiette de la retenue de garantie ») retourne le **bon article cité** (numéro exact) en tête de résultat — vérifié par un test d'intégration.
- [ ] **Migration 0003 en prod** — `CREATE EXTENSION vector` validé.
  Fini = `alembic upgrade head` passe sur la prod avec pgvector installé côté serveur PostgreSQL (cf. `docs/rag/PHASE0-*`).

---

## 🔒 Sécurité (résidus de l'audit du 29 avr — failles critiques/hautes déjà corrigées)

- [x] **SEC-RESID-1 — Tests d'intégration cross-org** ✅ FAIT
  Couvert par `backend/tests/test_security_cross_org.py` (9 tests verts) : `test_user_b_cannot_view_user_a_project_file` (file_serve cross-org → 403/404, pas de fuite de corps), `test_path_traversal_blocked`, `test_unknown_prefix_blocked`, + cross-org projet/document/référence.
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

- [ ] **Réduire le coût de génération mémoire via prompt caching** (P1)
  Réalité mesurée : **~€0,90 / mémoire en full-Sonnet** (DCE Gueux ; vs ~€6 en Opus, cf. `docs/comparaison-memoire-AB/RESULTAT.md`). Cible : abaisser via prompt caching Anthropic (préfixe stable caché par modèle) + fragments DB.
  Fini = mesure réelle sur une génération complète loggée **< €0,50 / mémoire** grâce au cache (cache_read effectif sur les segments consécutifs), sans perte de densité normative.

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
