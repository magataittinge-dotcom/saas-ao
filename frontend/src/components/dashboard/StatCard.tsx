import { useEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── prefers-reduced-motion ─────────────────────────────────────── */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const on = () => setReduced(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return reduced
}

/* ── Compteur qui monte (ease-out cubic) ────────────────────────── */
function useCountUp(target: number, dur = 900) {
  const reduced = usePrefersReducedMotion()
  const [v, setV] = useState(0)
  const prev = useRef(0)
  useEffect(() => {
    if (reduced) { setV(target); prev.current = target; return }
    const t0 = performance.now()
    const from = prev.current
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min((now - t0) / dur, 1)
      const ease = 1 - Math.pow(1 - p, 3)
      setV(Math.round(from + (target - from) * ease))
      if (p < 1) raf = requestAnimationFrame(tick)
      else prev.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, dur, reduced])
  return v
}

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: number
  suffix?: string
  /** Fraction 0→1 pour l'anneau de progression. Omis = pas d'anneau (chiffre seul). */
  ring?: number
  /** Index pour décaler l'apparition (stagger). */
  delay?: number
  className?: string
}

/**
 * Carte de statistique premium Synorix — compteur animé, anneau de progression
 * optionnel, halo cyan discret au survol. Charte : glass-card + ds-cyan + Geist Sans.
 */
export function StatCard({ icon: Icon, label, value, suffix = '', ring, delay = 0, className }: StatCardProps) {
  const count = useCountUp(value)
  const reduced = usePrefersReducedMotion()

  // Anneau SVG (rayon 16, circonférence ≈ 100.5)
  const R = 16
  const C = 2 * Math.PI * R
  const frac = ring === undefined ? 0 : Math.max(0, Math.min(1, ring))

  return (
    <div
      className={cn(
        'glass-card group relative overflow-hidden p-5 animate-fade-in',
        'transition-transform duration-200 ease-smooth hover:-translate-y-0.5',
        className,
      )}
      style={{ animationDelay: reduced ? undefined : `${delay * 0.06}s` }}
    >
      {/* liseré d'accent cyan en haut */}
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-cyan opacity-80" />
      {/* halo cyan diffus, intensifié au survol */}
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-ds-cyan opacity-[0.06] blur-2xl transition-opacity duration-300 group-hover:opacity-[0.16]"
        aria-hidden
      />

      <div className="relative flex items-start justify-between">
        <div className="stat-icon-bg" style={{ background: 'rgba(34,211,238,0.08)' }}>
          <Icon size={20} className="text-ds-cyan" />
        </div>

        {ring !== undefined && (
          <div className="relative h-11 w-11 shrink-0">
            <svg viewBox="0 0 40 40" className="h-11 w-11 -rotate-90">
              <circle cx="20" cy="20" r={R} fill="none" stroke="#232730" strokeWidth="3.5" />
              <circle
                cx="20" cy="20" r={R} fill="none"
                stroke="#22D3EE" strokeWidth="3.5" strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - frac)}
                style={{ transition: reduced ? undefined : 'stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1)' }}
              />
            </svg>
          </div>
        )}
      </div>

      <p className="edge-data mt-3 text-3xl font-bold tabular-nums text-ds-text">
        {count}{suffix}
      </p>
      <p className="mt-0.5 text-sm text-ds-text-2">{label}</p>
    </div>
  )
}
