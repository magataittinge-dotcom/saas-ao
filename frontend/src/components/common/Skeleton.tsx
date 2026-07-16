import { type CSSProperties } from 'react'
import { cn } from '@/lib/utils'

/* Base — slate-100 background with a left→right shimmer overlay.
   The shimmer is defined in index.css as `.skeleton-shimmer`. We keep
   the wrapper as a single div with both background colour AND shimmer
   class so callers don't have to remember to add the shimmer.

   ⚠️ Never use a colour outside slate-100/slate-50 here — anything
   darker reads as a "hole" in the page (the previous bug used
   `#0C1222`). */
function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      className={cn('rounded-md skeleton-shimmer', className)}
      style={{ background: '#1C222D', ...style }}
    />
  )
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2.5', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3.5"
          style={{ width: i === lines - 1 ? '60%' : '100%' }}
        />
      ))}
    </div>
  )
}

export function SkeletonAvatar({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <Skeleton
      className={cn('rounded-full shrink-0', className)}
      style={{ width: size, height: size }}
    />
  )
}

/* SkeletonCard — generic white card placeholder that matches the visual
   weight of a real white-bg, slate-100-border card in the app. Used as
   the *outer* wrapper for higher-level skeletons like StatCardSkeleton.

   Was the source of the dark-rectangle bug (background `#0C1222`).
   Now defaults to white with a subtle border so the page doesn't get
   "holes" while data loads. */
export function SkeletonCard({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div
      className={cn('rounded-xl p-5', className)}
      style={{
        background: '#151A23',
        border: '1px solid rgba(186,205,234,.13)',
        boxShadow: '0 1px 3px rgba(0,0,0,.4)',
      }}
    >
      {children ?? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-3.5 w-full" />
        </div>
      )}
    </div>
  )
}

export default Skeleton
