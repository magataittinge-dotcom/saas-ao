/* Minimal legal footer used on authenticated pages.
 *
 * Just the legal-required links + copyright. Public pages (Landing) have
 * their own richer footer with product/resources columns.
 * Il suit le thème de la page : Calque (clair) ou Lumen (sombre).
 */
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

const LINKS = [
  { to: '/legal/mentions-legales', label: 'Mentions légales' },
  { to: '/legal/cgu', label: 'CGU' },
  { to: '/legal/cgv', label: 'CGV' },
  { to: '/legal/politique-confidentialite', label: 'Confidentialité' },
  { to: '/legal/cookies', label: 'Cookies' },
]

export default function LegalFooter({ calque = false }: { calque?: boolean }) {
  return (
    <footer
      className={cn('mt-8 border-t', calque ? 'border-ligne' : 'border-[var(--line)] bg-[var(--surface)]')}
    >
      <div className={cn('mx-auto flex flex-col items-center justify-between gap-3 px-6 py-4 sm:flex-row', calque ? 'max-w-[1680px]' : 'max-w-6xl')}>
        <span className={cn('text-xs', calque ? 'text-encre-3' : 'text-[var(--ink-3)]')}>
          © {new Date().getFullYear()} Synorix — Tous droits réservés.
        </span>
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={cn(
                'text-xs transition-colors',
                calque ? 'text-encre-3 hover:text-encre' : 'text-[var(--ink-3)] hover:text-[var(--ink)]',
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  )
}
