// Mon entreprise — le visage de Synorix : quatre clips muets enchaînés par une petite machine à états, pure.
// Aucune vidéo, aucun navigateur ici : la machine reçoit ses dépendances (lecture d'un clip, minuteries, horloge,
// hasard), si bien qu'un test peut la piloter avec une fausse horloge. Le composant `VisageAnime` fournit les vraies.
//
// Séquence (validée sur la maquette de Mohamed) :
//   arrivée                    → clip 1 (il ouvre les yeux)
//   repos, toutes les 7 à 12 s → clip 2 (ses neurones s'animent)
//   rubrique, bulle, enregistrement → clip 3 (un éclair le traverse), après le clip 1 si les yeux sont fermés
//   30 s sans interaction      → clip 4 (il ferme les yeux), puis clip 1 au bout de 2,5 s
//   hors écran, onglet caché   → rien ne joue, plus aucune minuterie
// Un clip terminé reste sur sa dernière image : jamais de boucle.

export type ClipId = 1 | 2 | 3 | 4

export const CLIP = { ouvre: 1, neurones: 2, eclair: 3, ferme: 4 } as const satisfies Record<string, ClipId>

/** Fondu entre deux clips ; l'ancienne vidéo est mise en pause un peu après. */
export const FONDU_MS = 280
export const PAUSE_APRES_FONDU_MS = 320
export const REPOS_MIN_MS = 7000
export const REPOS_MAX_MS = 12000
export const INACTIVITE_MS = 30000
export const REOUVERTURE_MS = 2500
/** Un clip qui ne démarre pas dans ce délai est considéré comme en échec : le poster yeux ouverts prend le relais. */
export const DEMARRAGE_MAX_MS = 10000

/** Boîte du visage, en pixels CSS. */
export const DIMENSIONS_VISAGE = { ordinateur: { largeur: 300, hauteur: 420 }, telephone: { largeur: 240, hauteur: 336 } } as const

export const POSTER_FERME = '/visage/poster-ferme.webp'
export const POSTER_OUVERT = '/visage/poster.webp'

export interface SourceClip { src: string; type: string }

/** Les deux fichiers d'un clip, dans l'ordre : mp4 d'abord (le plus répandu), webm ensuite. */
export function sourcesClip(clip: ClipId): SourceClip[] {
  return [
    { src: `/visage/visage-${clip}.mp4`, type: 'video/mp4' },
    { src: `/visage/visage-${clip}.webm`, type: 'video/webm' },
  ]
}

export interface ConditionsLecture {
  /** prefers-reduced-motion: reduce */
  mouvementReduit: boolean
  /** La scène est dans la zone visible de la fenêtre. */
  aLEcran: boolean
  ongletVisible: boolean
}

/** Rien ne joue en mouvement réduit, hors écran ni onglet caché. */
export function doitJouer(c: ConditionsLecture): boolean {
  return !c.mouvementReduit && c.aLEcran && c.ongletVisible
}

/** Délai avant le prochain clip de repos : entre 7 et 12 s selon `alea` ∈ [0, 1[. */
export function delaiRepos(alea: number): number {
  return Math.round(REPOS_MIN_MS + Math.min(Math.max(alea, 0), 1) * (REPOS_MAX_MS - REPOS_MIN_MS))
}

// ─── La machine ────────────────────────────────────────────────────────────────

/** Issue d'un clip : joué en entier, impossible à lire, ou interrompu (pause demandée). */
export type IssueClip = 'fini' | 'echec' | 'interrompu'

export interface DependancesVisage {
  /** Lit le clip et rend la main à la fin ('fini'), ou quand il ne peut pas être lu ('echec'). */
  jouer: (clip: ClipId) => Promise<IssueClip>
  /** Met en pause la vidéo en cours (la scène sort de l'écran, l'onglet se cache). */
  pauser: () => void
  /** La lecture est définitivement impossible : le composant montre le poster yeux ouverts. */
  surEchec: () => void
  poserMinuterie: (rappel: () => void, delaiMs: number) => unknown
  annulerMinuterie: (minuterie: unknown) => void
  maintenant: () => number
  alea: () => number
}

export interface EtatVisage {
  yeux: 'fermes' | 'ouverts'
  /** Un clip est en cours. */
  occupe: boolean
  /** La lecture est autorisée (à l'écran, onglet visible, mouvement permis). */
  actif: boolean
  /** La lecture a échoué : plus rien ne joue. */
  arrete: boolean
}

export interface MachineVisage {
  /** La lecture devient possible : clip 1 si les yeux sont fermés, puis le repos. */
  reprendre: () => void
  /** La lecture n'est plus permise : pause et plus aucune minuterie. */
  suspendre: () => void
  /** Une rubrique, une bulle ou un enregistrement : clip 3 (précédé du clip 1 si les yeux sont fermés). */
  interagir: () => void
  /** Un geste sans effet sur le visage (souris, clavier) : repousse la fermeture des yeux. */
  activite: () => void
  arreter: () => void
  etat: () => EtatVisage
}

export function creerMachineVisage(dep: DependancesVisage): MachineVisage {
  let yeux: EtatVisage['yeux'] = 'fermes'
  let actif = false
  let arrete = false
  let occupe = false
  let eclairEnAttente = false
  let generation = 0
  let clipEnCours: ClipId | null = null
  let derniereActivite = dep.maintenant()
  let minuterieRepos: unknown = null
  let minuterieInactivite: unknown = null
  let minuterieReouverture: unknown = null

  const annuler = () => {
    for (const m of [minuterieRepos, minuterieInactivite, minuterieReouverture]) if (m !== null) dep.annulerMinuterie(m)
    minuterieRepos = minuterieInactivite = minuterieReouverture = null
  }

  /** Joue un clip ; 'obsolete' si la lecture a été suspendue ou arrêtée entre-temps (la suite ne s'applique plus). */
  async function jouer(clip: ClipId): Promise<IssueClip | 'obsolete'> {
    const g = generation
    occupe = true
    clipEnCours = clip
    const issue = await dep.jouer(clip)
    if (g !== generation) return 'obsolete'
    occupe = false
    clipEnCours = null
    if (issue === 'echec') {
      arrete = true
      annuler()
      dep.surEchec()
    } else if (issue === 'fini') {
      if (clip === CLIP.ouvre) yeux = 'ouverts'
      if (clip === CLIP.ferme) yeux = 'fermes'
    }
    return issue
  }

  /** Après un clip terminé : l'éclair demandé pendant ce clip d'abord, sinon le repos. */
  function suite() {
    if (eclairEnAttente) { eclairEnAttente = false; void lancerEclair(); return }
    planifier()
  }

  async function lancerEclair() {
    annuler()
    if (yeux !== 'ouverts') {
      const ouverture = await jouer(CLIP.ouvre)
      if (ouverture !== 'fini') return
    }
    if ((await jouer(CLIP.eclair)) === 'fini') suite()
  }

  function planifier() {
    annuler()
    if (!actif || arrete) return
    minuterieRepos = dep.poserMinuterie(async () => {
      minuterieRepos = null
      if (!actif || arrete) return
      if (occupe) { planifier(); return }
      if ((await jouer(CLIP.neurones)) === 'fini') suite()
    }, delaiRepos(dep.alea()))
    armerInactivite()
  }

  function armerInactivite(delai?: number) {
    const reste = delai ?? Math.max(0, INACTIVITE_MS - (dep.maintenant() - derniereActivite))
    minuterieInactivite = dep.poserMinuterie(async () => {
      minuterieInactivite = null
      if (!actif || arrete) return
      if (dep.maintenant() - derniereActivite < INACTIVITE_MS) { armerInactivite(); return }
      if (occupe) { armerInactivite(1000); return } // un clip est en cours : on revérifie dans une seconde
      if (minuterieRepos !== null) { dep.annulerMinuterie(minuterieRepos); minuterieRepos = null }
      if ((await jouer(CLIP.ferme)) !== 'fini') return
      if (eclairEnAttente) { suite(); return }
      minuterieReouverture = dep.poserMinuterie(async () => {
        minuterieReouverture = null
        if (!actif || arrete) return
        derniereActivite = dep.maintenant() // les yeux se rouvrent : 30 s de plus avant de les refermer
        if ((await jouer(CLIP.ouvre)) === 'fini') suite()
      }, REOUVERTURE_MS)
    }, reste)
  }

  async function demarrer() {
    if (!actif || arrete) return
    if (yeux !== 'ouverts') {
      const ouverture = await jouer(CLIP.ouvre)
      if (ouverture !== 'fini') return
    }
    suite()
  }

  return {
    reprendre() {
      if (actif || arrete) return
      actif = true
      derniereActivite = dep.maintenant()
      void demarrer()
    },
    suspendre() {
      if (!actif) return
      actif = false
      generation += 1
      if (clipEnCours === CLIP.ferme) yeux = 'fermes' // interrompu à mi-course : le clip 1 rouvrira les yeux
      occupe = false
      clipEnCours = null
      eclairEnAttente = false
      annuler()
      dep.pauser()
    },
    interagir() {
      derniereActivite = dep.maintenant()
      if (!actif || arrete) return
      if (occupe) { eclairEnAttente = true; return }
      void lancerEclair()
    },
    activite() {
      derniereActivite = dep.maintenant()
    },
    arreter() {
      arrete = true
      actif = false
      generation += 1
      annuler()
    },
    etat: () => ({ yeux, occupe, actif, arrete }),
  }
}
