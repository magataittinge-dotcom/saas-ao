import { useEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
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
 * optionnel. Surface Card du socle, couleurs par jetons.
 */
export function StatCard({ icon: Icon, label, value, suffix = '', ring, delay = 0, className }: StatCardProps) {
  const count = useCountUp(value)
  const reduced = usePrefersReducedMotion()

  // Anneau SVG (rayon 16, circonférence ≈ 100.5)
  const R = 16
  const C = 2 * Math.PI * R
  const frac = ring === undefined ? 0 : Math.max(0, Math.min(1, ring))

  return (
    <Card
      className={cn('group relative overflow-hidden p-4 animate-fade-in', className)}
      style={{ animationDelay: reduced ? undefined : `${delay * 0.06}s` }}
    >
      <div className="relative flex items-start justify-between">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-tint">
          <Icon size={20} className="text-accent-text" aria-hidden />
        </div>

        {ring !== undefined && (
          <div className="relative h-11 w-11 shrink-0">
            <svg viewBox="0 0 40 40" className="h-11 w-11 -rotate-90" aria-hidden>
              <circle cx="20" cy="20" r={R} fill="none" className="stroke-surface-2" strokeWidth="3.5" />
              <circle
                cx="20" cy="20" r={R} fill="none"
                className="stroke-accent-ui" strokeWidth="3.5" strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - frac)}
                style={{ transition: reduced ? undefined : 'stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1)' }}
              />
            </svg>
          </div>
        )}
      </div>

      <p className="mt-2.5 font-mono text-3xl font-bold tabular-nums text-fg">
        {count}{suffix}
      </p>
      <p className="mt-0.5 text-sm text-fg-2">{label}</p>
    </Card>
  )
}
