# Raw NotebookLM extract — Skill #22 `validation-completude-document`

**Captured:** 2026-05-31 — N2 (7a661d76).

## Q1 (N2) — Champs obligatoires + détection complétion
- N2 détaille le **DC4** [1-14] ; DC1/DC2/AE = pratique standard signalée hors corpus.
- **DC1** : acheteur + candidat (SIRET, adresse), mandataire si groupement, case attestation sur l'honneur cochée.
- **DC2** : candidat, CA 3 derniers exercices (non nuls), effectifs, capacités.
- **DC4** : identification sous-traitant, nature/montant prestation, conditions paiement.
- **AE/ATTRI1** : parties, objet, montant HT+TTC non nul, délai, RIB, signature représentant légal [17].
- **DPGF/BPU** : tous postes chiffrés, totaux non nuls, pas de ligne vide / 0 € sans gratuité.

## Build notes
- Haiku. 0 faux "complete". champs_manquants explicite.
