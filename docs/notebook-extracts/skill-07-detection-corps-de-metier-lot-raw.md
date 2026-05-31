# Raw NotebookLM extract — Skill #7 `detection-corps-de-metier-lot`

**Captured:** 2026-05-31 — N4 (777badb4). Build-time only.

## Q1 (N4) — Intitulés de lot par corps de métier
- **gros_oeuvre** → Gros œuvre, Maçonnerie, Béton armé, Fondations, Dallage, Structure.
- **facade** → Enduits et revêtements de façade, Ravalement, Réfection des façades, Façade lourde/légère.
- **ite** → ITE, Bardage, Enduit sur isolant, Isolation des murs par l'extérieur.
- **etancheite** → Étanchéité toitures-terrasses, Toiture plate, Couverture-Étanchéité, Complexe d'étanchéité, Membrane.
- **menuiserie** → Menuiseries ext./int., Fenêtres et portes-fenêtres, Fermetures, Vitrerie, Blocs-baies.
- **plomberie** → Plomberie sanitaire, Réseaux d'eau intérieurs, Équipements sanitaires, ECS.
- **cvc** → Chauffage, VMC, Climatisation, Génie climatique, Équipements thermiques, Pompes à chaleur.
- **electricite** → Électricité, Courant fort/faible, Installations BT, Réseaux de communication, Éclairage.
- **peinture** → Peinture, Revêtements de finition, Aménagements intérieurs, Peinture sur plâtrerie.
- **vrd** → VRD, Assainissement, Terrassement, Réseaux extérieurs, Canalisations, eaux pluviales.

## Build notes
- Enum fermé de 10 corps (mappé aux experts Step 3) + "autre" (libellé libre obligatoire).
- Haiku (classification signal fort sur intitulé).
