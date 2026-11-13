import { useQuery } from '@tanstack/react-query'
import { EtatElement } from '@/components/etape'
import { Bouton } from '@/components/ui/bouton'
import { Carte } from '@/components/ui/carte'
import { lectureControleFichiers, nomCourt, sourceControle, type LigneControle } from '@/lib/controleFichiers'
import { espacesFr } from '@/lib/espacesFr'

/**
 * B9 — les fichiers du dossier à relire avant le dépôt : l'état dit une fois (« À relire »), puis une ligne par point,
 * avec le nom du fichier, la phrase du serveur et sa source. Jamais bloquant : le téléchargement reste possible.
 * Zéro ligne : rien (pas de message vide).
 */
export function ListeControleFichiers({ lignes }: { lignes: readonly LigneControle[] }) {
  if (lignes.length === 0) return null
  return (
    <Carte sansMarge data-controle-fichiers="" className="mb-3 overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 bg-surface-1 px-4 py-2 sm:px-5">
        <EtatElement etat="a-verifier" texte="À relire" />
        <span aria-hidden="true" className="text-xs text-fg-3 max-sm:hidden">·</span>
        <span className="text-xs text-fg-3 max-sm:basis-full">{lignes.length} {lignes.length > 1 ? 'points' : 'point'} avant le dépôt&nbsp;; le téléchargement reste possible</span>
      </div>
      <ul aria-label="Fichiers à relire avant le dépôt">
        {lignes.map((l, i) => {
          const source = sourceControle(l)
          return (
            <li key={`${l.type}-${l.fichier ?? 'dossier'}-${i}`} className="min-h-11 border-t border-bord px-4 py-2.5 sm:px-5">
              <p className="break-words text-sm font-medium text-fg">{nomCourt(l.fichier) ?? 'Le dossier entier'}</p>
              <p className="break-words text-sm text-fg-2">{espacesFr(l.texte)}</p>
              {source && (
                <p className="break-words text-xs text-fg-3">
                  Source&nbsp;: {source.libelle}
                  {source.url && <>{' · '}<a href={source.url} target="_blank" rel="noreferrer noopener" className="font-medium text-accent-text hover:underline">Consulter (nouvel onglet)</a></>}
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </Carte>
  )
}

/** Le contrôle, lu à l'ouverture de l'écran d'export. Une panne se dit (elle ne vaut pas « rien à relire »). */
export default function ControleFichiers({ projectId }: { projectId: string }) {
  const requete = useQuery(lectureControleFichiers(projectId))
  if (requete.isError) {
    return (
      <p role="status" className="mb-3 flex flex-wrap items-center gap-x-3 text-sm text-fg-2">
        Le contrôle des fichiers du dossier n’a pas pu se faire.
        <Bouton variante="lien" onClick={() => { void requete.refetch() }}>Réessayer</Bouton>
      </p>
    )
  }
  return <ListeControleFichiers lignes={requete.data?.lignes ?? []} />
}
