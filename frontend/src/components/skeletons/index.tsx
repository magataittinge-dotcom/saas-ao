/* Page-level skeleton primitives.
 *
 * Each skeleton mirrors the EXACT dimensions of its real counterpart so
 * the swap is invisible (no layout shift). All shapes stay inside the
 * slate-100 / slate-50 colour band — anything darker reads as a "hole"
 * in the page (the bug we just fixed).
 *
 * Convention:
 *   - <NameSkeleton />        → renders a single placeholder
 *   - <NameListSkeleton n=k />→ renders k of them
 */
import Skeleton from '@/components/common/Skeleton'

const CARD = {
  background: '#151A23',
  border: '1px solid rgba(186,205,234,.13)',
  boxShadow: '0 1px 3px rgba(0,0,0,.4)',
} as const

/* ── Stat card (Dashboard 4 top tiles) — h-[110px] ─────────────────── */
export function StatCardSkeleton() {
  return (
    <div className="rounded-xl p-5 relative overflow-hidden h-[110px]" style={CARD}>
      <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: '#1C222D' }} />
      <div className="flex items-start justify-between">
        <Skeleton className="h-10 w-10 rounded-lg" />
      </div>
      <Skeleton className="h-7 w-16 mt-3" />
      <Skeleton className="h-3.5 w-24 mt-2" />
    </div>
  )
}

export function StatCardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  )
}

/* ── Project row (Dashboard table + /projects list) — h-[52px] ──────── */
export function ProjectRowSkeleton() {
  return (
    <div
      className="grid items-center gap-3 px-5 py-3.5"
      style={{
        gridTemplateColumns: '2fr 1fr 90px 140px 70px 32px',
        borderBottom: '1px solid rgba(186,205,234,.10)',
      }}
    >
      {/* Name + client */}
      <div className="min-w-0 space-y-1.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      {/* Lot */}
      <Skeleton className="h-3.5 w-20" />
      {/* Status */}
      <Skeleton className="h-5 w-16 rounded-full" />
      {/* Progress */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-1.5 w-full rounded-full" />
        <Skeleton className="h-3.5 w-8" />
      </div>
      {/* Deadline */}
      <Skeleton className="h-3.5 w-10" />
      {/* Action */}
      <Skeleton className="h-5 w-5 rounded" />
    </div>
  )
}

export function ProjectListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <ProjectRowSkeleton key={i} />
      ))}
    </>
  )
}

/* ── Project card (used on /projects grid view) ────────────────────── */
export function ProjectCardSkeleton() {
  return (
    <div className="rounded-xl p-5 space-y-4" style={CARD}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-1.5 w-full rounded-full" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-3.5 w-12" />
      </div>
    </div>
  )
}

export function ProjectCardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <ProjectCardSkeleton key={i} />
      ))}
    </div>
  )
}

/* ── Stepper skeleton (top of /projects/:id) ───────────────────────── */
export function StepperSkeleton() {
  return (
    <div className="rounded-xl p-5 mb-6" style={CARD}>
      <div className="flex items-center gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 flex-1">
            <Skeleton className="h-9 w-9 rounded-full shrink-0" />
            <Skeleton className="h-3.5 flex-1 max-w-[80px]" />
            {i < 5 && <Skeleton className="h-px flex-1" />}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Document/vault row — h-[60px] ─────────────────────────────────── */
export function DocumentRowSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg" style={CARD}>
      <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
      <div className="flex-1 space-y-1.5 min-w-0">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-5 w-20 rounded-full" />
      <Skeleton className="h-7 w-7 rounded" />
    </div>
  )
}

export function DocumentListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <DocumentRowSkeleton key={i} />
      ))}
    </div>
  )
}

/* ── Requirement card (StepCandidat / StepAnalysis) ────────────────── */
export function RequirementCardSkeleton() {
  return (
    <div className="rounded-xl p-4 space-y-3" style={CARD}>
      <div className="flex items-start gap-3">
        <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
        <Skeleton className="h-5 w-16 rounded-full shrink-0" />
      </div>
      <div className="flex items-center gap-2 pt-2" style={{ borderTop: '1px solid rgba(186,205,234,.10)' }}>
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  )
}

export function RequirementListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <RequirementCardSkeleton key={i} />
      ))}
    </div>
  )
}

/* ── Mémoire section (StepMemoire long-form sections) ─────────────── */
export function MemoireSectionSkeleton() {
  return (
    <div className="rounded-xl p-6 space-y-4" style={CARD}>
      <div className="flex items-center gap-3 mb-2">
        <Skeleton className="h-6 w-6 rounded" />
        <Skeleton className="h-5 w-48" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-5/6" />
        <Skeleton className="h-3.5 w-4/5" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-3/4" />
      </div>
    </div>
  )
}

export function MemoireSkeleton() {
  return (
    <div className="space-y-4">
      <MemoireSectionSkeleton />
      <MemoireSectionSkeleton />
      <MemoireSectionSkeleton />
    </div>
  )
}

/* ── References table row ─────────────────────────────────────────── */
export function ReferenceRowSkeleton() {
  return (
    <tr style={{ borderBottom: '1px solid rgba(186,205,234,.13)' }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-3.5" style={{ width: i === 1 ? '80%' : '60%' }} />
        </td>
      ))}
    </tr>
  )
}

export function ReferenceTableSkeleton({ count = 5 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <ReferenceRowSkeleton key={i} />
      ))}
    </>
  )
}

/* ── Sidebar small section (Dashboard right column) ───────────────── */
export function SidebarSectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-xl p-4 space-y-3" style={CARD}>
      <Skeleton className="h-3 w-24" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}
