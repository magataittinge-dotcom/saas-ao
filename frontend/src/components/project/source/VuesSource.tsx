import { lazy, Suspense, type ReactNode } from 'react'
import {
  citationAffichee, rectsAffiches, rectsDansLoupe,
  type ReponseSource, type VueSource,
} from '@/lib/ancre'
import { LARGEUR_LOUPE } from '@/services/sources'
import { ImageSource } from './FeuilleSource'
import { Bouton } from '@/components/ui/bouton'

// pdf.js n'est chargé qu'à l'ouverture de la vue « Document ».
const VueDocument = lazy(() => import('./VueDocument'))

interface CommunProps {
  reponse: ReponseSource
  /** Identifiant de l'exigence ; null pour une source de champ du bandeau (pas d'images serveur). */
  exigenceId: string | null
}

/** Le passage cité, lisible : avant, passage surligné, après. 16 px au moins (lecture sur chantier),
 *  et dit tel quel aux lecteurs d'écran. `surligner` faux : extrait cité par l'analyse, non vérifié
 *  dans la pièce, donc sans surlignage. */
export function Citation({ reponse, surligner }: { reponse: ReponseSource; surligner: boolean }) {
  if (!reponse.citation) return null
  const c = citationAffichee(reponse.citation)
  const nom = reponse.document?.nom
  return (
    <figure className="source-citation" aria-label="Passage cité">
      <blockquote>
        {c.avant && <span className="source-ctx">{c.avant} </span>}
        {surligner ? (
          <>
            <span className="sr-only">Début du passage cité. </span>
            <mark>{c.passage}</mark>
            <span className="sr-only"> Fin du passage cité.</span>
          </>
        ) : (
          <span>{c.passage}</span>
        )}
        {c.apres && <span className="source-ctx"> {c.apres}</span>}
      </blockquote>
      <figcaption>
        {surligner
          ? `Texte exact de la page ${reponse.page}${nom ? ` · ${nom}` : ''}`
          : 'Extrait cité par Synorix, non retrouvé mot pour mot dans la pièce'}
      </figcaption>
    </figure>
  )
}

export function VuePassage({
  reponse, exigenceId, onVue,
}: CommunProps & { onVue: (v: VueSource) => void }) {
  const surLaPage = rectsAffiches(reponse)
  return (
    <div className="source-vue">
      {/* Jury et testeur, tour 1 : un extrait sans surlignage se lisait comme « le passage ». L'écran dit d'abord la vérité. */}
      {reponse.niveau === 'page' && (
        <p className="source-note" data-passage-non-retrouve="">
          Passage non retrouvé mot pour mot dans la pièce. Page citée par Synorix{reponse.page ? ` · page ${reponse.page}` : ''} : la clause est à lire sur cette page.
        </p>
      )}
      <Citation reponse={reponse} surligner={reponse.niveau === 'passage' && exigenceId !== null} />
      {exigenceId !== null && (
        <>
          <p className="source-sous-titre">Sur la page</p>
          <ImageSource
            exigenceId={exigenceId}
            vue="passage"
            largeur={LARGEUR_LOUPE}
            alt={`Extrait de la page ${reponse.page} de ${reponse.document?.nom ?? 'la pièce'}`}
            rects={rectsDansLoupe(surLaPage, reponse.cadrage)}
            onClick={() => onVue('page')}
            intitule="Voir la page entière"
          />
        </>
      )}
    </div>
  )
}

export function VuePage({
  reponse, exigenceId, largeur, conteneurRef, onSuite,
}: CommunProps & {
  largeur: number
  conteneurRef: React.RefObject<HTMLElement>
  onSuite: (page: number) => void
}) {
  if (exigenceId === null) return null
  return (
    <div className="source-vue">
      {reponse.niveau === 'page' && (
        <p className="source-note" data-passage-non-retrouve="">Passage non retrouvé mot pour mot dans la pièce. Page citée par Synorix : la clause est à lire sur cette page.</p>
      )}
      <ImageSource
        exigenceId={exigenceId}
        vue="page"
        largeur={largeur}
        alt={`Page ${reponse.page} de ${reponse.document?.nom ?? 'la pièce'}`}
        rects={rectsAffiches(reponse)}
        conteneurRef={conteneurRef}
        centrer
        cle={String(largeur)}
      />
      {reponse.suite && (
        <div className="source-suite">
          <p>Le passage se poursuit page {reponse.suite.page}.</p>
          <Bouton onClick={() => onSuite(reponse.suite!.page)}>
            Voir la page {reponse.suite.page} dans le document
          </Bouton>
        </div>
      )}
    </div>
  )
}

export function VueDocumentPdf({
  reponse, page, onPage, onNombrePages, conteneurRef,
}: {
  reponse: ReponseSource
  page: number
  onPage: (n: number) => void
  onNombrePages: (n: number) => void
  conteneurRef: React.RefObject<HTMLElement>
}) {
  const url = reponse.document?.url
  if (!url) return null
  return (
    <div className="source-vue">
      {reponse.niveau === 'page' && page === reponse.page && (
        <p className="source-note" data-passage-non-retrouve="">Passage non retrouvé mot pour mot dans la pièce. Voici la page citée par Synorix : la clause est à lire sur cette page.</p>
      )}
      <Suspense fallback={<div className="source-squelette" role="status" aria-label="Chargement du document" />}>
        <VueDocument
          reponse={reponse} url={url} page={page}
          onPage={onPage} onNombrePages={onNombrePages} conteneurRef={conteneurRef}
        />
      </Suspense>
    </div>
  )
}

/** Quand il n'y a rien à montrer à l'écran : un texte positif et le lien vers la pièce.
 *  Pour un champ du résumé (`champ`), l'extrait lu est reproduit tel quel et la phrase ne promet
 *  ni page ni surlignage (R14). */
export function VueSansPage({ reponse, lien, children, champ = false }: {
  reponse: ReponseSource; lien: ReactNode; children?: ReactNode; champ?: boolean
}) {
  const sansApercu = !reponse.document?.url
  const phrase = sansApercu
    ? 'Cette pièce n’a pas d’aperçu à l’écran pour le moment. Vous pouvez l’ouvrir en entier.'
    : champ
      ? 'Ce fait est lu dans la pièce ; la page exacte n’est pas repérée. Vous pouvez ouvrir la pièce en entier.'
      : 'Cette exigence s’appuie sur la pièce dans son ensemble.'
  return (
    <div className="source-vide" role="status">
      {champ && <Citation reponse={reponse} surligner={false} />}
      {children ?? <p>{phrase}</p>}
      {lien}
    </div>
  )
}
