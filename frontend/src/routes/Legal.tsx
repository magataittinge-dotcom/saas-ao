/* Legal pages — public, no auth required.
 *
 * Layout: 2-column (sidebar nav + markdown content).
 * Each document is a static .md served from /public/legal/.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { ArrowLeft, FileText } from 'lucide-react'

const F = "'DM Sans', sans-serif"

type DocSlug =
  | 'mentions-legales'
  | 'cgu'
  | 'cgv'
  | 'politique-confidentialite'
  | 'cookies'

const DOCS: { slug: DocSlug; label: string; description: string }[] = [
  {
    slug: 'mentions-legales',
    label: 'Mentions légales',
    description: 'Éditeur, hébergeur, contact',
  },
  {
    slug: 'cgu',
    label: 'CGU',
    description: "Conditions Générales d'Utilisation",
  },
  {
    slug: 'cgv',
    label: 'CGV',
    description: 'Conditions Générales de Vente B2B',
  },
  {
    slug: 'politique-confidentialite',
    label: 'Confidentialité',
    description: 'Politique de protection des données (RGPD)',
  },
  {
    slug: 'cookies',
    label: 'Cookies',
    description: 'Politique de gestion des cookies',
  },
]

export default function Legal() {
  const { slug } = useParams<{ slug?: string }>()
  const navigate = useNavigate()

  // Default to mentions-legales when navigating to /legal directly.
  const activeSlug = useMemo<DocSlug>(() => {
    const valid = DOCS.find((d) => d.slug === slug)?.slug
    return valid ?? 'mentions-legales'
  }, [slug])

  useEffect(() => {
    if (!slug) navigate('/legal/mentions-legales', { replace: true })
  }, [slug, navigate])

  const [markdown, setMarkdown] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    fetch(`/legal/${activeSlug}.md`, { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`Document indisponible (${r.status})`)
        return r.text()
      })
      .then((txt) => {
        if (!cancelled) setMarkdown(txt)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message ?? 'Erreur de chargement')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeSlug])

  // Scroll to top on slug change so users always start at the title.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [activeSlug])

  return (
    <div style={{ background: '#1A1D21', minHeight: '100vh', fontFamily: F }}>
      {/* Top bar with back link */}
      <div className="border-b" style={{ borderColor: '#232730', background: '#1A1D21' }}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium transition-colors"
            style={{ color: '#9AA3AE' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#22D3EE' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#9AA3AE' }}
          >
            <ArrowLeft size={16} /> Retour à l&apos;accueil
          </Link>
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #22D3EE, #67E8F9)' }}
            >
              <span className="text-white font-black text-[11px]">S</span>
            </div>
            <span className="text-sm font-semibold" style={{ color: '#E7EAEE' }}>
              Synorix
            </span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-10">
        {/* Sidebar */}
        <aside className="lg:sticky lg:top-6 self-start">
          <div className="flex items-center gap-2 mb-4">
            <FileText size={16} style={{ color: '#22D3EE' }} />
            <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#6B7280' }}>
              Documents légaux
            </h2>
          </div>
          <nav className="space-y-1">
            {DOCS.map((doc) => {
              const active = doc.slug === activeSlug
              return (
                <Link
                  key={doc.slug}
                  to={`/legal/${doc.slug}`}
                  className="block rounded-lg px-3 py-2.5 transition-colors"
                  style={{
                    background: active ? 'rgba(34,211,238,0.08)' : 'transparent',
                    border: '1px solid',
                    borderColor: active ? 'rgba(34,211,238,0.18)' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = '#232730'
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <p
                    className="text-sm font-semibold"
                    style={{ color: active ? '#22D3EE' : '#E7EAEE' }}
                  >
                    {doc.label}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>
                    {doc.description}
                  </p>
                </Link>
              )
            })}
          </nav>
          <p className="text-xs mt-6 leading-relaxed" style={{ color: '#6B7280' }}>
            Pour toute question juridique, contactez-nous à{' '}
            <a
              href="mailto:contact@synorix.tech"
              className="font-medium"
              style={{ color: '#22D3EE' }}
            >
              contact@synorix.tech
            </a>
            .
          </p>
        </aside>

        {/* Document */}
        <article className="legal-prose">
          {isLoading && (
            <div className="space-y-3 animate-pulse">
              <div className="h-8 rounded" style={{ background: '#232730', width: '60%' }} />
              <div className="h-4 rounded" style={{ background: '#232730', width: '40%' }} />
              <div className="h-3 rounded mt-6" style={{ background: '#232730' }} />
              <div className="h-3 rounded" style={{ background: '#232730' }} />
              <div className="h-3 rounded" style={{ background: '#232730', width: '80%' }} />
            </div>
          )}
          {error && (
            <div
              className="rounded-lg p-4"
              style={{ background: '#3A1D1D', border: '1px solid #FECACA', color: '#F87171' }}
            >
              <p className="text-sm font-semibold">Impossible de charger le document</p>
              <p className="text-xs mt-1">{error}</p>
            </div>
          )}
          {!isLoading && !error && (
            <div className="animate-fade-in">
              <ReactMarkdown>{markdown}</ReactMarkdown>
            </div>
          )}
        </article>
      </div>
    </div>
  )
}
