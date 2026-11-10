// Garde-fous du design (P30) : les règles, le relevé par fichier et le lot de chaque fichier.
// Le test est tests/garde-fous-design.test.ts ; la dette par fichier est dans tests/dette-design.json.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { RACINE, sansCommentaires } from './sources'

export interface Regle {
  id: string
  /** Ce que la règle refuse, et quoi mettre à la place. */
  quoi: string
  /** Fichiers concernés (chemin relatif à frontend/, ex. « src/routes/Projects.tsx »). */
  concerne: (fichier: string) => boolean
  /** Nombre d'écarts dans le code (commentaires retirés). */
  compte: (code: string, fichier: string) => number
}

const nb = (code: string, motif: RegExp) => (code.match(motif) ?? []).length
const tsx = (f: string) => /\.tsx?$/.test(f)
const css = (f: string) => f.endsWith('.css')
const ui = (f: string) => f.startsWith('src/components/ui/')
// Un document n'est pas l'interface : l'aperçu de fiche (PDF) et le texte du mémoire gardent leurs graisses, leurs tableaux, leur grille.
const document_ = (f: string) => /^src\/components\/fiche\/|LecteurMarkdown|^src\/lib\/(apercuFiche|fiche|tablesMarkdown)\./.test(f)
const interfaceTsx = (f: string) => tsx(f) && !document_(f)

export const TAILLES = ['11px', '12.5px', '13.5px', '15px', '17px', '22px']
const MISE_EN_FORME = /style=\{\{[^}]*?\b(color|background|backgroundColor|backgroundImage|fontSize|fontWeight|fontFamily|borderRadius|padding\w*|margin\w*|boxShadow|border\w*|letterSpacing|lineHeight|transition\w*|animation\w*|textTransform)\s*:/g

/** `title=` posé sur une balise HTML (minuscule) : une infobulle native, invisible au toucher. `title` d'un composant : non compté. */
function titresNatifs(code: string): number {
  let n = 0
  for (const m of code.matchAll(/\stitle=/g)) {
    const avant = code.slice(Math.max(0, m.index - 600), m.index)
    const balise = [...avant.matchAll(/<([A-Za-z][\w.]*)/g)].pop()
    if (balise && /^[a-z]/.test(balise[1]) && !/^(svg|iframe|abbr)$/.test(balise[1])) n += 1
  }
  return n
}

export const REGLES: Regle[] = [
  { id: 'couleur-en-dur', quoi: 'couleur écrite en dur (hex, rgb(, hsl() : un jeton de styles/theme.css',
    concerne: (f) => (tsx(f) || css(f)) && f !== 'src/styles/theme.css' && !document_(f),
    compte: (c) => nb(c, /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{3}\b(?![\w-])|\brgba?\((?!\s*var\()|\bhsla?\(/g) },
  { id: 'seconde-palette', quoi: 'seconde palette d\'états (info, success, warning, danger) : les six sens (bleu, vert, ambre, rouge, turquoise, gris : -ink, -soft, -mark)',
    concerne: (f) => (tsx(f) || css(f)) && f !== 'src/styles/theme.css',
    compte: (c) => nb(c, /(?<![\w-])(?:bg|text|border|outline|ring|fill|stroke|divide|decoration)-(?:info|success|warning|danger)(?:-(?:bg|border|solid))?\b(?![\w-])|var\(--(?:info|success|warning|danger)-(?:bg|border|fg)\)/g) },
  { id: 'taille-hors-echelle', quoi: `taille hors de l'échelle (${TAILLES.join(', ')}, text-xs à text-xl remis à l'échelle)`,
    concerne: interfaceTsx,
    compte: (c) => [...c.matchAll(/\btext-\[([\d.]+(?:px|rem|em))\]/g)].filter((m) => !TAILLES.includes(m[1])).length + nb(c, /\btext-[2-9]xl\b|\bfontSize\s*:/g) },
  { id: 'graisse-hors-echelle', quoi: 'graisse hors de 400 / 500 / 600 (font-normal, font-medium, font-semibold)',
    concerne: interfaceTsx,
    compte: (c) => nb(c, /\bfont-(thin|extralight|light|bold|extrabold|black)\b|\bfont-\[\d+\]|\bfontWeight\s*:/g) },
  { id: 'rayon-hors-echelle', quoi: 'rayon hors de 8 / 14 / 22 / pilule (rounded-md, rounded-lg, rounded-carte, rounded-pilule)',
    concerne: interfaceTsx,
    compte: (c) => nb(c, /\brounded(?:-[trblse]{1,2})?-\[[^\]]+\]|\bborderRadius\s*:/g) },
  { id: 'duree-hors-echelle', quoi: 'durée hors de 100 / 180 / 280 ms (duration-fast, duration-survol, duration-pop)',
    concerne: (f) => interfaceTsx(f) || (css(f) && !/styles\/theme\.css|layout\/aurore\.css|intelligence\.css/.test(f)),
    compte: (c, f) => css(f)
      ? nb(c, /(?:transition|animation)(?:-duration)?\s*:[^;{}]*?(?<![\w.-])\d*\.?\d+m?s\b/g)
      : nb(c, /\bduration-(75|150|200|300|500|700|1000)\b|\bduration-\[[^\]]+\]|\b(transition|animation)Duration\s*:/g) },
  { id: 'police-hors-echelle', quoi: 'police hors de Manrope (interface) et Newsreader (h1, mémoire) : font-mono sort de l\'interface, chiffres tabulaires à la place',
    concerne: interfaceTsx,
    compte: (c) => nb(c, /\bfont-mono\b|\bfontFamily\s*:|\bfont-\[(?!\d)[^\]]+\]/g) },
  { id: 'capitales-forcees', quoi: 'capitales forcées (uppercase) : casse de phrase',
    concerne: interfaceTsx,
    compte: (c) => nb(c, /(?<![\w-])uppercase\b|\btextTransform\s*:/g) },
  { id: 'approche-positive', quoi: 'approche positive (tracking-wide…) : 0 jusqu\'à 15 px, −0,01 em pour les titres',
    concerne: interfaceTsx,
    compte: (c) => nb(c, /\btracking-(wide|wider|widest)\b|\btracking-\[0?\.\d[^\]]*\]|\bletterSpacing\s*:\s*['"]0?\.\d/g) },
  { id: 'transition-all', quoi: 'transition: all : nommer les propriétés (transition-colors, transition-[transform,opacity])',
    concerne: (f) => tsx(f) || css(f),
    compte: (c) => nb(c, /\btransition-all\b|\btransition\s*:\s*['"]?all\b/g) },
  { id: 'controle-natif', quoi: 'contrôle natif visible (<select>, date, nombre, case, bouton radio, confirm(, alert() : ListeDeroulante, ChampDate, ChampNombre, CaseACocher, BoutonRadio, Dialogue',
    concerne: (f) => tsx(f) && !ui(f),
    compte: (c) => nb(c, /<select\b|type=["'](?:date|number|checkbox|radio)["']|(?<![\w.])(?:window\.)?(?:confirm|alert)\(/g) },
  { id: 'infobulle-native', quoi: 'title= en infobulle sur une balise : <Infobulle> (ou aria-label si le texte ne sert qu\'aux lecteurs d\'écran)',
    concerne: (f) => tsx(f) && !ui(f),
    compte: titresNatifs },
  { id: 'composant-maison', quoi: 'balise brute là où le système a un composant (<button>, <input>, <textarea>, <table>, createPortal) : Bouton, Champ, ZoneTexte, Tableau, Dialogue',
    concerne: (f) => f.endsWith('.tsx') && !ui(f) && !document_(f),
    compte: (c) => nb(c, /<button\b|<input\b|<textarea\b|<table\b|\bcreatePortal\(/g) },
  { id: 'boucle', quoi: 'animation qui boucle hors aurore et visage (animate-spin, animate-pulse, infinite) : un libellé qui change, une barre qui avance',
    concerne: (f) => (tsx(f) || css(f) || f === 'tailwind.config.js') && !/layout\/aurore\.css|intelligence\/intelligence\.css|ui\/CompanionOrb\.tsx/.test(f),
    compte: (c) => nb(c, /\banimate-(spin|pulse|ping|bounce|shimmer|pulse-glow|breathe)\b|\binfinite\b/g) },
  { id: 'aplat-accent', quoi: 'aplat d\'accent posé à la main (bg-accent-fill, signature-btn…) : <Bouton variante="principal">, un seul par écran',
    concerne: (f) => tsx(f) && !ui(f),
    compte: (c) => nb(c, /\bbg-accent-fill\b|\bbg-gradient-(signature|lumen|cyan)\b|\bsignature-btn\b|\bedge-cta\b|\bbg-primary\b|\bbg-accent-(500|600|700)\b(?!\/)/g)
      + Math.max(0, nb(c, /variante="principal"|variant="(?:signature|default)"/g) - 1) },
  { id: 'etat-ao-hors-module', quoi: 'estEnCours / estEnCoursOuvert hors de lib/etatAO.ts : etatAO(), comptesAO(), aLaUne()',
    concerne: (f) => tsx(f) && !/^src\/lib\/(etatAO|echeance)\.ts$/.test(f),
    compte: (c) => nb(c, /\bestEnCours(?:Ouvert)?\b/g) },
  { id: 'style-en-ligne', quoi: 'style={{…}} de mise en forme : des classes aux jetons (une valeur calculée, largeur d\'une jauge, reste permise)',
    concerne: interfaceTsx,
    compte: (c) => nb(c, MISE_EN_FORME) },
  { id: 'visage-en-vignette', quoi: 'le visage dans une ligne ou une carte d\'AO : il ne vit qu\'à côté d\'une phrase de Synorix (<SynorixParle>)',
    concerne: (f) => /^src\/components\/(mesao\/(LigneAO|ALaUne|Termines)|dashboard\/BandeAO|veille\/(CarteAvis|ListeAvis))\.tsx$/.test(f) || f === 'src/components/project/StepProgress.tsx',
    compte: (c) => nb(c, /\bVisage\w*\b|\bCompanionOrb\b/g) },
  { id: 'page-sans-conteneur', quoi: 'une route pose sa largeur ou ses marges (max-w-*, mx-auto) ou ne passe pas par <Page> : le conteneur est celui de la coquille',
    concerne: (f) => /^src\/routes\/[A-Z]\w+\.tsx$/.test(f) && !/routes\/(Landing|Pricing|Legal|Login|Register)\.tsx$/.test(f),
    compte: (c, f) => nb(c, /\bmx-auto\b|\bmax-w-(?:\[\d+(?:px|rem)\]|[4-7]xl\b|screen)/g) + (/<Page\b|<PageAO\b/.test(c) || f === 'src/routes/Project.tsx' ? 0 : 1) },
]

/** Tous les fichiers surveillés : src/**\/*.{ts,tsx,css} et tailwind.config.js. */
export function fichiersSurveilles(): string[] {
  const liste: string[] = ['tailwind.config.js']
  const parcourir = (rel: string) => {
    for (const nom of readdirSync(path.join(RACINE, rel))) {
      const enfant = `${rel}/${nom}`
      if (statSync(path.join(RACINE, enfant)).isDirectory()) parcourir(enfant)
      else if (/\.(tsx?|css)$/.test(nom)) liste.push(enfant)
    }
  }
  parcourir('src')
  return liste.sort()
}

export type Dette = Record<string, Record<string, number>>

/** Le relevé d'aujourd'hui : pour chaque règle, les fichiers qui s'en écartent et combien de fois. */
export function relever(): Dette {
  const releve: Dette = Object.fromEntries(REGLES.map((r) => [r.id, {}]))
  for (const fichier of fichiersSurveilles()) {
    const code = sansCommentaires(readFileSync(path.join(RACINE, fichier), 'utf8'))
    for (const r of REGLES) {
      if (!r.concerne(fichier)) continue
      const n = r.compte(code, fichier)
      if (n > 0) releve[r.id][fichier] = n
    }
  }
  return releve
}

// ── Le lot de chaque fichier (règles ordonnées de l'inventaire, § 8 ; la première qui correspond gagne) ──
const LOTS: [string, RegExp][] = [
  ['d', /^routes\/(Landing|Pricing|Legal|Login|Register)\.|^lib\/(clerkApparence|rechargementDeploiement)\.|^App\.tsx$|^components\/onboarding\/FirstAOWelcome\.|^components\/mesao\/VideMesAO\./],
  ['b2', /^routes\/project\/Step(Plan|Memoire|Export)\.|^components\/(plan|memoire)\/|^components\/project\/source\/|^components\/project\/(FormulaireMemoire|MemoirePreflight|PoidsMemoire|RewritePassageBar)\.|^hooks\/(useReponseSource|useSourceChamp)\.|^services\/sources\.|^lib\/(ancre|memoire\w*|planMemoire|planRecoupe|relectureMemoire|passagesACompleter|tablesMarkdown|exportDossier|copier)\./],
  ['socle', /^routes\/(Project|Design)\.|^components\/project\/(StepProgress|BarreEtape)\.|^components\/(etape|ui|layout|common|skeletons)\/|^styles\/(theme|tokens|polices)\.css$|^index\.css$|^lib\/(echeance|etatAO|mesAO|prenom|raisonSociale|theme\w*|requete)\.|^lib\/intelligence\/action\.|^stores\/uiStore\./],
  ['b1', /^routes\/NewProject\.|^routes\/project\/Step(Upload|LotSelection|Analysis|Verification)\.|^components\/(project|depot)\/|^components\/onboarding\/ZoneDepotAO\.|^components\/vault\/VaultSavePrompt\.|^hooks\/(useLancerLecture|useLotsDuDepot)\.|^services\/upload\.|^styles\/pieces\.css$|^lib\/(analyseLibelles|carteAO|choixLots|coutLecture|depotDossier|lectureNonDemarree|lotsMetiers|lotsSource|nomsPieces|pieceCitee|resumeAO|resumePieces|statutPiece|typesPieces|pendingUpload|filePrechargement|tailleFichier)\./],
  ['c', /^routes\/(Company|FicheEntreprise|Vault|Settings|Billing|Tools)\.|^components\/(entreprise|company|fiche|vault)\/|^lib\/entreprise\/|^lib\/(fiche|fichePage|apercuFiche|vault|carteSiege|coffreFormats)\./],
  ['a', /./], // Accueil, Mes AO, veille, et le reste du lot socle de l'inventaire (mission suivante)
]
/** socle (phase 1, ce passage) · a (Accueil, Mes AO, veille, reste du socle) · b1 · b2 · c · d. */
export function lotDe(fichier: string): string {
  if (fichier === 'tailwind.config.js') return 'socle'
  const rel = fichier.replace(/^src\//, '')
  return LOTS.find(([, re]) => re.test(rel))![0]
}
