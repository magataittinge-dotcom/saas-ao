# Cerveau de l'entreprise — conception (bloc 7, nuit du 27 au 28/10/2026)

Aucun code. Aucun appel payant. Aucune nouvelle recherche web : les concurrents viennent de `nuit-25-10/C-autogenai-et-concurrents.md` et `D-memoire-technique.md`. Les chiffres de coût sont des **estimations sur les jetons** (§5), à calibrer à la première tranche du bloc 8. Les 12 questions du §9 sont **tranchées** (réponses de Mohamed, 28/10/2026) ; le §9 consigne les décisions.

## 1. En bref

- Le patron dépose tout en vrac. Synorix lit, range, puis montre « Voici ce que j'ai compris ». **Rien n'entre dans un mémoire sans son accord.**
- Ce que Synorix a compris forme un **graphe** : personnes, chantiers, clients, techniques, matériel, qualifications, anciens AO, tous reliés. **Chaque fait garde sa source** (document, page, phrase), ou « saisi par vous ».
- **Décision d'architecture principale** : les tables actuelles (`team_members`, `references`, `documents`, champs de `organizations`) **restent la vérité** lue par le générateur de mémoire. Le graphe s'ajoute à côté, avec un pont vers ces lignes. Pas de bascule générale.
- Les paragraphes des anciens mémoires deviennent une **bibliothèque** : le mémoire part d'eux, dit d'où vient chaque partie, et propose « Votre version / Version Synorix ».
- **Coût d'extraction** : environ 0,08 € pour un ancien mémoire de 40 pages, 0,005 € pour un CV, **environ 0,47 € pour l'import complet de la maquette** (31 documents), 2,8 € pour dix ans d'historique (Haiku 4.5). Négligeable face à 349 €/mois.
- **RGPD** : le patron est responsable de traitement, Synorix sous-traitant. Voyage AI est ajouté à la politique de confidentialité et la rétention des sauvegardes y est alignée sur 6 mois (fait le 28/10). Restent : le contrat de sous-traitance (T9) et l'avenant Anthropic (action de Mohamed) (§6).
- **Graphe au téléphone** : 300 à 600 nœuds, WebGL 1 sans bibliothèque (le module du visage coûte 0,39 ms par image), positions calculées sur le serveur (§7).
- **Bloc 8** : 10 tranches, environ **31 jours-agent** (§8). Le cœur utile (import, vérification, suppression) en fait environ 16.

## 2. Comparaison avec `maquettes-memoire/`

Les 10 captures ont toutes été regardées. Reprendre le comportement et la structure, pas les pixels.

### Ce qui est repris tel quel

| Élément de la maquette | Pourquoi on le garde |
|---|---|
| Une seule zone « Donnez à Synorix ce que vous avez déjà », dossier entier accepté | C'est le besoin du patron de TPE. AutogenAI l'annonce aussi pour une grande entreprise (3 ans d'offres chargés au départ, *Dit*). |
| Trois étapes : Déposer, Synorix lit et range, Vous vérifiez. « Vous pouvez quitter cette page » | Les lectures longues passent par Celery. Les notifications existent (`services/notifications.py`). |
| Deux faits qui se contredisent : **on demande une fois**, la réponse vaut pour tous les mémoires suivants | GovDash signale aussi les contradictions entre pièces (*Dit*, C §5). Le « une fois » est mémorisé (§4, `kb_fact`). |
| Source sur chaque ligne (« CV · p. 1 ») et fiche qui ne masque pas l'élément choisi | Règle du projet : toute exigence garde sa source. |
| Six parties et leurs couleurs ; l'ambre réservé à ce qui demande une action | Cohérent avec le dashboard du bloc 11 (six bulles, six ancres du visage). |
| Bibliothèque par thème : origine, « repris N fois » | C'est la fonction F8 de C (« une bibliothèque qui se remplit seule »). |
| Votre version / Version Synorix, côte à côte ou phrase par phrase, raison sourcée | Plus lisible que le « Regenerate » d'AutogenAI, qui ne montre pas la raison des changements (C F1). |
| Style d'écriture mesuré (« nous » 9 phrases sur 10, 17 mots par phrase) | Mesure déterministe, 0 € d'IA. |
| Téléphone : onglet Cerveau en barre du bas, fiche en tiroir | Cohérent avec le bloc 10. |

### Ce qui change, et pourquoi

| # | Maquette | Conception | Pourquoi |
|---|---|---|---|
| 1 | Cerveau en points, forme imposée | **Décidé (Q1)** : graphe à forme libre, groupes posés sur les six ancres de ton visage, visage en filigrane | Une forme de cerveau ou de visage impose des positions et fait perdre la lisibilité dès 300 nœuds. |
| 2 | « Cerveau » remplace « Mon entreprise » et « Mes références » dans la barre latérale | Il remplace aussi « Bibliothèque ». « Coffre-fort » reste | **Décidé (Q2)** : `CLAUDE.md` et le PRD v3.0 (MON CAPITAL : Mon entreprise, Mes références, Coffre-fort, Bibliothèque) sont mis à jour ; anciennes adresses redirigées. |
| 3 | « 0 parties sur 6 vérifiées » | « 6 parties à vérifier » | Même défaut que le « 0/N » de l'export, que tu as interdit le 25/10. Formulation positive. |
| 4 | « Tout est juste » sur chaque partie | Gardé, mais **sans effet sur les faits en contradiction ni sur les faits mal ancrés** : ceux-là se traitent un par un | Un bouton qui valide 126 paragraphes sans lecture est le piège du « Couvert automatique » que tu as refusé. |
| 5 | « Vos mots 71 % » | Défini : part des phrases de la version retenue **identiques à une phrase de la bibliothèque** (comparaison de texte, pas d'IA) | Un chiffre affiché doit se recalculer. |
| 6 | « Ce que je découvre » : « votre point fort le plus net » | Comptes seulement (« 17 chantiers en site occupé depuis 2019 »), sans jugement | Synorix est un éditeur, pas un juge. |
| 7 | Photos de chantier « classées par chantier » | Classement par nom de dossier, date et lieu de la photo, **sans reconnaissance d'image**, sans visage | Pas de biométrie. Une vision par IA reste possible en option, à la demande (0,005 € la page, §5). |
| 8 | Écrit directement dans le profil | **Tout reste « proposé » tant que le patron n'a pas validé**, puis écrit dans les tables actuelles | Aucune écriture directe : même principe que `profile_structurer.py`. |
| 9 | Le tri de 5 à 7 flux (décret n° 2021-950) cité comme raison | Les raisons viennent du DCE (CCTP, RC) ou du corpus réglementaire déjà indexé (`rag_chunks`), jamais d'une règle écrite à la main | Règle du projet : règles métier sourcées. |

## 3. Le parcours

**1. Dépôt en vrac.** PDF, Word, Excel, photos, dossier entier. Contrôles existants : type et taille, octets magiques, garde anti-zip-bomb. Chaque fichier entre dans le coffre-fort (hors webroot, URL signée) et reçoit une empreinte pour éviter les doublons.

**2. Synorix lit et range** (tâche Celery détachée, avancement par `progress_bus`, reprise après coupure par la réconciliation existante). Dans l'ordre :
1. **Texte sans IA** : pdfium isolé, python-docx, tableurs (garde existante). Les scans passent par un OCR local (Q4 : comparatif RapidOCR / Tesseract d'abord, T2).
2. **Type du document** sans IA (nom, mots-clés, `vault_classifier`) ; Haiku seulement pour les « autre ».
3. **Masquage RGPD avant tout envoi** : numéro de sécurité sociale, IBAN, e-mails, téléphones, dates de naissance remplacés par des étiquettes (§6).
4. **Extraction** par type de document, schéma Pydantic strict, Haiku 4.5. Garde déterministe après le modèle : toute valeur dont les termes ne se retrouvent pas **mot pour mot** dans le texte source est écartée (même méthode que `profile_structurer.py`). Le texte exact et la page sont ancrés avec `excerpt_anchor`.
5. **Rapprochement** : « J. Bervel » et « Julien Bervel » sont la même personne. Noms normalisés, SIRET, dates ; correspondance approchée (`rapidfuzz`, MIT). Au-dessus de 0,92 : fusion proposée ; entre 0,80 et 0,92 : question posée au patron ; en dessous : deux éléments.
6. **Contradictions** : même élément, même champ, deux valeurs normalisées différentes → « point à trancher ».
7. **Rangement provisoire** : tout est « proposé ». Aucun embedding à ce stade : on ne dépense rien sur ce que le patron va peut-être corriger.

**3. « Voici ce que j'ai compris ».** Les contradictions d'abord, puis six parties : identité, équipe, références, bibliothèque, style, coffre-fort. Chaque ligne montre sa source ; le patron corrige ou confirme. Il peut finir plus tard : ce qui n'est pas confirmé reste « proposé » et n'entre dans aucun mémoire.

**4. Validation → Cerveau.** À la validation, les faits confirmés sont **écrits dans les tables actuelles** (`team_members`, `references`, `documents`, champs de l'entreprise). Le générateur de mémoire n'a donc rien à apprendre de neuf. Puis : embeddings des paragraphes, calcul des positions du graphe, notification.

**5. « Votre version / Version Synorix »** (dans le mémoire).
1. Pour chaque partie, on cherche dans la bibliothèque de **cette** entreprise : mots-clés du lot et du critère, recherche hybride (le retriever du lot 7, filtré par `org_id`).
2. Le générateur reçoit ces textes **après** le préfixe stable (le cache de prompt est conservé) avec la consigne : « partir de ces textes, ne changer que ce que le DCE impose, donner la raison et la source de chaque changement ».
3. **Retiré / ajouté** : calculé par comparaison de phrases, pas par le modèle. Le modèle fournit seulement le texte adapté et la raison numérotée.
4. Garde : tout chiffre ajouté doit exister dans un fait validé, le DCE ou le corpus. Sinon il est écarté et signalé « chiffre à vérifier ».
5. Étiquette d'origine par partie, au sens de Penko (« Cadre imposé », « Proposition IA », « Mémoire ref ») mais en mots de Synorix : **Vos mots / Vos données / Adapté / Rédigé par Synorix**. Le patron choisit phrase par phrase.
6. Drapeau `MEMOIRE_BIBLIOTHEQUE`, éteint par défaut : éteint, le mémoire est **octet pour octet celui d'aujourd'hui** (même précaution que `RAG_ENRICHMENT`).

**6. Enrichissement après chaque AO.** Quand l'AO passe en « Déposé » (`project_status`) :
- les paragraphes que le patron a retouchés (différence entre le texte généré et le texte final) sont proposés, **pré-cochés** ; une seule question : « Garder vos paragraphes retouchés pour vos prochains mémoires ? » ;
- l'AO devient un nœud « Clients et AO » (client, lot, date) ;
- une référence n'est **proposée** que si l'AO est gagné, avec « à compléter » pour les champs inconnus ;
- 0 € d'IA pour la différence ; environ 0,007 € si Haiku range 20 paragraphes par thème.

## 4. Modèle de données (Postgres + pgvector)

Constats sur l'existant :
- `rag_chunks` (migration 0003, `vector(1024)`, Voyage `voyage-context-3`, HNSW cosinus, FTS français) est **global, sans `org_id`** : c'est le corpus réglementaire. **La mémoire de l'entreprise doit être dans d'autres tables**, avec `org_id` partout.
- Les identifiants sont des chaînes UUID, les tests tournent sous SQLite : les colonnes `vector` s'ajoutent par migration réservée à Postgres, et la recherche passe par du SQL direct (comme `services/rag/retriever.py`).
- Dernière migration : `0025`. Les suivantes : `0026` à `0028`.

### Tables (7 nouvelles)

| Table | Rôle | Colonnes essentielles |
|---|---|---|
| `kb_import` | un dépôt | `org_id`, état (déposé / lecture / à vérifier / validé), compteurs, jetons entrée/sortie, coût estimé |
| `kb_import_file` | un fichier du dépôt | `import_id`, `document_id` → `documents` (coffre-fort), type détecté, pages, état, empreinte |
| `kb_node` | un élément du graphe | `org_id`, `kind` (personne, chantier, client, technique, materiel, qualification, ao), libellé, libellé normalisé, `attrs` JSONB validé par Pydantic selon `kind`, `statut` (proposé / validé / rejeté / archivé), `fusionne_dans`, **pont `ref_table` + `ref_id`**, position `x`, `y`, `fts` |
| `kb_edge` | un lien | `org_id`, `src_id`, `dst_id`, `rel` parmi une liste fermée (travaille sur, a pour client, emploie, détient, prouvé par, cité dans…), `origine` (import / saisie / ao) |
| `kb_fact` | **la source de chaque fait** | `org_id`, `node_id`, `champ`, `valeur` JSONB, `valeur_norm`, `statut` (proposé / validé / contesté / rejeté), `source_type` (document / saisie / ao_retouche / existant), `document_id`, `page`, `debut`, `fin`, `project_id`, `source_supprimee_le` |
| `kb_paragraph` | un paragraphe de la bibliothèque | `org_id`, texte, empreinte, `theme_node_id`, origine, `document_id` + section ou `project_id`, `remplace_id` (version précédente), `embedding vector(1024)`, `fts` |
| `kb_paragraph_use` | où il a servi | `paragraph_id`, `project_id`, section, choix (votre version / Synorix / mélange), date |

Le style (`kb_style`) est un JSONB sur l'entreprise : une ligne par entreprise, pas besoin d'une table de plus.

### Règles qui tiennent le modèle

- **Isolation entre entreprises au niveau de la base** : `kb_node` a une contrainte unique `(org_id, id)`, et `kb_edge`, `kb_fact`, `kb_paragraph` y pointent par clé étrangère composite `(org_id, …)`. Un lien d'une entreprise vers un nœud d'une autre est **impossible**, pas seulement testé. Tests cross-org systématiques sur chaque route (règle du projet).
- **Aucun fait sans source** : contrainte `CHECK` par type de source (corrigée le 28/10 : la version « saisie ou `document_id` » refusait trois cas légitimes) :
  - `document` : `document_id` renseigné **ou** `source_supprimee_le` renseigné (source supprimée : `document_id` est alors NULL, la mention « source supprimée le … » s'affiche) ;
  - `saisie` : aucune exigence de document ;
  - `existant` (reprise 0028) : `ref_table` + `ref_id` du nœud renseignés (la ligne d'origine de `team_members`, `references` ou `documents` est la source) ;
  - `ao_retouche` : `project_id` renseigné, `document_id` NULL accepté.
  Dans tous les cas, `source_supprimee_le` n'est jamais renseigné sans que `document_id` soit NULL. Le fait garde sa valeur validée quand la source disparaît (suppression du CV d'origine, Q6) ; Pour un CV, on stocke page et position, pas l'extrait : la vue relit le document au moment de l'affichage, pour ne pas dupliquer de données personnelles.
- **Trancher une fois** : index unique partiel — un seul fait `validé` par `(node_id, champ)` pour les champs à valeur unique. Les valeurs refusées restent (`rejeté`) pour ne pas être reproposées au prochain import.
- **Paragraphes hors graphe** : un thème (« Gestion des déchets · 9 paragraphes ») est un nœud ; les paragraphes sont des lignes de `kb_paragraph`. Le graphe reste de 300 à 600 nœuds même avec 3 000 paragraphes. La maquette (333 éléments, 740 liens pour 31 documents) donne environ 11 nœuds et 24 liens par document.
- **Embeddings** : seulement sur les paragraphes validés, et **les noms de personnes remplacés par une étiquette avant l'envoi** (question 5).
- **Suppression** : `ON DELETE CASCADE` du nœud vers faits, liens et paragraphes liés ; les personnes sont supprimées pour de bon (§6).

### Migrations

| N° | Contenu | Retour arrière |
|---|---|---|
| `0026_kb_noyau` | `kb_import`, `kb_import_file`, `kb_node`, `kb_edge`, `kb_fact`, index, contraintes composites | `DROP TABLE` dans l'ordre inverse |
| `0027_kb_paragraphes` | `kb_paragraph`, `kb_paragraph_use` ; colonne `embedding vector(1024)`, index HNSW et GIN **seulement sur Postgres** (`dialect.name`), `IF NOT EXISTS` comme en 0003 | idem |
| `0028_kb_reprise_existant` | crée un nœud + un fait « existant » pour chaque ligne de `team_members`, `references`, `documents` ; idempotent ; ne modifie aucune table existante | supprime les lignes `source_type='existant'` |

La reprise de 0028 évite le « Cerveau vide » pour les comptes déjà actifs et prépare la contradiction entre ce que le patron a saisi et ce que le dépôt apprend.

## 5. Coût d'extraction (estimé, aucun appel payant)

**Hypothèses** : 1 page ≈ 800 jetons (français, marge comprise) ; deux passes de lecture sur un ancien mémoire (classement des paragraphes, puis éléments cités) ; sortie en JSON ; réflexion coupée. Tarifs lus dans le dépôt : Haiku 4.5 à 1 $ / 5 $ le million (`profile_structurer.py`), Sonnet 4.6 à 3 $ / 15 $ (`CLAUDE.md`). **Sonnet 5.5 et Haiku 5.5 : aucun tarif dans le dépôt, coûts « à vérifier »** ; à relever sur la grille officielle avant le bloc 8. **1 $ = 0,92 €** (hypothèse). Marge d'erreur : ±30 %.

| Document | Entrée / sortie (jetons) | Haiku 4.5 | Sonnet 4.6 | Sonnet 5.5 | Haiku 5.5 |
|---|---|---|---|---|---|
| Ancien mémoire, 40 pages | 64 800 / 4 000 | **0,078 €** | 0,234 € | à vérifier | à vérifier |
| Moyens humains et matériels, 6 pages | 5 600 / 3 000 | 0,019 € | 0,057 € | à vérifier | à vérifier |
| CV, 2 pages | 2 400 / 500 | **0,005 €** | 0,014 € | à vérifier | à vérifier |
| Liste de références, 38 lignes | 3 800 / 2 600 | 0,016 € | 0,046 € | à vérifier | à vérifier |
| Attestation ou Kbis, 2 pages | 2 400 / 250 | 0,003 € | 0,010 € | à vérifier | à vérifier |
| Page scannée lue par vision Haiku (repli) | 1 600 / 700 | 0,005 € | — | à vérifier | à vérifier |

**Import complet de la maquette** (4 mémoires de 40 pages, 1 moyens humains, 14 CV, 1 liste, 6 attestations, 5 autres ; 330 000 jetons en entrée, 33 000 en sortie, 15 000 de rapprochement) :
- **Haiku 4.5 : 0,47 €** ; avec l'API par lot (rabais de 50 %, délai plus long) : 0,24 € ;
- Sonnet 4.6 : 1,41 € ; Sonnet 5.5 et Haiku 5.5 : à vérifier ;
- embeddings Voyage des paragraphes validés : environ 0,005 € (tarif à confirmer, ordre de grandeur 0,18 $ le million de jetons).

**Gros import** (dix ans : 30 mémoires, 30 CV, 60 pièces) : 2,8 € en Haiku, 8,4 € en Sonnet.

Conséquences :
- **L'import ne consomme aucune unité de quota** (1 lot = 1 mémoire = 1 unité). Il faut seulement un plafond contre l'abus : 200 documents et 1 500 pages par dépôt, et un budget d'environ 5 € par mois et par entreprise (question 9).
- **Haiku par défaut** : la garde « mot pour mot » compense sa moindre finesse ; Sonnet seulement en reprise d'un document dont la garde a écarté trop de valeurs.
- **Étalonnage au bloc 8** : le coût réel est enregistré à chaque appel, comme `profile_structurer.py` le fait déjà. Un essai sur 5 documents inventés, **1 € au plus, coût réel enregistré, sur Haiku 4.5 ET Haiku 5.5** (Q11).

## 6. RGPD des CV et des salariés

*Ce qui suit est une conception technique, pas un avis juridique : un juriste ou un DPO doit relire avant ouverture.*

**Rôles.** Le patron est **responsable de traitement** pour les données de ses salariés ; Synorix est **sous-traitant** (art. 28). Il faut donc un **contrat de sous-traitance** dans les CGV, qui n'existe pas encore. Le patron doit informer ses salariés (art. 13-14) : Synorix fournit un modèle de note et une **case obligatoire au premier dépôt de CV** (« J'ai informé mes salariés »), sous la responsabilité du patron.

**Minimisation (art. 5-1-c).**
- Liste fermée de ce qui est extrait d'un CV : nom, rôle, années d'expérience, chantiers cités, habilitations, diplômes. **Jamais** : date de naissance, adresse, téléphone, e-mail personnel, situation familiale, photo, numéro de sécurité sociale, IBAN, aptitude médicale (donnée de santé, art. 9).
- **Masquage avant envoi à l'IA**, par expressions régulières : ces champs ne quittent pas le serveur.
- Pas de reconnaissance de visage, ni sur les CV ni sur les photos de chantier.
- Par défaut, **le CV d'origine est supprimé après validation** (case « garder dans le coffre-fort », Q6) ; seuls les faits validés restent, avec la mention « source supprimée le … » (`kb_fact.source_supprimee_le`, §4).

**Suppression (art. 17).**
- « Supprimer cette personne » efface le nœud, ses faits, ses liens, et les extraits des paragraphes qui la citent sont marqués à revoir.
- **Suppression réelle, pas seulement `deleted_at`** : le modèle actuel est en suppression douce, ce qui ne suffit pas ici. Délai d'annulation de 7 jours, puis purge.
- « Tout supprimer » : tous les nœuds et faits issus des dépôts, le texte des paragraphes, les embeddings.
- Un salarié parti passe en « archivé » : jamais proposé dans un nouveau mémoire, mais ses chantiers passés restent cités sans son nom si le patron le demande.
- Le journal d'audit enregistre l'action et l'identifiant, **jamais le nom** (règle : logs sans données personnelles).

**Sous-traitants et transferts (art. 28, 44-46).**
- La politique de confidentialité publiée liste Hostinger (France), Stripe (Irlande), Anthropic (États-Unis, DPF) et Clerk (États-Unis, DPF). **Voyage AI n'y figure pas.** Aujourd'hui Voyage ne reçoit que des textes réglementaires publics, donc rien de personnel ; avec des paragraphes d'entreprise, il en recevrait. **Décidé (Q5)** : noms remplacés par des étiquettes avant l'embedding ; Voyage ajouté à la politique (fait le 28/10, texte seulement) ; reste le contrat de sous-traitance (T9).
- Anthropic reçoit les textes extraits (masqués). La politique dit que l'API n'entraîne pas de modèles ; **action pour toi** : signer l'avenant de traitement des données d'Anthropic et vérifier la durée de conservation côté API, que je n'ai pas pu confirmer.

**Sécurité (art. 32).** Coffre-fort hors webroot, URLs signées de courte durée, isolation entre entreprises testée, chiffrement des sauvegardes (déjà en place).

**Écart à corriger.** La politique annonce « sauvegardes quotidiennes chiffrées, rétention 30 jours ». Le script `deploy/sauvegarde/synorix-sauvegarde.sh` garde 7 jours, 4 semaines et 6 mois (`restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6`). Une personne supprimée reste donc dans les sauvegardes jusqu'à six mois. **Décidé (Q10)** : texte aligné (« conservées jusqu'à 6 mois, jamais restaurées sauf sinistre »), fait le 28/10 dans `politique-confidentialite.md` ; le script ne change pas.

**Analyse d'impact (art. 35).** Probablement non requise (petit volume, pas de donnée sensible, pas de suivi), mais à faire confirmer avec le reste.

## 7. Un graphe rapide au téléphone

**Nombre de nœuds.** Cible : **300 à 600** visibles, plafond de confort **2 000 nœuds et 5 000 liens**. Au-delà, on replie par groupe (un nœud par thème ou par client) et on ne déplie que le voisinage de l'élément touché. Les paragraphes ne sont jamais des nœuds (§4).

**Technique.**
- **Positions calculées sur le serveur**, une fois, par une tâche Celery après chaque import (`networkx`, BSD ; 400 nœuds en moins d'une seconde). Enregistrées dans `kb_node.x, y`. Un nouveau nœud est placé près de ses voisins ; un recalcul complet n'a lieu qu'à l'import. Le téléphone ne calcule aucune mise en page.
- **Rendu WebGL 1 sans bibliothèque**, comme le visage : points en un tampon, liens en un seul tampon de lignes. Le module du visage mesure **0,39 ms par image pour 11 070 points** et 20,8 Ko (`F-design-synorix-intelligence.md`) ; 600 nœuds et 1 500 liens sont donc très en dessous. Cadence plafonnée à 30 images/s au téléphone, **0 image hors écran ou en mouvement réduit**, repli en Canvas 2D si le contexte WebGL est perdu (le visage a déjà `visage-canvas2d.js`).
- **Étiquettes en HTML**, 12 au plus, choisies par nombre de liens et par zoom : pas de texte dans le canvas.
- **Toucher** : détection par grille de cases sur le processeur. La fiche s'ouvre en tiroir et le graphe se décale : l'élément choisi n'est jamais masqué.
- **Données** : une seule route renvoie un JSON compact (nœuds, liens, positions) et la fiche se charge au toucher. Estimation : moins de 60 Ko compressés pour 600 nœuds.
- **Limite connue** : sur ce PC, la carte graphique perd le contexte WebGL dans Chromium ; la cadence réelle d'un téléphone se mesure sur un appareil, pas ici.

## 8. Découpage du bloc 8

Une tranche = un test vert = un commit. Estimation en jours-agent (hypothèse : un agent Sonnet 5.5, suite complète de 1 928 tests à chaque commit).

| # | Tranche | Contenu | Jours |
|---|---|---|---|
| T1 | Socle de données | Migrations 0026-0028, modèles, contraintes composites, reprise de l'existant, tests cross-org | 3 |
| T2 | Dépôt et lecture | Écran Déposer, tâche Celery, texte par type, **comparatif OCR en premier** (RapidOCR, 98,4 % mesuré le 25/10, contre Tesseract : mêmes pages, mémoire mesurée à l'échelle d'un KVM 1 ; vision Haiku en repli seulement, avec accord), masquage RGPD, progression | 4 |
| T3 | Extraction | Schémas par type, Haiku, garde « mot pour mot », rapprochement, contradictions, coût enregistré, étalonnage | 4 |
| T4 | « Voici ce que j'ai compris » | Écran, trancher une fois, validation qui écrit dans les tables actuelles, **suppression réelle d'une personne** | 3 |
| T5 | Bibliothèque et style | Paragraphes, embeddings masqués, recherche hybride filtrée, thèmes, usage, mesure du style | 3 |
| T6 | Votre version / Version Synorix | Récupération dans la bibliothèque, comparaison de phrases, raisons, origine par partie, « vos mots », drapeau éteint par défaut | 4 |
| T7 | Enrichissement après AO | Retouches proposées, nœud AO, référence proposée si gagné | 2 |
| T8 | Vue Cerveau | Route graphe, positions, rendu WebGL et repli, fiche, recherche | 4 |
| T9 | Données et RGPD | « Tout supprimer », page « Vos données », modèle de note aux salariés, contrat de sous-traitance (avec Voyage AI), case « J'ai informé mes salariés » bloquante | 2 |
| T10 | Téléphone et recette | Tiroir, onglet, mesures sur appareil, recette sur corpus inventé | 2 |
| | **Total** | | **31** |

**Ordre décidé (Q12) : blocs 9, 10, 11, puis 12 avant Ozcan ; le bloc 8 commence juste après. Prototype du graphe (demi-journée, captures clair, nuit, téléphone) avant T8.** Ordre interne recommandé : T1 → T2 → T3 → T4 (avec la suppression) → T8 → T5 → T6 → T7 → T9 → T10. T8 vient tôt : il rend visible ce que T1-T4 ont compris et sert à les valider ; il dépend de ta réponse à la question 1 et des jetons du bloc 10.
**Valeur minimale** : T1-T4 et T9 (**environ 16 jours**) donnent « je dépose, je vérifie, tout est sourcé et supprimable ». T5-T7 (9 jours) apportent le gain sur le mémoire. T8 (4 jours) apporte la vue.
**Risques** : T6 touche `memoire_generator.py`, le fichier le plus sensible du produit (drapeau éteint, test « octet pour octet »). L'OCR demande un paquet système sur le VPS. Aucune de ces tranches n'est prête pour le test d'Ozcan du 4/11.

## 9. Décisions de Mohamed (28/10/2026)

1. **Vue** : graphe à forme libre, six groupes sur les six ancres du visage, visage en points très pâle derrière (`points.bin`). Prototype d'une demi-journée avant T8, captures clair, nuit et téléphone.
2. **Barre latérale** : le Cerveau remplace Mon entreprise, Mes références et Bibliothèque ; Coffre-fort reste ; redirection des anciennes adresses ; `CLAUDE.md` et le PRD mis à jour (au bloc 8).
3. **Source de vérité** : les tables actuelles restent la vérité, le graphe est un pont.
4. **Scans** : OCR local ; comparer d'abord RapidOCR (98,4 % le 25/10) et Tesseract sur les mêmes pages, mémoire mesurée à l'échelle d'un KVM 1. Vision Haiku en repli seulement, avec accord.
5. **Voyage** : oui, noms remplacés par des étiquettes avant l'envoi ; ajouté à la politique (fait) et au contrat (T9).
6. **CV d'origine** : supprimé par défaut, case « garder dans le coffre-fort ».
7. **Avenant Anthropic** : Mohamed s'en occupe.
8. **Information des salariés** : case bloquante.
9. **Plafonds d'import** : oui (200 documents, 1 500 pages par dépôt, environ 5 € par mois et par entreprise, hors quota).
10. **Sauvegardes** : texte aligné sur 6 mois (fait).
11. **Calibrage** : 1 € au plus, documents inventés, coût réel enregistré ; Haiku 5.5 étalonné aussi.
12. **Ordre** : blocs 9, 10, 11, 12, puis bloc 8.
