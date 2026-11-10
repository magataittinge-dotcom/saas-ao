---
name: Synorix
description: Réponse aux appels d'offres BTP, du DCE au dossier déposable — « Aurore polaire » (base A, discipline B, gros chiffres C), décidée le 9/11/2026 ; couleurs tirées du visage par la mesure le 10/11/2026.
colors:
  # Clair (défaut). Toutes les teintes de marque sont mesurées sur le visage (scripts/mesure-visage.mjs).
  page: "#f2f8fc"
  surface-0: "#ffffff"
  surface-1: "#e6eef4"
  surface-2: "#dae5ec"
  text-1: "#061620"
  text-2: "#364b58"
  text-3: "#4e6472"
  border-1: "#d3dee6"
  border-2: "#becdd7"
  border-field: "#6d808d"
  accent-text: "#0065b6"
  accent-ui: "#0077d3"
  accent-fill: "#0077d3"
  accent-fill-deep: "#0065b6"
  accent-fill-p3: "color(display-p3 0.0000 0.4408 0.8993)"
  on-accent: "#ffffff"
  aurore-ink: "#196b95"
  aurore-mark: "#1688c0"
  aurore-glow: "rgba(80,175,230,.22)"
  aurore-glace: "rgba(100,194,250,.55)"
  aurore-givre: "rgba(171,214,253,.45)"
  aurore-azur: "rgba(66,155,247,.4)"
  flamme: "#ecac2f"
  bleu-ink: "#0a518f"
  bleu-soft: "#e6f1fe"
  bleu-mark: "#1270c3"
  vert-ink: "#0e6835"
  vert-soft: "#e2f6e6"
  vert-mark: "#178d4a"
  ambre-ink: "#834b0c"
  ambre-soft: "#feedde"
  ambre-mark: "#ae6614"
  rouge-ink: "#830d10"
  rouge-soft: "#feebe8"
  rouge-mark: "#b7191c"
  turquoise-ink: "#0a5253"
  turquoise-soft: "#daf7f7"
  turquoise-mark: "#127475"
  gris-ink: "#515d65"
  gris-soft: "#ebf1f5"
  gris-mark: "#707c85"
  surligneur: "#ffe066"
  # Nuit ([data-theme="dark"]) : elle part des ombres du visage, la page est le fond de ses clips
  nuit-page: "#070e13"
  nuit-surface-0: "#0a1922"
  nuit-surface-1: "#112430"
  nuit-surface-2: "#192f3d"
  nuit-text-1: "#ecf3f8"
  nuit-text-2: "#b7c9d4"
  nuit-text-3: "#92a6b4"
  nuit-border-1: "#192d39"
  nuit-border-2: "#2b4352"
  nuit-border-field: "#6d8493"
  nuit-accent-text: "#79b9ff"
  nuit-accent-ui: "#008dfa"
  nuit-accent-fill: "#0077d3"
  nuit-aurore-ink: "#a7dcff"
  nuit-aurore-mark: "#78ccff"
  nuit-aurore-glow: "rgba(120,204,255,.22)"
  nuit-aurore-glace: "rgba(83,188,249,.5)"
  nuit-aurore-givre: "rgba(159,209,252,.38)"
  nuit-aurore-azur: "rgba(0,135,240,.5)"
  nuit-flamme: "#fdbe51"
  nuit-bleu-ink: "#a3cdfc"
  nuit-bleu-soft: "rgba(92,169,251,.14)"
  nuit-bleu-mark: "#5ca9fb"
  nuit-vert-ink: "#92e8aa"
  nuit-vert-soft: "rgba(64,202,116,.14)"
  nuit-vert-mark: "#40ca74"
  nuit-ambre-ink: "#fdcb9f"
  nuit-ambre-soft: "rgba(250,149,33,.14)"
  nuit-ambre-mark: "#fa9521"
  nuit-rouge-ink: "#fca095"
  nuit-rouge-soft: "rgba(239,103,92,.14)"
  nuit-rouge-mark: "#ef675c"
  nuit-turquoise-ink: "#46d7d8"
  nuit-turquoise-soft: "rgba(33,176,178,.14)"
  nuit-turquoise-mark: "#21b0b2"
  nuit-gris-ink: "#aab8c1"
  nuit-gris-soft: "rgba(135,148,157,.14)"
  nuit-gris-mark: "#87949d"
typography:
  display:
    fontFamily: "Newsreader Variable, ui-serif, Georgia, serif"
    fontSize: "clamp(2rem, 1.4rem + 1.6vw, 2.75rem)"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.01em"
    fontVariation: "opsz auto"
  memoire:
    fontFamily: "Newsreader Variable, ui-serif, Georgia, serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.65
  title:
    fontFamily: "Manrope Variable, ui-sans-serif, system-ui, Segoe UI, Roboto, Arial, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Manrope Variable, ui-sans-serif, system-ui, Segoe UI, Roboto, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "\"tnum\" 1"
  label:
    fontFamily: "Manrope Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 600
    lineHeight: 1.3
  chiffre-grand:
    fontFamily: "Manrope Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(40px, 24px + 2vw, 48px)"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "\"tnum\" 1, \"lnum\" 1"
  data:
    fontFamily: "Geist Mono, ui-monospace, Menlo, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "22px"
  pill: "9999px"
spacing:
  "4": "4px"
  "8": "8px"
  "12": "12px"
  "16": "16px"
  "20": "20px"
  "30": "30px"
  "40": "40px"
  gouttiere-mobile: "16px"
components:
  button-primary:
    backgroundColor: "{colors.accent-fill}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.accent-fill-deep}"
  button-secondary:
    backgroundColor: "{colors.surface-0}"
    textColor: "{colors.text-1}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "44px"
  card:
    backgroundColor: "{colors.surface-0}"
    rounded: "{rounded.lg}"
    padding: "24px"
  pastille-etat:
    backgroundColor: "{colors.vert-soft}"
    textColor: "{colors.vert-ink}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
    typography: "{typography.label}"
  champ:
    backgroundColor: "{colors.surface-0}"
    textColor: "{colors.text-1}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 14px"
---

# Design System: Synorix

> Source de vérité des jetons : `frontend/src/styles/theme.css` (clair et nuit). Ce document en donne le sens ; en cas d'écart, le code fait foi et ce document se corrige.

## Overview

**Étoile polaire : « Aurore polaire »**

Un logiciel qui écrit des documents, pas un tableau de bord de plus. Le jour, un blanc glacé légèrement bleuté (jamais de gris chaud) ; la nuit, le bleu-noir des ombres du visage (jamais de gris neutre, jamais de noir). Derrière le travail, un ciel d'aurores boréales respire lentement en haut de l'écran : il se devine le jour, il se voit la nuit, il ne touche jamais le contenu. **La marque sort du visage de Synorix : ce qui n'est pas dans le visage n'est pas dans la marque.** Le bleu de son verre reste la seule couleur d'action ; les six couleurs d'état ne servent qu'à dire un état ; un fil de lumière glacée (l'accent aurore) signe la marque sur quelques traits et halos ; l'or de sa flamme n'apparaît qu'une fois, dans le logo.

La discipline vient de la direction « Précision » : traits d'un pixel plutôt qu'ombres, hiérarchie portée par la taille et la graisse, chiffres tabulaires, couleur rare donc parlante. Les cartes de résumé reprennent les gros chiffres de « Givre », sans le verre : l'état du cabinet se lit d'un coup d'œil, au bureau comme sur un téléphone de chantier en plein soleil.

Le niveau visé est celui d'Apple ou de Samsung : rien qui ressemble à un gabarit généré, rien d'approximatif affiché comme certain. L'abonnement coûte plusieurs centaines d'euros par mois ; chaque écran doit inspirer confiance par la retenue.

**Key Characteristics:**
- Fond glacé `#f2f8fc` / bleu-noir `#070e13` (le fond des clips du visage), surfaces blanches / `#0a1922` séparées par des traits de 1 px.
- Une serif (Newsreader) pour le titre de la page et le texte du mémoire, Manrope pour tout le reste.
- Quatre teintes mesurées sur le visage, pas une de plus : ombres 237°, lumières 245°, verre 252° (la couleur d'action), flamme 72° (l'or, rare).
- Une seule couleur d'action (bleu `--accent-*`), six couleurs d'état, un accent aurore qui n'est pas un état.
- Gros chiffres tabulaires sur les cartes de résumé ; jamais de gros « 0 ».
- Un seul mouvement continu : l'aurore (3 ellipses, `transform` seul), coupée dès que l'utilisateur, l'onglet ou la connexion le demandent.

## Colors

Un ciel froid et lumineux, tiré du visage : neutres à la teinte de ses ombres, un bleu d'action à la teinte de son verre, une lumière glacée réservée à la marque, l'or de sa flamme en signature, et six couleurs d'état qui ne disent qu'une chose chacune.

### La mesure (10/11/2026, `frontend/scripts/mesure-visage.mjs` → `frontend/scripts/visage-mesure.json`)

- 157 images tirées par ffmpeg (3 par seconde) des dix clips `visage-1` à `4` et `tete-*`, plus les six affiches ; sujet séparé du fond par l'écart au fond (0,08 ΔE OK) puis enveloppe ligne par ligne ; tout est converti en OKLCH.
- **Le visage est presque monochrome** : 77,2 % de sa surface a une chroma sous 0,03 ; chroma médiane 0,025, maximale 0,12 (99,9e centile).
- Teintes dominantes (k-moyennes OKLab, part de la surface) : `oklch(0.274 0.022 238.1)` 33,5 % ; `oklch(0.404 0.024 246.7)` 23,0 % ; `oklch(0.55 0.028 250.8)` 19,2 % ; `oklch(0.716 0.029 250.7)` 14,1 % ; `oklch(0.891 0.018 247.2)` 10,0 % ; `oklch(0.808 0.108 78.5)` 0,3 %.
- **Ombres** (les 10 % les plus sombres) : `oklch(0.234 0.021 237.2)`. **Lumières** (les 10 % les plus clairs) : `oklch(0.892 0.016 245.5)`. **Fond** des clips : `oklch(0.158 0.015 239.1)`.
- **Famille colorée du verre** : teinte **251,7°** (21,8 % du sujet, chroma jusqu'à 0,05). **Flamme** : teinte **71,8°** (0,5 % du sujet, chroma jusqu'à 0,141), dont l'or `oklch(0.808 0.108 78.5)`.
- La marque n'a donc que **quatre teintes** : ombres 237,2°, lumières 245,5°, verre 251,7°, or 78,5°. On n'invente aucune teinte : l'action et l'accent sont ces teintes à d'autres clartés et d'autres chromas.
- **Tolérance : ± 8°** autour d'une teinte mesurée. C'est le plus grand écart relevé entre la teinte des ombres d'un clip et celle de l'ensemble (7,6°). Gardée par `tests/palette-visage.test.ts`.
- L'émeraude et le turquoise de l'ancienne aurore (165° à 200°) ne sont pas dans le visage : ils sont sortis de l'aurore, du fil et du logo. Le vert et le turquoise d'ÉTAT restent : ce sont des sens, pas la marque.
- Le bleu d'action d'avant (`#0078d6`, 251,7°) tombait déjà sur la teinte du verre : la mesure le confirme, sa clarté et sa chroma sont maintenant résolues sur le contraste.
- Toute la palette est recalculée par `frontend/scripts/palette-visage.mjs --ecrire` (rejouable) ; `theme.css` doit lui être identique (test).

### Primary
- **Bleu Synorix** (`--accent-600` `#0077d3`, texte `--accent-text` `#0065b6` clair / `#79b9ff` nuit) : boutons, liens, sélection, anneau de focus. Échelle `--accent-50` à `900` à **teinte constante 251,7°** : seules la clarté et la chroma varient. Le bouton principal est un dégradé `--accent-fill` (700 → 600 en clair, 600 plein en nuit). C'est la seule couleur d'action de l'application.
- **Gamut large.** Sur un écran display-p3, `--accent-fill`, `--accent-fill-hover`, `--accent-ring` et `--accent-vif` passent en `color(display-p3 …)` (même teinte, même clarté, plus de chroma : `color(display-p3 0.0000 0.4408 0.8993)` pour 600), sous `@media (color-gamut: p3)` et `@supports (color: color(display-p3 1 1 1))`. Le repli sRGB est conforme seul. Les paliers `--accent-NNN`, `--accent-ui`, `--accent-text` et `--accent-fill-solid` restent en sRGB : Clerk et le dessin du visage les lisent en JavaScript.

### Secondary
- **Lumière d'aurore** (`--aurore-ink` `#196b95` / `#a7dcff`, `--aurore-mark` `#1688c0` / `#78ccff`, `--aurore-glow`) : le fil lumineux de la marque (trait sous le titre de l'Accueil, halo du visage, sélection de texte, logo), à la teinte des ombres et du halo du visage (237,2°). Ce n'est **pas** un état.
- **Ciel** (`--aurore-a` glace 237,2°, `--aurore-b` givre 245,5°, `--aurore-c` azur 251,7°) : les trois ellipses du fond, toutes dans la famille bleue du visage. Ni vert, ni turquoise, ni violet.
- **Or de la flamme** (`--flamme` `#ecac2f` / `#fdbe51`, `--flamme-glow`) : la seule teinte chaude de la marque (78,5°). De la **lumière** seulement : la braise du logo, et la lumière du visage. Jamais un texte, une pastille, un point d'état ni une barre ; aucune classe Tailwind ne l'expose.

### Neutral
Tous les neutres sont à la teinte des ombres du visage (237,2°), avec une chroma supérieure à zéro : jamais un gris pur. Seul le papier est blanc.
- **Givre** (`--surface-page` `#f2f8fc` / `#070e13`) : fond de page, sous l'aurore. En nuit, c'est exactement le fond des clips du visage : le visage se pose sur la page sans bord.
- **Papier** (`--surface-0` `#ffffff` / `#0a1922`) : cartes, panneaux, document du mémoire, barre latérale.
- **Glace** (`--surface-1` `#e6eef4` / `#112430`) : survols, en-têtes de bloc, fonds de barre.
- **Glace profonde** (`--surface-2` `#dae5ec` / `#192f3d`) : survol sur une surface déjà teintée, sélection de rangée.
- **Encre** (`--text-1` `#061620` / `#ecf3f8`), **encre 2** (`--text-2` `#364b58` / `#b7c9d4`), **encre 3** (`--text-3` `#4e6472` / `#92a6b4`) : texte, texte secondaire, méta. Tous ≥ 4,5:1 sur les quatre surfaces.
- **Filet** (`--border-1` `#d3dee6` / `#192d39`) : séparateurs et bords de carte (décoratifs). **Bord de champ** (`--border-field` `#6d808d` / `#6d8493`) : contrôles, ≥ 3:1 sur toute surface, glace profonde comprise.

### Les six sens (COULEURS.md, 3/11/2026)

Chaque sens a trois jetons : `*-ink` (texte), `*-soft` (fond de pastille), `*-mark` (barre, point, bordure). Les six sont **accordés** : même clarté commune pour tous les `ink`, tous les `soft`, tous les `mark` (résolue sur le contraste), même chroma visée (réduite au gamut sRGB), la teinte seule change. Chaque état reçoit un petit décalage de clarté (bande de ± 0,04 : le rouge et le turquoise un peu plus sombres, le vert et l'ambre un peu plus clairs ; le gris plus clair le jour, en retrait la nuit à − 0,06) : sans lui, un daltonien confond le turquoise avec le gris et le vert avec l'ambre.

| Couleur | Teinte | Sens | Exemples |
|---|---|---|---|
| Bleu `--bleu-*` | 251,7° (le verre) | en cours, action, information, lien | étape en cours, « Plan proposé : 11 parties », AO déposé en attente du résultat |
| Vert `--vert-*` | 152° | fait, prêt, validé, gagné, consommation normale (< 70 %) | étapes faites du fil, « 9 sur 9 prêtes », « Gagné », jauge d'unités |
| Ambre `--ambre-*` | 62° | à surveiller | remise dans 4 à 7 jours, « À décider », informations à renseigner, pièce bientôt expirée, consommation 70 à 90 % |
| Rouge `--rouge-*` | 27° | urgent ou négatif | remise dans 3 jours ou moins, date dépassée, pièce expirée, « Perdu », consommation > 90 % |
| Turquoise `--turquoise-*` | 196° | veille | « Nouveau », « Trouvé par la veille », nouveaux avis |
| Gris `--gris-*` | 237,2° (les ombres) | à venir, pas commencé, sans suite, archivé | étapes à venir, « Sans suite » |

Le vert, l'ambre, le rouge et le turquoise ne sont pas dans le visage : ce sont des sens, pas la marque. Ils ne colorent jamais l'aurore, le fil, le logo ni l'accent.

Écarts mesurés (ΔE OK, `tests/palette-visage.test.ts`) : deux états restent à **0,03 au moins** l'un de l'autre pour un deutéranope comme pour un protanope (plus petit écart relevé : 0,034, turquoise et gris) ; l'or de marque reste à **0,07 au moins** de chacun des trois jetons ambre, en vision normale et daltonienne (relevé : 0,208 en clair, 0,077 en nuit), et sa teinte s'en écarte de 16,5°.

### Contrastes

`tests/contraste-palette.test.ts` calcule la matrice complète (WCAG 2), en clair et en nuit, sur le repli sRGB et sur les valeurs display-p3 : chaque texte sur chaque surface où il s'emploie, chaque `ink` sur son `soft` et sur les quatre surfaces, le texte sur l'aplat d'accent : **≥ 4,5:1** ; marques, bords de champ, points, barres, anneau de focus : **≥ 3:1**. Zéro couple sous le seuil ; le test échoue au premier.

### Named Rules

**La règle « ce qui n'est pas dans le visage n'est pas dans la marque ».** L'accent, l'aurore, le fil, le logo, les neutres et les ombres n'emploient que les quatre teintes mesurées, à ± 8°. Une nouvelle teinte de marque passe d'abord par la mesure.

**La règle « une couleur vive, rare, sur un champ calme ».** La couleur vive (chroma ≥ 0,10) occupe au plus 6 % de l'écran, aurore comprise : un bouton principal, la rangée active, les liens ; le reste est neutre. Mesuré sur les captures du 10/11 : 0,7 à 1,2 % à 1 440 px en clair, 1,8 à 2,8 % en nuit ; 0,7 à 3,2 % et 1,9 à 4,9 % à 390 px. L'or n'apparaît qu'une fois par écran (la braise du logo).

**La règle « jamais la couleur seule ».** Un état porte toujours un mot, et une icône (WCAG 1.4.1). La couleur confirme, elle n'informe jamais seule.

**La règle « la plus urgente gagne ».** Plusieurs états dans un même bloc : le bloc prend la couleur la plus urgente (rouge > ambre > bleu > vert > turquoise > gris). La pastille de Mes AO dans la barre latérale suit la même règle.

**La règle « une voix d'action ».** Le bleu `--accent-*` est la seule couleur d'action. Un seul bouton en dégradé par écran (« Nouvel appel d'offres », ou l'action qui fait avancer l'AO).

**La règle « l'aurore n'est pas un état ».** `--aurore-*` et `--flamme` ne colorent jamais un fond de pastille, un texte d'état ni une barre de progression.

**La règle « la nuit éclaire ».** En nuit, les accents sont plus clairs qu'en clair (texte d'accent 300, interface 500, encres d'état relevées) et la profondeur vient de lumière colorée : lueur bleue sous le bouton principal, filet de lumière en haut des surfaces flottantes.

## Typography

**Display Font:** Newsreader (variable, axe optique `opsz`), repli `ui-serif, Georgia, serif`
**Body Font:** Manrope (variable), repli `ui-sans-serif, system-ui, Segoe UI, Roboto, Arial, sans-serif`
**Label/Mono Font:** Geist Mono, pour les données seulement (références, montants alignés, identifiants)

**Character:** une serif de lecture, froide et nette, posée sur une grotesque géométrique et calme : l'interface d'un outil, la voix d'un document.

**Pourquoi Newsreader plutôt qu'Instrument Serif :** rendues côte à côte à taille réelle (`.claude/echange/sprint-ozcan/design/phase1/serif-comparaison-{clair,nuit}.png`), Newsreader tient le paragraphe du mémoire à 17 px grâce à son axe optique et ses graisses 400 à 600, alors qu'Instrument Serif, étroite et en une seule graisse, ne sert qu'aux titres et fatigue la lecture longue.

Toutes les polices sont auto-hébergées (`@fontsource`), sous-ensembles latin et latin-ext seulement, `font-display: swap`, aucune requête vers un service tiers.

### Hierarchy
- **Titre de page** (Newsreader 500, `clamp(2rem, 1.4rem + 1.6vw, 2.75rem)`, interligne 1,1, approche −0,01 em, `text-wrap: balance`, `font-optical-sizing: auto`) : le `h1` de chaque écran (« Bonjour », « DCE Gueux complet »), une fois par page. Jamais sous 28 px.
- **Texte du mémoire** (Newsreader 400, 17 px, interligne 1,65, 72 caractères au plus par ligne, chiffres proportionnels) : Rédiger et les aperçus du mémoire. Les titres de parties du mémoire sont en Newsreader 600.
- **Titre de carte ou de section** (Manrope 600, 16 à 18 px, interligne 1,3, approche −0,01 em) : tout `h2`-`h6` de l'interface.
- **Corps** (Manrope 400, 15 px, interligne 1,5) : texte d'interface. Méta 13,5 px.
- **Libellé** (Manrope 600, 12,5 px) : pastilles, en-têtes de colonne. Libellés de la barre latérale 11 px (plancher).
- **Gros chiffre** (`.chiffre-grand` : Manrope 600, 40 à 48 px, interligne 1, tabulaire) : cartes de résumé seulement.

### Named Rules

**La règle « serif au sommet ».** La serif sert au `h1` de la page et au texte du mémoire, et à rien d'autre : ni titres de carte, ni boutons, ni chiffres.

**La règle « chiffres alignés ».** `body` active `"tnum"` ; la classe `.chiffres` (tabulaires + alignés) se pose sur tout nombre isolé hors du `body` hérité. Seul le texte du mémoire revient aux chiffres proportionnels.

## Layout

- Coquille : barre latérale flottante de 76 px à gauche sur ordinateur (marge 16 px), onglets en bas sous 769 px ; contenu centré, largeur de lecture 760 px pour les textes longs, conteneur 1 200 px.
- Gouttière 16 px au téléphone. Aucun débordement horizontal jusqu'à 390 px de large.
- Rythme : base 4 px (4 · 8 · 12 · 16 · 20 · 30 · 40). Groupes serrés, séparation large, plus d'air au-dessus d'un titre qu'en dessous.
- Cartes de résumé en composition inégale (une principale, des secondaires, ou une seule surface découpée par des filets) : jamais une grille de cartes identiques.
- L'aurore est posée une fois, dans `Layout.tsx`, en `position: fixed; inset: 0; z-index: 0`, derrière la coquille (`z-index: 1`).

## Elevation & Depth

La profondeur vient de la lumière et des traits, pas des ombres. Au repos, une carte est une surface `--surface-0` bordée d'un trait `--border-1` de 1 px, avec une ombre presque nulle. Seuls les éléments qui flottent au-dessus du contenu (menus, fenêtres, infobulles, notifications, barre latérale) portent une ombre froide, décalée et douce. **Jamais un noir neutre** : l'ombre portée a la couleur des ombres du visage (`--ombre-rvb`, mesurée).

### Shadow Vocabulary
- **Teinte des ombres** (`--ombre-rvb` : `20, 31, 39` clair, soit l'ombre mesurée du visage ; `0, 3, 6` nuit) : toutes les ombres s'écrivent `rgba(var(--ombre-rvb), …)`.
- **Filet de lumière** (`--filet-lumiere` : `rgba(255, 255, 255, .9)` clair ; `rgba(211, 221, 230, .1)` nuit, la couleur des lumières du visage à 10 %) : le trait d'un pixel en haut des surfaces, posé par `--edge-light` (`inset 0 1px 0 var(--filet-lumiere)`). Jamais une valeur en dur.
- **Carte** (`--shadow-card` : `0 1px 0` à 4 % en clair, 35 % en nuit) : un appui à peine visible ; le trait fait le travail.
- **Flottant** (`--shadow-pop` : `0 2px 6px` à 7 % et `0 18px 40px -18px` à 24 % en clair ; en nuit `0 22px 48px -18px` à 75 % et le filet de lumière en haut) : menus, fenêtres, barre latérale.
- **Bouton principal** (`--shadow-cta`) : reflet intérieur d'un pixel et ombre bleue `0 8px 18px -8px` à 55 % en clair ; en nuit le bouton **éclaire** (liseré d'un pixel et lueur `0 10px 28px -8px` de l'accent 500 à 60 %). Le seul bouton qui porte une ombre colorée.

### Named Rules

**La règle « plat au repos ».** Une carte ne gagne pas d'ombre au survol : son trait passe à `--border-2`.

## Shapes

- Rayons : **8 px** (petits éléments, focus, pastilles carrées), **14 px** (boutons secondaires, champs, entrées de navigation), **22 px** (cartes, blocs, document), pilule pour le bouton principal, la recherche et les pastilles d'état.
- Traits de 1 px partout ; aucune bordure latérale colorée de plus de 1 px. L'étape active de la barre latérale est marquée par une barre de 3 px posée hors du bloc.
- Icônes dessinées (lucide-react), trait 1,6 à 2 px, jamais posées dans un rond décoratif.
- Logo provisoire : l'arc d'aurore (deux traits courbes ; le haut en dégradé de la glace à l'azur de l'action, le bas à l'encre, terminé par une braise d'or `--flamme`), SVG en ligne (`components/layout/Logo.tsx`). Aucune couleur d'état.

## Components

### Buttons
- **Shape :** pilule (9999 px) pour le principal, 14 px pour les autres ; 44 px de haut au moins.
- **Primary :** `--accent-fill`, texte blanc 600, reflet intérieur et `--shadow-cta`. Survol : `--accent-fill-hover` et montée d'1 px. Un par écran.
- **Hover / Focus :** 180 ms `cubic-bezier(.2,.8,.2,1)` (`--ease-survol`), sans rebond. Focus : contour 2 px `--accent-ring` décalé de 2 à 3 px.
- **Secondary :** surface `--surface-0`, trait `--border-field`, texte `--text-1` ; au survol, trait et texte bleus.
- **Disabled :** opacité 45 %, aucune ombre.

### Chips (pastilles d'état)
- **Style :** fond `*-soft`, texte `*-ink`, icône + mot, pilule, 12,5 px 600.
- **State :** une pastille = un sens de COULEURS.md. Jamais `--aurore-*`, jamais la couleur seule.

### Cards / Containers
- **Corner Style :** 22 px.
- **Background :** `--surface-0` sur la page `--surface-page`.
- **Shadow Strategy :** `--shadow-card` (voir Elevation).
- **Border :** 1 px `--border-1`.
- **Internal Padding :** 20 à 24 px (16 px au téléphone).
- Jamais de carte dans une carte : à l'intérieur, des rangées séparées par un filet.

### Cartes de résumé (gros chiffres)
- Un chiffre `.chiffre-grand`, un libellé Manrope 600 14 px dessous, un lien d'action à droite du titre.
- Quand il n'y a rien à compter, pas de « 0 » : une phrase dit ce qui apparaîtra ici (« Les avis de la veille arriveront ici chaque matin »).

### Inputs / Fields
- **Style :** surface `--surface-0`, trait 1 px `--border-field` (3:1), rayon 14 px, 44 px de haut.
- **Focus :** contour 2 px `--accent-ring`, décalé.
- **Validation :** message en `--rouge-ink` qui nomme la correction à faire, avec une icône.

### Navigation
- Barre latérale : cinq entrées (Accueil · Mes AO · Mon entreprise · Coffre-fort · Paramètres), icône et nom 11 px dessous, visibles sans survol. Active : fond `--bleu-soft`, texte `--bleu-ink`. Au téléphone : onglets en bas, zones de 44 px.
- Le logo (arc d'aurore) tient la place haute de la barre.

### Aurore (signature)
- Trois ellipses en `radial-gradient` (glace, givre, azur : les trois teintes froides du visage), 140 vw × 34 à 46 vh, animées en `transform` seul sur 28 / 36 / 44 s (aller-retour, `ease-in-out`), sous un masque qui les éteint à 78 % de la hauteur. Aucun `filter: blur`.
- Opacité `--aurore-opacite` : 0,30 le jour (elle se devine), 0,9 la nuit.
- Image fixe sous `prefers-reduced-motion`, en pause quand l'onglet est caché (`visibilitychange`), figée si `navigator.connection.saveData` ou une connexion 2G.

## Do's and Don'ts

### Do:
- **Do** écrire en mots positifs : « À ajouter », « À téléverser », « À compléter ». Synorix parle à la 3ᵉ personne et propose toujours une action.
- **Do** remplacer un compteur vide par une phrase qui dit ce qui apparaîtra ici.
- **Do** réserver la serif au `h1` de la page et au texte du mémoire.
- **Do** garder le bleu `--accent-*` comme seule couleur d'action, et un seul bouton en dégradé par écran.
- **Do** rejouer `node scripts/mesure-visage.mjs` puis `node scripts/palette-visage.mjs --ecrire` quand le visage change : la palette suit la mesure.
- **Do** accompagner chaque couleur d'état d'un mot et d'une icône ; dans un bloc, la plus urgente gagne.
- **Do** poser les nombres en chiffres tabulaires (`.chiffres`, `.chiffre-grand`).
- **Do** donner 44 px à toute cible tactile et vérifier chaque écran à 390 px sans débordement horizontal.
- **Do** respecter « réduire les animations » : l'aurore devient une image fixe, les transitions sont coupées (règle globale de `theme.css`).
- **Do** vérifier les contrastes dans les deux thèmes : texte 4,5:1, interface 3:1.

### Don't:
- **Don't** utiliser « manquant », « absent », « incomplet », « défaillant », ni de point d'exclamation.
- **Don't** afficher un gros « 0 ».
- **Don't** mettre la serif sur un titre de carte, un bouton ou un chiffre.
- **Don't** introduire une deuxième couleur d'action ni colorer un fond de carte avec un état.
- **Don't** aligner des cartes identiques en grille (icône + titre + texte répétés).
- **Don't** poser une icône dans un rond décoratif.
- **Don't** écrire un surtitre en capitales monospace au-dessus d'un titre.
- **Don't** faire rebondir quoi que ce soit (`cubic-bezier(.34,1.56,.64,1)` est banni), ni faire entrer des éléments en scène au défilement.
- **Don't** mettre l'aurore devant le contenu, ni l'animer autrement qu'en `transform`.
- **Don't** colorer une pastille d'état, un texte d'état ou une barre avec l'accent aurore ni avec l'or.
- **Don't** introduire une teinte de marque absente du visage (vert, turquoise et violet d'aurore sont sortis), ni une ombre en noir neutre, ni un gris pur.
- **Don't** utiliser de dégradé de texte, de bordure latérale colorée de plus de 1 px, de fond quadrillé, de verre décoratif.
