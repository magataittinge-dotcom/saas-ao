import { lazy, Suspense, useState } from 'react'
import { Link, useParams, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useProject } from '@/hooks/useProject'
import { StepProgress, segmentDeEtape } from '@/components/project/StepProgress'
import { lotUniqueDuDossier } from '@/lib/lotUnique'
import { actionEtape, libelleRemise, quandRemise } from '@/lib/intelligence/action'
import { lectureAO } from '@/lib/etatAO'
import { acheteurCourt, niveauRemise, quandCourt } from '@/lib/mesAO'
import { dossierLu } from '@/lib/dossierLu'
import { AIDE_ETAPES, AideEtapeContexte, LectureNonFaite } from '@/components/etape'
import { MettreAJourStatut } from '@/components/common/MettreAJourStatut'
import { AplatCede, Bouton } from '@/components/ui/bouton'
import { AOIntrouvable } from '@/components/public/EcransEtat'
import { EtatErreur, EtatRequete } from '@/components/ui/etats'
import { Message } from '@/components/ui/message'
import { PastilleEtat } from '@/components/ui/pastille'
import { Squelette, SqueletteLignes } from '@/components/ui/squelette'
import type { Project as ProjetAO } from '@/types'

// Chaque étape est un morceau chargé à la demande (bloc 6).
const StepUpload = lazy(() => import('./project/StepUpload'))
const StepLotSelection = lazy(() => import('./project/StepLotSelection'))
const StepAnalysis = lazy(() => import('./project/StepAnalysis'))
const StepVerification = lazy(() => import('./project/StepVerification'))
const StepPlan = lazy(() => import('./project/StepPlan'))
const StepMemoire = lazy(() => import('./project/StepMemoire'))
const StepExport = lazy(() => import('./project/StepExport'))

/** Le squelette d'une étape : aux dimensions du gabarit (titre, ligne d'utilité, bande de résumé, un bloc). Fixe. */
function SqueletteEtape() {
  return (
    <div aria-busy="true" className="space-y-6">
      <div className="space-y-3"><Squelette className="h-10 w-64 max-w-full" /><Squelette className="h-4 w-96 max-w-full" /></div>
      <Squelette className="h-28 w-full rounded-carte" />
      <SqueletteLignes lignes={4} />
    </div>
  )
}

/** Le squelette de la page d'un AO : la ligne de contexte, le fil des étapes, puis l'étape. */
function SqueletteAO() {
  return (
    <div>
      <Squelette className="mb-4 h-4 w-72 max-w-full" />
      <div className="flex items-start gap-3 pb-6">{Array.from({ length: 7 }, (_, i) => <Squelette key={i} className="size-8 shrink-0 rounded-pilule" />)}</div>
      <SqueletteEtape />
    </div>
  )
}

/**
 * La coquille d'un AO, partagée par les sept étapes. Un seul `h1` par écran : le titre de l'étape (gabarit d'étape) ; le nom
 * de l'AO est dans la barre du haut (« Mes AO / nom de l'AO »). Ici : une ligne de contexte (acheteur, lot, remise), le fil
 * des étapes, l'état de l'AO (lib/etatAO.ts : une remise passée n'a qu'une action, « Mettre à jour le statut »), puis l'étape.
 * Chargement, erreur, contenu dans cet ordre : un AO introuvable dit qu'il est introuvable (il ne renvoie plus à l'Accueil
 * sans un mot). Le conteneur est celui de la coquille ; Rédiger l'ouvre à toute la largeur (`data-page-pleine`).
 */
/** Le serveur a répondu que cet AO n'existe pas (ou n'est pas à cette entreprise) : ce n'est pas une panne. */
export function aoIntrouvable(erreur: unknown): boolean {
  const statut = (erreur as { response?: { status?: number } } | null | undefined)?.response?.status
  return statut === 404 || statut === 403
}

export default function Project() {
  const { id } = useParams<{ id: string }>()
  const requete = useProject(id!)
  // Une phrase par cause (jury, tour 1) : introuvable → l'écran « AO introuvable », sans « Réessayer » (il n'y a rien à
  // réessayer) ; panne → l'état d'erreur du système, avec « Réessayer ». Jamais « peut-être supprimé, ou la connexion… ».
  return (
    <EtatRequete requete={requete} estVide={() => false} vide={null} squelette={<SqueletteAO />}
      erreur={aoIntrouvable(requete.error) ? <AOIntrouvable /> : (
        <EtatErreur titre="Cet appel d’offres n’a pas pu s’ouvrir" detail="La connexion au serveur a échoué. Votre dossier n’est pas touché."
          onReessayer={() => { void requete.refetch() }} enCours={requete.isFetching} action={<Bouton asChild variante="lien"><Link to="/projects">Retour à Mes AO</Link></Bouton>} />
      )}>
      {(project) => <PageAO project={project} />}
    </EtatRequete>
  )
}

function PageAO({ project }: { project: ProjetAO }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [statut, setStatut] = useState(false)
  const segment = pathname.match(/^\/projects\/[^/]+\/(\w+)/)?.[1] ?? ''
  const lecture = lectureAO(project)
  const niveau = niveauRemise(project)
  const quand = quandCourt(project)
  // Une seule alerte de date (jury, tour 1 : la remise passée était dite deux fois, pastille rouge ET bandeau). Remise
  // passée : le bandeau la dit, avec la date et la seule action permise ; la pastille ne s'affiche pas. Sinon : la pastille.
  const remisePassee = lecture.etat === 'a_mettre_a_jour'
  const jourRemise = quandRemise(project)
  const contexte = [acheteurCourt(project.maitre_ouvrage), project.selected_lot_name].filter(Boolean).join(' · ')

  return (
    <div className="page-ao page" data-page={segment === 'memoire' ? 'pleine' : 'large'} data-page-pleine={segment === 'memoire' ? '' : undefined}>
      {/* ── Le contexte de l'AO : qui, quoi, pour quand (R1). Une ligne ; le nom de l'AO est dans la barre du haut. ── */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-4">
        <p className="min-w-0 break-words text-sm text-fg-2">
          {/* au téléphone, la barre du haut ne porte que le retour « Mes AO » : le nom de l'AO est écrit ici, en entier */}
          {contexte && <span data-nom-ao-tel="" className="block text-base font-semibold text-fg min-[769px]:hidden">{project.name}</span>}
          {contexte || project.name}
        </p>
        {lecture.echeance.etat !== 'sans_date' && !remisePassee && (
          <PastilleEtat sens={lecture.etat === 'termine' ? 'gris' : niveau === 'rouge' ? 'rouge' : niveau === 'ambre' ? 'ambre' : 'gris'} icone={lecture.etat === 'termine' || niveau === 'neutre' ? null : undefined}>
            {libelleRemise(lecture.echeance)}{quand ? ` · ${quand}` : ''}
          </PastilleEtat>
        )}
      </div>

      {/* Le fil des étapes défile avec la page : collé, il recouvrait le contenu et les messages d'erreur (G3). */}
      <StepProgress
        currentStep={project.current_step}
        completedSteps={project.completed_steps}
        lotUnique={lotUniqueDuDossier(project)}
        piecesAJoindre={project.avancement?.pieces ? project.avancement.pieces.total - project.avancement.pieces.pretes : null}
        onStepClick={(step) => navigate(`/projects/${project.id}/${segmentDeEtape(step)}`)}
      />

      {/* L'état de l'AO, dit une fois : une remise passée n'a qu'une action, « Mettre à jour le statut » */}
      {lecture.action.statut && (
        <div data-alerte-ao={remisePassee ? 'attention' : 'info'} className="mb-6">
          <Message ton={remisePassee ? 'attention' : 'info'} titre={remisePassee ? 'La date de remise est passée' : 'Le dossier est déposé'}
            action={<Bouton variante={remisePassee ? 'principal' : 'secondaire'} onClick={() => setStatut(true)}>{lecture.action.verbe}</Bouton>}>
            {remisePassee
              ? `${jourRemise ? `Elle était fixée au ${jourRemise.replace(/^./, (c) => c.toLowerCase())}. ` : ''}Dites si le dossier a été déposé : cet appel d’offres quittera ceux à suivre.`
              : 'Indiquez le résultat quand l’acheteur l’annonce.'}
          </Message>
        </div>
      )}
      <MettreAJourStatut projet={project} ouvert={statut} onOuvert={setStatut} />

      {/* L'étape : son aide (« ? ») est publiée ici, le gabarit la déplie */}
      {/* Remise passée : la seule action est « Mettre à jour le statut » (DESIGN.md). Elle porte l'aplat ; l'étape le lui cède. */}
      <AplatCede.Provider value={remisePassee}>
      <AideEtapeContexte.Provider value={AIDE_ETAPES[segment] ?? null}>
        <Suspense fallback={<SqueletteEtape />}>
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
              : <LectureNonFaite project={project} titre="Plan du mémoire" utilite="Les parties de votre mémoire, avant sa rédaction."
                  libelles={['Les parties', 'Les critères du règlement', 'La longueur demandée', 'Les fiches']} />} />
            <Route path="memoire"      element={dossierLu(project)
              ? <StepMemoire project={project} />
              : <LectureNonFaite project={project} titre="Rédiger le mémoire" utilite="Synorix rédige chaque partie du plan, à partir de votre dossier et de Mon entreprise."
                  libelles={['Le plan', 'Le poids de chaque partie dans la note']} />} />
            <Route path="export"       element={<StepExport       project={project} />} />
          </Routes>
        </Suspense>
      </AideEtapeContexte.Provider>
      </AplatCede.Provider>
    </div>
  )
}
