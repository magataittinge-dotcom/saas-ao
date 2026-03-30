import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  Sparkles, Upload, Brain, FileDown, Check, ArrowRight,
  FileText, Layers, ShieldCheck, BookOpen,
} from 'lucide-react'
import PlanetBackground from '@/components/common/PlanetBackground'

// ─── Intersection Observer hook ────────────────────────────────────────────────

function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('revealed')
          obs.disconnect()
        }
      },
      { threshold: 0.12 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return ref
}

function Section({
  children,
  className = '',
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
}) {
  const ref = useReveal()
  return (
    <div
      ref={ref}
      className={`reveal-section ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

// ─── Data ──────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: FileText,
    title: 'Analyse DCE intelligente',
    desc: "Uploadez votre DCE (ZIP ou fichiers séparés). L'IA extrait toutes les exigences en quelques minutes : RC, CCTP, CCAP, DPGF.",
  },
  {
    icon: Layers,
    title: 'Détection multi-lots',
    desc: "Détection automatique de tous les lots avec score de confiance. Choisissez votre lot et concentrez-vous sur l'essentiel.",
  },
  {
    icon: ShieldCheck,
    title: 'Conformité automatique',
    desc: 'Checklist candidature générée et matrice de conformité vérifiée contre votre coffre-fort documentaire.',
  },
  {
    icon: BookOpen,
    title: 'Mémoire technique IA',
    desc: "Génération d'un mémoire technique de 20 pages adapté au DCE, export Word (.docx) prêt à soumettre.",
  },
]

const STEPS = [
  {
    num: '01',
    icon: Upload,
    title: 'Uploadez votre DCE',
    desc: 'Glissez-déposez vos fichiers PDF, DOCX, XLSX ou une archive ZIP. Synorix reconnaît automatiquement chaque pièce.',
  },
  {
    num: '02',
    icon: Brain,
    title: "L'IA analyse et extrait",
    desc: "Claude Opus lit l'intégralité du dossier, détecte les lots, extrait les exigences et bâtit la matrice de conformité.",
  },
  {
    num: '03',
    icon: FileDown,
    title: 'Téléchargez votre mémoire',
    desc: "Votre mémoire technique de 20 pages est prêt. Révisez-le dans l'éditeur intégré et exportez en Word d'un clic.",
  },
]

const PLANS = [
  {
    id: 'pro',
    name: 'Pro',
    price: '249',
    desc: 'Pour les TPE et PME BTP',
    features: [
      '2 utilisateurs',
      '15 AO / mois',
      'Analyse DCE complète',
      'Détection multi-lots',
      'Checklist conformité',
      'Mémoire technique IA',
      'Export Word (.docx)',
      'Coffre-fort documentaire',
    ],
    cta: 'Démarrer en Pro',
    highlight: false,
  },
  {
    id: 'business',
    name: 'Business',
    price: '399',
    desc: 'Pour les équipes et groupements',
    features: [
      '5+ utilisateurs',
      '30 AO / mois',
      'Tout le plan Pro',
      'Alertes AO automatiques',
      'Multi-lots avancé',
      'Tableaux de bord équipe',
      'Templates personnalisés',
      'Support prioritaire',
    ],
    cta: 'Démarrer en Business',
    highlight: true,
  },
]

// ─── Landing ──────────────────────────────────────────────────────────────────

export default function Landing() {
  const featuresRef = useRef<HTMLElement>(null)

  const scrollToFeatures = () => {
    featuresRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div
      style={{
        background: '#050A18',
        color: '#E2E8F0',
        fontFamily: '"DM Sans", system-ui, sans-serif',
      }}
    >
      <style>{`
        /* Reveal animation */
        .reveal-section {
          opacity: 0;
          transform: translateY(30px);
          transition: opacity 0.6s ease-out, transform 0.6s ease-out;
        }
        .reveal-section.revealed {
          opacity: 1;
          transform: translateY(0);
        }

        /* Planet rotation */
        @keyframes planet-rotate {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }

        /* Shimmer text */
        @keyframes shimmer-text {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        .shimmer-gradient {
          background: linear-gradient(
            90deg,
            #60A5FA 0%,
            #22D3EE 25%,
            #93C5FD 50%,
            #22D3EE 75%,
            #60A5FA 100%
          );
          background-size: 200% 100%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer-text 4s linear infinite;
        }

        /* Feature card hover */
        .landing-feature-card {
          transition: border-color 0.3s ease, transform 0.3s ease, box-shadow 0.3s ease;
        }
        .landing-feature-card:hover {
          border-color: rgba(59,130,246,0.20) !important;
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(59,130,246,0.08);
        }

        /* Border rotate for highlighted pricing card */
        @keyframes border-rotate {
          0%   { background-position: 0% 50%; }
          100% { background-position: 300% 50%; }
        }
        .pricing-highlight-border {
          position: relative;
        }
        .pricing-highlight-border::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1px;
          background: linear-gradient(90deg, #3B82F6, #06B6D4, #3B82F6, #06B6D4);
          background-size: 300% 100%;
          animation: border-rotate 4s linear infinite;
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
        }

        /* CTA glow pulse */
        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 32px rgba(59,130,246,0.25); }
          50%       { box-shadow: 0 0 48px rgba(59,130,246,0.40); }
        }
        .cta-glow-pulse {
          animation: glow-pulse 3s ease-in-out infinite;
        }

        /* Mobile nav */
        @media (max-width: 640px) {
          .nav-links-desktop { display: none !important; }
          .planet-bg {
            right: -300px !important;
            top: -50px !important;
            width: 500px !important;
            height: 500px !important;
          }
        }
        @media (min-width: 641px) {
          .planet-bg {
            right: -200px;
            top: -100px;
          }
        }

        /* Reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .reveal-section { opacity: 1; transform: none; transition: none; }
          .shimmer-gradient { animation: none; }
          .pricing-highlight-border::before { animation: none; }
          .cta-glow-pulse { animation: none; }
          [style*="planet-rotate"] { animation: none !important; }
        }
      `}</style>

      {/* ════════════════════════════════════════════════════════════════════
          NAV — Sticky glassmorphism
      ════════════════════════════════════════════════════════════════════ */}
      <nav
        className="sticky top-0 z-50"
        style={{
          background: 'rgba(5,10,24,0.80)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 no-underline">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{
                background: 'linear-gradient(135deg, #3B82F6, #06B6D4)',
                boxShadow: '0 0 16px rgba(59,130,246,0.40)',
              }}
            >
              <span
                className="text-white font-black text-sm"
                style={{ fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}
              >
                S
              </span>
            </div>
            <span
              className="font-black text-lg tracking-tight"
              style={{
                background: 'linear-gradient(135deg, #60A5FA, #22D3EE)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
              }}
            >
              Synorix
            </span>
          </Link>

          {/* Links */}
          <div className="nav-links-desktop flex items-center gap-1">
            <button
              onClick={scrollToFeatures}
              className="bg-transparent border-none cursor-pointer text-sm px-3 py-2 rounded-lg transition-colors"
              style={{ color: '#94A3B8' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#94A3B8')}
            >
              Fonctionnalités
            </button>
            <Link
              to="/pricing"
              className="text-sm no-underline px-3 py-2 rounded-lg transition-colors"
              style={{ color: '#94A3B8' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#94A3B8')}
            >
              Tarifs
            </Link>
            <button
              className="bg-transparent border-none cursor-pointer text-sm px-3 py-2 rounded-lg transition-colors"
              style={{ color: '#94A3B8' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#94A3B8')}
            >
              Contact
            </button>

            <Link
              to="/register"
              className="ml-4 inline-flex items-center gap-1.5 text-sm font-semibold text-white no-underline rounded-full px-6 py-2 transition-all hover:brightness-110 hover:-translate-y-px"
              style={{
                background: 'linear-gradient(135deg, #3B82F6, #06B6D4)',
                fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
              }}
            >
              Commencer
            </Link>
          </div>
        </div>
      </nav>

      {/* ════════════════════════════════════════════════════════════════════
          HERO
      ════════════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden" style={{ padding: '100px 24px 120px' }}>
        {/* Planet */}
        <div className="planet-bg absolute" style={{ right: '-200px', top: '-100px' }}>
          <PlanetBackground />
        </div>

        <div className="relative max-w-3xl mx-auto text-center">
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 mb-8 text-xs font-semibold tracking-wide"
            style={{
              background: 'rgba(59,130,246,0.08)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(59,130,246,0.18)',
              borderRadius: 999,
              padding: '7px 18px',
              color: '#93C5FD',
            }}
          >
            <Sparkles size={12} />
            Propulsé par l&apos;IA
          </div>

          {/* Title */}
          <h1
            className="mb-6"
            style={{
              fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
              fontSize: 'clamp(2.5rem, 7vw, 4.5rem)',
              fontWeight: 900,
              lineHeight: 1.08,
              letterSpacing: '-0.03em',
              color: '#FFFFFF',
            }}
          >
            Répondez aux appels d&apos;offres
            <br />
            <span className="shimmer-gradient">10x plus vite</span>
          </h1>

          {/* Subtitle */}
          <p
            className="max-w-2xl mx-auto mb-10"
            style={{
              fontSize: 'clamp(1rem, 2.5vw, 1.2rem)',
              lineHeight: 1.7,
              color: '#94A3B8',
            }}
          >
            Synorix analyse vos DCE, vérifie la conformité et génère votre mémoire technique
            automatiquement grâce à l&apos;IA.{' '}
            <span style={{ color: '#CBD5E1' }}>Un AO en 2 heures au lieu de 2 jours.</span>
          </p>

          {/* CTAs */}
          <div className="flex gap-4 justify-center flex-wrap mb-8">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 font-bold text-white no-underline transition-all hover:scale-105 hover:-translate-y-0.5"
              style={{
                background: 'linear-gradient(135deg, #3B82F6, #06B6D4)',
                padding: '15px 32px',
                borderRadius: 14,
                fontSize: 15,
                fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
                boxShadow: '0 0 32px rgba(59,130,246,0.25)',
              }}
            >
              Commencer gratuitement <ArrowRight size={16} />
            </Link>
            <button
              onClick={scrollToFeatures}
              className="text-sm font-medium cursor-pointer transition-all"
              style={{
                background: 'transparent',
                color: '#94A3B8',
                border: '1px solid rgba(255,255,255,0.20)',
                borderRadius: 14,
                padding: '15px 28px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(59,130,246,0.50)'
                e.currentTarget.style.color = '#E2E8F0'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.20)'
                e.currentTarget.style.color = '#94A3B8'
              }}
            >
              Voir la démo
            </button>
          </div>

          {/* Trust signal */}
          <div className="flex items-center justify-center gap-3 text-sm" style={{ color: '#475569' }}>
            {/* Placeholder avatars */}
            <div className="flex -space-x-2">
              {['#3B82F6', '#06B6D4', '#60A5FA', '#8B5CF6'].map((bg, i) => (
                <div
                  key={i}
                  className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ background: bg, borderColor: '#050A18' }}
                >
                  {['JD', 'ML', 'PB', 'SC'][i]}
                </div>
              ))}
            </div>
            <span>Utilisé par <span style={{ color: '#93C5FD', fontWeight: 600 }}>120+</span> entreprises BTP</span>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          FEATURES — 4 cards grid
      ════════════════════════════════════════════════════════════════════ */}
      <section ref={featuresRef} className="px-6 pb-24">
        <div className="max-w-5xl mx-auto">
          <Section>
            <div className="text-center mb-14">
              <h2
                style={{
                  fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
                  fontSize: 'clamp(1.6rem, 4vw, 2.6rem)',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  color: '#FFFFFF',
                  marginBottom: 12,
                }}
              >
                Tout ce dont vous avez besoin
              </h2>
              <p style={{ fontSize: 16, color: '#94A3B8', maxWidth: 500, margin: '0 auto' }}>
                De l&apos;upload du DCE à l&apos;export du mémoire, Synorix automatise chaque étape.
              </p>
            </div>
          </Section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {FEATURES.map(({ icon: Icon, title, desc }, i) => (
              <Section key={title} delay={i * 100}>
                <div
                  className="landing-feature-card relative overflow-hidden p-8"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    backdropFilter: 'blur(16px) saturate(150%)',
                    WebkitBackdropFilter: 'blur(16px) saturate(150%)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '20px',
                    boxShadow: '14px 17px 40px 4px rgba(0,0,0,0.20)',
                  }}
                >
                  {/* Top accent line */}
                  <div
                    className="absolute top-0 left-0 right-0"
                    style={{
                      height: 2,
                      background: 'linear-gradient(90deg, #3B82F6, #06B6D4, transparent)',
                    }}
                  />

                  {/* Icon */}
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                    style={{
                      background: 'rgba(59,130,246,0.10)',
                      border: '1px solid rgba(59,130,246,0.15)',
                    }}
                  >
                    <Icon size={22} style={{ color: '#60A5FA' }} />
                  </div>

                  <h3
                    className="mb-2"
                    style={{
                      fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
                      fontWeight: 600,
                      fontSize: '1.25rem',
                      color: '#FFFFFF',
                    }}
                  >
                    {title}
                  </h3>
                  <p style={{ fontSize: 14, lineHeight: 1.7, color: '#94A3B8' }}>{desc}</p>
                </div>
              </Section>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          HOW IT WORKS — 3 steps
      ════════════════════════════════════════════════════════════════════ */}
      <section className="px-6 pb-24">
        <div className="max-w-5xl mx-auto">
          <Section>
            <div className="text-center mb-14">
              <h2
                style={{
                  fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
                  fontSize: 'clamp(1.6rem, 4vw, 2.4rem)',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  color: '#FFFFFF',
                  marginBottom: 12,
                }}
              >
                Comment ça marche
              </h2>
              <p style={{ fontSize: 15, color: '#94A3B8' }}>
                De zéro à un mémoire technique complet en moins de 10 minutes.
              </p>
            </div>
          </Section>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 relative">
            {STEPS.map(({ num, icon: Icon, title, desc }, i) => (
              <Section key={num} delay={i * 100}>
                <div className="relative flex flex-col h-full">
                  {/* Dashed connector (not last) */}
                  {i < STEPS.length - 1 && (
                    <div
                      className="hidden md:block absolute top-10 left-full w-full z-0"
                      style={{
                        height: 0,
                        borderTop: '2px dashed rgba(59,130,246,0.20)',
                      }}
                    />
                  )}

                  <div
                    className="relative p-7 h-full z-10"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      backdropFilter: 'blur(16px) saturate(150%)',
                      WebkitBackdropFilter: 'blur(16px) saturate(150%)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '20px',
                      boxShadow: '14px 17px 40px 4px rgba(0,0,0,0.20)',
                      margin: '0 10px',
                    }}
                  >
                    {/* Watermark number */}
                    <div
                      className="absolute top-4 right-6 select-none pointer-events-none"
                      style={{
                        fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
                        fontSize: '4rem',
                        fontWeight: 900,
                        color: 'rgba(59,130,246,0.08)',
                        lineHeight: 1,
                      }}
                    >
                      {num}
                    </div>

                    {/* Icon + step label */}
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                        style={{
                          background: 'rgba(59,130,246,0.10)',
                          border: '1px solid rgba(59,130,246,0.18)',
                        }}
                      >
                        <Icon size={19} style={{ color: '#3B82F6' }} />
                      </div>
                      <span
                        className="text-xs font-medium tracking-wider"
                        style={{
                          color: '#475569',
                          fontFamily: '"JetBrains Mono", monospace',
                        }}
                      >
                        Étape {num}
                      </span>
                    </div>

                    <h3
                      className="mb-2"
                      style={{
                        fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
                        fontWeight: 600,
                        fontSize: 16,
                        color: '#FFFFFF',
                      }}
                    >
                      {title}
                    </h3>
                    <p style={{ fontSize: 13.5, lineHeight: 1.7, color: '#94A3B8' }}>{desc}</p>
                  </div>
                </div>
              </Section>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          PRICING — 2 cards
      ════════════════════════════════════════════════════════════════════ */}
      <section className="px-6 pb-24">
        <div className="max-w-4xl mx-auto">
          <Section>
            <div className="text-center mb-12">
              <h2
                style={{
                  fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
                  fontSize: 'clamp(1.6rem, 4vw, 2.4rem)',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  color: '#FFFFFF',
                  marginBottom: 12,
                }}
              >
                Des tarifs clairs, sans surprise
              </h2>
              <p style={{ fontSize: 15, color: '#94A3B8' }}>
                Sans engagement · Résiliable à tout moment
              </p>
            </div>
          </Section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {PLANS.map((plan, idx) => (
              <Section key={plan.id} delay={idx * 100}>
                <div
                  className={`relative overflow-hidden p-8 ${plan.highlight ? 'pricing-highlight-border' : ''}`}
                  style={{
                    background: plan.highlight ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.04)',
                    backdropFilter: 'blur(16px) saturate(150%)',
                    WebkitBackdropFilter: 'blur(16px) saturate(150%)',
                    border: plan.highlight ? 'none' : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '20px',
                    boxShadow: plan.highlight
                      ? '14px 17px 40px 4px rgba(0,0,0,0.30), 0 0 30px rgba(59,130,246,0.08)'
                      : '14px 17px 40px 4px rgba(0,0,0,0.20)',
                  }}
                >
                  {/* POPULAIRE badge */}
                  {plan.highlight && (
                    <div
                      className="absolute top-5 right-5 text-[11px] font-bold tracking-wider rounded-full px-3 py-1"
                      style={{
                        background: 'linear-gradient(135deg, #3B82F6, #06B6D4)',
                        color: '#FFFFFF',
                      }}
                    >
                      POPULAIRE
                    </div>
                  )}

                  {/* Plan name */}
                  <p
                    className="text-xs font-bold tracking-widest uppercase mb-1"
                    style={{
                      color: plan.highlight ? '#60A5FA' : '#3B82F6',
                      fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
                    }}
                  >
                    {plan.name}
                  </p>
                  <p className="text-sm mb-6" style={{ color: '#475569' }}>
                    {plan.desc}
                  </p>

                  {/* Price */}
                  <div className="flex items-baseline gap-1 mb-6">
                    <span
                      style={{
                        fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
                        fontSize: '2.5rem',
                        fontWeight: 900,
                        letterSpacing: '-0.03em',
                        color: '#FFFFFF',
                      }}
                    >
                      {plan.price}€
                    </span>
                    <span className="text-sm" style={{ color: '#94A3B8' }}>
                      /mois
                    </span>
                  </div>

                  {/* CTA */}
                  <Link
                    to="/register"
                    className="block text-center no-underline font-semibold text-sm rounded-xl py-3 mb-6 transition-all hover:brightness-110 hover:-translate-y-px"
                    style={{
                      fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
                      ...(plan.highlight
                        ? {
                            background: 'linear-gradient(135deg, #3B82F6, #06B6D4)',
                            color: '#FFFFFF',
                            boxShadow: '0 0 24px rgba(59,130,246,0.25)',
                          }
                        : {
                            background: 'rgba(59,130,246,0.10)',
                            color: '#93C5FD',
                            border: '1px solid rgba(59,130,246,0.20)',
                          }),
                    }}
                  >
                    {plan.cta}
                  </Link>

                  {/* Features list */}
                  <ul className="space-y-2.5 list-none p-0 m-0">
                    {plan.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-center gap-2.5 text-sm"
                        style={{ color: '#94A3B8' }}
                      >
                        <Check size={14} style={{ color: '#60A5FA', flexShrink: 0 }} />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </Section>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          CTA BAND
      ════════════════════════════════════════════════════════════════════ */}
      <section className="px-6 pb-24">
        <Section>
          <div
            className="max-w-4xl mx-auto relative overflow-hidden text-center"
            style={{
              padding: '64px 40px',
              background: 'linear-gradient(180deg, rgba(30,58,138,0.25) 0%, rgba(255,255,255,0.04) 100%)',
              backdropFilter: 'blur(16px) saturate(150%)',
              WebkitBackdropFilter: 'blur(16px) saturate(150%)',
              border: '1px solid rgba(59,130,246,0.15)',
              borderRadius: '20px',
              boxShadow: '14px 17px 40px 4px rgba(0,0,0,0.25)',
            }}
          >
            {/* Mesh glow */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'radial-gradient(ellipse at 50% 0%, rgba(59,130,246,0.15) 0%, transparent 60%)',
              }}
            />

            <h2
              className="relative mb-4"
              style={{
                fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
                fontSize: 'clamp(1.5rem, 3.5vw, 2.2rem)',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: '#FFFFFF',
              }}
            >
              Prêt à gagner plus de marchés ?
            </h2>
            <p className="relative mb-8" style={{ fontSize: 15, color: '#94A3B8' }}>
              Rejoignez les entreprises BTP qui répondent plus vite et mieux grâce à l&apos;IA.
            </p>
            <Link
              to="/register"
              className="relative inline-flex items-center gap-2 font-bold text-white no-underline rounded-xl transition-all hover:brightness-110 hover:-translate-y-0.5 cta-glow-pulse"
              style={{
                background: 'linear-gradient(135deg, #3B82F6, #06B6D4)',
                padding: '16px 40px',
                fontSize: 15,
                fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
              }}
            >
              Créer mon compte gratuitement <ArrowRight size={16} />
            </Link>
          </div>
        </Section>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          FOOTER
      ════════════════════════════════════════════════════════════════════ */}
      <footer
        style={{
          background: '#050A12',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          padding: '48px 24px',
        }}
      >
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">
            {/* Brand */}
            <div className="md:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, #3B82F6, #06B6D4)',
                  }}
                >
                  <span
                    className="text-white font-black text-xs"
                    style={{ fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}
                  >
                    S
                  </span>
                </div>
                <span
                  className="font-black text-sm tracking-tight"
                  style={{
                    background: 'linear-gradient(135deg, #60A5FA, #22D3EE)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
                  }}
                >
                  Synorix
                </span>
              </div>
              <p className="text-xs" style={{ color: '#475569', lineHeight: 1.6 }}>
                La plateforme IA pour répondre aux appels d&apos;offres BTP plus vite et mieux.
              </p>
            </div>

            {/* Produit */}
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-widest mb-3"
                style={{ color: '#64748B' }}
              >
                Produit
              </p>
              <ul className="space-y-2 list-none p-0 m-0">
                {['Fonctionnalités', 'Tarifs', 'Démo'].map((item) => (
                  <li key={item}>
                    <span
                      className="text-sm cursor-pointer transition-colors"
                      style={{ color: '#475569' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#94A3B8')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = '#475569')}
                    >
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Entreprise */}
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-widest mb-3"
                style={{ color: '#64748B' }}
              >
                Entreprise
              </p>
              <ul className="space-y-2 list-none p-0 m-0">
                {['À propos', 'Blog', 'Contact'].map((item) => (
                  <li key={item}>
                    <span
                      className="text-sm cursor-pointer transition-colors"
                      style={{ color: '#475569' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#94A3B8')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = '#475569')}
                    >
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Légal */}
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-widest mb-3"
                style={{ color: '#64748B' }}
              >
                Légal
              </p>
              <ul className="space-y-2 list-none p-0 m-0">
                {['Mentions légales', 'Confidentialité', 'CGU'].map((item) => (
                  <li key={item}>
                    <span
                      className="text-sm cursor-pointer transition-colors"
                      style={{ color: '#475569' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#94A3B8')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = '#475569')}
                    >
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Copyright */}
          <div
            className="pt-6 flex items-center justify-between flex-wrap gap-4"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p className="text-xs" style={{ color: '#334155' }}>
              © 2026 Synorix. Tous droits réservés.
            </p>
            <div className="flex gap-4">
              <Link
                to="/login"
                className="text-xs no-underline transition-colors"
                style={{ color: '#475569' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#94A3B8')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#475569')}
              >
                Connexion
              </Link>
              <Link
                to="/register"
                className="text-xs no-underline transition-colors"
                style={{ color: '#475569' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#94A3B8')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#475569')}
              >
                Inscription
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
