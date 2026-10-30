import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

/** Bascule soleil / lune. Le choix est mémorisé dans ce navigateur (lib/theme.ts). */
export default function BasculeTheme({ className }: { className?: string }) {
  const [theme, basculer] = useTheme()
  const nuit = theme === 'dark'
  return (
    <button
      type="button"
      onClick={basculer}
      aria-label={nuit ? 'Passer au thème clair' : 'Passer au thème nuit'}
      title={nuit ? 'Thème clair' : 'Thème nuit'}
      className={cn(
        'relative grid size-11 shrink-0 place-items-center rounded-pilule text-fg-2 transition-[background-color,color] duration-base ease-lien hover:bg-surface-1 hover:text-fg',
        className,
      )}
    >
      {/* les deux icônes se croisent : transform + opacité seulement */}
      <Sun size={20} strokeWidth={1.5} absoluteStrokeWidth aria-hidden
        className={cn('absolute transition-[transform,opacity] duration-pop ease-pop', nuit ? 'scale-50 -rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100')} />
      <Moon size={20} strokeWidth={1.5} absoluteStrokeWidth aria-hidden
        className={cn('absolute transition-[transform,opacity] duration-pop ease-pop', nuit ? 'scale-100 rotate-0 opacity-100' : 'scale-50 rotate-90 opacity-0')} />
    </button>
  )
}
