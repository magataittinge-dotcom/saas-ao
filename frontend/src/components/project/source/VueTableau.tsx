import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { api } from '@/services/api'

/**
 * « Voir dans le DCE » pour un tableur (DPGF, BPU, DQE) : le tableau tel qu'il est dans la
 * pièce, avec la ligne citée surlignée. On montre, on ne commente pas : aucune mise en forme
 * ni mise en avant des montants, aucun calcul. Chaque cellule est du texte.
 *
 * L'ancre vient de GET /api/sources/{id} ; la fenêtre du tableau, de .../tableau.
 */

/** Ancre d'une exigence citée dans un tableur (services/tableur_ancre.py). */
export interface AncreTableur {
  version: number
  format: 'tableur'
  doc_id: string | null
  feuille: string | null
  ligne: number | null
  /** Lettres des colonnes qui portent le passage (« B », « C »…). */
  cellules: string[]
  /** passage : ligne surlignée · page : feuille citée, sans surlignage · aucun : rien à montrer. */
  niveau: 'passage' | 'page' | 'aucun'
}

/** Réponse de GET /api/sources/{id}/tableau : des textes, rien de calculé. */
export interface FenetreTableur {
  feuille: string
  ligne: number | null
  colonnes: string[]
  entete: { n: number; cellules: string[] } | null
  lignes: { n: number; cellules: string[]; cible: boolean }[]
  colonnes_tronquees: boolean
}

interface Props {
  exigenceId: string
  ancre: AncreTableur
}

/** Vrai si la colonne `lettre` fait partie des cellules citées par l'ancre. */
export function celluleCitee(ancre: Pick<AncreTableur, 'cellules'>, lettre: string): boolean {
  return ancre.cellules.includes(lettre)
}

/** Texte de l'en-tête d'une colonne : celui du tableur, sinon sa lettre. */
export function titreColonne(fenetre: Pick<FenetreTableur, 'entete' | 'colonnes'>, index: number): string {
  return fenetre.entete?.cellules[index]?.trim() || fenetre.colonnes[index]
}

/** Ce que montre le tableau, en une phrase positive. */
export function legende(ancre: Pick<AncreTableur, 'niveau' | 'ligne'>): string {
  return ancre.niveau === 'passage' && ancre.ligne
    ? `Ligne ${ancre.ligne} citée par l'analyse`
    : "Feuille citée par l'analyse"
}

const CELLULE = 'border-b border-ds-border-subtle px-3 py-2 align-top whitespace-pre-line break-words'

/** Le tableau seul (présentation : testé en rendu statique). */
export function TableauSource({
  fenetre,
  ancre,
  refZone,
  refLigne,
}: {
  fenetre: FenetreTableur
  ancre: AncreTableur
  refZone?: React.Ref<HTMLDivElement>
  refLigne?: React.Ref<HTMLTableRowElement>
}) {
  return (
    <div className="min-w-0 max-w-full">
      <p className="text-base font-semibold text-ds-text">Feuille « {fenetre.feuille} »</p>
      <p className="text-base text-ds-text-2">{legende(ancre)}</p>
      <div
        ref={refZone}
        role="region"
        aria-label={`Tableau de la feuille ${fenetre.feuille}`}
        tabIndex={0}
        className="relative mt-3 max-h-[60vh] max-w-full overflow-auto rounded-lg border border-ds-border-subtle bg-ds-surface"
      >
        <table className="w-max min-w-full border-separate border-spacing-0 text-left text-base text-ds-text">
          <caption className="sr-only">
            Feuille {fenetre.feuille} : {legende(ancre)}
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 top-0 z-20 h-11 whitespace-nowrap border-b border-ds-border-subtle bg-ds-surface-2 px-3 py-2 font-semibold text-ds-text-2"
              >
                Ligne
              </th>
              {fenetre.colonnes.map((lettre, i) => (
                <th
                  key={lettre}
                  scope="col"
                  className="sticky top-0 z-10 h-11 min-w-[6rem] max-w-[24rem] border-b border-ds-border-subtle bg-ds-surface-2 px-3 py-2 text-left align-top font-semibold text-ds-text-2"
                >
                  {titreColonne(fenetre, i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fenetre.lignes.map((l) => (
              <tr
                key={l.n}
                ref={l.cible ? refLigne : undefined}
                aria-current={l.cible ? 'true' : undefined}
                data-ligne-citee={l.cible ? 'true' : undefined}
                className={l.cible ? 'bg-ds-warning/10' : undefined}
              >
                <th
                  scope="row"
                  className={`edge-data sticky left-0 z-10 h-11 whitespace-nowrap border-b border-ds-border-subtle px-3 py-2 text-left align-top font-normal ${
                    l.cible ? 'bg-ds-surface-3 text-ds-text shadow-[inset_4px_0_0_#D9A441]' : 'bg-ds-surface text-ds-text-2'
                  }`}
                >
                  {l.n}
                  {l.cible && <span className="sr-only"> (ligne citée)</span>}
                </th>
                {fenetre.colonnes.map((lettre, i) => {
                  const citee = l.cible && celluleCitee(ancre, lettre)
                  return (
                    <td
                      key={lettre}
                      data-cellule-citee={citee ? 'true' : undefined}
                      className={`${CELLULE} h-11 min-w-[6rem] max-w-[24rem] ${citee ? 'bg-ds-warning/20 font-semibold' : ''}`}
                    >
                      {l.cellules[i] ?? ''}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {fenetre.colonnes_tronquees && (
        <p className="mt-2 text-base text-ds-text-2">Affichage limité aux colonnes les plus utiles de la feuille.</p>
      )}
    </div>
  )
}

/** Amène la ligne citée au centre de la zone (et sa cellule en vue), sans faire défiler la page. */
export function amenerEnVue(zone: HTMLElement | null, ligne: HTMLElement | null, reduit = false): void {
  if (!zone || !ligne) return
  const comportement: ScrollBehavior = reduit ? 'auto' : 'smooth'
  const z = zone.getBoundingClientRect()
  const r = ligne.getBoundingClientRect()
  const haut = zone.scrollTop + (r.top - z.top) - (zone.clientHeight - r.height) / 2
  let gauche = zone.scrollLeft
  const cellule = ligne.querySelector<HTMLElement>('[data-cellule-citee]')
  if (cellule) {
    const c = cellule.getBoundingClientRect()
    const colonneFixe = 72 // la colonne « Ligne » reste collée à gauche
    if (c.left < z.left + colonneFixe || c.right > z.right) {
      gauche = zone.scrollLeft + (c.left - z.left) - colonneFixe - 8
    }
  }
  zone.scrollTo({ top: Math.max(0, haut), left: Math.max(0, gauche), behavior: comportement })
}

const BOUTON =
  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-ds-border-subtle ' +
  'bg-ds-surface-2 px-4 text-base font-medium text-ds-text hover:bg-ds-surface-3 ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-ds-lum'

/** Délai avant un nouvel essai quand le serveur est occupé (503 + Retry-After). */
function delaiReessai(_n: number, erreur: unknown): number {
  const entete = (erreur as { response?: { headers?: Record<string, string> } })?.response?.headers?.['retry-after']
  const s = Number(entete)
  return Math.min(Math.max(Number.isFinite(s) && s > 0 ? s : 3, 1), 15) * 1000
}

function statut(erreur: unknown): number | undefined {
  return (erreur as { response?: { status?: number } })?.response?.status
}

export default function VueTableau({ exigenceId, ancre }: Props) {
  const zone = useRef<HTMLDivElement>(null)
  const cible = useRef<HTMLTableRowElement>(null)
  const actif = ancre.niveau !== 'aucun' && !!ancre.feuille

  const { data, isPending, isError, refetch, isFetching } = useQuery<FenetreTableur>({
    queryKey: ['source-tableau', exigenceId, ancre.feuille, ancre.ligne],
    queryFn: async () => {
      const { data } = await api.get<FenetreTableur>(`/sources/${exigenceId}/tableau`)
      return data
    },
    enabled: actif,
    staleTime: 60_000,
    retry: (n, e) => statut(e) === 503 && n < 3,
    retryDelay: delaiReessai,
  })

  useEffect(() => {
    if (!data) return
    const reduit = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    amenerEnVue(zone.current, cible.current, reduit)
  }, [data])

  if (!actif) {
    return <p className="text-base text-ds-text-2">Aucune ligne du tableur n'est rattachée à cette exigence.</p>
  }
  if (isError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-base text-ds-text-2">Le tableau ne peut pas s'afficher pour le moment.</p>
        <button type="button" onClick={() => refetch()} disabled={isFetching} className={BOUTON}>
          Réessayer
        </button>
      </div>
    )
  }
  if (isPending || !data) {
    return (
      <p role="status" className="flex items-center gap-2 text-base text-ds-text-2">
        <Loader2 size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Chargement du tableau…
      </p>
    )
  }
  return <TableauSource fenetre={data} ancre={ancre} refZone={zone} refLigne={cible} />
}
