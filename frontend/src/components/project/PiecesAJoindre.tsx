import { phrasePiecesAJoindre } from '@/lib/exportDossier'

interface Piece {
  id: string
  status: string
  document_type_required: string
  details?: string | null
  linked_document_name?: string | null
}

// État en mots positifs (jamais « manquant »). La signature à confirmer n'a pas de statut propre : c'est le défaut.
function etat(p: Piece): string {
  return p.status === 'manquant' ? 'à joindre'
    : p.status === 'expire' ? 'à renouveler'
      : p.status === 'warning' ? 'date de validité à confirmer'
        : 'signature à confirmer'
}

/**
 * S6 — l'avertissement avant le téléchargement : une ligne, sans fenêtre ni orange, au-dessus du bouton.
 * La liste des pièces reste là, repliée sous la ligne (« Voir les pièces »).
 */
export default function PiecesAJoindre({ pieces }: { pieces: Piece[] }) {
  const phrase = phrasePiecesAJoindre(pieces.length)
  if (!phrase) return null
  return (
    <div className="w-full max-w-xl text-center">
      <p className="text-sm" style={{ color: 'var(--text-2)' }}>{phrase}</p>
      <details className="mt-1 text-left">
        <summary className="cursor-pointer text-center text-xs underline underline-offset-2 [@media(pointer:coarse)]:min-h-11" style={{ color: 'var(--text-3)' }}>
          Voir les pièces
        </summary>
        <ul className="mt-1.5 max-h-48 space-y-0.5 overflow-y-auto text-xs" style={{ color: 'var(--text-2)' }}>
          {pieces.map((i) => (
            <li key={i.id}>
              {i.details || i.linked_document_name || i.document_type_required} ({etat(i)})
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
