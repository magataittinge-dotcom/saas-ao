import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Bouton } from '@/components/ui/bouton'

/** Boutons de page du document : cibles de 44 px. */
export default function NavigationPages({ page, total, onPage }: { page: number; total: number | null; onPage: (n: number) => void }) {
  return (
    <div className="source-pages" role="group" aria-label="Pages du document">
      <Bouton variante="secondaire" className="w-11 rounded-pilule px-0" aria-label="Page précédente"
        disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft aria-hidden="true" />
      </Bouton>
      <span className="source-pages-texte" aria-live="polite">
        Page {page}{total ? ` sur ${total}` : ''}
      </span>
      <Bouton variante="secondaire" className="w-11 rounded-pilule px-0" aria-label="Page suivante"
        disabled={total !== null && page >= total} onClick={() => onPage(page + 1)}>
        <ChevronRight aria-hidden="true" />
      </Bouton>
    </div>
  )
}
