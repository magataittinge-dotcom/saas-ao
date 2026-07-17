import { useState, useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import {
  Search, FileText, Layers, Shield, Download, ArrowRight, Check,
  Menu, X, Star, Play,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════════════════
   LANDING PAGE — Synorix
   Style: "Stark Automate" — dark premium, neural network bg, glassmorphism
   Single file, CSS-only animations, no external images
   ═══════════════════════════════════════════════════════════════════════════ */

// ── Particle positions (neural network background) ──────────────────────
// 50 particles roughly clustered in a brain-like oval at center
const PARTICLES = Array.from({ length: 50 }, (_, i) => {
  const angle = (i / 50) * Math.PI * 2 + (Math.random() - 0.5) * 1.2
  const radius = 15 + Math.random() * 25
  const cx = 50 + Math.cos(angle) * radius * (0.6 + Math.random() * 0.4)
  const cy = 45 + Math.sin(angle) * radius * (0.5 + Math.random() * 0.5)
  const size = 2 + Math.random() * 3
  const dur = 20 + Math.random() * 20
  const dx = (Math.random() - 0.5) * 6
  const dy = (Math.random() - 0.5) * 6
  const delay = -Math.random() * dur
  return { id: i, cx, cy, size, dur, dx, dy, delay }
})

// ── Connections between nearby particles ─────────────────────────────────
const CONNECTIONS: { x1: number; y1: number; x2: number; y2: number; id: string }[] = []
for (let i = 0; i < PARTICLES.length; i++) {
  for (let j = i + 1; j < PARTICLES.length; j++) {
    const dx = PARTICLES[i].cx - PARTICLES[j].cx
    const dy = PARTICLES[i].cy - PARTICLES[j].cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 18) {
      CONNECTIONS.push({
        x1: PARTICLES[i].cx, y1: PARTICLES[i].cy,
        x2: PARTICLES[j].cx, y2: PARTICLES[j].cy,
        id: `${i}-${j}`,
      })
    }
  }
}

// ── CSS Keyframes ────────────────────────────────────────────────────────
const KEYFRAMES = `
@keyframes float-particle {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(var(--dx), var(--dy)); }
}
@keyframes float-pill {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-10px); }
}
@keyframes float-pill-2 {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(8px); }
}
@keyframes pulse-dot {
  0%, 100% { opacity: 1; box-shadow: 0 0 4px rgba(228,233,242,0.6); }
  50% { opacity: 0.5; box-shadow: 0 0 8px rgba(228,233,242,0.9); }
}
@keyframes marquee-scroll {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
@keyframes fade-up {
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes glow-pulse {
  0%, 100% { box-shadow: 0 0 30px rgba(228,233,242,0.3); }
  50% { box-shadow: 0 0 50px rgba(228,233,242,0.5); }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
`

// ── Floating feature pills data ──────────────────────────────────────────
const FLOATING_PILLS = [
  { label: 'Analyse DCE', top: '20%', left: '8%', right: undefined, anim: 'float-pill', dur: '4s', delay: '0s' },
  { label: 'Mémoire 5/5', top: '14%', left: undefined, right: '12%', anim: 'float-pill-2', dur: '3.5s', delay: '0.5s' },
  { label: '62 exigences', top: undefined, left: '12%', right: undefined, anim: 'float-pill', dur: '5s', delay: '1s', bottom: '34%' },
  { label: 'Détection lots', top: undefined, left: undefined, right: '9%', anim: 'float-pill-2', dur: '4.5s', delay: '0.3s', bottom: '28%' },
]

// ── How it works tabs ────────────────────────────────────────────────────
const HOW_TABS = [
  {
    id: 'upload', num: '1', title: 'Upload',
    desc: 'Glissez-déposez votre DCE complet (ZIP, PDF, DOCX). Synorix extrait et identifie automatiquement chaque document : RC, CCTP, DPGF, plans.',
    mock: ['RC — Règlement', 'CCTP — 245 pages', 'DPGF — 12 lots', 'Plans — 8 fichiers'],
  },
  {
    id: 'analyse', num: '2', title: 'Analyse',
    desc: "L'IA analyse chaque document en multi-pass : extraction des exigences, détection des lots, critères de jugement, conditions financières. Source et page référencées.",
    mock: ['62 exigences détectées', 'Conformité: 94%', 'Prix: 40% / Technique: 60%', 'Délai: J-14'],
  },
  {
    id: 'memoire', num: '3', title: 'Mémoire',
    desc: 'Claude Opus génère un mémoire technique complet (~20 pages) adapté à votre entreprise, vos références, et chaque critère de notation du marché.',
    mock: ['Partie A — Présentation', 'Partie B — Prestation', 'Partie C — Méthodologie', 'Scoring: 18.5/20'],
  },
  {
    id: 'export', num: '4', title: 'Export',
    desc: 'Téléchargez le mémoire en .docx, la matrice de conformité Excel, et le dossier complet en ZIP. Prêt à déposer sur la plateforme de l\'acheteur.',
    mock: ['Mémoire.docx ✓', 'Compliance.xlsx ✓', 'Checklist: 12/12', 'ZIP final prêt'],
  },
]

// ── Pricing ──────────────────────────────────────────────────────────────
const PLANS = [
  {
    name: 'Pro', price: '149', popular: false,
    features: ['Analyse IA illimitée', 'Matrice de conformité', 'Checklist candidature', 'Mémoire technique IA', 'Export Word (.docx)', 'Coffre-fort documentaire', '5 projets simultanés'],
  },
  {
    name: 'Business', price: '349', popular: true,
    features: ['Tout le plan Pro, plus :', 'Projets illimités', 'Templates personnalisés', 'Multi-utilisateurs (5)', 'Scoring IA des offres', 'Support prioritaire', 'Historique complet'],
  },
]

// ── Testimonials ─────────────────────────────────────────────────────────
const TESTIMONIALS = [
  { quote: "On a divisé par 3 le temps de réponse aux AO. Le mémoire généré était meilleur que ce qu'on faisait à la main.", name: 'Karim B.', role: 'Directeur commercial', company: 'OZDEM BAT' },
  { quote: "L'analyse DCE détecte des exigences qu'on ratait systématiquement. On n'a plus de mauvaises surprises à l'ouverture des plis.", name: 'Sophie M.', role: 'Responsable marchés', company: 'Plurial Novilia' },
  { quote: "Le coffre-fort documentaire et la checklist nous font gagner un temps fou sur la partie administrative.", name: 'Jean-Marc L.', role: 'Gérant', company: 'Sionneau SAS' },
]

// ── Stats ────────────────────────────────────────────────────────────────
const STATS = [
  { value: '60+', label: 'exigences détectées', color: '#E4E9F2' },
  { value: '10 min', label: 'par mémoire technique', color: '#C3CCDC' },
  { value: '13', label: 'lots auto-détectés', color: '#E4E9F2' },
  { value: '5/5', label: 'note technique visée', color: '#9BA4B5' },
]

// ── Logo clients ─────────────────────────────────────────────────────────
const CLIENTS = ['Plurial Novilia', 'OZDEM BAT', 'Sionneau', 'CARISO FACADE', 'Reims Habitat']

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function Landing() {
  const navigate = useNavigate()
  const { isSignedIn } = useAuth()
  const [mobileMenu, setMobileMenu] = useState(false)
  const [activeTab, setActiveTab] = useState('upload')

  const scrollTo = useCallback((id: string) => {
    setMobileMenu(false)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const activeTabData = useMemo(() => HOW_TABS.find(t => t.id === activeTab)!, [activeTab])

  return (
    <div
      className="min-h-screen w-full overflow-x-hidden"
      style={{ background: '#0A0C11', color: '#F1F5F9', fontFamily: "'Geist', system-ui, sans-serif" }}
    >
      <style>{KEYFRAMES}</style>

      {/* ════════════════════════════════════════════════════════════════
          HERO SECTION — 100vh with neural network background
          ════════════════════════════════════════════════════════════════ */}
      <section className="relative min-h-screen flex flex-col overflow-hidden">

        {/* ── Neural network background ── */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          {/* Central glow */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{
              width: '60vw', height: '60vw', maxWidth: 700, maxHeight: 700,
              background: 'radial-gradient(circle, rgba(228,233,242,0.08) 0%, rgba(228,233,242,0.02) 40%, transparent 70%)',
              borderRadius: '50%',
            }}
          />
          {/* Connections */}
          <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.06 }}>
            {CONNECTIONS.map(c => (
              <line
                key={c.id}
                x1={`${c.x1}%`} y1={`${c.y1}%`}
                x2={`${c.x2}%`} y2={`${c.y2}%`}
                stroke="#E4E9F2" strokeWidth="0.5"
              />
            ))}
          </svg>
          {/* Particles */}
          {PARTICLES.map(p => (
            <div
              key={p.id}
              className="absolute rounded-full"
              style={{
                left: `${p.cx}%`, top: `${p.cy}%`,
                width: p.size, height: p.size,
                background: 'rgba(228,233,242,0.25)',
                boxShadow: '0 0 6px rgba(228,233,242,0.3)',
                animation: `float-particle ${p.dur}s ease-in-out infinite alternate`,
                animationDelay: `${p.delay}s`,
                ['--dx' as string]: `${p.dx}px`,
                ['--dy' as string]: `${p.dy}px`,
              }}
            />
          ))}
        </div>

        {/* ── Navbar ── */}
        <nav
          className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06]"
          style={{ background: 'rgba(0,0,0,0.50)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2.5 shrink-0">
              <div className="logo-synorix" style={{ width: 32, height: 32 }}>
                <span className="logo-synorix-text" style={{ fontSize: 14 }}>S</span>
              </div>
              <span
                className="font-extrabold text-lg tracking-tight"
                style={{ fontFamily: "'Geist', system-ui, sans-serif", color: '#151A23' }}
              >
                Synorix
              </span>
            </Link>

            {/* Desktop links */}
            <div className="hidden md:flex items-center gap-8">
              {[
                { label: 'Fonctionnalités', id: 'features' },
                { label: 'Comment ça marche', id: 'how' },
                { label: 'Tarifs', id: 'pricing' },
              ].map(l => (
                <button
                  key={l.id}
                  onClick={() => scrollTo(l.id)}
                  className="text-sm text-[#9BA4B5] hover:text-white transition-colors bg-transparent border-none cursor-pointer"
                >
                  {l.label}
                </button>
              ))}
            </div>

            {/* Desktop CTA */}
            <div className="hidden md:flex items-center gap-3">
              <Link
                to={isSignedIn ? '/dashboard' : '/login'}
                className="text-sm text-[#9BA4B5] hover:text-white transition-colors px-4 py-2"
              >
                Connexion
              </Link>
              <Link
                to="/register"
                className="text-sm font-semibold text-[#0F1218] px-5 py-2.5 rounded-xl transition-all"
                style={{
                  background: 'linear-gradient(180deg, #FFFFFF, #E2E7F0)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.9), 0 4px 18px -6px rgba(255,255,255,.30)',
                  boxShadow: '0 0 30px rgba(228,233,242,0.3)',
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 40px rgba(228,233,242,0.5)' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 0 30px rgba(228,233,242,0.3)' }}
              >
                Essai gratuit
              </Link>
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenu(!mobileMenu)}
              className="md:hidden p-2 text-[#9BA4B5]"
            >
              {mobileMenu ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>

          {/* Mobile menu */}
          {mobileMenu && (
            <div className="md:hidden border-t border-white/[0.06] px-4 py-4 space-y-3" style={{ background: 'rgba(0,0,0,0.90)' }}>
              {['features', 'how', 'pricing'].map(id => (
                <button key={id} onClick={() => scrollTo(id)} className="block text-sm text-[#9BA4B5] hover:text-white transition-colors bg-transparent border-none cursor-pointer">
                  {id === 'features' ? 'Fonctionnalités' : id === 'how' ? 'Comment ça marche' : 'Tarifs'}
                </button>
              ))}
              <div className="flex gap-3 pt-2">
                <Link to={isSignedIn ? '/dashboard' : '/login'} className="text-sm text-[#9BA4B5]">Connexion</Link>
                <Link to="/register" className="text-sm font-semibold text-[#0F1218] px-4 py-2 rounded-lg" style={{ background: '#E9EDF5' }}>Essai gratuit</Link>
              </div>
            </div>
          )}
        </nav>

        {/* ── Hero content ── */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 pt-24 pb-16 text-center">
          {/* Floating pills — hidden on mobile */}
          <div className="hidden lg:block">
            {FLOATING_PILLS.map((pill, i) => (
              <div
                key={i}
                className="absolute hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
                style={{
                  top: pill.top, left: pill.left, right: pill.right, bottom: (pill as { bottom?: string }).bottom,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  backdropFilter: 'blur(12px)',
                  color: '#9BA4B5',
                  animation: `${pill.anim} ${pill.dur} ease-in-out infinite`,
                  animationDelay: pill.delay,
                }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: '#E9EDF5', animation: 'pulse-dot 2s ease-in-out infinite' }}
                />
                {pill.label}
              </div>
            ))}
          </div>

          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm mb-8"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.10)',
              animation: 'fade-up 0.6s ease-out both',
            }}
          >
            <span>✨</span>
            <span className="text-[#C7CEDA]">Propulsé par l'IA la plus avancée</span>
          </div>

          {/* Title */}
          <h1
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.1] mb-6 max-w-4xl"
            style={{ fontFamily: "'Geist', system-ui, sans-serif", animation: 'fade-up 0.6s ease-out 0.1s both' }}
          >
            Ne perdez plus de{' '}
            <br className="hidden sm:block" />
            <span
              style={{
                background: 'linear-gradient(90deg, #E4E9F2, #C3CCDC)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}
            >
              marchés
            </span>
            <br />
            à cause d'un dossier incomplet
          </h1>

          {/* Subtitle */}
          <p
            className="text-base sm:text-lg text-[#9BA4B5] max-w-2xl mx-auto mb-10 leading-relaxed"
            style={{ animation: 'fade-up 0.6s ease-out 0.2s both' }}
          >
            Synorix analyse vos DCE, détecte chaque exigence, et génère des mémoires techniques notés 5/5. En 10 minutes.
          </p>

          {/* CTA buttons */}
          <div
            className="flex flex-col sm:flex-row items-center gap-4 mb-10"
            style={{ animation: 'fade-up 0.6s ease-out 0.3s both' }}
          >
            <button
              onClick={() => navigate('/register')}
              className="px-8 py-3.5 rounded-xl text-sm font-semibold text-[#0F1218] flex items-center gap-2 transition-all"
              style={{
                background: 'linear-gradient(180deg, #FFFFFF, #E2E7F0)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.9), 0 4px 18px -6px rgba(255,255,255,.30)',
                boxShadow: '0 0 30px rgba(228,233,242,0.3)',
                animation: 'glow-pulse 3s ease-in-out infinite',
              }}
            >
              Démarrer — 1 AO gratuit <ArrowRight size={16} />
            </button>
            <button
              onClick={() => scrollTo('how')}
              className="px-6 py-3.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-all hover:bg-white/[0.08]"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#C7CEDA',
              }}
            >
              <Play size={14} /> Voir la démo
            </button>
          </div>

          {/* Social proof */}
          <div
            className="flex items-center gap-3 text-sm text-[#9BA4B5]"
            style={{ animation: 'fade-up 0.6s ease-out 0.4s both' }}
          >
            <div className="flex -space-x-2">
              {[0, 1, 2, 3, 4].map(i => (
                <div
                  key={i}
                  className="w-7 h-7 rounded-full border-2 border-[#0A0C11] flex items-center justify-center text-[9px] font-bold text-[#0F1218]"
                  style={{ background: `linear-gradient(135deg, ${i % 2 === 0 ? '#E4E9F2' : '#C3CCDC'}, ${i % 2 === 0 ? '#C3CCDC' : '#E4E9F2'})` }}
                >
                  {['KB', 'SM', 'JL', 'AR', 'MC'][i]}
                </div>
              ))}
            </div>
            <span>Utilisé par <strong className="text-[#9BA4B5]">+50 entreprises BTP</strong></span>
          </div>
        </div>

        {/* ── Dashboard mockup ── */}
        <div
          className="relative z-10 max-w-4xl mx-auto px-4 pb-20 w-full"
          style={{ animation: 'fade-up 0.8s ease-out 0.5s both' }}
        >
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: '#0F1218',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 0 80px rgba(228,233,242,0.12), 0 40px 80px rgba(0,0,0,0.5)',
              transform: 'perspective(1200px) rotateX(4deg)',
            }}
          >
            {/* Browser bar */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
              <div className="w-3 h-3 rounded-full" style={{ background: '#F58E86' }} />
              <div className="w-3 h-3 rounded-full" style={{ background: '#9BA4B5' }} />
              <div className="w-3 h-3 rounded-full" style={{ background: '#E9EDF5' }} />
              <div className="flex-1 mx-4 h-6 rounded-md" style={{ background: 'rgba(255,255,255,0.04)', maxWidth: 300 }}>
                <div className="px-3 py-1 text-[10px] text-[#788295]">app.synorix.fr/dashboard</div>
              </div>
            </div>
            {/* Mock dashboard content */}
            <div className="p-5 sm:p-6 space-y-4">
              {/* Stats row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'AO en cours', val: '7', color: '#E4E9F2' },
                  { label: 'Taux conformité', val: '94%', color: '#E4E9F2' },
                  { label: 'AO gagnés', val: '12', color: '#C3CCDC' },
                  { label: 'Soumis ce mois', val: '3', color: '#9BA4B5' },
                ].map(s => (
                  <div
                    key={s.label}
                    className="rounded-lg p-3"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
                  >
                    <div className="text-[10px] text-[#9BA4B5] mb-1">{s.label}</div>
                    <div className="text-xl font-bold" style={{ color: s.color, fontFamily: "'Geist Mono', monospace" }}>{s.val}</div>
                  </div>
                ))}
              </div>
              {/* Project cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {['Construction 42 logements', 'Réhab. école Jean Jaurès', 'Voirie ZAC des Halles'].map((name, i) => (
                  <div
                    key={i}
                    className="rounded-lg p-3 space-y-2"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-[#F4F6FA] truncate">{name}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(228,233,242,0.12)', color: '#FFFFFF' }}>En cours</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <div className="h-full rounded-full" style={{ width: `${[65, 40, 85][i]}%`, background: 'linear-gradient(90deg, #E4E9F2, #C3CCDC)' }} />
                    </div>
                    <div className="text-[10px] text-[#788295]">Étape {[3, 2, 5][i]}/6 · J-{[14, 7, 3][i]}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          LOGOS CLIENTS
          ════════════════════════════════════════════════════════════════ */}
      <section className="py-12 border-y border-white/[0.04] overflow-hidden">
        <p className="text-center text-xs text-[#9BA4B5] uppercase tracking-[0.15em] mb-8 font-medium">
          Ils nous font confiance
        </p>
        <div className="relative overflow-hidden" style={{ maskImage: 'linear-gradient(90deg, transparent, black 15%, black 85%, transparent)' }}>
          <div className="flex whitespace-nowrap" style={{ animation: 'marquee-scroll 25s linear infinite' }}>
            {[...CLIENTS, ...CLIENTS].map((name, i) => (
              <span
                key={i}
                className="inline-block text-lg font-semibold text-[#5C6678] mx-10 sm:mx-16"
                style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          FEATURES — Bento Grid
          ════════════════════════════════════════════════════════════════ */}
      <section id="features" className="py-20 sm:py-28 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2
              className="text-3xl sm:text-4xl font-bold mb-4"
              style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
            >
              Une IA experte en{' '}
              <span style={{ background: 'linear-gradient(90deg, #E4E9F2, #C3CCDC)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                marchés publics BTP
              </span>
            </h2>
            <p className="text-[#9BA4B5] max-w-xl mx-auto">
              Chaque fonctionnalité est conçue pour maximiser vos chances de remporter le marché.
            </p>
          </div>

          {/* Bento grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Large 1: Analyse DCE */}
            <div
              className="lg:col-span-2 rounded-xl p-6 sm:p-8 transition-all duration-300 hover:border-[#E4E9F2]/30 group"
              style={{ background: '#0F1218', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="flex items-start gap-4 mb-5">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(228,233,242,0.12)' }}>
                  <Search size={18} style={{ color: '#E4E9F2' }} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#F4F6FA] mb-1" style={{ fontFamily: "'Geist', system-ui, sans-serif" }}>Analyse DCE intelligente</h3>
                  <p className="text-sm text-[#9BA4B5] leading-relaxed">Multi-pass sur RC, CCTP, DPGF. Chaque exigence est extraite avec sa source, sa page, et sa priorité.</p>
                </div>
              </div>
              {/* Mini illustration */}
              <div className="rounded-lg p-4 space-y-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                {['Attestation décennale — RC p.4', 'Planning détaillé — CCTP §3.2', 'Sous-traitance déclarée — RC p.7'].map((txt, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: ['rgba(239,68,68,0.12)', 'rgba(245,158,11,0.12)', 'rgba(228,233,242,0.12)'][i], color: ['#F87171', '#FBBF24', '#FFFFFF'][i] }}>
                      {['Critique', 'Important', 'Standard'][i]}
                    </span>
                    <span className="text-[#9BA4B5]">{txt}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Small 1: Détection lots */}
            <div
              className="rounded-xl p-6 transition-all duration-300 hover:border-[#E4E9F2]/30"
              style={{ background: '#0F1218', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background: 'rgba(0,212,170,0.12)' }}>
                <Layers size={18} style={{ color: '#C3CCDC' }} />
              </div>
              <h3 className="text-base font-semibold text-[#F4F6FA] mb-2" style={{ fontFamily: "'Geist', system-ui, sans-serif" }}>Détection des lots</h3>
              <p className="text-sm text-[#9BA4B5] leading-relaxed">L'IA identifie tous les lots depuis le DPGF, RC et noms de fichiers. Badge de confiance pour chaque détection.</p>
            </div>

            {/* Small 2: Coffre-fort */}
            <div
              className="rounded-xl p-6 transition-all duration-300 hover:border-[#E4E9F2]/30"
              style={{ background: '#0F1218', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background: 'rgba(139,92,246,0.12)' }}>
                <Shield size={18} style={{ color: '#E4E9F2' }} />
              </div>
              <h3 className="text-base font-semibold text-[#F4F6FA] mb-2" style={{ fontFamily: "'Geist', system-ui, sans-serif" }}>Coffre-fort documents</h3>
              <p className="text-sm text-[#9BA4B5] leading-relaxed">Centralisez décennale, URSSAF, Kbis. Alerte avant expiration. Lié automatiquement à la checklist candidature.</p>
            </div>

            {/* Large 2: Mémoire technique */}
            <div
              className="lg:col-span-2 rounded-xl p-6 sm:p-8 transition-all duration-300 hover:border-[#E4E9F2]/30 group"
              style={{ background: '#0F1218', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="flex items-start gap-4 mb-5">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(228,233,242,0.12)' }}>
                  <FileText size={18} style={{ color: '#E4E9F2' }} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#F4F6FA] mb-1" style={{ fontFamily: "'Geist', system-ui, sans-serif" }}>Mémoire technique 5/5</h3>
                  <p className="text-sm text-[#9BA4B5] leading-relaxed">Claude Opus génère ~20 pages adaptées à vos références, votre équipe, et chaque critère de notation du marché.</p>
                </div>
              </div>
              {/* Mini illustration */}
              <div className="rounded-lg p-4 space-y-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                {['A — Présentation générale', 'B — Prestation & méthodologie', 'C — Planning & sécurité'].map((txt, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs">
                    <div className="w-1.5 h-6 rounded-full" style={{ background: ['#E4E9F2', '#C3CCDC', '#E4E9F2'][i] }} />
                    <span className="text-[#9BA4B5]">{txt}</span>
                    <span className="ml-auto text-[10px] text-[#788295]">{['6 pages', '8 pages', '4 pages'][i]}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Small 3: Export */}
            <div
              className="rounded-xl p-6 transition-all duration-300 hover:border-[#E4E9F2]/30"
              style={{ background: '#0F1218', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background: 'rgba(245,158,11,0.12)' }}>
                <Download size={18} style={{ color: '#9BA4B5' }} />
              </div>
              <h3 className="text-base font-semibold text-[#F4F6FA] mb-2" style={{ fontFamily: "'Geist', system-ui, sans-serif" }}>Export ZIP pro</h3>
              <p className="text-sm text-[#9BA4B5] leading-relaxed">Mémoire .docx, compliance Excel, dossier complet. Prêt à déposer en un clic sur la plateforme de l'acheteur.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          HOW IT WORKS — 4 Tabs
          ════════════════════════════════════════════════════════════════ */}
      <section id="how" className="py-20 sm:py-28 px-4">
        <div className="max-w-4xl mx-auto">
          <h2
            className="text-3xl sm:text-4xl font-bold text-center mb-4"
            style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
          >
            De l'analyse au dépôt en{' '}
            <span style={{ background: 'linear-gradient(90deg, #E4E9F2, #C3CCDC)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              4 étapes
            </span>
          </h2>
          <p className="text-center text-[#9BA4B5] mb-12 max-w-lg mx-auto">
            Uploadez, laissez l'IA travailler, déposez. C'est aussi simple que ça.
          </p>

          {/* Tabs */}
          <div className="flex border-b border-white/[0.06] mb-8 overflow-x-auto">
            {HOW_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex-1 min-w-[100px] py-3 px-4 text-sm font-medium transition-all bg-transparent border-none cursor-pointer whitespace-nowrap"
                style={{
                  color: activeTab === tab.id ? '#E4E9F2' : '#9BA4B5',
                  background: activeTab === tab.id ? 'rgba(228,233,242,0.08)' : 'transparent',
                  borderBottom: activeTab === tab.id ? '2px solid #E4E9F2' : '2px solid transparent',
                }}
              >
                {tab.num}. {tab.title}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div>
              <h3
                className="text-xl font-semibold text-[#F4F6FA] mb-3"
                style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
              >
                {activeTabData.num}. {activeTabData.title}
              </h3>
              <p className="text-[#9BA4B5] leading-relaxed text-sm">{activeTabData.desc}</p>
            </div>
            <div
              className="rounded-xl p-5 space-y-3"
              style={{ background: '#0F1218', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              {activeTabData.mock.map((line, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}
                >
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: '#E9EDF5' }} />
                  <span className="text-[#C7CEDA]">{line}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          STATS
          ════════════════════════════════════════════════════════════════ */}
      <section className="py-20 px-4" style={{ background: '#10141B' }}>
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {STATS.map(s => (
            <div key={s.label}>
              <div
                className="text-4xl sm:text-5xl font-bold mb-2"
                style={{ color: s.color, fontFamily: "'Geist Mono', monospace" }}
              >
                {s.value}
              </div>
              <div className="text-sm text-[#9BA4B5]">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          PRICING
          ════════════════════════════════════════════════════════════════ */}
      <section id="pricing" className="py-20 sm:py-28 px-4">
        <div className="max-w-4xl mx-auto">
          <h2
            className="text-3xl sm:text-4xl font-bold text-center mb-4"
            style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
          >
            Des prix simples, un{' '}
            <span style={{ background: 'linear-gradient(90deg, #E4E9F2, #C3CCDC)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              ROI immédiat
            </span>
          </h2>
          <p className="text-center text-[#9BA4B5] mb-12">
            1 AO gratuit pour tester — Sans engagement
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {PLANS.map(plan => (
              <div
                key={plan.name}
                className="rounded-2xl p-8 relative transition-all duration-300"
                style={{
                  background: '#0F1218',
                  border: plan.popular ? '1px solid rgba(228,233,242,0.30)' : '1px solid rgba(255,255,255,0.06)',
                  boxShadow: plan.popular ? '0 0 40px rgba(228,233,242,0.08)' : 'none',
                }}
              >
                {plan.popular && (
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-semibold text-[#0F1218]"
                    style={{ background: 'linear-gradient(135deg, #E4E9F2, #C3CCDC)' }}
                  >
                    Populaire
                  </div>
                )}
                <h3
                  className="text-xl font-bold text-[#F4F6FA] mb-2"
                  style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
                >
                  {plan.name}
                </h3>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-bold text-white" style={{ fontFamily: "'Geist Mono', monospace" }}>{plan.price}€</span>
                  <span className="text-sm text-[#9BA4B5]">/mois</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-3 text-sm text-[#9BA4B5]">
                      <Check size={14} style={{ color: '#E4E9F2' }} className="shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => navigate('/register')}
                  className="w-full py-3 rounded-xl text-sm font-semibold transition-all"
                  style={plan.popular
                    ? { background: '#E4E9F2', color: 'white', boxShadow: '0 0 30px rgba(228,233,242,0.3)' }
                    : { background: 'transparent', color: '#C7CEDA', border: '1px solid rgba(255,255,255,0.15)' }
                  }
                  onMouseEnter={e => {
                    if (plan.popular) e.currentTarget.style.boxShadow = '0 0 40px rgba(228,233,242,0.5)'
                    else e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                  }}
                  onMouseLeave={e => {
                    if (plan.popular) e.currentTarget.style.boxShadow = '0 0 30px rgba(228,233,242,0.3)'
                    else e.currentTarget.style.background = 'transparent'
                  }}
                >
                  Commencer
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          TESTIMONIALS
          ════════════════════════════════════════════════════════════════ */}
      <section className="py-20 sm:py-28 px-4" style={{ background: '#10141B' }}>
        <div className="max-w-6xl mx-auto">
          <h2
            className="text-3xl sm:text-4xl font-bold text-center mb-14"
            style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
          >
            Ce qu'en disent nos utilisateurs
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {TESTIMONIALS.map((t, i) => (
              <div
                key={i}
                className="rounded-xl p-6 transition-all duration-300 hover:border-white/[0.12]"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div className="flex gap-0.5 mb-4">
                  {[0, 1, 2, 3, 4].map(s => (
                    <Star key={s} size={14} fill="#9BA4B5" stroke="none" />
                  ))}
                </div>
                <p className="text-sm text-[#C7CEDA] leading-relaxed mb-5 italic">"{t.quote}"</p>
                <div>
                  <div className="text-sm font-semibold text-[#F4F6FA]">{t.name}</div>
                  <div className="text-xs text-[#9BA4B5]">{t.role} · {t.company}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          CTA FINAL
          ════════════════════════════════════════════════════════════════ */}
      <section className="py-24 sm:py-32 px-4 text-center relative overflow-hidden">
        {/* Glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(228,233,242,0.08) 0%, transparent 60%)' }}
        />
        <div className="relative z-10">
          <h2
            className="text-3xl sm:text-5xl font-bold mb-6"
            style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
          >
            Prêt à gagner plus de{' '}
            <span style={{ background: 'linear-gradient(90deg, #E4E9F2, #C3CCDC)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              marchés
            </span>
            {' '}?
          </h2>
          <p className="text-[#9BA4B5] mb-10 max-w-md mx-auto">
            Commencez gratuitement avec 1 AO complet. Aucune carte bancaire requise.
          </p>
          <button
            onClick={() => navigate('/register')}
            className="px-10 py-4 rounded-xl text-base font-semibold text-[#0F1218] transition-all inline-flex items-center gap-2"
            style={{
              background: 'linear-gradient(180deg, #FFFFFF, #E2E7F0)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.9), 0 4px 18px -6px rgba(255,255,255,.30)',
              boxShadow: '0 0 40px rgba(228,233,242,0.35)',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 60px rgba(228,233,242,0.55)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 0 40px rgba(228,233,242,0.35)' }}
          >
            Démarrer gratuitement <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          FOOTER
          ════════════════════════════════════════════════════════════════ */}
      <footer className="border-t border-white/[0.06] py-16 px-4" style={{ background: '#0A0C11' }}>
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-10">
          <div>
            <h4 className="text-sm font-semibold text-[#F4F6FA] mb-4" style={{ fontFamily: "'Geist', system-ui, sans-serif" }}>Produit</h4>
            <ul className="space-y-2.5 text-sm text-[#9BA4B5]">
              <li><button onClick={() => scrollTo('features')} className="hover:text-white transition-colors bg-transparent border-none cursor-pointer text-[#9BA4B5] text-sm p-0">Fonctionnalités</button></li>
              <li><button onClick={() => scrollTo('pricing')} className="hover:text-white transition-colors bg-transparent border-none cursor-pointer text-[#9BA4B5] text-sm p-0">Tarifs</button></li>
              <li><button onClick={() => scrollTo('how')} className="hover:text-white transition-colors bg-transparent border-none cursor-pointer text-[#9BA4B5] text-sm p-0">Comment ça marche</button></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[#F4F6FA] mb-4" style={{ fontFamily: "'Geist', system-ui, sans-serif" }}>Ressources</h4>
            <ul className="space-y-2.5 text-sm text-[#9BA4B5]">
              <li>Documentation</li>
              <li>Blog</li>
              <li>Changelog</li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[#F4F6FA] mb-4" style={{ fontFamily: "'Geist', system-ui, sans-serif" }}>Légal</h4>
            <ul className="space-y-2.5 text-sm text-[#9BA4B5]">
              <li><Link to="/legal/mentions-legales" className="hover:text-white transition-colors">Mentions légales</Link></li>
              <li><Link to="/legal/cgu" className="hover:text-white transition-colors">CGU</Link></li>
              <li><Link to="/legal/cgv" className="hover:text-white transition-colors">CGV</Link></li>
              <li><Link to="/legal/politique-confidentialite" className="hover:text-white transition-colors">Confidentialité</Link></li>
              <li><Link to="/legal/cookies" className="hover:text-white transition-colors">Cookies</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[#F4F6FA] mb-4" style={{ fontFamily: "'Geist', system-ui, sans-serif" }}>Contact</h4>
            <ul className="space-y-2.5 text-sm text-[#9BA4B5]">
              <li><a href="mailto:contact@synorix.tech" className="hover:text-white transition-colors">contact@synorix.tech</a></li>
              <li><a href="mailto:support@synorix.tech" className="hover:text-white transition-colors">support@synorix.tech</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-6xl mx-auto mt-12 pt-6 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #E4E9F2, #C3CCDC)' }}>
              <span className="text-[#0F1218] font-black text-[10px]">S</span>
            </div>
            <span className="text-sm text-[#788295]">Synorix</span>
          </div>
          <span className="text-xs text-[#5C6678]">© 2026 Synorix. Tous droits réservés.</span>
        </div>
      </footer>
    </div>
  )
}
