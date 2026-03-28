import { useRef, useState, useEffect } from 'react'
import { useParams, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useProject } from '@/hooks/useProject'
import { StepProgress } from '@/components/project/StepProgress'
import StepUpload       from './project/StepUpload'
import StepLotSelection from './project/StepLotSelection'
import StepAnalysis     from './project/StepAnalysis'
import StepCandidat     from './project/StepCandidat'
import StepMemoire      from './project/StepMemoire'
import StepExport       from './project/StepExport'
import { cn } from '@/lib/utils'

const STEP_ROUTES = ['upload', 'lots', 'analysis', 'candidature', 'memoire', 'export']

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
    return (
      <div className="flex items-center justify-center h-64">
        <div
          className="w-8 h-8 rounded-full border-2 border-transparent animate-spin"
          style={{ borderTopColor: '#0EA5E9' }}
        />
      </div>
    )
  }

  if (!project) return <Navigate to="/dashboard" replace />

  const handleStepClick = (step: number) => {
    navigate(`/projects/${id}/${STEP_ROUTES[step - 1]}`)
  }

  return (
    <div className="animate-fade-in">
      {/* Project header */}
      <div className="mb-4">
        <h1 className="text-ds-text text-xl font-bold">{project.name}</h1>
        {project.maitre_ouvrage && (
          <p className="text-sm text-ds-text-2 mt-0.5">{project.maitre_ouvrage}</p>
        )}
      </div>

      <div ref={sentinelRef} className="h-px" />

      {/* Sticky stepper */}
      <div
        className={cn(
          'sticky top-0 z-20 glass-card p-5 mb-6 transition-all duration-200',
          stepperStuck && 'rounded-none -mx-6 px-12',
        )}
        style={stepperStuck ? { background: 'rgba(8,11,18,0.92)', backdropFilter: 'blur(20px)' } : undefined}
      >
        <StepProgress
          currentStep={project.current_step}
          completedSteps={project.completed_steps}
          onStepClick={handleStepClick}
        />
      </div>

      {/* Step content */}
      <Routes>
        <Route path="/"            element={<Navigate to="upload" replace />} />
        <Route path="upload"       element={<StepUpload       project={project} />} />
        <Route path="lots"         element={<StepLotSelection project={project} />} />
        <Route path="analysis"     element={<StepAnalysis     project={project} />} />
        <Route path="candidature"  element={<StepCandidat     project={project} />} />
        <Route path="memoire"      element={<StepMemoire      project={project} />} />
        <Route path="export"       element={<StepExport       project={project} />} />
      </Routes>
    </div>
  )
}
