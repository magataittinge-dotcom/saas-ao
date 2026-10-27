import { ChevronLeft, ChevronRight } from 'lucide-react'

/** Boutons de page du document : cibles de 44 px. */
export default function NavigationPages({ page, total, onPage }: { page: number; total: number | null; onPage: (n: number) => void }) {
  return (
    <div className="source-pages" role="group" aria-label="Pages du document">
      <button type="button" className="source-rond" aria-label="Page précédente"
        disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
      <span className="source-pages-texte" aria-live="polite">
        Page {page}{total ? ` sur ${total}` : ''}
      </span>
      <button type="button" className="source-rond" aria-label="Page suivante"
        disabled={total !== null && page >= total} onClick={() => onPage(page + 1)}>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </div>
  )
}
