// « Voir dans le DCE » : l'ancre d'une exigence (réponse de GET /api/sources/{id}) et la
// logique pure de l'écran : position des rectangles (rotation comprise), cadrage de la loupe,
// aiguillage des niveaux et des formats, mise en forme de la citation.
//
// Miroir du serveur : backend/services/pdf_ancre.py (forme de l'ancre) et
// backend/services/pdf_positions.py::tourner_rectangle (rotation).

/** [x0, y0, x1, y1], en fractions de la page, origine en haut à gauche. */
export type Rect = [number, number, number, number]

export type NiveauAncre = 'passage' | 'page' | 'aucun'

export interface Citation {
  avant: string
  passage: string
  apres: string
}

export interface SuiteAncre {
  page: number
  rotation: number
  rects: Rect[]
}

export interface Ancre {
  version: number
  doc_id: string | null
  page: number | null
  /** Rotation (/Rotate) de la page, en degrés dans le sens des aiguilles d'une montre. */
  rotation: number
  /** Dans la page NON tournée : à passer par `rectsAffiches` avant de les poser. */
  rects: Rect[]
  niveau: NiveauAncre
  citation: Citation | null
  /** Passage à cheval sur deux pages : les rectangles de la page suivante. */
  suite?: SuiteAncre
  /** Format de la pièce ; absent = PDF. Un tableur (DPGF) a sa propre vue. */
  format?: string
}

export interface DocumentSource {
  nom: string
  /** URL signée du PDF à afficher (la pièce, ou son PDF converti pour un Word) ; null sans PDF. */
  url: string | null
  /** URL signée de la pièce déposée (lien « Ouvrir la pièce »). */
  origine: string | null
  expire_dans: number
}

export interface ReponseSource extends Ancre {
  /** Zone de la page affichée (fractions) que montre la loupe ; null = page entière. */
  cadrage: Rect | null
  document: DocumentSource | null
}

// ─── Rotation ────────────────────────────────────────────────────────────────

const arrondi = (v: number) => Math.round(v * 1e5) / 1e5

/** Le rectangle (page non tournée) tel qu'il se place sur la page AFFICHÉE après sa rotation. */
export function tournerRectangle(rect: Rect, rotation: number): Rect {
  const [x0, y0, x1, y1] = rect
  const r = (((Math.round(rotation / 90) * 90) % 360) + 360) % 360
  if (r === 90) return [arrondi(1 - y1), x0, arrondi(1 - y0), x1]
  if (r === 180) return [arrondi(1 - x1), arrondi(1 - y1), arrondi(1 - x0), arrondi(1 - y0)]
  if (r === 270) return [y0, arrondi(1 - x1), y1, arrondi(1 - x0)]
  return [x0, y0, x1, y1]
}

/** Les rectangles de la page `cible` (principale ou suite), prêts à être posés sur la page affichée. */
export function rectsAffiches(ancre: Ancre, cible: 'principale' | 'suite' = 'principale'): Rect[] {
  if (ancre.niveau !== 'passage') return []
  const source = cible === 'suite'
    ? (ancre.suite ? { rects: ancre.suite.rects, rotation: ancre.suite.rotation } : null)
    : { rects: ancre.rects, rotation: ancre.rotation }
  return (source?.rects ?? []).map((r) => tournerRectangle(r, source!.rotation))
}

/** Rectangles de la page affichée → repère de la loupe (image recadrée sur `cadrage`). Les
 *  parties hors cadre sont ramenées au bord ; un rectangle entièrement hors cadre est écarté. */
export function rectsDansLoupe(rects: readonly Rect[], cadrage: Rect | null): Rect[] {
  if (!cadrage) return rects.map((r) => [...r] as Rect)
  const [cx0, cy0, cx1, cy1] = cadrage
  const largeur = cx1 - cx0
  const hauteur = cy1 - cy0
  if (largeur <= 0 || hauteur <= 0) return []
  const bornee = (v: number) => Math.min(1, Math.max(0, v))
  return rects
    .filter((r) => r[2] > cx0 && r[0] < cx1 && r[3] > cy0 && r[1] < cy1)
    .map((r): Rect => [
      bornee((r[0] - cx0) / largeur), bornee((r[1] - cy0) / hauteur),
      bornee((r[2] - cx0) / largeur), bornee((r[3] - cy0) / hauteur),
    ])
}

/** Ordonnée du centre du passage (fraction de la page), pour centrer l'affichage dessus. */
export function centreVertical(rects: readonly Rect[]): number | null {
  if (rects.length === 0) return null
  const haut = Math.min(...rects.map((r) => r[1]))
  const bas = Math.max(...rects.map((r) => r[3]))
  return (haut + bas) / 2
}

/** Position de défilement (px) qui centre `fraction` de la page dans une fenêtre de `fenetre` px,
 *  la page mesurant `hauteurPage` px à partir de `departPage` dans le défilement. */
export function defilementCentre(fraction: number, hauteurPage: number, departPage: number, fenetre: number): number {
  return Math.max(0, Math.round(departPage + fraction * hauteurPage - fenetre / 2))
}

// ─── Aiguillage ──────────────────────────────────────────────────────────────

export type VueSource = 'passage' | 'page' | 'document'

/** Ce qu'affiche le panneau : une vue PDF, une vue tableur (agent TAB), ou le texte « sans page ». */
export type Aiguillage = 'pdf' | 'tableur' | 'aucun' | 'format-inconnu'

export function formatDe(ancre: Pick<Ancre, 'format'>): string {
  return ancre.format ?? 'pdf'
}

export function aiguiller(reponse: Pick<ReponseSource, 'niveau' | 'format'>): Aiguillage {
  const format = formatDe(reponse)
  if (format === 'tableur') return 'tableur'
  if (format !== 'pdf') return 'format-inconnu'
  return reponse.niveau === 'aucun' ? 'aucun' : 'pdf'
}

/** Les vues proposées. `avecImages` : l'exigence existe côté serveur (loupe et page en images) ;
 *  une source de champ du bandeau n'a que le document. */
export function vuesDisponibles(
  reponse: Pick<ReponseSource, 'niveau' | 'format' | 'document'>,
  avecImages = true,
): VueSource[] {
  if (aiguiller(reponse) !== 'pdf') return []
  const vues: VueSource[] = []
  if (avecImages) vues.push('passage', 'page')
  else if (reponse.niveau === 'passage' || reponse.niveau === 'page') vues.push('passage')
  if (reponse.document?.url) vues.push('document')
  return vues
}

/** La vue ouverte par défaut : « Passage » (ou la première possible). */
export function vueParDefaut(vues: readonly VueSource[]): VueSource | null {
  return vues.includes('passage') ? 'passage' : (vues[0] ?? null)
}

/** Texte de situation sous le nom de la pièce. Toujours positif. */
export function libelleNiveau(ancre: Pick<Ancre, 'niveau' | 'suite'>): string {
  if (ancre.niveau === 'passage') return ancre.suite ? 'Passage retrouvé, sur deux pages' : 'Passage retrouvé dans la page'
  if (ancre.niveau === 'page') return 'Page citée par l’analyse'
  return 'Pièce citée par l’analyse'
}

// ─── Citation ────────────────────────────────────────────────────────────────

const ESPACES = /\s+/g

/** Coupe `texte` à `max` caractères au mot près ; `debut` garde la fin (contexte « avant »). */
export function couperContexte(texte: string, max: number, debut: boolean): string {
  const t = (texte || '').replace(ESPACES, ' ').trim()
  if (!t) return ''
  if (t.length <= max) return t
  // on ne garde que des mots entiers : le mot coupé par la limite est écarté
  if (debut) {
    const reste = t.slice(-max)
    return '… ' + (/\s/.test(t[t.length - max - 1]) ? reste : reste.replace(/^\S*\s/, ''))
  }
  const reste = t.slice(0, max)
  return (/\s/.test(t[max]) ? reste : reste.replace(/\s\S*$/, '')) + ' …'
}

export interface CitationAffichee {
  avant: string
  passage: string
  apres: string
}

/** La citation prête à afficher : contexte raccourci de part et d'autre du passage entier. */
export function citationAffichee(c: Citation, max = 160): CitationAffichee {
  return {
    avant: couperContexte(c.avant, max, true),
    passage: (c.passage || '').replace(ESPACES, ' ').trim(),
    apres: couperContexte(c.apres, max, false),
  }
}

/** Le document est-il encore valable (URL signée à durée limitée) ? `marge` en secondes. */
export function urlExpiree(recuA: number, expireDans: number, maintenant: number, marge = 60): boolean {
  return maintenant >= recuA + (expireDans - marge) * 1000
}
