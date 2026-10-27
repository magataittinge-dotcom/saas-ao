// Préchargement des ancres et des loupes des exigences visibles, sans jamais dépasser la limite
// du serveur (120 ancres et 300 aperçus par minute et par organisation, partagés entre tous les
// onglets et tous les utilisateurs de l'organisation : on n'en prend qu'une part).
//
// La file est bornée de trois façons :
//   - quelques requêtes à la fois (`simultanees`) ;
//   - un budget par minute et par catégorie (fenêtre glissante de 60 s) ;
//   - une longueur maximale d'attente (`attenteMax`) : au-delà, la plus ancienne est écartée
//     (c'est la moins susceptible d'être encore à l'écran).
// Un clic de l'utilisateur ne passe jamais par la file : il note son appel (`noter`) pour que le
// budget en tienne compte, mais n'attend personne. Une réponse 429 ou 503 met la file en pause.

export type Categorie = 'ancre' | 'apercu'

export interface TachePrechargement {
  /** Identifiant unique : une tâche déjà vue (en attente, en cours ou faite) n'est pas relancée. */
  cle: string
  categorie: Categorie
  executer: () => Promise<unknown>
}

export interface OptionsFile {
  simultanees: number
  /** Nombre maximal de requêtes démarrées par minute, par catégorie. */
  parMinute: Record<Categorie, number>
  /** Longueur maximale de la liste d'attente. */
  attenteMax?: number
  maintenant?: () => number
  /** Réveil ultérieur de la file (injecté dans les tests). */
  planifier?: (fn: () => void, ms: number) => unknown
}

export interface EtatFile {
  attente: number
  enCours: number
  pauseJusqua: number
}

const MINUTE = 60_000

export interface FilePrechargement {
  ajouter(tache: TachePrechargement): void
  /** Retire une tâche encore en attente (l'exigence est sortie de l'écran). */
  retirer(cle: string): boolean
  /** Note un appel fait hors file (clic) dans le budget de la minute. */
  noter(categorie: Categorie): void
  pauser(ms: number): void
  etat(): EtatFile
}

export function creerFile(options: OptionsFile): FilePrechargement {
  const maintenant = options.maintenant ?? Date.now
  const planifier = options.planifier ?? ((fn, ms) => setTimeout(fn, ms))
  const attenteMax = options.attenteMax ?? 200

  const attente: TachePrechargement[] = []
  const vues = new Set<string>()
  const departs: Record<Categorie, number[]> = { ancre: [], apercu: [] }
  let enCours = 0
  let pauseJusqua = 0
  let reveilPrevu = false

  const purger = (categorie: Categorie) => {
    const limite = maintenant() - MINUTE
    const liste = departs[categorie]
    while (liste.length > 0 && liste[0] <= limite) liste.shift()
  }
  const reste = (categorie: Categorie) => {
    purger(categorie)
    return options.parMinute[categorie] - departs[categorie].length
  }

  const reveiller = (ms: number) => {
    if (reveilPrevu) return
    reveilPrevu = true
    planifier(() => { reveilPrevu = false; pomper() }, Math.max(50, ms))
  }

  function pomper(): void {
    const t = maintenant()
    if (t < pauseJusqua) { if (attente.length) reveiller(pauseJusqua - t); return }
    let i = 0
    while (enCours < options.simultanees && i < attente.length) {
      const tache = attente[i]
      if (reste(tache.categorie) <= 0) { i += 1; continue }     // budget épuisé : on essaie les autres catégories
      attente.splice(i, 1)
      departs[tache.categorie].push(maintenant())
      enCours += 1
      Promise.resolve()
        .then(tache.executer)
        .catch(() => { /* l'échec est traité par l'appelant : la file continue */ })
        .finally(() => { enCours -= 1; pomper() })
    }
    // des tâches attendent un budget : se réveiller à la sortie du plus ancien départ
    if (attente.length > 0 && enCours < options.simultanees) {
      const prochains = (['ancre', 'apercu'] as Categorie[])
        .filter((c) => attente.some((a) => a.categorie === c) && reste(c) <= 0)
        .map((c) => departs[c][0] + MINUTE - maintenant())
      if (prochains.length > 0) reveiller(Math.min(...prochains) + 5)
    }
  }

  return {
    ajouter(tache) {
      if (vues.has(tache.cle)) return
      vues.add(tache.cle)
      attente.push(tache)
      while (attente.length > attenteMax) {          // les plus anciennes sont écartées, relançables
        const ecartee = attente.shift()!
        vues.delete(ecartee.cle)
      }
      pomper()
    },
    retirer(cle) {
      const i = attente.findIndex((t) => t.cle === cle)
      if (i < 0) return false
      attente.splice(i, 1)
      vues.delete(cle)                                // pas lancée : elle pourra être redemandée
      return true
    },
    noter(categorie) {
      departs[categorie].push(maintenant())
    },
    pauser(ms) {
      pauseJusqua = Math.max(pauseJusqua, maintenant() + ms)
    },
    etat() {
      return { attente: attente.length, enCours, pauseJusqua }
    },
  }
}
