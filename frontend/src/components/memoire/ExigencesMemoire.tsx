import { EtatElement } from '@/components/etape'
import { Bouton } from '@/components/ui/bouton'
import { espacesFr } from '@/lib/espacesFr'
import { phraseExigences, rangerExigences, type BlocExigences, type LienExigence } from '@/lib/exigencesMemoire'
import { libelleSource } from '@/lib/resumeAO'
import type { SourceLigne } from '@/lib/relectureMemoire'

/** L'état d'une exigence (ou d'un de ses éléments) : un mot et son icône, puis le passage du mémoire qui la traite. */
function Traitement({ de, onAller }: { de: LienExigence; onAller: (ancre: string) => void }) {
  const traitee = de.statut === 'traitee'
  const ancre = de.ancre
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3">
        <EtatElement etat={traitee ? 'pret' : 'a-verifier'} texte={traitee ? 'Traitée' : 'À couvrir'} />
        {ancre && de.section && (
          <Bouton variante="lien" onClick={() => onAller(ancre)} className="h-auto min-h-9 whitespace-normal text-left">Aller à&nbsp;: {de.section}</Bouton>
        )}
      </div>
      {traitee && de.extrait && <p className="break-words text-xs text-fg-3">«&nbsp;{de.extrait}&nbsp;»</p>}
    </>
  )
}

/**
 * B4 — ce que le règlement demande dans le mémoire : chaque exigence de contenu technique, en face du paragraphe qui la
 * traite (« Aller à : … » remonte au passage par les ancres du mémoire), sinon « À couvrir ». Chaque ligne garde sa
 * source dans le règlement. Aucune exigence de contenu relevée : rien.
 */
export default function ExigencesMemoire({ exigences, onAller, onSource }: {
  exigences: BlocExigences | null | undefined
  onAller: (ancre: string) => void
  onSource: (source: SourceLigne) => void
}) {
  if (!exigences || exigences.lignes.length === 0) return null
  return (
    <section data-exigences-memoire="" className="border-t border-bord pt-4">
      <h3 className="text-sm font-semibold text-fg">Ce que le règlement demande dans le mémoire</h3>
      <p className="mt-0.5 text-xs text-fg-3">{espacesFr(phraseExigences(exigences))}</p>
      <ul className="mt-3">
        {rangerExigences(exigences.lignes).map((l) => {
          const source = l.source ? libelleSource({ document: l.source.document ?? '', page: l.source.page ?? null }) : null
          const origine = l.source
          return (
            <li key={l.id} className="border-t border-bord py-3" data-exigence={l.statut}>
              <p className="break-words text-sm font-medium text-fg">{l.texte}</p>
              {l.elements.length > 1 ? (
                <ul className="mt-1.5 space-y-1.5 border-l border-bord pl-3">
                  {l.elements.map((e, i) => (
                    <li key={i} data-element={e.statut}>
                      <p className="break-words text-sm text-fg-2">{e.texte}</p>
                      <Traitement de={e} onAller={onAller} />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-0.5"><Traitement de={l} onAller={onAller} /></div>
              )}
              {origine && (
                <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-fg-3">
                  {source && <span>Source&nbsp;: {source}</span>}
                  <Bouton variante="lien" onClick={() => onSource({ type: 'exigence', id: origine.id })} className="min-h-9">Voir dans le dossier</Bouton>
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
