# Raw NotebookLM extract — Skill #2 `detection-date-limite`

**Captured:** 2026-05-31 — N2 (7a661d76) + N1 (08531eb6). Build-time only.

## Q1 (N2) — Date limite dans le RC
- N2 : info précise **absente du corpus**. Grounded : date limite récapitulée dans l'**avis de marché** [1] ; le **RC indique les modalités de candidature** et documents à remettre [2].
- Hors corpus (signalé par N2, pratique courante MP, à traiter en heuristique) : date en page de garde du RC + article « Conditions de remise des offres » / « Modalités de transmission des plis ». Formulations : « Date et heure limites de réception des plis : le JJ/MM/AAAA à HH:MM », « avant le [date] à [heure] (Heure de Paris) ». Fuseau serveur plateforme = Heure de Paris métropole.

## Q1bis (N1) — Primauté des pièces + horodatage
- **RC fait autorité** pour les délais, modalités, calendrier [1, 2]. **AAPC** annonce publiquement [3]. **AE** matérialise l'engagement (prix), ne régit pas les délais [1, 4].
- Dépôt dématérialisé : **horodatage du serveur** du profil d'acheteur fait foi [5] ; conserver l'**accusé de réception** [6].
- Fuseau : CCAG MOE — « le fuseau horaire utilisé est celui de la livraison ou de l'exécution » [7] (computation des délais d'exécution).
- **Hors corpus N1** (connaissances générales, à vérifier) : divergence AAPC/RC → jurisprudence CE *Département de l'Eure* (24 fév. 2016, n° 394945) : offre remise avant la date la plus tardive figurant dans l'un des documents protégée (égalité de traitement). Fuseau légal = heure de l'acheteur (Paris métropole / locale Outre-mer), serveur synchronisé UTC.

## Build notes
- Sonnet (raisonnement multi-docs + divergence). notebook_sources = ["N2","N1"].
- Règle stricte respectée : la date n'est jamais inventée (not_found si absente). La jurisprudence CE n°394945 est renseignée à titre indicatif dans le champ `divergence`, signalée hors corpus, jamais tranchée d'office.
- **Divergence registry/NotebookLM à arbitrer** : la date-limite n'est PAS solidement couverte par N2 (corpus pièces admin). Suggestion Mohamed : enrichir N2 (ou N1) avec exemples de RC réels + jurisprudence délais, ou re-router #2 vers N1.
