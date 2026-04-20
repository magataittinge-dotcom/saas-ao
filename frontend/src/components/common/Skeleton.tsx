import { type CSSProperties } from 'react'
import { cn } from '@/lib/utils'

function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      className={cn('rounded-lg skeleton-shimmer', className)}
      style={{ background: '#F1F5F9', ...style }}
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

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn('rounded-2xl p-6 skeleton-shimmer', className)}
      style={{
        background: '#0C1222',
        border: '1px solid #E2E8F0',
      }}
    >
      <div className="space-y-4">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-3/4" />
      </div>
    </div>
  )
}

export default Skeleton
