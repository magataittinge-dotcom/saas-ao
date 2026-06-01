# Raw NotebookLM extracts — Skills #66, #67 (N5) & #85 (N7)

**Captured:** 2026-06-01. Reformulé downstream; non chargé au runtime.

## #66 — Nommage des fichiers (N5 Plateformes, 39ae9088)
- **Caractères à proscrire absolument** : espaces, accents, apostrophes, ponctuation, tout caractère spécial.
- **Longueur** : nom de fichier le plus court possible, **max ~30 caractères** (AWS) ; **chemin d'accès total ≤ 150 caractères**.
- **Format recommandé** : `NomSociete_TypePiece`, espaces remplacés par underscores. Exemples : `Societe_DC1`, `Societe_BPU`, `Societe_Memoire_technique`, `Societe_RIB`.

## #67 — Procédures de dépôt (N5 Plateformes, 39ae9088)
**AWS :**
1. Accès → sélection des lots → « Préparation du pli ».
2. Chargement des dossiers (Candidature, Offre-lot 1…).
3. **Signature** : « Tout signer » → certificat dans le magasin Windows → code PIN ; l'outil Java signe **chaque pièce individuellement**.
4. **Chiffrement** automatique du pli par la plateforme.
5. Transmission : « Déposer » avant l'heure limite → conserver **attestation de dépôt + bordereau de contrôle**.

**PLACE :**
1. Authentification au compte entreprise (traçage + notifications modif DCE).
2. Ajout des fichiers (≤ **1 Go par fichier**) ; PDF + bureautiques acceptés ; **macros/liaisons/exécutables exclus**.
3. Signature si le RC l'exige (format **PAdES / XAdES / CAdES**).
4. Envoi + horodatage → conserver l'**accusé de réception électronique**.

## #85 — 3 formules prix DAJ (N7, réutilise capture #13)
**Formules DAJ Bercy (base 10) :**
- Inversement proportionnelle (classique, neutre) : `Note = (prix le plus bas / prix offre) × 10` (sur 40/50 : `× 40 (ou 50)`).
- Linéaire : `Note = 10 − 10 × [(prix offre − prix bas) / (prix élevé − prix bas)]`.
- Moyenne des offres : `Note = (10 × prix moyen) / (prix moyen + prix offre)`.
- Variante AMF : `Note = 200 × prix bas / (prix bas + prix offre)`.
→ #85 (Haiku) calcule la note prix selon chaque formule et identifie la **plus favorable** au candidat. Formule réellement applicable = celle du RC.
