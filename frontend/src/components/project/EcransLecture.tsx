import SubscriptionWall from '@/components/common/SubscriptionWall'
import ProgressDisplay, { type StepDescriptor } from '@/components/common/ProgressDisplay'
import type { LectureEnCours } from '@/hooks/useLancerLecture'

// La fenêtre affichée dès le clic sur « Lire ce dossier ».
const ANALYSIS_STEPS_FOR_DISPLAY: StepDescriptor[] = [
  { key: 'preparation',     label: 'Lecture des documents',                 estimated_s: 2 },
  { key: 'analyzing_pass1', label: 'Lecture des exigences administratives', estimated_s: 50 },
  { key: 'analyzing_pass2', label: 'Lecture des exigences techniques',      estimated_s: 50 },
  { key: 'finalizing',      label: 'Finalisation',                          estimated_s: 5 },
]

/** La grille des offres (quota atteint, refus 402) et la fenêtre de progression de la lecture. */
export default function EcransLecture({ lecture }: { lecture: LectureEnCours }) {
  return (
    <>
      <SubscriptionWall open={lecture.showPaywall} onClose={lecture.fermerPaywall} feature="analysis" message={lecture.paywallMessage} />
      {lecture.isAnalyzing && (
        <ProgressDisplay
          variant="modal"
          title="Lecture du dossier en cours"
          steps={ANALYSIS_STEPS_FOR_DISPLAY}
          currentStep={lecture.analysisSse.step}
          progress={lecture.analysisSse.progress}
          detail={lecture.analysisSse.detail}
          phase={lecture.analysisSse.phase}
          onCancel={lecture.annuler}
        />
      )}
    </>
  )
}
