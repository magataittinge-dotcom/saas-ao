import { lazy, Suspense, useRef, useState, useEffect } from 'react'
import { useParams, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { useProject } from '@/hooks/useProject'
import { StepProgress } from '@/components/project/StepProgress'
import { DeadlinePill } from '@/components/dashboard/DeadlinePill'
import { echeanceAO } from '@/lib/echeance'
import { StepperSkeleton } from '@/components/skeletons'
import Skeleton from '@/components/common/Skeleton'
import EcranEnChargement from '@/components/common/EcranEnChargement'
import { cn } from '@/lib/utils'

// Chaque étape est un morceau chargé à la demande (bloc 6).
const StepUpload = lazy(() => import('./project/StepUpload'))
const StepLotSelection = lazy(() => import('./project/StepLotSelection'))
const StepAnalysis = lazy(() => import('./project/StepAnalysis'))
const StepVerification = lazy(() => import('./project/StepVerification'))
const StepMemoire = lazy(() => import('./project/StepMemoire'))
const StepExport = lazy(() => import('./project/StepExport'))

const STEP_ROUTES = ['upload', 'lots', 'analysis', 'verification', 'memoire', 'export']

export default function Project() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: project, isLoading } = useProject(id!)

  const sentinelRef = useRef<HTMLDivElement>(null)
  const [stepperStuck, setStepperStuck] = useState(false)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      ([entry]) => setStepperStuck(!entry.isIntersecting),
      { threshold: 0 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  if (isLoading) {
    // Show the page skeleton (header + stepper) instead of a full-screen
    // spinner so the user feels the page is responsive while we fetch.
    return (
      <div>
        <div className="mb-4 space-y-2">
          <Skeleton className="h-7 w-2/3 max-w-md" />
          <Skeleton className="h-4 w-1/3 max-w-xs" />
        </div>
        <StepperSkeleton />
      </div>
    )
  }

  if (!project) return <Navigate to="/dashboard" replace />

  const handleStepClick = (step: number) => {
    navigate(`/projects/${id}/${STEP_ROUTES[step - 1]}`)
  }

  return (
    <div className="animate-fade-in max-w-6xl mx-auto">
      {/* ── Bandeau contexte AO — qui, quoi, pour quand (R1) ───────── */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="microlabel mb-1">Appel d&apos;offres</p>
          <h1 className="font-display tracking-tight text-ds-text text-[22px] font-bold leading-tight truncate">{project.name}</h1>
          {project.maitre_ouvrage && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ds-text-2 truncate">
              <MapPin size={13} className="shrink-0 text-ds-text-3" />
              {project.maitre_ouvrage}
            </p>
          )}
        </div>
        {echeanceAO(project) && (
          <div className="shrink-0 pt-1">
            <DeadlinePill echeance={echeanceAO(project)} emphasized />
          </div>
        )}
      </div>

      <div ref={sentinelRef} className="h-px" />

      {/* Sticky stepper — fin, une seule lumière */}
      <div
        className={cn(
          'sticky top-0 z-20 glass-card px-4 py-2.5 mb-5 transition-all duration-200',
          stepperStuck && 'rounded-none -mx-6 px-12',
        )}
        style={stepperStuck ? { background: 'rgba(18,18,19,0.92)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderBottom: '1px solid var(--line)', boxShadow: '0 8px 24px rgba(0,0,0,.4)' } : undefined}
      >
        <StepProgress
          currentStep={project.current_step}
          completedSteps={project.completed_steps}
          onStepClick={handleStepClick}
        />
      </div>

      {/* Step content */}
      <Suspense fallback={<EcranEnChargement />}>
      <Routes>
        <Route path="/"            element={<Navigate to="upload" replace />} />
        <Route path="upload"       element={<StepUpload       project={project} />} />
        <Route path="lots"         element={<StepLotSelection project={project} />} />
        <Route path="analysis"     element={<StepAnalysis     project={project} />} />
        <Route path="verification" element={<StepVerification project={project} />} />
        {/* B9 — ancien nom d'étape conservé en redirect */}
        <Route path="candidature"  element={<Navigate to={`/projects/${project.id}/verification`} replace />} />
        <Route path="memoire"      element={<StepMemoire      project={project} />} />
        <Route path="export"       element={<StepExport       project={project} />} />
      </Routes>
      </Suspense>
    </div>
  )
}
