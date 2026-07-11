/* Minimal legal footer used on authenticated pages.
 *
 * Just the legal-required links + copyright. Public pages (Landing) have
 * their own richer footer with product/resources columns.
 */
import { Link } from 'react-router-dom'

const LINKS = [
  { to: '/legal/mentions-legales', label: 'Mentions légales' },
  { to: '/legal/cgu', label: 'CGU' },
  { to: '/legal/cgv', label: 'CGV' },
  { to: '/legal/politique-confidentialite', label: 'Confidentialité' },
  { to: '/legal/cookies', label: 'Cookies' },
]

export default function LegalFooter() {
  return (
    <footer
      className="border-t mt-8"
      style={{ background: '#1A1D21', borderColor: '#232730' }}
    >
      <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <span className="text-xs" style={{ color: '#6B7280' }}>
          © {new Date().getFullYear()} Synorix — Tous droits réservés.
        </span>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1.5 justify-center">
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="text-xs transition-colors"
              style={{ color: '#9AA3AE' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#22D3EE' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#9AA3AE' }}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  )
}
