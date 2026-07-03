# TASKS — Synorix (backlog)

Backlog cochable reconstruit depuis le **gap analysis Vision V1 FINALE** (2026-07-01, cf. `docs/PRD_SYNORIX_V2.md` v3.0). Chaque tâche porte un **critère de « fini » objectif** (test vert / comportement vérifiable). Règle projet : **Terminé = Prouvé**.

Convention priorité : **P0** = socle en cours · **P1-démo** = irréprochable pour la démo Adil · **P1-business** = commercialisation · **P2/P3** = ensuite.

Codes gap analysis entre crochets : `[Bn]` = existe à modifier · `[Cn]` = à construire (cf. tableau du 2026-07-01).

---

## ✅ FAIT — référence (NE PAS reconstruire)

Briques déjà implémentées et conformes à la vision. Pointeur fichier pour éviter toute reconstruction.

- [x] **Streaming SSE** — `backend/services/progress_bus.py`, `pipeline_tracker.py`, `routers/progress.py` ; front `hooks/useProgressStream.ts` + `components/common/ProgressDisplay.tsx`. Heartbeat, fallback polling, signal réel (compteur chars).
- [x] **Prompt caching mémoire** — `services/ai/memoire_generator.py` (`cache_control ephemeral`, ~90 % cache hit dès la 2ᵉ génération, segments consécutifs même modèle).
- [x] **Stripe carte-only** — `services/billing/stripe_provider.py` (`payment_method_types=["card"]`) + provider abstrait (`billing_provider`, `billing_country`).
- [x] **Upload découplé disque→réponse immédiate** — `routers/projects.py` (spool 10 Mo, cap 2 Go, extraction thread daemon), `services/file_storage.py`, `document_processor.py`.
- [x] **Lots déterministes 4-passes + badges confiance** — `services/lot_detector.py` ; isolation par lot via `document_tagger.get_documents_for_lot()`.
- [x] **Analyse 2-pass + source_excerpt + catégories** — `routers/analysis.py`, `services/ai/dce_analyzer.py`, `models/compliance_item.py`.
- [x] **DPGF checker déterministe** — `services/dpgf_checker.py` (lignes vides, cohérence total, multi-format).
- [x] **Dates d'expiration coffre-fort** — `services/expiry_checker.py` + Celery `tasks/check_expiry.py`.
- [x] **Export ZIP structuré + nommage safe + DOCX** — `routers/export.py` (`_sanitize`), `services/docx_exporter.py`.
- [x] **Sécurité multi-tenant** — `routers/file_serve.py` (`_authorize_path`), `main.py` (CSP/HSTS/CORS), rate-limit slowapi.
- [x] **Calculateur retenue de garantie** — front `routes/Tools.tsx` (`RetenueCalculator`).
- [x] **Profil entreprise stable BDD** (socle profil mémoire vivant) — `models/memoire_config.py`, `organization.py`, `team_member.py`.
- [x] **SEC-RESID-1 — Tests cross-org** — `backend/tests/test_security_cross_org.py` (9 tests verts).

---

## 🗄️ P0 — Phase 1 RAG réglementaire (SOCLE — conservé)

Objectif : brancher le corpus réglementaire (Code de la commande publique d'abord) pour que la génération mémoire et l'analyse DCE citent des articles **réels et sourcés**. Socle posé : migration `0003_rag_corpus_pgvector` (table `rag_chunks`, extension `vector`, index HNSW + GIN FTS). PDF en place : `backend/rag_corpus/reglementation-marches-publics/`. Mesures de référence : `docs/rag/PHASE0-*`.

- [ ] **1. Ingestion CCP (extraction texte)** — Fini = un loader lit le PDF `Code de la commande publique.pdf` et produit un texte structuré (parties/livres/articles) ; test sur ≥1 article connu (ex. `R2143-3`) retrouve son texte intégral.
- [ ] **2. Chunking par article** — Fini = un chunk par article (pas de troncature mi-article) ; test vérifie qu'un article long n'est pas coupé et que `article_ref` est renseigné.
- [ ] **3. Contextualisation (Haiku)** — Fini = chaque chunk reçoit un `contexte` court (contextual retrieval) ; test : le contexte mentionne le titre/section parent.
- [ ] **4. Embeddings Voyage** — Fini = chaque chunk a un `embedding` de dimension `VECTOR_DIM` (1024) ; test : appel embeddings renvoie un vecteur de bonne dimension (clé mockée en CI).
- [ ] **5. Indexation pgvector** — Fini = chunks insérés dans `rag_chunks` ; `count(*) > 0` et index HNSW utilisé (`EXPLAIN`).
- [ ] **6. Retriever hybride (vector + FTS + RRF + rerank)** — Fini = `retrieve(query, k)` combine ANN cosine + FTS français, RRF puis rerank ; test : top-k contient l'article attendu.
- [ ] **7. Validation bout-en-bout** — Fini = une requête réglementaire réelle (ex. « assiette de la retenue de garantie ») retourne le **bon article cité** en tête — test d'intégration.
- [ ] **Migration 0003 en prod** — Fini = `alembic upgrade head` passe sur la prod avec pgvector installé côté serveur.

---

## 🎯 P1-DÉMO — Pipeline irréprochable de bout en bout (démo Adil)

Priorité absolue : Adil doit être **« bluffé »**. L'expérience prime sur le code.

- [ ] **DÉMO-1. Validation réelle upload + streaming** — Test end-to-end avec un **gros DCE réel** (centaines de Mo, ZIP), **réseau non-local**. Fini = barre de progression **fidèle du début à la fin, jamais décroissante**, réponse **immédiate** post-transfert, traitement lourd bien découplé en fond, erreur explicite par fichier, **zéro cercle de chargement infini**. A1/A4 sont conformes sur le papier — on prouve l'**expérience** en conditions réelles, pas juste le code.
- [ ] **DÉMO-2. Retrait OAB `[B3]`** — Supprimer route + UI (`front/routes/Tools.tsx` `OabCalculator`) + module `backend/services/calculators/oab.py` + ses tests. Fini = `grep -ri "oab" backend/ frontend/src` ne retourne plus de code produit ; tests verts ; UI sans trace OAB.
- [ ] **DÉMO-3. Filet IA lots `[C3][C4]`** — IA Claude UNIQUEMENT sur échec objectif (zéro lot / écart vs compte annoncé RC / libellé manquant). Fini = sur un DCE mono-pièce sans structure, l'IA retrouve les lots ; sur un DCE structuré, l'IA n'est PAS appelée (log le prouve) ; recoupement du compte annoncé RC testé.
- [ ] **DÉMO-4. Bandeau critique analyse `[C5]`** — Extraction structurée deadline / visite obligatoire / critères pondérés / délai / pénalités clés. Fini = sur le DCE de démo, le bandeau affiche les 5 champs corrects, sourcés.
- [ ] **DÉMO-5. Source → doc surligné `[C6]`** — Bouton source par exigence ouvre le doc à la bonne page, **phrase entière surlignée jaune** (source_excerpt verbatim). Fini = clic sur une exigence ouvre la page exacte, surlignage couvre la phrase complète (pas le début seul).
- [ ] **DÉMO-6. Options mémoire 0 € `[C8]`** — Organigramme SVG, Gantt, page de garde, annexes coffre. Fini = chaque option cochée produit son artefact dans le mémoire exporté, **sans appel LLM** (coût = 0 €).
- [ ] **DÉMO-7. Pré-flight preview + réécriture ciblée `[C9]`** — Preview profil condensé éditable (modifs locales par défaut + case « mettre à jour mon profil »), références pré-sélectionnées (5-8). Réécriture IA par passage (Opus 4.7). Fini = preview éditable avant génération ; sélection d'un paragraphe + instruction → seul ce paragraphe change.
- [ ] **DÉMO-8. Vérification 3 états + score conformité `[C10]`** — États ✓ conforme / ⚠️ présente-mais-problème / ✗ manquante ; score « 14/16 » **gate le bouton ZIP (non-bloquant)**. Fini = les 3 états s'affichent ; score calculé (déterministe 0 €) ; ZIP prévient si score incomplet mais reste possible.
- [ ] **DÉMO-9. Seuils validité par type `[C11]`** — URSSAF/fiscale/PROBTP/CIBTP < 6 mois, KBIS < 3 mois, assurances. Fini = un KBIS de 4 mois est signalé ⚠️, un de 2 mois ✓ ; test par type de doc.
- [ ] **DÉMO-10. Workflow DPGF + signatures `[C12]`** — Télécharger → remplir hors SaaS → re-upload → valider (aucune ligne vide + total = montant AE) ; confirmation signatures (liste + case). Fini = re-upload d'une DPGF incomplète = ⚠️ ; complète = ✓ ; cases signatures persistées.
- [ ] **DÉMO-11. Export PDF mémoire + ZIP ordre RC `[C13]`** — Mémoire PDF (dépôt) + Word (retouche) ; 1 ZIP par lot, numérotation = ordre du RC, convention nommage RC si présente. Fini = PDF généré ouvrable ; ZIP par lot ordonné selon le RC.
- [ ] **DÉMO-12. Synorix Score go/no-go `[C18]`** — Éligibilité factuelle **déterministe 0 €** (CA exigé vs profil, qualifications, pondérations, délais). Fini = score go/no-go affiché sur le DCE de démo, calculé sans LLM, justifié par facteur.
- [ ] **DÉMO-13. Traduction trésorerie CCAP `[C19]`** — Avance, délais de paiement, RG, pénalités **en clair**, déterministe. Fini = les 4 postes traduits pour le DCE de démo, sourcés CCAP.
- [ ] **DÉMO-14. Rétro-planning auto `[C20]`** — Visite → questions → dépôt J-1 → deadline. Fini = planning généré à partir de la deadline + visite extraites.
- [ ] **DÉMO-15. Statuts post-export + stats `[C14]`** — Prêt → Déposé (confirmé) → Gagné/Perdu (nourrit stats). Fini = transition de statut manuelle testée ; stats gagné/perdu mises à jour au dashboard.

### UI de la démo

- [ ] **DÉMO-UI-1. Refonte sidebar `[B4]`** — `[+ Nouvel AO]` hors nav en haut ; groupes TRAVAIL / MON CAPITAL ; Références sous MON CAPITAL ; jauge quota en bas → Paramètres > Abonnement ; **pipeline jamais dans la sidebar**. Fini = sidebar conforme au PRD §4, aucune entrée « mémoire technique » séparée.
- [ ] **DÉMO-UI-2. Mon entreprise = profil vivant + 3 onglets `[B6]`** — Onglets Identité / Moyens humains-matériels / Certifications ; le profil mémoire vit ICI. Fini = les 3 onglets affichent/éditent le profil ; la génération lit ce profil au moment T.
- [ ] **DÉMO-UI-3. Dashboard hub 3 zones `[B7]`** — Reprendre / Démarrer / Piloter ; distinction « En cours de réponse » vs « Analysés ». Fini = les 2 catégories distinctes affichées ; reprise d'un AO à l'étape exacte.
- [ ] **DÉMO-UI-4. Jauge quota « 32/40 » `[C17]`** — Composant + store + endpoint, cliquable → Abonnement. Fini = jauge affiche la conso réelle (dépend de BUS-1).
- [ ] **B9 — Renommage candidature → verification** — Route + composant (`StepCandidat.tsx` → `StepVerification.tsx`) + libellés. Fini = **route + composant + libellés renommés, zéro référence résiduelle** (`grep -ri "candidat" front/src/routes/project` propre), **tests verts**.

---

## 💶 P1-BUSINESS — Commercialisation (quotas, pricing, onboarding)

- [ ] **BUS-1. Quotas + enforcement `[C1]`** — Deux compteurs mensuels (40 analyses + 40 mémoires Pro ; fair-use Business), unité 1 lot = 1 mémoire ; middleware avant analyse/mémoire ; blocage doux + nudge upgrade (pas d'overage). Fini = la 41ᵉ mémoire du mois sur Pro est bloquée avec message d'upgrade (test) ; Business non bloqué.
- [ ] **BUS-2. Pricing 349/599 `[B1]`** — Tarifs Stripe + UI abonnement. Fini = checkout Stripe aux nouveaux prix ; page abonnement affiche 349/599.
- [ ] **BUS-3. SIRET / Sirene INSEE `[C2]`** — `services/insee_service.py` (verify + fetch), appelé au sign-up ; pré-remplit raison sociale/adresse/NAF ; NAF 41/42/43. Fini = un SIRET BTP valide pré-remplit le profil ; un SIRET non-BTP est refusé poliment ; outage INSEE ne bloque pas le sign-up.
- [ ] **BUS-4. Onboarding wow < 5 min + coffre progressif `[C15][C16]`** — Inscription → SIRET → écran unique « 1er DCE offert » ; bandeau discret « enregistrer ce doc au coffre ? » sur upload perso. Fini = parcours inscription→premier upload < 5 min sans formulaire long ; bandeau coffre apparaît, jamais de relance si refus.
- [ ] **BUS-5. Billing dans Paramètres `[B5]`** — Déplacer de premier niveau → Paramètres > Abonnement & Facturation. Fini = plus d'entrée billing au premier niveau ; accessible via Paramètres.
- [ ] **BUS-6. Reformulation profil via Haiku `[C7]`** — Champs narratifs libres reformulables par Haiku, sans toucher les données factuelles. Fini = reformulation d'un historique via Haiku, coût loggé négligeable.

---

## 🔒 Sécurité (résidus audit + by-design vision)

- [ ] **SEC-C21 — Anti-zip-bomb** (P1) — Garde ratio de décompression sur `_handle_zip_upload`. Fini = un zip-bomb (ratio > seuil) est rejeté avec message explicite (test).
- [ ] **SEC-C22 — URLs signées coffre-fort** (P1) — Timestamp + HMAC, durée limitée, sur `file_storage`/`file_serve`. Fini = une URL de doc coffre expire après TTL (test) ; ownership toujours vérifié.
- [ ] **SEC-RESID-2 — Audit XSS frontend** (P1) — Fini = chaque `dangerouslySetInnerHTML`/`innerHTML` sanitisé ou justifié ; éditeur mémoire testé sur payload `<script>`/`<img onerror>` (pas d'exécution).
- [ ] **SEC-RESID-5 — Alerting Sentry** (P1) — Fini = `SENTRY_DSN` câblé, exception volontaire visible dans Sentry.
- [ ] **SEC — Validators Pydantic stricts** (P1) — Fini = `email` et `siret` (14 chiffres) rejetés en `422` sur entrée invalide (test) ; câblés sur création profil/organisation.
- [ ] **SEC-RESID-4 — Rate limit par `user.id`** (P2) — Fini = `key_func` utilise `user.id` ; bucket `auth/sync` à 5/min ; dépassement → `429`.
- [ ] **SEC-RESID-3 — CSP report endpoint** (P2) — Fini = `/api/csp-report` reçoit + logge une violation ; `report-uri`/`report-to` dans la CSP.
- [ ] **SEC — Durcissement prod** (P1, cf. `docs/DEPLOYMENT.md`) — Fini = fail2ban + Cloudflare (DDoS/WAF) actifs en prod, vérifiés.
- [ ] **RGPD** (P1) — Fini = hébergement UE confirmé ; DPA Anthropic signé ; mentions légales + politique de confidentialité publiées et liées au footer.

---

## 💶 Coût & robustesse IA

- [ ] **Coût mémoire < €0,50 via caching + profil vivant** (P1) — Réalité mesurée : **~€0,90 / mémoire full-Sonnet** (DCE Gueux ; vs ~€6 Opus, cf. `docs/comparaison-memoire-AB/RESULTAT.md`). Fini = mesure réelle loggée **< €0,50 / mémoire** (cache_read effectif + profil stable), sans perte de densité normative.

---

## 🧭 Produit — moyen/long terme (P2/P3)

- [ ] **Notifications sobres `[C23]`** (P2) — In-app + email : mémoire prêt, J-3/J-1, doc expire, relance 30j (« avez-vous eu un retour ? »). Fini = chaque déclencheur envoie la notif correspondante (test) ; jamais de marketing.
- [ ] **Détection qualifications manquantes** (Qualibat/RGE requis vs détenu) (P2) — Fini = alerte quand une qualif requise par le DCE manque au profil.
- [ ] **Templates mémoire org-level** (Bibliothèque, plan Pro+) (P2) — Fini = un mémoire marqué « référence » est réutilisé sur un nouveau projet.
- [ ] **Auto-remplissage DC1/DC2/DUME** depuis profil (P2) — Fini = un PDF DC1 rempli sans ressaisie sur un profil test.
- [ ] **API publique v1** (P2) — Fini = appel authentifié par clé API documenté + rate limit testé.
- [ ] **Landing pages SEO** (P2) — Fini = pages publiques en ligne et indexables.
- [ ] **Bench DPGF (DECP data.gouv.fr)** (P3) — *lecture de fourchettes de marché, JAMAIS de conseil de prix* — Fini = fourchette informative affichée pour un code CPV test.
- [ ] **Intégration ERP BTP** (Sage Batigest / Codial / Onaya) (P3) — Fini = export DPGF ouvert sans erreur dans un ERP cible.
- [ ] **SSO SAML** (plan Entreprise) (P3) — Fini = login SSO test réussi.
- [ ] **Multi-langue (EN/ES)** (P3 — marché FR prioritaire).

---

## 🗓️ Roadmap V1.5+ (HORS V1 — déclassé, cf. PRD §9.2)

Ne PAS construire en V1 : multi-utilisateurs Business (rôles) · Mode Groupement GME (#89) · auto-suggestions RSE 2026 (#92) · RAO prédictif (#86) · ancrage juridique profond (jurisprudence CE/CAA/TA) · **Synorix Score qualité mémoire /100 (LLM)** · veille AO multi-sources (BOAMP/DECP) · veille réglementaire RAG Phase 4 · dépôt direct plateformes · prélèvement SEPA (post-migration d'entité).
