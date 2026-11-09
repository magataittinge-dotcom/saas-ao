import { useId } from 'react'
import { cn } from '@/lib/utils'

// Logo provisoire (DESIGN.md § Shapes) : l'arc d'aurore. Deux traits courbes, le haut en lumière
// (aurore → turquoise → bleu d'action), le bas à l'encre du thème. SVG en ligne, couleurs = jetons.
export default function Logo({ className, titre }: { className?: string; titre?: string }) {
  const id = useId()
  return (
    <svg viewBox="0 0 34 34" className={cn('size-[34px]', className)} role={titre ? 'img' : undefined} aria-hidden={titre ? undefined : true} aria-label={titre}>
      <defs>
        <linearGradient id={id} x1="0" x2="1">
          <stop offset="0" style={{ stopColor: 'var(--aurore-mark)' }} />
          <stop offset=".6" style={{ stopColor: 'var(--turquoise-mark)' }} />
          <stop offset="1" style={{ stopColor: 'var(--accent-ui)' }} />
        </linearGradient>
      </defs>
      <path d="M4 24c5-14 11-16 26-12" fill="none" stroke={`url(#${id})`} strokeWidth="3.2" strokeLinecap="round" />
      <path d="M6 29c6-9 12-11 22-8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" opacity=".85" />
    </svg>
  )
}
