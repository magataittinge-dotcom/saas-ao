# Raw NotebookLM extract — Skill #39 `extraction-memoire-importe`

**Captured:** 2026-06-01
**Operator:** Claude Code (build session — Phase 4 memoire)
**Notebook:** N3 `Synorix - 3 - Memoires Techniques Gagnants BTP` (43615791)
**Purpose:** Build-time source of truth. Reformulated downstream; not loaded at runtime.

---

## Q1 — Parsing structurel d'un mémoire libre + indices de section/métier (N3, 43615791)

**Question posée :**
> Comment parser structurellement un mémoire technique BTP libre (Word/PDF) pour identifier ses sections sans table des matières fiable ? Quels indices (titres, mots-clés) permettent de découper et tagger chaque paragraphe par section et corps de métier ?

**Réponse NotebookLM (extraits) :**

**Mots-clés indices par SECTION :**
- **QSE — Sécurité** : PPSPS, sécurité, EPI (casques, gants, harnais), balisage, prévention, chutes, inspections.
- **QSE — Qualité** : autocontrôle, points d'arrêt, SOPAQ, réception, levée des réserves, fiches techniques.
- **QSE — Environnement/Déchets** : SOGED, SOSED, tri sélectif, DIB, bennes, traçabilité, BSDD, recyclage, nuisances sonores, poussières, bilan carbone.
- **Planning et Délais** : diagramme de Gantt, rétroplanning, délais, jalons, semaines, intempéries, chemin critique.

**Indices pour tagger par CORPS DE MÉTIER (normes + lexique technique spécifique) :**
- **Gros Œuvre / Maçonnerie / Terrassement** : Eurocodes (0 à 9), DTU 13.11 (fondations), DTU 21 (béton armé), Qualibat 2113/2114, béton, élévation, planchers.
- **Couverture / Étanchéité / Zinguerie** : série DTU 40, Qualibat 3522/7131, test fumigène, thermographie, mise en eau, bac acier, points singuliers.
- **Façade / ITE** : DTU 45.2, ETICS, AQC, pont thermique, test d'arrachement, enduit mince, pare-vapeur.
- **Menuiserie** : DTU 36, CEKAL, Acotherm, pose en applique, pose en feuillure, calfeutrement.
- **Électricité / Courants forts et faibles** : NF C 15-100, Qualifelec, schéma unifilaire, habilitations B0/H0/BR.
- **Peinture / Plâtrerie / Sols** : DTU 59.1 (peinture), DTU 25.41 (plâtrerie), COV, Ecolabel, calepinage.

**Heuristique de tag combiné :**
Un paragraphe avec titre numéroté (ex : *4.1 Mode opératoire*) + mots "ETICS", "test d'arrachement", "DTU 45.2" + structure d'action ("Nous fixons") → tag automatique : **[Section : Méthodologie] + [Métier : Façade/ITE] + [Statut : Bloc Réutilisable]**.

**Stratégie de découpage sans TDM fiable :** s'appuyer sur les titres numérotés / mises en forme de titre, puis sur la densité de mots-clés de section, et confirmer le corps de métier par la présence de normes spécifiques.
