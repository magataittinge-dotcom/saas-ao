import Logo from '@/components/layout/Logo'
import { cn } from '@/lib/utils'

/** La marque : le logo de l'appli et le nom, les mêmes sur le site que dans la barre connectée. */
export function Marque({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 text-lg font-semibold tracking-[-0.01em] text-fg', className)}>
      <Logo />
      Synorix
    </span>
  )
}
