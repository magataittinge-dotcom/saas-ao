---
name: Synorix
description: Réponse aux appels d'offres BTP, du DCE au dossier déposable — « Aurore polaire » (base A, discipline B, gros chiffres C), décidée le 9/11/2026 ; couleurs tirées du visage par la mesure le 10/11/2026 ; socle (grille, composants, mouvement, garde-fous) posé le 10/11/2026.
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
  nuit-border-1: "rgba(211,221,230,.09)"
  nuit-border-2: "rgba(211,221,230,.16)"
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
    fontSize: "17px"
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
    fontWeight: 500
    lineHeight: 1.4
  chiffre-grand:
    fontFamily: "Manrope Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(40px, 24px + 2vw, 48px)"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.03em"
    fontFeature: "\"tnum\" 1, \"lnum\" 1"
  data:
    fontFamily: "Manrope Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "\"tnum\" 1, \"lnum\" 1"
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
  gouttiere-tablette: "24px"
  gouttiere-bureau: "32px"
  conteneur: "1200px"
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

> Source de vérité des jetons : `frontend/src/styles/theme.css` (clair et nuit). Ce document en donne le sens ; en cas d'écart, le code fait foi et ce document se corrige. Le design se mesure à chaque fusion : `frontend/tests/garde-fous-design.test.ts` compte les écarts aux échelles, fichier par fichier, et échoue au premier écart nouveau (voir « Garde-fous »). Référence visuelle de chaque composant, dans chaque état : la page `/design`.

## Overview

**Étoile polaire : « Aurore polaire »**

Un logiciel qui écrit des documents, pas un tableau de bord de plus. Le jour, un blanc glacé légèrement bleuté (jamais de gris chaud) ; la nuit, le bleu-noir des ombres du visage (jamais de gris neutre, jamais de noir). Derrière le travail, un ciel d'aurores boréales respire lentement en haut de l'écran : il se devine le jour, il se voit la nuit, il ne touche jamais le contenu. **La marque sort du visage de Synorix : ce qui n'est pas dans le visage n'est pas dans la marque.** Le bleu de son verre reste la seule couleur d'action ; les six couleurs d'état ne servent qu'à dire un état ; un fil de lumière glacée (l'accent aurore) signe la marque sur quelques traits et halos ; l'or de sa flamme est la seule couleur chaude, de la lumière seulement : la pointe du fil, l'éclat du halo du visage, la braise du logo.

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
- **Or de la flamme** (`--flamme` `#ecac2f` / `#fdbe51`, `--flamme-glow`) : la seule teinte chaude de la marque (78,5°). De la **lumière** seulement (variante B) : la pointe d'or du fil d'aurore (son dernier cinquième), l'éclat d'or du halo du visage (`.eclat-or`, un arc court), la braise du logo. Jamais un texte, une pastille, un point d'état, une barre de progression ni un fond de bouton ; aucune classe Tailwind ne l'expose ; au plus 1 % de l'écran.

### Neutral
Tous les neutres sont à la teinte des ombres du visage (237,2°), avec une chroma supérieure à zéro : jamais un gris pur. Seul le papier est blanc.
- **Givre** (`--surface-page` `#f2f8fc` / `#070e13`) : fond de page, sous l'aurore. En nuit, c'est exactement le fond des clips du visage : le visage se pose sur la page sans bord.
- **Papier** (`--surface-0` `#ffffff` / `#0a1922`) : cartes, panneaux, document du mémoire, barre latérale.
- **Glace** (`--surface-1` `#e6eef4` / `#112430`) : survols, en-têtes de bloc, fonds de barre.
- **Glace profonde** (`--surface-2` `#dae5ec` / `#192f3d`) : survol sur une surface déjà teintée, sélection de rangée.
- **Encre** (`--text-1` `#061620` / `#ecf3f8`), **encre 2** (`--text-2` `#364b58` / `#b7c9d4`), **encre 3** (`--text-3` `#4e6472` / `#92a6b4`) : texte, texte secondaire, méta. Tous ≥ 4,5:1 sur les quatre surfaces.
- **Filet** (`--border-1` `#d3dee6` / `rgba(211, 221, 230, .09)` ; au survol `--border-2` `#becdd7` / `rgba(211, 221, 230, .16)`) : séparateurs et bords de carte (décoratifs). En nuit, le filet est la lumière du visage **en transparence**, plus un gris opaque : il prend la couleur de la surface qu'il borde et s'en distingue sur chacune (1,19 à 1,26:1 au repos, 1,43 à 1,53:1 au survol ; l'ancien `#192d39` tombait à 1,03:1 sur la glace profonde). L'alpha est résolu par le script. **Bord de champ** (`--border-field` `#6d808d` / `#6d8493`) : contrôles, ≥ 3:1 sur toute surface, glace profonde comprise.

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

**La règle « une couleur vive, rare, sur un champ calme ».** La couleur vive (chroma ≥ 0,10) occupe au plus 6 % de l'écran, aurore comprise : un bouton principal, la rangée active, les liens ; le reste est neutre. Mesuré sur les captures du 10/11 : 0,7 à 1,2 % à 1 440 px en clair, 1,8 à 2,8 % en nuit ; 0,7 à 3,2 % et 1,9 à 4,9 % à 390 px. L'or reste une étincelle : au plus 1 % de l'écran. La lueur d'aube de la variante B (une ellipse d'or dans le ciel) a été retirée le 10/11 : elle passait derrière des titres et se lisait comme un reflet ; l'aurore n'a que du bleu.

**La règle « jamais la couleur seule ».** Un état porte toujours un mot, et une icône (WCAG 1.4.1). La couleur confirme, elle n'informe jamais seule.

**La règle « la plus urgente gagne ».** Plusieurs états dans un même bloc : le bloc prend la couleur la plus urgente (rouge > ambre > bleu > vert > turquoise > gris). La pastille de Mes AO dans la barre latérale suit la même règle.

**La règle « une voix d'action ».** Le bleu `--accent-*` est la seule couleur d'action. **Un seul aplat d'accent par écran** : l'action qui fait avancer (`<Bouton variante="principal">`). Dès qu'un écran montre la sienne, « Nouvel appel d'offres » de la barre passe au trait, tout seul. Un élément sélectionné n'est **jamais** un aplat : onglet, segment et entrée de menu choisis = surface neutre et texte plein ; filtre actif = fond `--bleu-soft`, texte `--bleu-ink`, trait `--bleu-mark`. Une action destructrice n'est jamais un aplat (au trait rouge).

**La règle « la coquille est neutre ».** Barre latérale, barre du haut et barre du bas ne portent aucun fond d'accent : l'entrée active a un fond `--surface-1` et un texte `--text-1` ; seules son icône et sa barre de 3 px sont à `--accent-ui`.

**La règle « une seule palette d'états ».** Les six sens (`--bleu-*` … `--gris-*`). Les anciens noms (`--info / --success / --warning / --danger`, et les classes Tailwind qui en sortent) sont de **simples alias** des sens bleu, vert, ambre et rouge, en clair comme en nuit : `bg` = `soft`, `fg` = `ink`, `border` = `mark` (`--info-bg: var(--bleu-soft)`, écrit par le script). Un écran qui les emploie encore prend donc les couleurs des six sens ; ils ne s'emploient plus, un garde-fou compte leurs derniers usages et un test vérifie que chaque ancien nom vaut exactement son sens.

**La règle « l'aurore n'est pas un état ».** `--aurore-*` et `--flamme` ne colorent jamais un fond de pastille, un texte d'état ni une barre de progression.

**La règle « en nuit, la seule lumière colorée est l'aurore ».** En nuit, les accents sont plus clairs qu'en clair (texte d'accent 300, interface 500, encres d'état relevées) et la profondeur vient de surfaces qui s'éclaircissent et d'un filet de lumière d'un pixel en haut des surfaces. Aucune lueur ni ombre colorée, pas même sous le bouton principal : l'aurore et le halo du visage sont les seules lumières colorées de l'écran (`tests/palette-visage.test.ts` : aucune ombre de nuit dont la chroma dépasse 0,04).

## Typography

**Display Font:** Newsreader (variable, axe optique `opsz`), repli `ui-serif, Georgia, serif`
**Body Font:** Manrope (variable), repli `ui-sans-serif, system-ui, Segoe UI, Roboto, Arial, sans-serif`
**Données :** Manrope à chiffres tabulaires. **Aucune police à chasse fixe dans l'interface** (ni pastille, ni « LOT 01 », ni pourcentage) ; le paquet Geist Mono reste installé mais ne sert plus.

**Character:** une serif de lecture, froide et nette, posée sur une grotesque géométrique et calme : l'interface d'un outil, la voix d'un document.

**Pourquoi Newsreader plutôt qu'Instrument Serif :** rendues côte à côte à taille réelle (`.claude/echange/sprint-ozcan/design/phase1/serif-comparaison-{clair,nuit}.png`), Newsreader tient le paragraphe du mémoire à 17 px grâce à son axe optique et ses graisses 400 à 600, alors qu'Instrument Serif, étroite et en une seule graisse, ne sert qu'aux titres et fatigue la lecture longue.

Toutes les polices sont auto-hébergées (`@fontsource`), sous-ensembles latin et latin-ext seulement, `font-display: swap`, aucune requête vers un service tiers.

### Hierarchy
- **Titre de page** (Newsreader 500, `clamp(2rem, 1.4rem + 1.6vw, 2.75rem)`, interligne 1,1, approche −0,01 em, `text-wrap: balance`) : **le seul `h1` de l'écran**, posé par `<Page>` (ou par le gabarit d'une étape d'AO). Jamais sous 28 px.
- **Texte du mémoire** (Newsreader 400, 17 px, interligne 1,65, 72 caractères au plus par ligne, chiffres proportionnels) : Rédiger et les aperçus du mémoire.
- **Échelle de l'interface, fermée : sept tailles et pas une autre** : 11 (`text-micro`, libellés des barres) · 12,5 (`text-xs`, libellés, pastilles, en-têtes de colonne) · 13,5 (`text-sm`, méta, contrôles) · 15 (`text-base`, corps) · 17 (`text-lg`, titre de carte ou de section, 600) · 22 (`text-xl`, titre d'un bloc d'écran, 600), plus le `h1`. Le gros chiffre (40 à 48 px) reste à part. Seule exception : 16 px dans un champ au téléphone (pas de zoom d'iOS).
- **Trois graisses** : 400 (texte), 500 (libellés, contrôles, navigation), 600 (titres, chiffres). Rien au-dessus, rien en dessous. L'aperçu de fiche PDF, qui est un document, garde les siennes.
- **Approche** : −0,03 em sur le gros chiffre, −0,01 em sur les titres de 17 et 22 px et sur le `h1`, 0 jusqu'à 15 px. Jamais d'approche positive.
- **Aucune capitale forcée** : en-têtes de colonne, titres de section et pastilles en casse de phrase.

### Named Rules

**La règle « serif au sommet ».** La serif sert au `h1` de la page et au texte du mémoire, et à rien d'autre : ni titres de carte, ni boutons, ni chiffres.

**La règle « chiffres alignés ».** Le texte courant et les dates sont en chiffres proportionnels (en tabulaires, les « 1 » s'écartent : « Mercredi 1 1 novembre »). Les chiffres tabulaires sont réservés aux colonnes de nombres : la classe `.chiffres` (tabulaires + alignés) et les colonnes `nombre` du `Tableau` ; le gros chiffre d'une case (`.chiffre-grand`) est seul, donc proportionnel.

**La règle « un titre, une fois ».** Le petit titre de la barre du haut n'apparaît que lorsque le `h1` est sorti de l'écran (la coquille l'observe : fondu de 100 ms, aucun saut de mise en page) ; il ne le double jamais. Dans un AO, la barre porte le chemin « Mes AO / nom de l'AO » : c'est de la navigation ; le `h1` est le titre de l'étape.

## Layout

- **Un seul conteneur, un seul bord gauche.** Le conteneur (`.conteneur` : 1 200 px de contenu, gouttière `--gutter` de 16 px au téléphone, 24 px à partir de 769 px, 32 px à partir de 1 200 px) est posé UNE fois par la coquille (`layout/Layout.tsx`), autour de l'écran et dans la barre du haut : le titre de la barre, le `h1`, les titres de section et les surfaces partent du même x. **Une route ne pose ni largeur ni marge latérale** : elle rend `<Page titre sousTitre action>` (`components/ui/page.tsx`). Un écran étroit (`etroite`, 760 px) s'aligne à gauche dans le conteneur, il ne se recentre pas. Rédiger (`pleine`) est le seul écran en pleine largeur, à la gouttière ; la barre du haut le suit.
- Coquille : barre latérale flottante de 76 px à gauche sur ordinateur (marge 16 px), onglets en bas sous 769 px. Barre du haut : 64 px (56 px et deux actions au plus au téléphone : la recherche et « + » ; le thème et les notifications sont dans « Compte »). Rien ne s'empile au-dessus.
- **Rythme** : base 4 px (4 · 8 · 12 · 16 · 20 · 30 · 40). Trois fois plus d'air au-dessus d'un titre de section qu'en dessous : 40 / 16 px (30 / 12 au téléphone, `.titre-section`) ; 12 px entre deux surfaces sœurs.
- Cartes de résumé : une seule surface découpée par des filets (`BandeCases`), jamais une grille de cartes identiques.
- Au téléphone : une colonne et les mêmes composants ; une rangée de tableau s'empile ; rien ne défile de côté. Aucun débordement horizontal jusqu'à 390 px.
- L'aurore est posée une fois, dans `Layout.tsx`, en `position: fixed; inset: 0; z-index: 0`, derrière la coquille.
- Mesure : `design/scenarios/grille.mjs` (banc) vérifie les bords gauche et droit de chaque écran à 1 440 et 390 px, à 1 px près.

## Elevation & Depth

La profondeur vient de la lumière et des traits, pas des ombres. Au repos, une carte est une surface `--surface-0` bordée d'un trait `--border-1` de 1 px, avec une ombre presque nulle. Seuls les éléments qui flottent au-dessus du contenu (menus, fenêtres, infobulles, notifications, barre latérale) portent une ombre froide, décalée et douce. **Jamais un noir neutre** : l'ombre portée a la couleur des ombres du visage (`--ombre-rvb`, mesurée).

### Shadow Vocabulary
- **Teinte des ombres** (`--ombre-rvb` : `20, 31, 39` clair, soit l'ombre mesurée du visage ; `0, 3, 6` nuit) : toutes les ombres s'écrivent `rgba(var(--ombre-rvb), …)`.
- **Filet de lumière** (`--filet-lumiere` : `rgba(255, 255, 255, .9)` clair ; `rgba(211, 221, 230, .1)` nuit, la couleur des lumières du visage à 10 %) : le trait d'un pixel en haut des surfaces, posé par `--edge-light` (`inset 0 1px 0 var(--filet-lumiere)`). Jamais une valeur en dur.
- **Carte** (`--shadow-card` : `0 1px 0` à 4 % en clair ; en nuit `0 1px 0` à 35 % et le filet de lumière `inset 0 1px 0` en haut de la surface) : un appui à peine visible ; le trait fait le travail.
- **Flottant** (`--shadow-pop` : `0 2px 6px` à 7 % et `0 18px 40px -18px` à 24 % en clair ; en nuit `0 22px 48px -18px` à 75 % et le filet de lumière en haut) : menus, fenêtres, barre latérale.
- **Bouton principal** (`--shadow-cta`) : reflet intérieur d'un pixel et ombre bleue `0 8px 18px -8px` à 55 % en clair ; en nuit, **ni ombre ni lueur** : le reflet d'un pixel seul (`inset 0 1px 0 rgba(255, 255, 255, .22)`), le bouton se détache par son aplat. Le seul bouton qui porte une ombre colorée, et en clair seulement.

### Named Rules

**La règle « plat au repos ».** Une carte ne gagne pas d'ombre au survol : son trait passe à `--border-2`.

## Shapes

- **Quatre rayons** : **8 px** (petits éléments, focus, éléments de menu), **14 px** (boutons secondaires, champs, listes, entrées de navigation, menus), **22 px** (cartes, blocs, dialogues, document), **pilule** (bouton principal, recherche, filtres, pastilles). 4 px seulement sous 24 px de haut. Un enfant n'a jamais un rayon supérieur à celui de son parent. Les noms de Tailwind renvoient à ces jetons (`rounded-md` 8, `rounded-lg` 14, `rounded-xl` à `-3xl` 22) ; l'ancien 28 px est retiré.
- Traits de 1 px partout ; aucune bordure latérale colorée de plus de 1 px. L'étape active de la barre latérale est marquée par une barre de 3 px posée hors du bloc.
- Icônes dessinées (lucide-react), trait 1,6 à 2 px, jamais posées dans un rond décoratif.
- Logo provisoire : l'arc d'aurore (deux traits courbes ; le haut en dégradé de la glace à l'azur de l'action, le bas à l'encre, terminé par une braise d'or `--flamme`), SVG en ligne (`components/layout/Logo.tsx`). Aucune couleur d'état.
- Halo du visage rond (`VisageRond`) : liseré bleu `--aurore-mark` et un éclat d'or, un arc court (`.eclat-or`).

## Components

Un seul jeu de composants, dans `frontend/src/components/ui/`, aux jetons seulement, **44 px de haut**, une forme par rôle. Les anciens noms (`Button`, `Input`, `Card`, `Badge`, `Skeleton`, `StatusBadge`, `DeleteConfirmModal`, `EchecAction`, `toast`, `MenuLigne`) sont des alias minces vers lui. États de chaque contrôle : repos, survol, focus visible (contour de 2 px `--accent-ring`, décalé), appui, désactivé (45 %), en cours, erreur.

### Buttons (`Bouton`, `BoutonIcone`)
- **principal** : pilule, `--accent-fill`, texte blanc 600, `--shadow-cta`. Un par écran. **secondaire** (par défaut) : papier, trait `--border-field`, rayon 14. **discret** : sans trait. **danger** : au trait rouge, jamais un aplat. **lien**.
- **Survol** : le fond change (`--accent-fill-hover`, `--surface-1`), **rien ne bouge**. **Appui** : `scale(.98)` en 100 ms. **En cours** : le libellé change (« Enregistrement… ») et le bouton se désactive ; aucune roue qui tourne.

### Chips (`PastilleEtat`, `PastilleCompte`)
- Fond `*-soft`, texte `*-ink`, une icône et un mot, pilule, 12,5 px / 500, casse de phrase. Une pastille = un des six sens. Jamais `--aurore-*`, jamais l'or, jamais la couleur seule.

### Cards / Containers (`Carte`, `TitreCarte`, `RangeeCarte`)
- Papier `--surface-0`, trait 1 px `--border-1`, rayon 22, `--shadow-card`, marge intérieure 20 à 24 px. Plate au repos : au survol d'une carte cliquable, seul le trait passe à `--border-2`.
- Jamais de carte dans une carte : à l'intérieur, des rangées séparées par un filet (52 px au moins).

### Cases de résumé (`CaseResume`, `BandeCases`)
- **L'étiquette en haut** (13,5 px / 500), **la valeur dessous**. Un nombre supérieur à 0 : le gros chiffre `.chiffre-grand`, **seul** ; l'unité seulement si elle ajoute un sens (« 2 à poser »). Jamais l'étiquette répétée à côté de la valeur ; le sous-titre du `h1` dit autre chose que la première case.
- Rien à compter : « Aucune » ou « Aucun », en texte ; jamais un gros « 0 ».

### Inputs / Fields (`Champ`, `ZoneTexte`, `ChampRecherche`, `ChampDate`, `ChampNombre`, `ListeDeroulante`, `CaseACocher`, `GroupeRadio`, `Interrupteur`, `GroupeChamp`)
- Saisie et liste déroulante : la même forme, rectangle de 14 px, 44 px (au bureau aussi), trait `--border-field` (3:1). Recherche : pilule. **Aucun contrôle natif visible** : la liste (Radix Select), la date (jj/mm/aaaa) et le nombre sont dessinés.
- Focus : trait et contour `--accent-ring`. Validation à la sortie du champ : message en `--rouge-ink` qui nomme la correction à faire, avec une icône. L'aide est un exemple, pas une consigne.
- **Filtre** (`PuceFiltre`) : une puce à deux états, proposée (« + Métier ») ou active (elle porte sa valeur et sa croix). « Effacer les filtres » en fin de rangée, seulement si un filtre est actif.

### Tableaux (`Tableau`)
- Une surface à filets horizontaux de 1 px : aucun trait vertical, aucune zébrure. Texte à gauche, nombres et dates à droite en chiffres tabulaires. Rangées de 52 px, cliquables entières. En-tête 12,5 px / 500 `--text-3`, casse de phrase, collant.
- 0 ligne : pas de tableau, l'état vide. Jusqu'à 50 : tout. Au-delà : pages de 50 (« 1–50 sur 312 »). Cellule sans objet : « — ». Le tableau du mémoire est un document : il garde sa grille.

### Chargement, erreur, vide (`EtatRequete`, `Squelette`, `EtatErreur`, `EtatVide`)
- Toujours dans cet ordre : **chargement → erreur → vide → contenu** (`lib/requete.ts`). Une erreur du serveur ne s'affiche jamais comme « vous n'avez rien ».
- **Chargement** : rien pendant 200 ms, puis un squelette **fixe**, aux dimensions du contenu, à la glace du thème (jamais noir sur une page claire), visible 400 ms au moins.
- **Erreur** : ce qui n'a pas pu se faire, en mots simples, et « Réessayer ». Jamais une pile d'appels ni de l'anglais.
- **Vide** : trois éléments (ce qui apparaîtra ici, quand en 14 mots au plus, une seule action dont le verbe répond au titre). Vide par filtre : une autre phrase et « Effacer les filtres », jamais une invitation à créer. Ni compteur « (0) », ni cadre en pointillés.

### Surcouches (`Dialogue`, `DialogueConfirmation`, `Menu`, `Infobulle`, `Sheet`, `Message`, toast)
- Un seul de chaque, sur Radix (piège de focus, Échap, retour du focus). Voile sans flou. Un dialogue ne sert qu'à interrompre ou protéger un geste ; une confirmation porte la question en titre et le verbe sur son bouton.
- **Message** en ligne : là où le fait se produit, une seule fois (jamais sous le bouton et dans la barre du bas). **Toast** : en bas de l'écran, jamais sur la barre du haut. **Infobulle** : jamais un `title=` natif, jamais une information nécessaire.

### Navigation
- Barre latérale : cinq entrées (Accueil · Mes AO · Entreprise · Coffre-fort · Paramètres), icône et nom 11 px dessous, **sur une ligne** (le nom complet « Mon entreprise » reste le titre de la page, l'`aria-label` et l'entrée de Ctrl K). Active : fond `--surface-1`, texte `--text-1`, icône et barre de 3 px `--accent-ui`. Au téléphone : cinq onglets en bas, libellé d'une ligne, zones de 56 px, aucune action dedans.
- Le rond du compte : la photo, sinon l'initiale du prénom, sinon une icône de personne. Jamais « – », jamais l'e-mail. Son menu porte le thème (« Système · Clair · Nuit » ; sans choix : Système) et le réglage « Animer le fond ».
- Le bandeau « Nouveau » n'est pas dans la coquille.

### L'état d'un appel d'offres (`lib/etatAO.ts`, `MettreAJourStatut`)
- Une seule source pour tous les écrans : **en cours**, **à mettre à jour** (remise passée sans statut mis à jour), **terminé**. Une remise passée n'a qu'une action : « Mettre à jour le statut » (jamais « Télécharger »). « À la une » = la prochaine remise à venir ; aucune à venir : pas de bloc. La phrase et les faits viennent de la même source ; les accords suivent le nombre.
- Un seul vocabulaire : étape Pièces = « Réunir les pièces », étape Export = « Télécharger le dossier ».

### La coquille d'un AO (`routes/Project.tsx`, `StepProgress`, `GabaritEtape`, `BarreEtape`)
- La barre du haut porte « Mes AO / nom de l'AO » ; une ligne de contexte (acheteur, lot, remise) ; le fil des sept étapes (faite : coche verte ; active : anneau d'accent sur papier, jamais un aplat ; à venir : anneau gris) ; puis l'étape, dont le titre est le `h1`.
- Le bouton « ? » de l'en-tête déplie trois lignes **dans l'écran** : ce que montre l'écran, ce que vous avez à faire, les mots de l'écran (sigles de `lib/lexique.ts`). Ni bulle flottante, ni visite guidée, ni lien d'aide.
- Une seule action principale : la barre du bas (flottante, sans verre) cède l'aplat au bouton de l'en-tête quand il existe. Le message d'échec d'une étape est posé une fois, sous l'en-tête.

### Le visage (`SynorixParle`)
- Le visage n'apparaît que **là où Synorix parle**, à côté de sa phrase, **une fois par écran au plus**. Jamais en vignette d'un AO, jamais dans une ligne ou une carte d'AO, jamais en décor ni au bout du fil des étapes. Il est à sa taille sur « Mon entreprise ».

### Mouvement
- **Trois durées** : 100 ms (couleur au survol, appui, fondu d'un écran, fermetures), 180 ms (contrôles, menus), 280 ms (dialogues, panneaux, feuilles). **Une courbe** : `--ease-survol` (`cubic-bezier(.2,.8,.2,1)`), sans dépassement. Les autres jetons et les nombres de Tailwind en sont des alias.
- On n'anime que `transform`, `opacity` et les couleurs, propriété par propriété. Jamais `transition: all`.
- Un changement d'écran ne se met pas en scène : un fondu de 100 ms au plus, sans translation ni cascade.
- **Rien ne boucle, sauf l'aurore et le visage** : ni squelette qui pulse, ni point qui pulse, ni roue qui tourne. Une attente longue montre une barre qui avance pour de vrai, ou le visage à côté de la phrase de Synorix.
- Mesures (60 images par seconde au défilement et au changement de page) : `.claude/echange/sprint-ozcan/design/socle/MOUVEMENT.md`.

### Aurore (signature)
- Trois ellipses en `radial-gradient` (glace, givre, azur : les trois teintes froides du visage), 140 vw × 34 à 46 vh, animées en `transform` seul sur 28 / 36 / 44 s (aller-retour), sous un masque qui les éteint à 78 % de la hauteur. Aucun `filter: blur`. Aucune teinte chaude dans le ciel.
- Opacité `--aurore-opacite` : 0,30 le jour (elle se devine), **0,66 la nuit** : plafonnée pour que le titre et sa sous-ligne tiennent 4,5:1 sur le cœur des rubans (mesuré sur capture : 8,0:1 pour `--text-1`, 5,3:1 pour `--text-2` ; `--text-3` ne se pose pas dans l'en-tête de page).
- Image fixe sous `prefers-reduced-motion`, en pause quand l'onglet est caché, figée si `saveData` ou connexion 2G, et quand l'utilisateur coupe « Animer le fond » (menu du compte).

### Garde-fous (`frontend/tests/garde-fous-design.test.ts`, `tests/dette-design.json`)
- Dix-neuf règles comptent leurs écarts par fichier : couleur en dur, seconde palette, taille, graisse, rayon, durée, police, capitales, approche positive, `transition-all`, contrôle natif, infobulle native, composant maison, boucle, aplat d'accent, état d'AO hors module, style en ligne, visage en vignette, page sans conteneur.
- **Une dette par fichier, qui ne peut que diminuer** : un fichier hors liste a droit à zéro ; un fichier qui dépasse son compte fait échouer `npm test`. Après une correction : `DETTE=baisser npm test -- garde-fous-design`.
- À l'écran : `design/scenarios/grille.mjs` (bords, un `h1`, un visage, un aplat au plus) et `design/socle/mesure-mouvement.mjs`.

## Do's and Don'ts

### Do:
- **Do** écrire en mots positifs : « À ajouter », « À téléverser », « À compléter ». Synorix parle à la 3ᵉ personne et propose toujours une action.
- **Do** remplacer un compteur vide par une phrase qui dit ce qui apparaîtra ici.
- **Do** réserver la serif au `h1` de la page et au texte du mémoire.
- **Do** garder le bleu `--accent-*` comme seule couleur d'action, et un seul aplat d'accent par écran.
- **Do** rendre `<Page>` dans chaque route, et lire toute donnée par `<EtatRequete>` (chargement, erreur, vide, contenu).
- **Do** appeler `lib/etatAO.ts` pour dire où en est un appel d'offres.
- **Do** baisser la dette de design du fichier qu'on touche (`DETTE=baisser npm test -- garde-fous-design`).
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
- **Don't** écrire un surtitre au-dessus d'un titre, ni forcer des capitales, ni employer une police à chasse fixe dans l'interface.
- **Don't** poser une largeur ou une marge latérale dans une route, ni répéter le titre de la page dans la barre du haut.
- **Don't** afficher une erreur comme un écran vide, ni un squelette qui pulse, ni une roue qui tourne.
- **Don't** utiliser un contrôle natif visible (`<select>`, date, nombre, case, `title=`, `confirm(`), ni écrire un dialogue ou un menu à la main.
- **Don't** faire bouger un élément au survol, ni écrire `transition: all`, ni une durée hors de 100 / 180 / 280 ms.
- **Don't** montrer le visage en vignette d'un appel d'offres, ni plus d'une fois par écran.
- **Don't** proposer « Télécharger le dossier » sur une remise passée : sa seule action est « Mettre à jour le statut ».
- **Don't** faire rebondir quoi que ce soit (`cubic-bezier(.34,1.56,.64,1)` est banni), ni faire entrer des éléments en scène, au défilement comme au changement d'écran.
- **Don't** mettre l'aurore devant le contenu, ni l'animer autrement qu'en `transform`.
- **Don't** colorer une pastille d'état, un texte d'état ou une barre avec l'accent aurore ni avec l'or.
- **Don't** introduire une teinte de marque absente du visage (vert, turquoise et violet d'aurore sont sortis), ni une ombre en noir neutre, ni un gris pur.
- **Don't** utiliser de dégradé de texte, de bordure latérale colorée de plus de 1 px, de fond quadrillé, de verre décoratif.
