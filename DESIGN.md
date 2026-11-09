---
name: Synorix
description: Réponse aux appels d'offres BTP, du DCE au dossier déposable — « Aurore polaire » (base A, discipline B, gros chiffres C), décidée le 9/11/2026.
colors:
  # Clair (défaut)
  page: "#f3f7fb"
  surface-0: "#ffffff"
  surface-1: "#e8eff7"
  surface-2: "#dde6f0"
  text-1: "#0b1728"
  text-2: "#3b4c62"
  text-3: "#56677d"
  border-1: "#d6e0ea"
  border-2: "#c3d0de"
  border-field: "#7f8da0"
  accent-text: "#0067ba"
  accent-ui: "#0078d6"
  accent-fill: "#0078d6"
  accent-fill-deep: "#0067ba"
  on-accent: "#ffffff"
  aurore-ink: "#0f7a62"
  aurore-mark: "#0f9a78"
  aurore-glow: "rgba(23,176,138,.22)"
  aurore-emeraude: "rgba(46,204,160,.55)"
  aurore-turquoise: "rgba(60,190,210,.45)"
  aurore-bleu: "rgba(70,140,255,.40)"
  bleu-ink: "#0858b0"
  bleu-soft: "#e7f1fd"
  bleu-mark: "#0a6fd6"
  vert-ink: "#17693d"
  vert-soft: "#e5f5ec"
  vert-mark: "#1f9d55"
  ambre-ink: "#8a4b00"
  ambre-soft: "#fff1dc"
  ambre-mark: "#c27c00"
  rouge-ink: "#b42318"
  rouge-soft: "#fdecea"
  rouge-mark: "#e5484d"
  turquoise-ink: "#0b6b6b"
  turquoise-soft: "#e2f4f3"
  turquoise-mark: "#14a3a0"
  gris-ink: "#566373"
  gris-soft: "#eef1f5"
  gris-mark: "#7f8da0"
  surligneur: "#ffe066"
  # Nuit ([data-theme="dark"])
  nuit-page: "#060d1a"
  nuit-surface-0: "#0d1828"
  nuit-surface-1: "#13223a"
  nuit-surface-2: "#1a2c47"
  nuit-text-1: "#eaf1fa"
  nuit-text-2: "#b4c3d6"
  nuit-text-3: "#8ea0b6"
  nuit-border-1: "#1c2a40"
  nuit-border-2: "#2a3d5a"
  nuit-border-field: "#627590"
  nuit-accent-text: "#69b1ff"
  nuit-accent-ui: "#008cf8"
  nuit-accent-fill: "#0078d6"
  nuit-aurore-ink: "#5fe6bb"
  nuit-aurore-mark: "#3fd9ad"
  nuit-aurore-glow: "rgba(63,217,173,.22)"
  nuit-aurore-emeraude: "rgba(46,230,170,.55)"
  nuit-aurore-turquoise: "rgba(50,200,230,.45)"
  nuit-aurore-bleu: "rgba(70,150,255,.45)"
  nuit-bleu-ink: "#8cc8ff"
  nuit-bleu-soft: "rgba(43,155,255,.14)"
  nuit-bleu-mark: "#4aa8ff"
  nuit-vert-ink: "#74d9a0"
  nuit-vert-soft: "rgba(80,200,130,.13)"
  nuit-vert-mark: "#3fbf78"
  nuit-ambre-ink: "#ffc46b"
  nuit-ambre-soft: "rgba(255,170,60,.13)"
  nuit-ambre-mark: "#ffb020"
  nuit-rouge-ink: "#ff8f87"
  nuit-rouge-soft: "rgba(255,90,80,.15)"
  nuit-rouge-mark: "#ff6b63"
  nuit-turquoise-ink: "#5fd4cf"
  nuit-turquoise-soft: "rgba(40,190,180,.14)"
  nuit-turquoise-mark: "#2cc2bc"
  nuit-gris-ink: "#93a1b1"
  nuit-gris-soft: "#141c27"
  nuit-gris-mark: "#627590"
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

Un logiciel qui écrit des documents, pas un tableau de bord de plus. Le jour, un blanc glacé légèrement bleuté (jamais de gris chaud) ; la nuit, un bleu-noir profond (jamais de gris neutre). Derrière le travail, un ciel d'aurores boréales respire lentement en haut de l'écran : il se devine le jour, il se voit la nuit, il ne touche jamais le contenu. Le bleu reste la seule couleur d'action ; les six couleurs d'état ne servent qu'à dire un état ; un fil de lumière vert-turquoise (l'accent aurore) signe la marque sur quelques traits et halos.

La discipline vient de la direction « Précision » : traits d'un pixel plutôt qu'ombres, hiérarchie portée par la taille et la graisse, chiffres tabulaires, couleur rare donc parlante. Les cartes de résumé reprennent les gros chiffres de « Givre », sans le verre : l'état du cabinet se lit d'un coup d'œil, au bureau comme sur un téléphone de chantier en plein soleil.

Le niveau visé est celui d'Apple ou de Samsung : rien qui ressemble à un gabarit généré, rien d'approximatif affiché comme certain. L'abonnement coûte plusieurs centaines d'euros par mois ; chaque écran doit inspirer confiance par la retenue.

**Key Characteristics:**
- Fond glacé `#f3f7fb` / bleu-noir `#060d1a`, surfaces blanches / `#0d1828` séparées par des traits de 1 px.
- Une serif (Newsreader) pour le titre de la page et le texte du mémoire, Manrope pour tout le reste.
- Une seule couleur d'action (bleu `--accent-*`), six couleurs d'état, un accent aurore qui n'est pas un état.
- Gros chiffres tabulaires sur les cartes de résumé ; jamais de gros « 0 ».
- Un seul mouvement continu : l'aurore (3 ellipses, `transform` seul), coupée dès que l'utilisateur, l'onglet ou la connexion le demandent.

## Colors

Un ciel froid et lumineux : neutres bleutés, un bleu d'action franc, un vert-turquoise de lumière réservé à la marque, et six couleurs d'état qui ne disent qu'une chose chacune.

### Primary
- **Bleu Synorix** (`--accent-600` `#0078d6`, texte `--accent-text` `#0067ba` clair / `#69b1ff` nuit) : boutons, liens, sélection, anneau de focus. Le bouton principal est un dégradé `--accent-fill` (700 → 600 en clair, 600 plein en nuit). C'est la seule couleur d'action de l'application.

### Secondary
- **Lumière d'aurore** (`--aurore-ink` `#0f7a62` / `#5fe6bb`, `--aurore-mark` `#0f9a78` / `#3fd9ad`, `--aurore-glow`) : le fil lumineux de la marque (trait sous le titre de l'Accueil, halo du visage de Mon entreprise, sélection de texte, logo). Ce n'est **pas** un état.
- **Ciel** (`--aurore-a` émeraude, `--aurore-b` turquoise, `--aurore-c` bleu) : les trois ellipses du fond. Pas de violet.

### Neutral
- **Givre** (`--surface-page` `#f3f7fb` / `#060d1a`) : fond de page, sous l'aurore.
- **Papier** (`--surface-0` `#ffffff` / `#0d1828`) : cartes, panneaux, document du mémoire, barre latérale.
- **Glace** (`--surface-1` `#e8eff7` / `#13223a`) : survols, en-têtes de bloc, fonds de barre.
- **Glace profonde** (`--surface-2` `#dde6f0` / `#1a2c47`) : survol sur une surface déjà teintée, sélection de rangée.
- **Encre** (`--text-1` `#0b1728` / `#eaf1fa`), **encre 2** (`--text-2` `#3b4c62` / `#b4c3d6`), **encre 3** (`--text-3` `#56677d` / `#8ea0b6`) : texte, texte secondaire, méta. Tous ≥ 4,5:1 sur les trois surfaces et la page.
- **Filet** (`--border-1` `#d6e0ea` / `#1c2a40`) : séparateurs et bords de carte (décoratifs). **Bord de champ** (`--border-field` `#7f8da0` / `#627590`) : contrôles, ≥ 3:1 sur toute surface.

### Les six sens (COULEURS.md, 3/11/2026)

Chaque sens a trois jetons : `*-ink` (texte), `*-soft` (fond de pastille), `*-mark` (barre, point, bordure).

| Couleur | Sens | Exemples |
|---|---|---|
| Bleu `--bleu-*` | en cours, action, information, lien | étape en cours, « Plan proposé : 11 parties », AO déposé en attente du résultat |
| Vert `--vert-*` | fait, prêt, validé, gagné, consommation normale (< 70 %) | étapes faites du fil, « 9 sur 9 prêtes », « Gagné », jauge d'unités |
| Ambre `--ambre-*` | à surveiller | remise dans 4 à 7 jours, « À décider », informations à renseigner, pièce bientôt expirée, consommation 70 à 90 % |
| Rouge `--rouge-*` | urgent ou négatif | remise dans 3 jours ou moins, date dépassée, pièce expirée, « Perdu », consommation > 90 % |
| Turquoise `--turquoise-*` | veille | « Nouveau », « Trouvé par la veille », nouveaux avis |
| Gris `--gris-*` | à venir, pas commencé, sans suite, archivé | étapes à venir, « Sans suite » |

Le gris `mark` est remonté à `#7f8da0` (clair) / `#627590` (nuit) pour atteindre 3:1 : un segment « à venir » reste perceptible.

### Named Rules

**La règle « jamais la couleur seule ».** Un état porte toujours un mot, et une icône (WCAG 1.4.1). La couleur confirme, elle n'informe jamais seule.

**La règle « la plus urgente gagne ».** Plusieurs états dans un même bloc : le bloc prend la couleur la plus urgente (rouge > ambre > bleu > vert > turquoise > gris). La pastille de Mes AO dans la barre latérale suit la même règle.

**La règle « une voix d'action ».** Le bleu `--accent-*` est la seule couleur d'action. Un seul bouton en dégradé par écran (« Nouvel appel d'offres », ou l'action qui fait avancer l'AO).

**La règle « l'aurore n'est pas un état ».** `--aurore-*` ne colore jamais un fond de pastille, un texte d'état ni une barre de progression.

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

La profondeur vient de la lumière et des traits, pas des ombres. Au repos, une carte est une surface `--surface-0` bordée d'un trait `--border-1` de 1 px, avec une ombre presque nulle. Seuls les éléments qui flottent au-dessus du contenu (menus, fenêtres, infobulles, notifications, barre latérale) portent une ombre froide, décalée et douce, teintée du bleu-noir de l'encre.

### Shadow Vocabulary
- **Carte** (`--shadow-card` : `0 1px 0 rgba(11,23,40,.03)` clair, `0 1px 0 rgba(0,0,0,.28)` nuit) : un appui à peine visible ; le trait fait le travail.
- **Flottant** (`--shadow-pop` : `0 2px 6px rgba(11,23,40,.06), 0 18px 40px -18px rgba(11,23,40,.22)` clair ; `0 2px 6px rgba(0,0,0,.45), 0 22px 48px -18px rgba(0,0,0,.7)` nuit) : menus, fenêtres, barre latérale.
- **Bouton principal** (`--shadow-cta` : reflet intérieur 1 px + `0 8px 18px -8px` bleu à 55 %) : le seul bouton qui porte une ombre colorée.

### Named Rules

**La règle « plat au repos ».** Une carte ne gagne pas d'ombre au survol : son trait passe à `--border-2`.

## Shapes

- Rayons : **8 px** (petits éléments, focus, pastilles carrées), **14 px** (boutons secondaires, champs, entrées de navigation), **22 px** (cartes, blocs, document), pilule pour le bouton principal, la recherche et les pastilles d'état.
- Traits de 1 px partout ; aucune bordure latérale colorée de plus de 1 px. L'étape active de la barre latérale est marquée par une barre de 3 px posée hors du bloc.
- Icônes dessinées (lucide-react), trait 1,6 à 2 px, jamais posées dans un rond décoratif.
- Logo provisoire : l'arc d'aurore (deux traits courbes, dégradé émeraude → turquoise → bleu), SVG en ligne (`components/layout/Logo.tsx`).

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
- Trois ellipses en `radial-gradient` (émeraude, turquoise, bleu), 140 vw × 34 à 46 vh, animées en `transform` seul sur 28 / 36 / 44 s (aller-retour, `ease-in-out`), sous un masque qui les éteint à 78 % de la hauteur. Aucun `filter: blur`.
- Opacité `--aurore-opacite` : 0,26 le jour (elle se devine), 0,9 la nuit.
- Image fixe sous `prefers-reduced-motion`, en pause quand l'onglet est caché (`visibilitychange`), figée si `navigator.connection.saveData` ou une connexion 2G.

## Do's and Don'ts

### Do:
- **Do** écrire en mots positifs : « À ajouter », « À téléverser », « À compléter ». Synorix parle à la 3ᵉ personne et propose toujours une action.
- **Do** remplacer un compteur vide par une phrase qui dit ce qui apparaîtra ici.
- **Do** réserver la serif au `h1` de la page et au texte du mémoire.
- **Do** garder le bleu `--accent-*` comme seule couleur d'action, et un seul bouton en dégradé par écran.
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
- **Don't** colorer une pastille d'état, un texte d'état ou une barre avec l'accent aurore.
- **Don't** utiliser de dégradé de texte, de bordure latérale colorée de plus de 1 px, de fond quadrillé, de verre décoratif.
