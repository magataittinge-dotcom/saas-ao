# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Deux personas, une seule interface (décision ferme : pas de bascule « mode pro / mode débutant », la couche d'aide s'adapte, pas l'écran).

- **Le Pro** — bureau d'études, conducteur de travaux, chargé d'appels d'offres dans une entreprise BTP de 20 à 200 salariés. Répond à 5 à 15 AO par mois. Connaît le DCE, le CCAG Travaux, les critères de notation. Sa douleur : le temps, pas le savoir. Il saute aux résultats, édite agressivement et juge sur la qualité du livrable ; tout détail doit être défendable devant un évaluateur.
- **Le débutant ambitieux** — dirigeant de PME, souvent artisan fondateur, 5 à 15 salariés. 1 à 3 AO par mois, qu'il perd le plus souvent. Submergé par le volume du DCE et le vocabulaire administratif, il craint le rejet pour un vice de forme. Il lit chaque message, suit le fil, et panique dès qu'une chose paraît « manquante ».

Situation d'usage confirmée : le patron utilise parfois Synorix **sur son téléphone, sur chantier** (plein soleil, connexion faible, doigts peu précis). Le bureau reste le poste principal.

## Product Purpose

Synorix transforme la réponse à un appel d'offres public BTP en France, qui coûte aujourd'hui 3 à 7 jours de travail expert ou 2 000 à 8 000 € de consultant, en un parcours guidé qui livre un dossier déposable en moins d'une demi-journée, à un niveau qu'un chargé d'AO senior signerait.

Depuis un DCE brut (zip), le produit détecte les lots, analyse les pièces (exigences avec source, page et priorité), vérifie la conformité formelle, génère un mémoire technique personnalisé d'une vingtaine de pages, puis exporte Word, PDF et ZIP complet dans l'ordre du règlement de consultation.

Succès : un dossier déposé, puis gagné. Le produit suit le cycle de vie des AO (statuts, statistiques gagné/perdu, relance 30 jours après le dépôt).

## Positioning

- **Le mémoire technique généré, personnalisé et déposable** est le coin d'entrée : les concurrents SaaS (SPIGAO, Intescia) aident sur les questionnaires administratifs et ne génèrent pas de mémoire ; les consultants le font à la main et cher.
- La personnalisation vient des données du client lui-même (profil entreprise, moyens, certifications, références chantiers, coffre-fort) ; rien n'est tiré des autres clients.
- Chaque exigence extraite cite sa source dans le document original (document, page, article) : la confiance repose sur la vérifiabilité, pas sur un score de fiabilité affiché.
- **Frontière chiffrage (ferme)** : Synorix ne commente ni ne conseille jamais les prix. Il lit le contrat (faits du CCAP) et vérifie la conformité formelle de la DPGF. Pas de calculateur d'offre anormalement basse. Synorix est un éditeur, pas un juge du prix.
- Les différenciateurs V1 sont **déterministes et à coût API nul** : Synorix Score go/no-go, traduction trésorerie du CCAP (avance, délais de paiement, retenue de garantie, pénalités), rétro-planning, statistiques gagné/perdu, calculateur de retenue de garantie. Aucun score n'est produit par un LLM.
- Positionnement « premium silencieux » : logiciel payant qui fait le travail, ne demande jamais de service au client, ne cite jamais la communauté des clients.

## Operating Context

- **Matière première** : le DCE (RC, CCAP, CCTP, DPGF, AE, annexes), souvent un zip de plusieurs dizaines de fichiers ; plusieurs lots par consultation, l'entreprise ne répond qu'à certains.
- **Unité de travail** : 1 lot = 1 mémoire = 1 unité de quota.
- **Fil d'un AO** (écran, dans cet ordre) : Dépôt · Lots · Décider · Pièces · Plan · Rédiger · Export. Ce fil vit dans la page de l'AO et **n'apparaît jamais dans la barre de navigation**.
- **Barre de navigation** : cinq entrées nommées sous l'icône : Accueil · Mes AO · Mon entreprise · Coffre-fort · Paramètres ; `[+ Nouvel AO]` hors nav ; jauge de quota vers Paramètres > Abonnement ; déconnexion dans le menu du compte. Équipe et Mes références sont des accès de Mon entreprise. Source unique : `frontend/src/components/layout/navigation.ts`. Un futur onglet « Cerveau » est prévu à la place de Mon entreprise.
- **Mon entreprise** : couche stable de l'entreprise (Identité / Moyens / Certifications) lue au moment de la génération ; les modifications faites depuis un mémoire restent locales par défaut, avec une case « mettre à jour mon profil ». Onboarding progressif : le profil se complète en travaillant, jamais de long formulaire au départ ; un Mon entreprise vide a pour seule action « Commencer par votre SIRET » (vérifié via l'API Sirene INSEE).
- **Coffre-fort** : pièces administratives (Kbis, URSSAF, décennale…) centralisées, alertes avant expiration, liées à la checklist de candidature ; les documents déposés lors d'un AO y sont rangés automatiquement.
- **Veille** : avis BOAMP sur l'accueil, filtrés par zone et activité.
- **Livrables** : mémoire Word et PDF, dossier ZIP ordonné selon le RC, fiches entreprise PDF / Word / Excel. Dépôt final sur la plateforme de l'acheteur, hors Synorix.
- **Rituel d'évaluation** : le client juge le mémoire comme le ferait l'évaluateur du marché, critère par critère ; le sommaire du mémoire se rattache aux sous-critères du règlement.
- **Équipe** : 1 poste en Pro, 5 en Business.

## Capabilities and Constraints

**Offre et paiement (confirmés, PRD v3.0 du 2026-07-01)**
- Grille du 11/11/2026, plus aucune offre illimitée : Essentiel 149 €/mois HT, 5 analyses + 5 mémoires par mois. Pro 349 €/mois HT, 1 utilisateur, 30 analyses + 30 mémoires par mois. Business 599 €/mois HT, 5 utilisateurs, 70 analyses + 70 mémoires par mois. 1 AO offert à la création du compte. Source unique : `frontend/src/lib/offres.ts` et `backend/services/quota.py`.
- Dépassement en Pro : blocage doux + proposition de montée en gamme, jamais de facturation à l'unité.
- Paiement par carte uniquement (Stripe), pas de SEPA en V1.

**Fonctionnel livré**
- Pipeline complet dépôt → lots → analyse → pièces → plan → mémoire → export ; éditeur de mémoire avec réécriture ciblée de paragraphe (Reformuler, Plus technique, Plus concis, Insister sur…), plafonnée à 60 par jour et par organisation ; « Refaire cette partie » plafonné à 10 par 24 h ; relecture sans IA du mémoire.
- Différenciateurs déterministes listés ci-dessus ; checklist à trois niveaux de gravité (optionnel / recommandé / bloquant) ; export ZIP désactivé tant qu'une pièce bloquante manque, avec confirmation explicite si l'utilisateur force.
- Thème clair et nuit déjà en place ; « Réduire les animations » respecté par une règle globale.

**Règles de ton (toutes les chaînes visibles)**
- Synorix travaille à la 3ᵉ personne (« Synorix analyse », « Synorix a préparé »). Jamais de demande de service (« Aidez-nous à… »), jamais d'allusion aux autres clients ni à l'amélioration de l'IA par les données.
- Mots interdits : « manquant », « absent », « incomplet », « défaillant » → « À ajouter », « À téléverser », « À compléter ». Pas de point d'exclamation, pas d'« Attention ! », pas d'« URGENT ». Toute friction se présente avec une action, jamais comme une alarme.
- Pas de score de fiabilité visible. Pas de « mode débutant / mode pro ».
- Vocabulaire : « Synorix » (jamais « le SaaS »), « AO », « skill », « coffre-fort », « lot ». Tout en français.

**Technique**
- Front React 18 + TypeScript strict + Tailwind + shadcn/ui ; API FastAPI + PostgreSQL + Redis + Celery ; IA Claude (Haiku 4.5 routage et reformulation, Sonnet 4.6 extraction, Sonnet 5.5 génération et réécriture). Déploiement VPS Hostinger.
- Sécurité by-design : isolation multi-tenant stricte (`org_id` sur chaque requête, tests cross-org), coffre-fort hors webroot avec URLs signées, validation Pydantic, limitation de débit, secrets en variables d'environnement, données en UE, logs sans données personnelles.
- Coût mesuré : environ 2,30 € par analyse complète et moins de 1 € par mémoire ; le produit ne doit pas réintroduire de troncature naïve du DCE.

**Décisions ouvertes**
- Onglet « Cerveau » (bloc 8) : place réservée, contenu non défini.
- Synorix Score qualité de mémoire /100 par LLM : reporté en V1.5.
- Ancrage juridique profond, mode groupement, suggestions RSE : roadmap V1.5+.

## Brand Commitments

**Ambition (fondateur, 2026-11-09) :** un design du niveau d'Apple ou de Samsung, qu'on ne puisse pas prendre pour un modèle généré par IA. L'abonnement coûte plusieurs centaines d'euros par mois : le design doit inspirer confiance.

**Signature visuelle :** le visage de Mon entreprise, et un fond d'aurores boréales discrètes qui bougent lentement sans prendre de place.

**Contraintes :**
- Mots positifs partout : jamais « manquant », « incomplet », « absent ».
- Chaque couleur a un sens : règle de référence dans `.claude/echange/sprint-ozcan/maquettes-mes-ao/COULEURS.md`.

Engagements confirmés par le fondateur le 2026-11-09, dans la perspective d'une refonte visuelle :

- **Le nom Synorix.**
- **Le visage animé de « Mon entreprise »** (clips dans `frontend/public/visage/`, posters et effet de parallaxe) : il reste.
- **Un fond d'aurores boréales discrètes** : contrainte posée par le fondateur, **pas encore implémentée**. Il doit rester très léger, ne jamais gêner la lecture, et se couper quand la connexion est faible ou que l'utilisateur réduit les animations.
- **Les modes clair et nuit**, tous deux de première classe.
- **Les règles d'accessibilité existantes** (voir section dédiée).
- **Les règles de ton** du PRD §7, résumées ci-dessus : elles font partie de la marque.

Tout le reste peut évoluer dans la refonte : logo actuel (`frontend/public/assets/logo-synorix.png`), couleurs, polices, composants. Le référentiel `docs/design/archive/DESIGN_SYSTEM.md` (cyan, DM Sans, archivé le 9/11/2026, remplacé par `DESIGN.md`) décrit un état antérieur au code actuel (Inter + Bricolage Grotesque, thème clair/nuit du 30/10) ; aucun des deux n'est contraignant.

## Evidence on Hand

- **Stade commercial : pré-lancement.** Aucun client payant, aucun témoignage, aucun logo client, aucun chiffre d'usage réel. « Ozcan » est le premier pilote / prospect. **Ne jamais inventer** de témoignages, de logos « ils nous font confiance », de nombres de clients, de taux de gain ni de références presse.
- **Preuves réelles utilisables** : parcours complet validé sur de vrais DCE (dossier « Gueux », plusieurs lots), avec mémoires réels de 40 à 46 pages, 0 placeholder, passages surlignés rattachés à leurs sources ; coûts et durées mesurés (analyse ≈ 2,30 €, mémoire ≈ 0,87 € en 169 s). Captures floutées dans `.claude/echange/sprint-ozcan/` (hors dépôt public).
- **Base d'expertise** : 86 skills V1 appuyées sur 8 notebooks NotebookLM validés (193 sources), socle RAG du CCP (1 793 articles indexés). Peut être cité comme mécanisme, pas comme certification.
- **Assets existants** : `frontend/public/assets/` (logo, hero webp, boucles d'analyse webm, têtes animées), `frontend/public/visage/` (4 clips du visage), `frontend/public/legal/` (mentions légales, CGU, confidentialité).
- **Comparatif concurrentiel** : SPIGAO / Intescia (questionnaires administratifs, pas de mémoire), consultants (2 000 à 8 000 € par réponse) ; source PRD §1.4, à présenter comme positionnement, pas comme benchmark mesuré.

## Product Principles

1. **Le livrable doit être défendable devant l'évaluateur.** Chaque exigence cite sa source ; chaque partie du mémoire se rattache à un sous-critère ; rien d'approximatif n'est affiché comme certain.
2. **Synorix fait le travail et le dit calmement.** Troisième personne, action plutôt qu'alarme, jamais de vocabulaire anxiogène ni de demande de service au client.
3. **Les faits du contrat, jamais le conseil de prix.** Lecture du CCAP, conformité formelle de la DPGF, scores déterministes ; aucun avis sur le chiffrage.
4. **Une seule interface pour le Pro et le débutant.** La structure ne change pas selon l'utilisateur ; c'est la couche d'aide qui s'adapte.
5. **Les données du client restent chez le client.** Isolation stricte, aucune mutualisation visible, confidentialité comme posture par défaut.

## Accessibility & Inclusion

- **Cible : WCAG 2.1 AA**, sans audit RGAA formel pour l'instant.
- **Usage téléphone sur chantier** : textes lisibles en plein soleil (contrastes forts), zones tactiles d'au moins 44 px, pages légères sous connexion faible (le fond d'aurores doit rester très léger et se désactiver au besoin). Aucun débordement horizontal jusqu'à 390 px de large.
- **« Réduire les animations » toujours respecté** : règle globale dans `frontend/src/styles/theme.css` (animations et transitions coupées, hors spinners).
- Modes clair et nuit tous deux conformes en contraste.
