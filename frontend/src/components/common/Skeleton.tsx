import { type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Squelette, SqueletteLignes } from '@/components/ui/squelette'

// ALIAS MINCE. Le squelette du système est `Squelette` (components/ui/squelette.tsx) : fixe, à la glace du thème, sans
// balayage ni pulsation. Ne plus importer ce fichier.
function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <Squelette className={className} style={style} />
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return <SqueletteLignes lignes={lines} className={className} />
}

export function SkeletonAvatar({ size = 40, className }: { size?: number; className?: string }) {
  return <Squelette className={cn('shrink-0 rounded-pilule', className)} style={{ width: size, height: size }} />
}

export function SkeletonCard({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <div className={cn('rounded-carte border border-bord bg-surface-0 p-5 shadow-card', className)}>
      {children ?? (
        <div className="space-y-4">
          <Squelette className="size-10 rounded-lg" />
          <Squelette className="h-7 w-20" />
          <Squelette className="h-3.5 w-full" />
        </div>
      )}
    </div>
  )
}

export default Skeleton
