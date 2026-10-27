// « Voir dans le DCE » : accès à GET /api/sources/{exigence}  (ancre) et .../apercu (image WebP),
// avec cache de session et préchargement borné des exigences visibles.
//
// Les images demandent l'authentification (jeton Bearer) : elles sont lues par axios puis rangées
// en Blob ; le composant en fait une URL locale le temps de l'affichage.
import axios from 'axios'
import { api } from '@/services/api'
import { creerFile, type FilePrechargement } from '@/lib/filePrechargement'
import { urlExpiree, type ReponseSource } from '@/lib/ancre'

/** Largeur de la loupe, la même au préchargement et à l'affichage (même entrée de cache serveur). */
export const LARGEUR_LOUPE = 960
/** Paliers de largeur servis par le serveur (routers/sources.py::PALIERS_LARGEUR). */
export const PALIERS_LARGEUR = [480, 720, 960, 1280, 1600] as const

export type VueApercu = 'passage' | 'page'

/** Palier de largeur à demander pour un conteneur de `px` pixels CSS (densité d'écran comprise). */
export function largeurPourConteneur(px: number, densite = 1): number {
  const voulue = Math.max(1, px) * Math.min(Math.max(densite, 1), 2)
  return PALIERS_LARGEUR.find((p) => voulue <= p) ?? PALIERS_LARGEUR[PALIERS_LARGEUR.length - 1]
}

// Le serveur limite à 120 ancres et 300 aperçus par minute et par organisation
// (backend/routers/sources.py : LIMITE_ANCRE, LIMITE_APERCU) : le préchargement n'en prend que
// la moitié ou moins (d'autres onglets, d'autres personnes de l'organisation partagent le plafond).
export const BUDGET_PRECHARGEMENT = { ancre: 50, apercu: 120 } as const
export const REQUETES_SIMULTANEES = 3

export const file: FilePrechargement = creerFile({
  simultanees: REQUETES_SIMULTANEES,
  parMinute: { ...BUDGET_PRECHARGEMENT },
  attenteMax: 150,
})

interface EntreeAncre {
  promesse: Promise<ReponseSource>
  recuA: number
  expireDans: number
}

const ancres = new Map<string, EntreeAncre>()
const apercus = new Map<string, Promise<Blob>>()
const ORDRE_APERCUS: string[] = []
const APERCUS_MAX = 150

/** 429 / 503 : le serveur demande d'attendre ; la file se met en pause. */
function noterRefus(err: unknown): void {
  if (!axios.isAxiosError(err)) return
  const statut = err.response?.status
  if (statut !== 429 && statut !== 503) return
  const brut = Number(err.response?.headers?.['retry-after'])
  file.pauser((Number.isFinite(brut) && brut > 0 ? Math.min(brut, 120) : 30) * 1000)
}

/** L'ancre d'une exigence : cache d'abord, sinon une requête. L'URL signée du document étant à
 *  durée limitée, une entrée trop ancienne est relue. `dansLaFile` : appel de la file de
 *  préchargement, qui a déjà compté son départ ; un clic (faux) le note lui-même au budget. */
export function obtenirAncre(id: string, dansLaFile = false): Promise<ReponseSource> {
  const connue = ancres.get(id)
  if (connue && !urlExpiree(connue.recuA, connue.expireDans, Date.now())) return connue.promesse
  if (!dansLaFile) file.noter('ancre')
  const entree: EntreeAncre = {
    recuA: Date.now(),
    expireDans: 900,
    promesse: api.get<ReponseSource>(`/sources/${encodeURIComponent(id)}`).then(({ data }) => {
      entree.expireDans = data.document?.expire_dans ?? 900
      return data
    }),
  }
  entree.promesse.catch((err) => { ancres.delete(id); noterRefus(err) })
  ancres.set(id, entree)
  return entree.promesse
}

/** L'image d'une exigence (loupe du passage ou page entière), au palier de largeur demandé. */
export function obtenirApercu(id: string, vue: VueApercu, largeur: number, dansLaFile = false): Promise<Blob> {
  const cle = `${id}|${vue}|${largeur}`
  const connu = apercus.get(cle)
  if (connu) return connu
  if (!dansLaFile) file.noter('apercu')
  const promesse = api
    .get<Blob>(`/sources/${encodeURIComponent(id)}/apercu`, { params: { vue, largeur }, responseType: 'blob' })
    .then(({ data }) => data)
  promesse.catch((err) => { apercus.delete(cle); noterRefus(err) })
  apercus.set(cle, promesse)
  ORDRE_APERCUS.push(cle)
  while (ORDRE_APERCUS.length > APERCUS_MAX) apercus.delete(ORDRE_APERCUS.shift()!)
  return promesse
}

/** Précharge l'ancre puis, si elle porte un passage ou une page, sa loupe. Appelé quand une
 *  exigence entre dans l'écran ; tout passe par la file bornée. */
export function precharger(id: string): void {
  file.ajouter({
    cle: `ancre:${id}`,
    categorie: 'ancre',
    executer: async () => {
      const ancre = await obtenirAncre(id, true)
      if (ancre.niveau === 'aucun' || ancre.format === 'tableur') return
      file.ajouter({
        cle: `apercu:${id}`,
        categorie: 'apercu',
        suite: true,
        executer: () => obtenirApercu(id, 'passage', LARGEUR_LOUPE, true),
      })
    },
  })
}

/** L'exigence est sortie de l'écran avant que sa requête ne parte : on l'oublie. */
export function abandonner(id: string): void {
  file.retirer(`ancre:${id}`)
  file.retirer(`apercu:${id}`)
}
