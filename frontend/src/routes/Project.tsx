import { lazy, Suspense } from 'react'
import { useParams, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { useProject } from '@/hooks/useProject'
import { StepProgress, segmentDeEtape } from '@/components/project/StepProgress'
import { lotUniqueDuDossier } from '@/lib/lotUnique'
import { actionEtape } from '@/lib/intelligence/action'
import { DeadlinePill } from '@/components/dashboard/DeadlinePill'
import { echeanceAO } from '@/lib/echeance'
import { dossierLu } from '@/lib/dossierLu'
import { LectureNonFaite } from '@/components/etape'
import { StepperSkeleton } from '@/components/skeletons'
import Skeleton from '@/components/common/Skeleton'
import EcranEnChargement from '@/components/common/EcranEnChargement'

// Chaque étape est un morceau chargé à la demande (bloc 6).
const StepUpload = lazy(() => import('./project/StepUpload'))
const StepLotSelection = lazy(() => import('./project/StepLotSelection'))
const StepAnalysis = lazy(() => import('./project/StepAnalysis'))
const StepVerification = lazy(() => import('./project/StepVerification'))
const StepPlan = lazy(() => import('./project/StepPlan'))
const StepMemoire = lazy(() => import('./project/StepMemoire'))
const StepExport = lazy(() => import('./project/StepExport'))


export default function Project() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: project, isLoading } = useProject(id!)

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
    navigate(`/projects/${id}/${segmentDeEtape(step)}`)
  }

  return (
    <div className="page-ao animate-fade-in max-w-6xl mx-auto">
      {/* ── Bandeau contexte AO — qui, quoi, pour quand (R1) ───────── */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="microlabel mb-1">Appel d&apos;offres</p>
          <h1 className="font-display tracking-tight text-fg text-xl font-semibold leading-tight line-clamp-2 break-words">{project.name}</h1>
          {project.maitre_ouvrage && (
            <p className="mt-1 flex items-start gap-1.5 text-sm text-fg-2">
              <MapPin size={13} className="mt-[3px] shrink-0 text-fg-3" />
              <span className="min-w-0 break-words">{project.maitre_ouvrage}</span>
            </p>
          )}
        </div>
        {echeanceAO(project) && (
          <div className="shrink-0 pt-1">
            <DeadlinePill echeance={echeanceAO(project)} emphasized />
          </div>
        )}
      </div>

      {/* Le fil des étapes défile avec la page : collé, il recouvrait le contenu et les messages d'erreur (G3). */}
      <div className="glass-card px-4 py-2.5 mb-5">
        <StepProgress
          currentStep={project.current_step}
          completedSteps={project.completed_steps}
          lotUnique={lotUniqueDuDossier(project)}
          onStepClick={handleStepClick}
        />
      </div>

      {/* Step content */}
      <Suspense fallback={<EcranEnChargement />}>
      <Routes>
        <Route path="/"            element={<Navigate to={actionEtape(project).segment} replace />} />
        <Route path="upload"       element={<StepUpload       project={project} />} />
        <Route path="lots"         element={<StepLotSelection project={project} />} />
        <Route path="analysis"     element={<StepAnalysis     project={project} />} />
        <Route path="verification" element={<StepVerification project={project} />} />
        {/* B9 — ancien nom d'étape conservé en redirect */}
        <Route path="candidature"  element={<Navigate to={`/projects/${project.id}/verification`} replace />} />
        <Route path="plan"         element={dossierLu(project)
          ? <StepPlan project={project} />
          : <LectureNonFaite project={project} titre="Plan du mémoire" utilite="Les parties de votre mémoire, avant sa rédaction." action="Valider le plan"
              libelles={['Parties', 'Critères du règlement', 'Longueur', 'Fiches']} />} />
        <Route path="memoire"      element={dossierLu(project)
          ? <StepMemoire project={project} />
          : <LectureNonFaite project={project} titre="Rédiger le mémoire" utilite="Synorix rédige chaque partie du plan, à partir de votre dossier et de Mon entreprise." action="Rédiger le mémoire"
              libelles={['Plan', 'Poids dans la note', 'Abonnement']} />} />
        <Route path="export"       element={<StepExport       project={project} />} />
      </Routes>
      </Suspense>
    </div>
  )
}
