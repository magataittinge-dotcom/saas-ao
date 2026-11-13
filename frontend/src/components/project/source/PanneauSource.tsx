import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, ExternalLink, X } from 'lucide-react'
import { Bouton } from '@/components/ui/bouton'
import { Infobulle } from '@/components/ui/infobulle'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
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

  // ── Échap ferme. Sous 1024 px, le panneau est la feuille du bas du système (`Sheet`) : voile, piège et retour du focus,
  //    Échap et fermeture au toucher du voile viennent d'elle (jury, tour 1 : plus de feuille faite à la main).
  useEffect(() => {
    if (feuille) return undefined
    const surTouche = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onFermer() }
    document.addEventListener('keydown', surTouche)
    return () => document.removeEventListener('keydown', surTouche)
  }, [onFermer, feuille])

  // Ordinateur : le panneau est ramené à l'écran à l'ouverture (il peut être plus bas que la fenêtre)
  const mouvementReduit = useMedia(REQUETE_MOUVEMENT_REDUIT)
  useEffect(() => {
    if (feuille) return
    panneauRef.current?.scrollIntoView({ block: 'nearest', behavior: mouvementReduit ? 'auto' : 'smooth' })
    // une fois à l'ouverture
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feuille])

  // ── Vue et page affichées
  const avecImages = exigenceId !== null
  const vues = useMemo(() => (reponse ? vuesDisponibles(reponse, avecImages) : []), [reponse, avecImages])
  const [vueChoisie, setVueChoisie] = useState<VueSource | null>(null)
  // Passage non retrouvé et aucun extrait à lire (source d'un fait du résumé) : la vue « Passage » serait vide ; on ouvre la
  // pièce à la page citée, sous la phrase qui le dit.
  const sansExtrait = !!reponse && reponse.niveau === 'page' && !reponse.citation && exigenceId === null && vues.includes('document')
  const vue: VueSource | null = vueChoisie && vues.includes(vueChoisie) ? vueChoisie : sansExtrait ? 'document' : vueParDefaut(vues)
  const [pageDoc, setPageDoc] = useState<number | null>(null)
  const [totalPages, setTotalPages] = useState<number | null>(nombrePages)
  const page = pageDoc ?? reponse?.page ?? 1

  const choisirVue = (v: VueSource) => { setVueChoisie(v); if (v === 'document') setPageDoc(reponse?.page ?? 1) }
  // Une vue en pages (Page, Document) rend au panneau toute sa hauteur : il est ramené à l'écran, son pied compris.
  useEffect(() => {
    if (feuille || (vue !== 'document' && vue !== 'page')) return
    panneauRef.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
  }, [vue, feuille])
  const surTabs = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const i = vues.indexOf(vue as VueSource)
    const suivant = vues[(i + (e.key === 'ArrowRight' ? 1 : vues.length - 1)) % vues.length]
    if (suivant) { choisirVue(suivant); e.preventDefault() }
  }

  const [corpsRef, largeurCorps] = useLargeur<HTMLDivElement>()
  const largeurPage = largeurPourConteneur(largeurCorps || 600, typeof window !== 'undefined' ? window.devicePixelRatio : 1)

  const lien = reponse ? lienPiece(reponse) : null
  const route = reponse ? aiguiller(reponse) : null
  const nom = reponse?.document?.nom ?? titre ?? 'Extrait du dossier'
  const lienOuvrir = lien && (
    <Bouton asChild variante="secondaire" className="source-ouvrir">
      <a href={lien} target="_blank" rel="noreferrer">
        <ExternalLink aria-hidden="true" /> Ouvrir la pièce
      </a>
    </Bouton>
  )

  const interieur = (
    <>
        <header className="source-tete">
          {feuille && <div className="source-poignee" aria-hidden="true" />}
          <div className="source-titre-ligne">
            <div className="min-w-0 flex-1">
              {feuille
                ? <SheetTitle className="source-piece pr-12">{nom}</SheetTitle>
                : <Infobulle texte={nom} cote="bottom"><h2 id={idTitre} className="source-piece">{nom}</h2></Infobulle>}
              {/* Un fait, une fois (jury, tour 3). La coche ne se pose que sur un passage retrouvé ; une page seulement
                  citée se dit sans icône de réussite. La page n'est pas redite ici quand le pied la porte (vue Document),
                  et un classeur n'a pas de « page ». */}
              {reponse && reponse.niveau !== 'aucun' && (
                <p className="source-meta">
                  <span className="source-niveau">
                    {reponse.niveau === 'passage' && <Check size={14} aria-hidden="true" />} {libelleNiveau(reponse)}
                  </span>
                  {reponse.page && route === 'pdf' && vue !== 'document' && (
                    <span>page {reponse.page}{totalPages ? ` sur ${totalPages}` : ''}</span>
                  )}
                </p>
              )}
            </div>
            {/* sur la feuille, la croix est celle de la feuille du système */}
            {!feuille && (
              <Bouton variante="secondaire" className="w-11 rounded-pilule px-0" onClick={onFermer} aria-label="Fermer l’extrait du dossier">
                <X aria-hidden="true" />
              </Bouton>
            )}
          </div>
          {vues.length > 1 && vue && (
            <div role="tablist" aria-label="Affichage" className="source-onglets" onKeyDown={surTabs}>
              {vues.map((v) => (
                <Bouton
                  key={v}
                  variante="discret"
                  role="tab"
                  id={`${idTitre}-${v}`}
                  aria-selected={v === vue}
                  aria-controls={`${idTitre}-corps`}
                  tabIndex={v === vue ? 0 : -1}
                  className="aria-selected:bg-surface-2 aria-selected:text-fg"
                  onClick={() => choisirVue(v)}
                >
                  {LIBELLES_VUES[v]}
                </Bouton>
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
              <p>Recherche du passage dans la pièce…</p>
            </div>
          )}
          {etat === 'echec' && (
            <div className="source-vide" role="status">
              <p>Cette source n&rsquo;a pas pu s&rsquo;afficher pour le moment.</p>
              <Bouton onClick={onReessayer}>Réessayer</Bouton>
            </div>
          )}
          {reponse && (() => {
            if (route === 'tableur') {
              // l'écran peut ne rien avoir à dessiner pour cette source (un fait du résumé lu dans un classeur) : le panneau
              // dit alors comment lire la pièce, il ne reste jamais blanc
              return rendreTableur?.(reponse) ?? (
                <VueSansPage reponse={reponse} lien={lienOuvrir}>
                  <p>Cette pièce est un tableur : ouvrez-la pour lire la ligne citée.</p>
                </VueSansPage>
              )
            }
            if (route !== 'pdf' || !vue) return <VueSansPage reponse={reponse} lien={lienOuvrir} champ={exigenceId === null} />
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
    </>
  )

  if (feuille) {
    return (
      <Sheet open onOpenChange={(ouvert) => { if (!ouvert) onFermer() }}>
        <SheetContent side="bottom" aria-describedby={undefined} data-feuille="oui" data-vue={vue ?? undefined} className="source-panneau gap-0 p-0 pr-0">
          {interieur}
        </SheetContent>
      </Sheet>
    )
  }
  return (
    <aside ref={panneauRef} className="source-panneau" role="dialog" aria-labelledby={idTitre} tabIndex={-1} data-feuille="non" data-vue={vue ?? undefined}>
      {interieur}
    </aside>
  )
}
