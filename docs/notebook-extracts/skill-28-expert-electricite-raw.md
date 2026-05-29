# Raw NotebookLM extract — Skill #28 `expert-electricite`

**Captured:** 2026-05-27 — N4 (777badb4) + N3 (43615791). Build-time only.

---

## Q1 — Référentiels & certifications (N4)

**Réforme NF C 15-100 août 2024** : segmentation en **21 normes indépendantes**.
- **NF C 15-100-1** — Exigences générales (ex-titres 1-6).
- **NF C 15-100-10** — Bâtiments d'habitation.
- **NF C 15-100-11** — Réseaux communication (VDI, RJ45).
- **NF C 15-100-8-1** — Efficacité énergétique.
- **NF C 15-100-7-701** — Locaux avec baignoire/douche (volumes 0/1/2).
- **NF C 15-100-7-704** — Installations de chantier.
- **NF C 15-100-7-715** — Éclairage TBTS.
- **NF C 15-100-7-722** — IRVE (véhicules électriques).
- **NF C 15-100-7-729** — Locaux service électrique.

**Autres :** **NF C 14-100** (branchement réseau public/AGCP) ; **NF C 18-510** (habilitations) ; **UTE C 15-712-1** (photovoltaïque) ; **NF S 61-931** (SSI).

**Interfaces DTU :** **NF DTU 68.3** (VMC raccord. élec.) ; **NF DTU 60.1** (chauffe-eau, 30 mA + MALT) ; **NF DTU 25.41** (boîtiers en plaques de plâtre, 1 par 9 m²).

**Qualifications :** Qualifelec ; **IRVE niveaux 1/2/3** ; RGE (chauffage élec. performant). **Habilitations NF C 18-510 :** B0/H0, B1/B1V/H1/H1V, B2/H2, BR/BC, BS/HE. **Consuel AC :** Jaune (domestique) / Verte (ERP, ERT) / Bleue (production PV). **Dossier SC 145** pour IRVE bidirectionnel V2X (EN 50 549).

---

## Q2 — Méthodologie 4 phases (N4)

### Phase 1 — Préparation & études (NF C 15-100-1)
- Calculs de section avec prise en compte des **harmoniques**.
- Sélectivité des protections + coupure d'urgence dans chaque local indépendant.
- Planification **ETEL** (Espace Technique Électrique du Logement).

### Phase 2 — Approvisionnement
- Marquage CE ou certification NF (RPC).
- Câbles : euroclasses réaction au feu.
- **DDR Type F** pour PAC/clim monophasé. **DDR Type B** pour triphasé. **DPDA** pour circuits prises lieux critiques.

### Phase 3 — Mise en œuvre (NF C 15-100-10)
- **GTL** dans l'ETEL (disjoncteur abonné + tableau répartition + coffret communication).
- Sections/protections circuits :
  - **Éclairage** : section **1,5 mm²**, disj. **10 ou 16 A**, max **8 points**/circuit.
  - **Prises** : 8 prises sur **1,5 mm²** (disj 16 A) OU **12 prises** sur **2,5 mm²** (disj 20 A).
  - **Spécialisés** (lave-linge, four, lave-vaisselle) : **2,5 mm²**, **20 A**.
  - **Plaques cuisson** : **6 mm²**, **32 A**.
- Mise à la terre : toutes masses métalliques au vert-jaune. Salle de bain : **LES (Liaison Équipotentielle Supplémentaire)**.
- Prises : **5 cm mini du sol** (≤ 20 A), **12 cm** (> 20 A). Respect volumes 0/1/2 NF C 15-100-7-701.

### Phase 4 — Contrôles & réception (NF C 15-100-1)
- Continuité conducteurs protection.
- Résistance d'isolement.
- Déclenchement DDR 30 mA (Types F et B).
- **AC Consuel** : Jaune / Verte / Bleue selon usage.
- DOE : plans récolement, notices, fiches autocontrôle.
- Note : nouvelle série 2024 systématique pour dossiers traités dès **septembre 2025**.

---

## Q3 — Pathologies & sinistralité (N4)

- **Sécurité incendie** : **1 % effectif global** des désordres 1995-2023. Causes : arcs (cordons endommagés), surcharges, courts-circuits, connexions mal serrées. Prévention : **DPDA** en tête circuits prises critiques, disjoncteurs adaptés, dimensionnement amont DDR (PV/IRVE).
- **Sécurité d'utilisation (incl. pièces d'eau 7-701)** : **11 % effectif** des sinistres 2021-2023. Causes : non-respect volumes 0/1/2, IP inadapté. Prévention : NF C 15-100-7-701 strict + LES.
- **Défauts de mise à la terre** : valeur prise de terre insuffisante. Prévention : **boucle à fond de fouille** au lieu de simple piquet + raccordement masses métalliques au vert-jaune + vérif continuité.
- **Défauts d'isolement / déclenchements intempestifs** : DDR inadaptés équipements modernes. Prévention : DDR Type F monophasé (PAC/clim), Type B triphasé.
- **Harmoniques / EMC** : charges non linéaires (info, LED, variateurs). Prévention : NF C 15-100-8-1.
- **VMC protection non indépendante** (NF DTU 68.3) : circuit dédié obligatoire.

---

## Q4 — Phrases-types mémoire (N3)

1. « Architecture conforme à la NF C 15-100 édition 2024 (21 normes segmentées). »
2. « DDR 30 mA, Type F pour PAC/clim monophasé, Type B pour triphasé. »
3. « DPDA en tête des circuits prises des locaux à sommeil / stockage inflammable (NF C 15-100-1). »
4. « Habilitations électriques NF C 18-510 (B1V, B2V, BR, BC) en adéquation avec les tâches. »
5. « ETEL + GTL aux dimensions normées. »
6. « IRVE sur circuit spécialisé + dossier SC 145 si V2X (EN 50 549). »
7. « NF C 15-100-8-1 : réduction pertes par harmoniques + mesure consommations. »
8. « Autocontrôles : résistance d'isolement + continuité de terre + AC Consuel. »
9. « Branchement réseau / AGCP selon NF C 14-100. »
10. « Reportage photographique points singuliers (terre, volumes pièces d'eau) intégré au DOE (CCAG Art. 40). »

---

## Q5 — Contrôles & livrables (N4)

### Contrôles
- Mise à la terre + masses métalliques.
- Volumes pièces d'eau (NF C 15-100-7-701).
- Organisation ETEL/GTL.
- Continuité conducteurs protection.
- Résistance d'isolement.
- Déclenchement DDR 30 mA (Type F PAC/clim, Type B triphasé).

### Livrables
- **PAQ** (CCAG Art. 28.4).
- **DOE** (CCAG Art. 40) : plans récolement, fiches CE, notices maintenance.
- **AC Consuel** : Jaune (domestique) / Verte (ERP, ERT) / Bleue (production PV).
- **Dossier SC 145** si IRVE bidirectionnel V2X.

### Textes
NF C 15-100 (2024) ; NF C 14-100 ; NF C 18-510 ; CCAG Art. 28 + 40 ; NF C 15-100-7-722 (IRVE).

Note : depuis septembre 2025, nouvelle structure NF C 15-100 systématique pour contrôles Consuel.

---

## Build notes
- Aucun timeout bloquant.
- Réforme NF C 15-100 août 2024 = info clé à mettre en avant dans le mémoire (effective sept 2025).
