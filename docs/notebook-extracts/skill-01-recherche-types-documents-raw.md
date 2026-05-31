# Raw NotebookLM extract — Skill #1 `recherche-types-documents`

**Captured:** 2026-05-31 — N2 (7a661d76). Build-time only.

## Q1 (N2) — Types de documents DCE BTP 2026

### Administratif
- **RC** (Règlement de la Consultation) — modalités consultation + règles de dépôt. Patterns : `01_RC.pdf`, `RC_<projet>.pdf`, `Reglement_Consultation_V1.pdf`.
- **CCAP** (Cahier des Clauses Administratives Particulières) — dispositions administratives/juridiques d'exécution. Patterns : `02_CCAP_LotX.pdf`, `CCAP_Marche_BTP.pdf`, `CCAP_Signe.pdf`.
- **AE / ATTRI1** (Acte d'Engagement, ex-DC3) — engagement contractuel attributaire. Patterns : `03_AE_ATTRI1.pdf`, `Acte_Engagement.pdf`, `ATTRI1_<entreprise>.pdf`.
- **DC1** (Lettre de candidature) — présente candidature, désigne mandataire en groupement. Patterns : `DC1_Candidature.pdf`, `DC1_Groupement.pdf`, `Formulaire_DC1_2026.pdf`.
- **DC2** (Déclaration du candidat) — capacités pro/techniques/financières. Patterns : `DC2_Capacites.pdf`, `Formulaire_DC2.pdf`.
- **DC4** (Déclaration de sous-traitance) — déclare + fait accepter un sous-traitant. Patterns : `DC4_SousTraitance.pdf`, `Annexe_DC4_Signe.pdf`.
- **Attestations** — vigilance URSSAF, régularité fiscale, Kbis, RCP, décennale. Patterns : `Attestation_Vigilance_URSSAF.pdf`, `Attestation_Decennale.pdf`.

### Technique
- **CCTP** (Cahier des Clauses Techniques Particulières) — spécifications techniques par corps d'état. Patterns : `04_CCTP_Lot3_Facade.pdf`, `CCTP_Technique.pdf`.
- **Mémoire Technique** — méthodologie + moyens + procédés (rédigé par candidat). Patterns : `Memoire_Technique_<entreprise>.pdf`, `MT_Lot_Facade.pdf`.
- **Planning** — calendrier prévisionnel/chronologique. Patterns : `Planning_Previsionnel_Chantier.pdf`, `Planning_Gantt_V1.pdf`.

### Financier
> N2 signale que les sigles **DPGF/BPU/DQE** relèvent de la pratique courante MP français (hors corpus strict du notebook). Usage universel et documenté → conservés, marqueur posé dans le prompt.
- **DPGF** (Décomposition du Prix Global et Forfaitaire). Patterns : `05_DPGF_Vierge.xlsx`, `DPGF_Completee.xlsx`.
- **BPU** (Bordereau des Prix Unitaires) — marchés à bons de commande. Patterns : `BPU_Vierge.pdf`, `BPU_2026.xls`.
- **DQE** (Détail Quantitatif Estimatif) — simulation non contractuelle, adossé BPU. Patterns : `DQE_Simulation.xlsx`, `DQE_Non_Contractuel.pdf`.

### Plan / Annexe
- **Plans** — architecte, façades, réseaux, coupes. Patterns : `Plans_DCE.zip`, `Plan_Facade_Architecte.pdf`, `*.dwg`.

## Build notes
- Skill Haiku (classification multi-classes sur nom + incipit + MIME).
- Aucune donnée inventée ; sigles financiers conservés avec marqueur de pratique courante.
