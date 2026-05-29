# Raw NotebookLM extract — Skill #25 `expert-facade`

**Captured:** 2026-05-27
**Operator:** Claude Code (batch 1 — 9 experts)
**Notebooks:** N4 `Synorix - 4 - Normes DTU` (777badb4) + N3 `Synorix - 3 - Mémoires Techniques Gagnants` (43615791)
**Scope:** Façade hors ITE — ravalement, enduits, peinture extérieure, bardage non isolant.

> Build-time only. Runtime prompt lives in `backend/synorix/skills/expert_metier/prompts/expert_facade.md`.

---

## Q1 — Référentiels & certifications (N4)

### Référentiels normatifs

**Enduits & imperméabilité**
- **NF DTU 26.1** — Travaux d'enduits de mortiers (traditionnels + monocouches, sur maçonnerie/béton). Coef. absorption solaire < 0,7 ; indice luminance Y > 35 %.
- **NF DTU 42.1** — Réfection des façades par revêtement d'imperméabilité à base de polymères (classes I1 à I4).

**Peinture & finitions**
- **NF DTU 59.1** — Travaux de peinture des bâtiments (extérieurs + intérieurs). Humidité support < 5 % en masse. Finitions A / B / C.
- **NF DTU 59.3** — Peinture de sol / supports béton.

**Bardages & façades légères (non isolants)**
- **NF DTU 41.2** — Revêtements extérieurs en bois.
- **NF DTU 31.4** — Façades à ossature bois.
- **NF DTU 33.1** — Façades rideaux.

**Étanchéité & supports**
- **NF DTU 44.1** — Étanchéité des joints de façade par mastics.
- **NF DTU 20.1** — Maçonnerie de petits éléments (support).
- **NF DTU 21** — Exécution des ouvrages en béton (support).

### Certifications & qualifications
- **Qualibat** — qualification capacité technique & financière.
- **RGE** — obligatoire pour aides publiques (même hors ITE si amélioration énergétique : bardage, menuiseries).
- **Label EQF** (SFJF) — Engagement Qualité Façade.
- **Habilitations** : travaux en hauteur / échafaudage (PRDM échafaudage).
- **Risque plomb** : décapage anciennes peintures (kits OPPBTP).
- **Risque amiante** (SS3 ou SS4) sur anciens enduits / plaques fibre-ciment.
- **Avis Technique (ATec) / DTA** pour systèmes non traditionnels.
- **Marquage CE / NF** pour mortiers, peintures, mastics.

---

## Q2 — Méthodologie 4 phases (N4)

### Phase 1 — Préparation & études
NF DTU 59.1 / 42.1 + NF DTU 20.1 / 21 (supports).
- Reconnaissance des fonds : sain, sec, propre, cohérent. Essai d'adhérence (quadrillage ou traction) sur supports anciens.
- **Humidité support < 5 % en masse** (béton/plâtre, humidimètre à pointes).
- **Planéité** sous règle de 2 m : **15 mm** (finition élémentaire), **7 mm** (courante), **5 mm** (soignée).
- Sondage sonore pour repérer zones non adhérentes à purger.

### Phase 2 — Approvisionnement & matériel
- Échafaudage aux normes (PRDM échafaudage).
- **Indice de luminance Y > 35 %** ou **absorption solaire < 0,7** (NF DTU 26.1 + 59.1).
- Stockage à l'abri du gel, **T ≤ 35 °C**.
- Marquage CE / certification NF obligatoires.

### Phase 3 — Mise en œuvre & points singuliers
NF DTU 26.1 (enduits), NF DTU 42.1 (imperméabilité).
- **Conditions climatiques : 5 °C à 35 °C** (ou 8 °C pour certaines peintures), hygrométrie **< 80 %** (70 % peinture).
- Étapes : décapage/lavage → traitement armatures corrodées + rebouchage → couche d'impression → couches intermédiaires + finition.
- **Classes I1-I4** (NF DTU 42.1) selon capacité à ponter les fissures. **I4 = armature obligatoire**.
- Joints : NF DTU 44.1, mastic extrudé sur fond de joint.
- Appuis fenêtres / rejingots : pente vers l'extérieur, bavettes si nécessaire.
- Entoilage modénatures : **recouvrement ≥ 50 mm** entre lés.

### Phase 4 — Contrôles & réception
- Contrôle visuel **à 2 m** (NF DTU 59.1), éclairage non rasant.
- Finitions : **A (soigné, ≤ 5 mm planéité)** / **B (courant, poché)** / **C (élémentaire, reflète support)**.
- **24h** séchage entre couches préparation. **28 jours** séchage béton neuf avant peinture.
- DOE : fiches techniques + PV adhérence + rapports autocontrôle signés.

---

## Q3 — Pathologies & sinistralité (N4) — survived 1 retry

### Fissuration (pathologie majeure)
- **40 %** des désordres enduits monocouches, **33,3 %** enduits traditionnels.
- Causes : mouvements support, retrait enduit, T° extrêmes.
- Préventions : délai séchage support (28 j béton), alignement supports, entoilage points singuliers.

### Défauts de liaison / décollement
- **34 %** enduits monocouches, **24,6 %** enduits traditionnels.
- Causes : support inadapté (poussières, graisses), humidité > 5 %, mauvaise préparation.
- Prévention : reconnaissance fonds + test goutte d'eau + essai quadrillage.

### Spectres (« fantômes »)
- Cause : épaisseur enduit insuffisante, hétérogénéité absorption support.
- Prévention : respect épaisseurs NF DTU 26.1, remplissage joints maçonnerie.

### Faïençage
- Cause : séchage brutal (vent, soleil), excès d'eau au mélange.
- Prévention : éviter plein soleil, indice luminance Y > 35 %.

### Infiltrations menuiseries
- **~6 %** des désordres ITI (vs 12-14 % en ITE).
- Causes : défaut calfeutrement dormant/gros œuvre, scellement sur enduit (au lieu de gros œuvre), défauts seuils/appuis.
- Préventions : calfeutrement **sur gros œuvre**, pente appuis vers l'extérieur, mastics NF DTU 44.1 non recouverts.

---

## Q4 — Phrases-types mémoire (N3)

1. « Reconnaissance contradictoire, humidité béton < 5 % en masse (NF DTU 59.1). »
2. « Essais de quadrillage ou d'arrachement par traction sur revêtements anciens (NF DTU 59.1). »
3. « Imperméabilité souple classée I1 à I4 (NF DTU 42.1), entoilage obligatoire en classe I4. »
4. « Calfeutrement par mastics élastomères classe 25 E sur fond de joint, NF DTU 44.1. »
5. « Indice de luminance Y > 35 % pour prévenir les chocs thermiques (NF DTU 26.1 / 59.1). »
6. « Trame de renfort (entoilage) aux points singuliers, recouvrement minimal 50 mm. »
7. « Application limitée à 5–35 °C, hygrométrie ambiante < 70 % peinture / < 80 % enduit. »
8. « Finition Grade B (Courant) selon NF DTU 59.1 : aspect poché uniforme. »
9. « Préparation supports béton selon NF DTU 59.3, adhérence ≥ 1 MPa. »
10. « Contrôle visuel à 2 m sous éclairage non rasant (NF DTU 59.1). »

---

## Q5 — Contrôles & livrables (N4)

### Contrôles
- Avant : humidité < 5 %, essai d'adhérence (quadrillage/arrachement, NF DTU 59.1), planéité conforme DTU support, sondage sonore.
- Pendant : T° 5/8–35 °C, hygrométrie < 70 % (peinture) / < 80 % (imperméabilité), calfeutrement sur gros œuvre (NF DTU 44.1), Y > 35 %.
- Réception : examen visuel à 2 m, éclairage non rasant, grade A/B/C.

### Livrables
- PV essais d'adhérence + PV réception supports.
- Fiches d'autocontrôle (températures, points d'arrêt).
- **DOE** (CCAG Travaux **Art. 40**) : plans d'exécution conformes (joints, modénatures), fiches techniques CE/NF, prescriptions maintenance, SOGED.

### Normes imposant les contrôles
| Domaine | Référence | Rôle |
|---|---|---|
| Peinture | NF DTU 59.1 | Reconnaissance fonds + essais adhérence |
| Imperméabilité | NF DTU 42.1 | Classes I1-I4, préparation |
| Enduits | NF DTU 26.1 | Luminance, mortiers |
| Joints | NF DTU 44.1 | Calfeutrement |
| PAQ | CCAG Travaux Art. 28 | Programme d'exécution + gestion qualité |
| DOE | CCAG Travaux Art. 40 | Contenu DOE + dossier entretien |

Entrepreneur réputé connaître les normes, **devoir de conseil** sur supports non conformes.

---

## Build notes
- Aucun timeout bloquant (Q3 a survécu à 1 retry automatique).
- Aucune divergence registry/notebook majeure pour cette skill (les NF DTU 26.1/42.1/59.1/44.1 sont les standards façade reconnus).
- Cohérence avec #26 expert-ite : NF DTU 44.1 cité aussi (joints), interfaces menuiseries cohérentes (6 % ITI vs 12-14 % ITE).
