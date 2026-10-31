import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ExternalLink, Loader2, X } from 'lucide-react'
import {
  aiguiller, libelleNiveau, vueParDefaut, vuesDisponibles,
  type ReponseSource, type VueSource,
} from '@/lib/ancre'
import { largeurPourConteneur } from '@/services/sources'
import { useReponseExigence } from '@/hooks/useReponseSource'
import { REQUETE_FEUILLE, REQUETE_MOUVEMENT_REDUIT, useLargeur, useMedia } from '@/hooks/useMedia'
import NavigationPages from './NavigationPages'
import { VueDocumentPdf, VuePage, VuePassage, VueSansPage } from './VuesSource'

/** Ce que le panneau montre : une exigence (images et ancre du serveur), ou la source d'un champ
 *  du bandeau (réponse déjà composée côté écran : le document seul, sans images serveur). */
export type SelectionSource =
  | { type: 'exigence'; id: string; titre?: string; nombrePages?: number | null }
  | { type: 'champ'; reponse: ReponseSource; nombrePages?: number | null }

interface Props {
  selection: SelectionSource
  onFermer: () => void
  /** Vue « tableur » (DPGF) : branchée par l'écran quand elle existe ; sinon un texte positif. */
  rendreTableur?: (reponse: ReponseSource) => ReactNode
}

/** Le panneau d'une exigence ou d'un champ : lit l'ancre auprès du serveur, puis l'affiche. */
export default function PanneauSource({ selection, onFermer, rendreTableur }: Props) {
  const exigenceId = selection.type === 'exigence' ? selection.id : null
  const { etat, reessayer } = useReponseExigence(exigenceId)
  return (
    <PanneauSourceVue
      exigenceId={exigenceId}
      titre={selection.type === 'exigence' ? selection.titre : undefined}
      nombrePages={selection.nombrePages ?? null}
      etat={selection.type === 'champ' ? 'pret' : etat.statut}
      reponse={selection.type === 'champ' ? selection.reponse : (etat.statut === 'pret' ? etat.reponse : null)}
      onReessayer={reessayer}
      onFermer={onFermer}
      rendreTableur={rendreTableur}
    />
  )
}

interface VueProps {
  /** Identifiant de l'exigence ; null pour une source de champ (pas d'images serveur). */
  exigenceId: string | null
  titre?: string
  nombrePages: number | null
  etat: 'chargement' | 'pret' | 'echec'
  reponse: ReponseSource | null
  onReessayer: () => void
  onFermer: () => void
  rendreTableur?: (reponse: ReponseSource) => ReactNode
}

const LIBELLES_VUES: Record<VueSource, string> = { passage: 'Passage', page: 'Page', document: 'Document' }

function lienPiece(reponse: ReponseSource): string | null {
  const d = reponse.document
  if (!d) return null
  const base = d.url ?? d.origine
  if (!base) return null
  return d.url && reponse.page ? `${base}#page=${reponse.page}` : base
}

/**
 * « Voir dans le DCE » : le panneau à trois vues (Passage, Page, Document) à côté de la liste des
 * exigences, ou feuille qui monte du bas (90 % de la hauteur) sous 1024 px.
 */
export function PanneauSourceVue({
  exigenceId, titre, nombrePages, etat, reponse, onReessayer, onFermer, rendreTableur,
}: VueProps) {
  const feuille = useMedia(REQUETE_FEUILLE)

  const idTitre = useId()
  const panneauRef = useRef<HTMLElement>(null)

  // ── Échap ferme ; sur la feuille, le focus entre dans le panneau, y reste, et revient au bouton
  useEffect(() => {
    const surTouche = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onFermer() }
    document.addEventListener('keydown', surTouche)
    return () => document.removeEventListener('keydown', surTouche)
  }, [onFermer])

  // Ordinateur : le panneau est ramené à l'écran à l'ouverture (il peut être plus bas que la fenêtre)
  const mouvementReduit = useMedia(REQUETE_MOUVEMENT_REDUIT)
  useEffect(() => {
    if (feuille) return
    panneauRef.current?.scrollIntoView({ block: 'nearest', behavior: mouvementReduit ? 'auto' : 'smooth' })
    // une fois à l'ouverture
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feuille])

  useEffect(() => {
    if (!feuille) return
    const avant = document.activeElement as HTMLElement | null
    panneauRef.current?.focus()
    return () => { if (avant && document.contains(avant)) avant.focus() }
  }, [feuille])

  const piegerLeFocus = useCallback((e: KeyboardEvent<HTMLElement>) => {
    if (!feuille || e.key !== 'Tab' || !panneauRef.current) return
    const cibles = [...panneauRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    if (cibles.length === 0) return
    const premier = cibles[0]
    const dernier = cibles[cibles.length - 1]
    if (e.shiftKey && (document.activeElement === premier || document.activeElement === panneauRef.current)) {
      e.preventDefault(); dernier.focus()
    } else if (!e.shiftKey && document.activeElement === dernier) {
      e.preventDefault(); premier.focus()
    }
  }, [feuille])

  // ── Vue et page affichées
  const avecImages = exigenceId !== null
  const vues = useMemo(() => (reponse ? vuesDisponibles(reponse, avecImages) : []), [reponse, avecImages])
  const [vueChoisie, setVueChoisie] = useState<VueSource | null>(null)
  const vue: VueSource | null = vueChoisie && vues.includes(vueChoisie) ? vueChoisie : vueParDefaut(vues)
  const [pageDoc, setPageDoc] = useState<number | null>(null)
  const [totalPages, setTotalPages] = useState<number | null>(nombrePages)
  const page = pageDoc ?? reponse?.page ?? 1

  const choisirVue = (v: VueSource) => { setVueChoisie(v); if (v === 'document') setPageDoc(reponse?.page ?? 1) }
  const surTabs = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const i = vues.indexOf(vue as VueSource)
    const suivant = vues[(i + (e.key === 'ArrowRight' ? 1 : vues.length - 1)) % vues.length]
    if (suivant) { choisirVue(suivant); e.preventDefault() }
  }

  const [corpsRef, largeurCorps] = useLargeur<HTMLDivElement>()
  const largeurPage = largeurPourConteneur(largeurCorps || 600, typeof window !== 'undefined' ? window.devicePixelRatio : 1)

  const lien = reponse ? lienPiece(reponse) : null
  const nom = reponse?.document?.nom ?? titre ?? 'Extrait du dossier'
  const lienOuvrir = lien && (
    <a href={lien} target="_blank" rel="noreferrer" className="edge-cta source-ouvrir">
      <ExternalLink size={16} aria-hidden="true" /> Ouvrir la pièce
    </a>
  )

  const contenu = (
    <>
      {feuille && <div className="source-voile" onClick={onFermer} aria-hidden="true" />}
      <aside
        ref={panneauRef}
        className="source-panneau"
        role="dialog"
        aria-modal={feuille ? true : undefined}
        aria-labelledby={idTitre}
        tabIndex={-1}
        onKeyDown={piegerLeFocus}
        data-feuille={feuille ? 'oui' : 'non'}
      >
        <header className="source-tete">
          {feuille && <div className="source-poignee" aria-hidden="true" />}
          <div className="source-titre-ligne">
            <div className="min-w-0 flex-1">
              <h2 id={idTitre} className="source-piece" title={nom}>{nom}</h2>
              {reponse && reponse.niveau !== 'aucun' && (
                <p className="source-meta">
                  <span className="source-niveau">
                    <Check size={14} aria-hidden="true" /> {libelleNiveau(reponse)}
                  </span>
                  {reponse.page && (
                    <span>page {reponse.page}{totalPages ? ` sur ${totalPages}` : ''}</span>
                  )}
                </p>
              )}
            </div>
            <button type="button" className="source-rond" onClick={onFermer} aria-label="Fermer l'extrait du dossier">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          {vues.length > 1 && vue && (
            <div role="tablist" aria-label="Affichage" className="source-onglets" onKeyDown={surTabs}>
              {vues.map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  id={`${idTitre}-${v}`}
                  aria-selected={v === vue}
                  aria-controls={`${idTitre}-corps`}
                  tabIndex={v === vue ? 0 : -1}
                  className="source-onglet"
                  onClick={() => choisirVue(v)}
                >
                  {LIBELLES_VUES[v]}
                </button>
              ))}
            </div>
          )}
        </header>

        <div
          ref={corpsRef}
          className="source-corps"
          id={`${idTitre}-corps`}
          role={vues.length > 1 ? 'tabpanel' : undefined}
          aria-labelledby={vues.length > 1 && vue ? `${idTitre}-${vue}` : undefined}
        >
          {etat === 'chargement' && (
            <div className="source-vide" role="status">
              <Loader2 size={20} className="animate-spin" aria-hidden="true" />
              <p>Recherche du passage dans la pièce</p>
            </div>
          )}
          {etat === 'echec' && (
            <div className="source-vide" role="status">
              <p>Cette source n&rsquo;a pas pu s&rsquo;afficher pour le moment.</p>
              <button type="button" className="source-bouton" onClick={onReessayer}>Réessayer</button>
            </div>
          )}
          {reponse && (() => {
            const route = aiguiller(reponse)
            if (route === 'tableur') {
              return rendreTableur ? rendreTableur(reponse) : (
                <VueSansPage reponse={reponse} lien={lienOuvrir}>
                  <p>Cette pièce est un tableur : ouvrez-la pour lire la ligne citée.</p>
                </VueSansPage>
              )
            }
            if (route !== 'pdf' || !vue) return <VueSansPage reponse={reponse} lien={lienOuvrir} />
            if (vue === 'passage') return <VuePassage reponse={reponse} exigenceId={exigenceId} onVue={choisirVue} />
            if (vue === 'page') {
              return (
                <VuePage
                  reponse={reponse} exigenceId={exigenceId} largeur={largeurPage}
                  conteneurRef={corpsRef}
                  onSuite={(p) => { setVueChoisie('document'); setPageDoc(p) }}
                />
              )
            }
            return (
              <VueDocumentPdf
                reponse={reponse} page={page} onPage={setPageDoc}
                onNombrePages={setTotalPages} conteneurRef={corpsRef}
              />
            )
          })()}
        </div>

        {reponse && lien && aiguiller(reponse) === 'pdf' && (
          <footer className="source-pied">
            {vue === 'document' && <NavigationPages page={page} total={totalPages} onPage={setPageDoc} />}
            {lienOuvrir}
          </footer>
        )}
      </aside>
    </>
  )

  // La feuille sort de la page (document.body) : un parent animé ou filtré ne doit pas la déplacer.
  return feuille ? createPortal(contenu, document.body) : contenu
}
