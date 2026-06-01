# Référence des règles — Skill #52 `generateur-photos-references`

> ⚠️ Cette skill a `model = "none"` : **aucun appel LLM**. La mise en page est
> déterministe (Python). Ce fichier documente les règles N3 appliquées par le
> code, pour audit — il n'est pas envoyé à un modèle.

## Règles de mise en page des photos (verbatim)
<!-- Source: NotebookLM N3, 01/06/26 -->

**Gagnant :**
- Photos d'**équipes en situation avec EPI**, balisage (preuve sécurité).
- Photos aidant la **compréhension technique** (méthodes, procédés) ; idéal **avant/après** ou détails techniques.
- Photos du **site de l'AO** (connaissance du terrain via la visite).

**Contre-productif / éliminatoire :**
- La photo **remplace** l'explication écrite — jurisprudence : « la seule production de photographies ne remplace pas la production d'une note technique exigée ». → La photo **illustre**, ne **substitue** pas : toute photo doit être rattachée à un point de méthodologie.
- Photos **génériques type plaquette commerciale** sans lien avec le besoin → baisse de note.

## Implémentation déterministe
- Une **légende annotée obligatoire** par photo (rattachée à une référence + un point technique).
- Ratio normalisé (paysage 4:3 par défaut), max **3 photos par référence**.
- Toute photo sans légende est **rejetée** (champ `photos_rejetees`), jamais publiée nue.
