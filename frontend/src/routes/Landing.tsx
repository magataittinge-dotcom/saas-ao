import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  Sparkles, Upload, Brain, FileDown, Check, ArrowRight,
  FileText, Layers, ShieldCheck, BookOpen, ChevronRight,
  Zap, Star,
} from 'lucide-react'

// ─── Intersection Observer hook ────────────────────────────────────────────────

function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add('revealed'); obs.disconnect() } },
      { threshold: 0.12 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return ref
}

// ─── Data ──────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: FileText,
    title: 'Analyse DCE intelligente',
    desc: 'Uploadez votre DCE (ZIP ou fichiers séparés). L\'IA extrait toutes les exigences en quelques minutes : RC, CCTP, CCAP, DPGF.',
    accent: '#0EA5E9',
    glow: 'rgba(14,165,233,0.18)',
  },
  {
    icon: Layers,
    title: 'Détection multi-lots',
    desc: 'Détection automatique de tous les lots avec score de confiance. Choisissez votre lot et concentrez-vous sur l\'essentiel.',
    accent: '#00D4AA',
    glow: 'rgba(0,212,170,0.18)',
  },
  {
    icon: ShieldCheck,
    title: 'Conformité automatique',
    desc: 'Checklist candidature générée et matrice de conformité vérifiée contre votre coffre-fort documentaire.',
    accent: '#38BDF8',
    glow: 'rgba(56,189,248,0.18)',
  },
  {
    icon: BookOpen,
    title: 'Mémoire technique IA',
    desc: 'Génération d\'un mémoire technique de 20 pages adapté au DCE, export Word (.docx) prêt à soumettre.',
    accent: '#5EEAD4',
    glow: 'rgba(94,234,212,0.18)',
  },
]

const STEPS = [
  {
    num: '01',
    icon: Upload,
    title: 'Uploadez votre DCE',
    desc: 'Glissez-déposez vos fichiers PDF, DOCX, XLSX ou une archive ZIP. Synorix reconnaît automatiquement le RC, CCTP, DPGF et les plans.',
  },
  {
    num: '02',
    icon: Brain,
    title: 'L\'IA analyse et extrait',
    desc: 'Claude Opus lit l\'intégralité du dossier, détecte les lots, extrait les exigences et bâtit la matrice de conformité en quelques minutes.',
  },
  {
    num: '03',
    icon: FileDown,
    title: 'Téléchargez votre mémoire',
    desc: 'Votre mémoire technique de 20 pages est prêt. Révisez-le dans l\'éditeur intégré et exportez en Word d\'un clic.',
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
    accent: '#0EA5E9',
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
    accent: '#00D4AA',
    cta: 'Démarrer en Business',
    highlight: true,
  },
]

const SECTORS = [
  { icon: '🏗️', label: 'Gros œuvre' },
  { icon: '🏠', label: 'Façades / ITE' },
  { icon: '⚡', label: 'Électricité' },
  { icon: '🔧', label: 'Plomberie / CVC' },
  { icon: '🪟', label: 'Menuiserie' },
  { icon: '🛣️', label: 'VRD / TP' },
]

// ─── Reusable animated section ─────────────────────────────────────────────────

function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useReveal()
  return (
    <div ref={ref} className={`reveal-section ${className}`}>
      {children}
    </div>
  )
}

// ─── Landing ──────────────────────────────────────────────────────────────────

export default function Landing() {
  const featuresRef = useRef<HTMLElement>(null)

  const scrollToFeatures = () => {
    featuresRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div style={{ background: '#080B12', color: '#E2E8F0', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <style>{`
        /* Reveal animation */
        .reveal-section {
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1),
                      transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .reveal-section.revealed {
          opacity: 1;
          transform: translateY(0);
        }
        /* Orb animation */
        @keyframes orb-float {
          0%, 100% { transform: translateY(0) scale(1); }
          50%       { transform: translateY(-24px) scale(1.04); }
        }
        .orb { animation: orb-float var(--dur, 8s) ease-in-out infinite; }
        /* Gradient text */
        .grad-text {
          background: linear-gradient(135deg, #0EA5E9 0%, #00D4AA 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        /* Stagger children */
        .stagger > * { transition-delay: calc(var(--i, 0) * 80ms); }
        /* Card hover */
        .feature-card {
          transition: border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease;
        }
        .feature-card:hover {
          border-color: rgba(14,165,233,0.30) !important;
          transform: translateY(-3px);
        }
        /* Pricing highlight pulse */
        @keyframes border-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(0,212,170,0); }
          50%       { box-shadow: 0 0 0 4px rgba(0,212,170,0.12); }
        }
        .plan-highlight { animation: border-pulse 3s ease-in-out infinite; }
        /* Mobile nav */
        @media (max-width: 640px) {
          .nav-links { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .reveal-section { opacity: 1; transform: none; transition: none; }
          .orb { animation: none; }
        }
      `}</style>

      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(8,11,18,0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(14,165,233,0.08)',
        }}
      >
        <div style={{ maxWidth: 1152, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: 'linear-gradient(135deg, #0EA5E9, #00D4AA)',
              boxShadow: '0 0 16px rgba(14,165,233,0.40)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Sparkles size={14} color="white" />
            </div>
            <span style={{
              fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
              fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em',
              background: 'linear-gradient(135deg, #0EA5E9, #00D4AA)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>
              SYNORIX
            </span>
          </div>

          {/* Links */}
          <div className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={scrollToFeatures}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 14, fontFamily: '"DM Sans", system-ui, sans-serif', padding: '8px 12px', borderRadius: 8, transition: 'color 0.2s' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#94A3B8')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#64748B')}
            >
              Fonctionnalités
            </button>
            <Link
              to="/pricing"
              style={{ color: '#64748B', fontSize: 14, textDecoration: 'none', padding: '8px 12px', borderRadius: 8, transition: 'color 0.2s' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#94A3B8')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#64748B')}
            >
              Tarifs
            </Link>
            <Link
              to="/login"
              style={{ color: '#64748B', fontSize: 14, textDecoration: 'none', padding: '8px 12px', borderRadius: 8, transition: 'color 0.2s' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#94A3B8')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#64748B')}
            >
              Connexion
            </Link>
            <Link
              to="/register"
              style={{
                background: 'linear-gradient(135deg, #0EA5E9, #00D4AA)',
                color: 'white', fontSize: 14, fontWeight: 600, textDecoration: 'none',
                padding: '8px 20px', borderRadius: 10, fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
                transition: 'filter 0.2s, transform 0.2s, box-shadow 0.2s',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = 'brightness(1.10)'
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 0 20px rgba(14,165,233,0.40)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = ''
                e.currentTarget.style.transform = ''
                e.currentTarget.style.boxShadow = ''
              }}
            >
              Commencer <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', overflow: 'hidden', padding: '100px 24px 120px', textAlign: 'center' }}>
        {/* Orbs */}
        <div className="orb" style={{
          '--dur': '9s',
          position: 'absolute', top: '-120px', left: '-80px',
          width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(14,165,233,0.18) 0%, transparent 70%)',
          pointerEvents: 'none',
        } as React.CSSProperties} />
        <div className="orb" style={{
          '--dur': '11s',
          position: 'absolute', top: '-60px', right: '-100px',
          width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,212,170,0.14) 0%, transparent 70%)',
          pointerEvents: 'none',
        } as React.CSSProperties} />
        <div className="orb" style={{
          '--dur': '13s',
          position: 'absolute', bottom: '-80px', left: '50%', transform: 'translateX(-50%)',
          width: 600, height: 300, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(14,165,233,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        } as React.CSSProperties} />

        <div style={{ position: 'relative', maxWidth: 800, margin: '0 auto' }}>
          {/* Badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 28,
            background: 'rgba(14,165,233,0.10)', border: '1px solid rgba(14,165,233,0.22)',
            borderRadius: 999, padding: '6px 16px', fontSize: 12, fontWeight: 600,
            color: '#7DD3FC', letterSpacing: '0.04em',
          }}>
            <Zap size={11} />
            Propulsé par Claude Opus (Anthropic)
          </div>

          {/* H1 */}
          <h1 style={{
            fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
            fontSize: 'clamp(2.4rem, 6vw, 4.2rem)',
            fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.03em',
            color: '#F1F5F9', marginBottom: 24,
          }}>
            Répondez aux appels d'offres{' '}
            <span className="grad-text">10× plus vite</span>
          </h1>

          {/* Subline */}
          <p style={{
            fontSize: 'clamp(1rem, 2.5vw, 1.2rem)', lineHeight: 1.7,
            color: '#64748B', maxWidth: 580, margin: '0 auto 40px',
          }}>
            Synorix analyse vos DCE, vérifie la conformité et génère votre mémoire technique
            automatiquement grâce à l'IA.{' '}
            <span style={{ color: '#94A3B8' }}>Un AO en 2 heures au lieu de 2 jours.</span>
          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              to="/register"
              style={{
                background: 'linear-gradient(135deg, #0EA5E9, #00D4AA)',
                color: 'white', fontWeight: 700, fontSize: 15, textDecoration: 'none',
                padding: '14px 32px', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 8,
                fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
                boxShadow: '0 0 32px rgba(14,165,233,0.30)',
                transition: 'filter 0.2s, transform 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = 'brightness(1.10)'
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 0 40px rgba(14,165,233,0.50)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = ''
                e.currentTarget.style.transform = ''
                e.currentTarget.style.boxShadow = '0 0 32px rgba(14,165,233,0.30)'
              }}
            >
              Commencer gratuitement <ArrowRight size={16} />
            </Link>
            <button
              onClick={scrollToFeatures}
              style={{
                background: 'rgba(255,255,255,0.04)', color: '#94A3B8', fontWeight: 500,
                fontSize: 15, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12,
                padding: '14px 28px', cursor: 'pointer', fontFamily: '"DM Sans", system-ui, sans-serif',
                transition: 'background 0.2s, border-color 0.2s, color 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(14,165,233,0.08)'
                e.currentTarget.style.borderColor = 'rgba(14,165,233,0.22)'
                e.currentTarget.style.color = '#E2E8F0'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'
                e.currentTarget.style.color = '#94A3B8'
              }}
            >
              Voir la démo
            </button>
          </div>

          {/* Trust signal */}
          <p style={{ marginTop: 28, fontSize: 13, color: '#334155', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Star size={12} style={{ color: '#F59E0B', fill: '#F59E0B' }} />
              <Star size={12} style={{ color: '#F59E0B', fill: '#F59E0B' }} />
              <Star size={12} style={{ color: '#F59E0B', fill: '#F59E0B' }} />
              <Star size={12} style={{ color: '#F59E0B', fill: '#F59E0B' }} />
              <Star size={12} style={{ color: '#F59E0B', fill: '#F59E0B' }} />
            </span>
            Pro à 249€/mois · Business à 399€/mois · Sans engagement
          </p>
        </div>
      </section>

      {/* ── SECTEURS ────────────────────────────────────────────────────── */}
      <Section>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 24px 80px', textAlign: 'center' }}>
          <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', color: '#475569', textTransform: 'uppercase', marginBottom: 28 }}>
            Conçu pour les entreprises BTP françaises
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {SECTORS.map(({ icon, label }) => (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(14,165,233,0.10)',
                borderRadius: 999, padding: '8px 18px', fontSize: 13, color: '#64748B',
                transition: 'border-color 0.2s, color 0.2s',
              }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(14,165,233,0.25)'; e.currentTarget.style.color = '#94A3B8' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(14,165,233,0.10)'; e.currentTarget.style.color = '#64748B' }}
              >
                <span style={{ fontSize: 16 }}>{icon}</span>
                <span style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── FEATURES ────────────────────────────────────────────────────── */}
      <section ref={featuresRef} style={{ padding: '0 24px 100px' }}>
        <Section>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 56 }}>
              <h2 style={{
                fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
                fontSize: 'clamp(1.6rem, 4vw, 2.6rem)', fontWeight: 700,
                letterSpacing: '-0.02em', color: '#F1F5F9', marginBottom: 12,
              }}>
                Tout ce dont vous avez besoin
              </h2>
              <p style={{ fontSize: 16, color: '#64748B', maxWidth: 480, margin: '0 auto' }}>
                De l'upload du DCE à l'export du mémoire, Synorix automatise chaque étape.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
              {FEATURES.map(({ icon: Icon, title, desc, accent, glow }) => (
                <div
                  key={title}
                  className="feature-card"
                  style={{
                    background: 'rgba(15,23,42,0.60)',
                    backdropFilter: 'blur(16px)',
                    border: '1px solid rgba(14,165,233,0.10)',
                    borderRadius: 16, padding: 28, position: 'relative', overflow: 'hidden',
                  }}
                >
                  {/* Corner glow */}
                  <div style={{
                    position: 'absolute', top: -40, right: -40, width: 120, height: 120,
                    borderRadius: '50%', background: glow, filter: 'blur(32px)', pointerEvents: 'none',
                  }} />
                  {/* Top accent line */}
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                    background: `linear-gradient(90deg, ${accent}, transparent)`,
                  }} />

                  <div style={{
                    width: 44, height: 44, borderRadius: 12, marginBottom: 18,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `rgba(${accent === '#0EA5E9' ? '14,165,233' : accent === '#00D4AA' ? '0,212,170' : accent === '#38BDF8' ? '56,189,248' : '94,234,212'},0.12)`,
                    border: `1px solid rgba(${accent === '#0EA5E9' ? '14,165,233' : accent === '#00D4AA' ? '0,212,170' : accent === '#38BDF8' ? '56,189,248' : '94,234,212'},0.22)`,
                  }}>
                    <Icon size={20} color={accent} />
                  </div>

                  <h3 style={{
                    fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
                    fontWeight: 600, fontSize: 15, color: '#E2E8F0', marginBottom: 8,
                  }}>
                    {title}
                  </h3>
                  <p style={{ fontSize: 13.5, lineHeight: 1.65, color: '#64748B' }}>{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </Section>
      </section>

      {/* ── HOW IT WORKS ────────────────────────────────────────────────── */}
      <section style={{ padding: '0 24px 100px' }}>
        <Section>
          <div style={{ maxWidth: 960, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 56 }}>
              <h2 style={{
                fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
                fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', fontWeight: 700,
                letterSpacing: '-0.02em', color: '#F1F5F9', marginBottom: 12,
              }}>
                Comment ça marche
              </h2>
              <p style={{ fontSize: 15, color: '#64748B' }}>
                De zéro à un mémoire technique complet en moins de 10 minutes.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24, position: 'relative' }}>
              {STEPS.map(({ num, icon: Icon, title, desc }, i) => (
                <div key={num} style={{ position: 'relative' }}>
                  {/* Connector line (not last) */}
                  {i < STEPS.length - 1 && (
                    <div style={{
                      position: 'absolute', top: 36, left: 'calc(100% + 1px)', width: 'calc(100% - 2px)',
                      height: 1, background: 'linear-gradient(90deg, rgba(14,165,233,0.30), transparent)',
                      display: 'none',  // hidden on mobile, visible on large screens via inline style won't work but that's OK
                    }} />
                  )}

                  <div style={{
                    background: 'rgba(15,23,42,0.60)', backdropFilter: 'blur(16px)',
                    border: '1px solid rgba(14,165,233,0.10)', borderRadius: 16, padding: '28px 24px',
                    height: '100%',
                  }}>
                    {/* Step number */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                        background: 'rgba(14,165,233,0.10)', border: '1px solid rgba(14,165,233,0.20)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Icon size={19} color="#0EA5E9" />
                      </div>
                      <span style={{
                        fontFamily: '"JetBrains Mono", monospace',
                        fontSize: 11, fontWeight: 500, color: '#334155', letterSpacing: '0.04em',
                      }}>
                        Étape {num}
                      </span>
                    </div>

                    <h3 style={{
                      fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
                      fontWeight: 600, fontSize: 15, color: '#E2E8F0', marginBottom: 8,
                    }}>
                      {title}
                    </h3>
                    <p style={{ fontSize: 13.5, lineHeight: 1.65, color: '#64748B' }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>
      </section>

      {/* ── PRICING ─────────────────────────────────────────────────────── */}
      <section style={{ padding: '0 24px 100px' }}>
        <Section>
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <h2 style={{
                fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
                fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', fontWeight: 700,
                letterSpacing: '-0.02em', color: '#F1F5F9', marginBottom: 12,
              }}>
                Des tarifs clairs, sans surprise
              </h2>
              <p style={{ fontSize: 15, color: '#64748B' }}>Sans engagement · Résiliable à tout moment</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
              {PLANS.map((plan) => (
                <div
                  key={plan.id}
                  className={plan.highlight ? 'plan-highlight' : ''}
                  style={{
                    background: plan.highlight ? 'rgba(15,23,42,0.80)' : 'rgba(15,23,42,0.55)',
                    backdropFilter: 'blur(20px)',
                    border: plan.highlight
                      ? '1px solid rgba(0,212,170,0.30)'
                      : '1px solid rgba(14,165,233,0.10)',
                    borderRadius: 18, padding: '32px 28px',
                    position: 'relative', overflow: 'hidden',
                  }}
                >
                  {/* Top accent */}
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                    background: `linear-gradient(90deg, ${plan.accent}, transparent)`,
                  }} />

                  {/* Popular badge */}
                  {plan.highlight && (
                    <div style={{
                      position: 'absolute', top: 16, right: 16,
                      background: 'rgba(0,212,170,0.15)', border: '1px solid rgba(0,212,170,0.30)',
                      borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 600,
                      color: '#5EEAD4', letterSpacing: '0.04em',
                    }}>
                      POPULAIRE
                    </div>
                  )}

                  {/* Plan name */}
                  <p style={{
                    fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
                    fontWeight: 700, fontSize: 13, color: plan.accent,
                    letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4,
                  }}>
                    {plan.name}
                  </p>
                  <p style={{ fontSize: 13, color: '#475569', marginBottom: 20 }}>{plan.desc}</p>

                  {/* Price */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 24 }}>
                    <span style={{
                      fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
                      fontSize: 42, fontWeight: 800, letterSpacing: '-0.03em', color: '#F1F5F9',
                    }}>
                      {plan.price}€
                    </span>
                    <span style={{ fontSize: 13, color: '#475569' }}>/mois HT</span>
                  </div>

                  {/* CTA */}
                  <Link
                    to="/register"
                    style={{
                      display: 'block', textAlign: 'center', textDecoration: 'none',
                      padding: '12px 0', borderRadius: 10, fontWeight: 600, fontSize: 14,
                      fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
                      marginBottom: 24,
                      ...(plan.highlight
                        ? {
                            background: 'linear-gradient(135deg, #0EA5E9, #00D4AA)',
                            color: 'white',
                            boxShadow: '0 0 24px rgba(0,212,170,0.25)',
                          }
                        : {
                            background: 'rgba(14,165,233,0.10)',
                            color: '#7DD3FC',
                            border: '1px solid rgba(14,165,233,0.20)',
                          }),
                      transition: 'filter 0.2s, transform 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.filter = 'brightness(1.10)'
                      e.currentTarget.style.transform = 'translateY(-1px)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.filter = ''
                      e.currentTarget.style.transform = ''
                    }}
                  >
                    {plan.cta}
                  </Link>

                  {/* Features list */}
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {plan.features.map((f) => (
                      <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: '#64748B' }}>
                        <Check size={13} color={plan.accent} style={{ flexShrink: 0 }} />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </Section>
      </section>

      {/* ── CTA BAND ────────────────────────────────────────────────────── */}
      <Section>
        <div style={{ padding: '0 24px 100px' }}>
          <div style={{
            maxWidth: 800, margin: '0 auto',
            background: 'rgba(14,165,233,0.06)',
            border: '1px solid rgba(14,165,233,0.18)',
            borderRadius: 20, padding: '56px 40px', textAlign: 'center',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', inset: 0,
              background: 'radial-gradient(ellipse at 50% 0%, rgba(14,165,233,0.12) 0%, transparent 70%)',
              pointerEvents: 'none',
            }} />
            <h2 style={{
              fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
              fontSize: 'clamp(1.5rem, 3.5vw, 2.2rem)', fontWeight: 700,
              letterSpacing: '-0.02em', color: '#F1F5F9', marginBottom: 12,
              position: 'relative',
            }}>
              Prêt à gagner du temps sur vos AO ?
            </h2>
            <p style={{ fontSize: 15, color: '#64748B', marginBottom: 32, position: 'relative' }}>
              Rejoignez les entreprises BTP qui répondent plus vite et mieux grâce à l'IA.
            </p>
            <Link
              to="/register"
              style={{
                background: 'linear-gradient(135deg, #0EA5E9, #00D4AA)',
                color: 'white', fontWeight: 700, fontSize: 15,
                textDecoration: 'none', padding: '14px 36px', borderRadius: 12,
                display: 'inline-flex', alignItems: 'center', gap: 8,
                fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
                boxShadow: '0 0 32px rgba(14,165,233,0.30)', position: 'relative',
                transition: 'filter 0.2s, transform 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = 'brightness(1.10)'
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 0 44px rgba(14,165,233,0.50)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = ''
                e.currentTarget.style.transform = ''
                e.currentTarget.style.boxShadow = '0 0 32px rgba(14,165,233,0.30)'
              }}
            >
              Créer mon compte gratuitement <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </Section>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer style={{
        borderTop: '1px solid rgba(14,165,233,0.08)',
        padding: '40px 24px',
      }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 20,
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'linear-gradient(135deg, #0EA5E9, #00D4AA)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Sparkles size={12} color="white" />
            </div>
            <span style={{
              fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
              fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em',
              background: 'linear-gradient(135deg, #0EA5E9, #00D4AA)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>
              SYNORIX
            </span>
          </div>

          {/* Links */}
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { to: '/login', label: 'Connexion' },
              { to: '/register', label: 'Inscription' },
              { to: '/pricing', label: 'Tarifs' },
            ].map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                style={{ fontSize: 13, color: '#475569', textDecoration: 'none', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#94A3B8')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#475569')}
              >
                {label}
              </Link>
            ))}
            <span style={{ fontSize: 13, color: '#475569', cursor: 'default' }}>Mentions légales</span>
          </div>

          {/* Copyright */}
          <p style={{ fontSize: 12, color: '#334155' }}>
            © 2026 Synorix. Tous droits réservés.
          </p>
        </div>
      </footer>
    </div>
  )
}
