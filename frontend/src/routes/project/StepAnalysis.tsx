import { useAvisAttente } from '@/hooks/useAvisAttente'
import { useState, useMemo, useRef, useCallback, useEffect, useId } from 'react'
import { useQuery, useQueryClient, useIsFetching } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { Bouton } from '@/components/ui/bouton'
import { Carte } from '@/components/ui/carte'
import { ChampRecherche } from '@/components/ui/champ'
import { EtatErreur, EtatVide } from '@/components/ui/etats'
import { EffacerFiltres } from '@/components/ui/filtre'
import { ListeDeroulante } from '@/components/ui/liste-deroulante'
import { Message } from '@/components/ui/message'
import { Tableau, type ColonneTableau } from '@/components/ui/tableau'
import { annoncer } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { api, getSignedFileUrl } from '@/services/api'
import { type FieldSource, type CriticalFieldsPayload } from '@/components/project/CriticalBanner'
import { CarteAO30sVue, useFaitsAO } from '@/components/project/CarteAO30s'
import PointsAEclaircir from '@/components/project/PointsAEclaircir'
import AVerifierAvantEngagement from '@/components/project/AVerifierAvantEngagement'
import { voirTresorerie } from '@/components/project/TresorerieCard'
import { GabaritEtape, SectionEtape, BarreEtape, ActionsBarre, ActionsBarreTel, BilanBarre, BoutonSuite, SqueletteCorpsEtape } from '@/components/etape'
import { enumerer } from '@/components/etape/LectureNonFaite'
import { EtapeSansAnalyse } from '@/components/project/EtapeSansAnalyse'
import { pointsAVerifier } from '@/lib/resumeAO'
import TresorerieCard from '@/components/project/TresorerieCard'
import SynorixScoreCard from '@/components/project/SynorixScoreCard'
import RetroPlanning from '@/components/project/RetroPlanning'
import PanneauSource, { type SelectionSource } from '@/components/project/source/PanneauSource'
import VueTableau, { enAncreTableur } from '@/components/project/source/VueTableau'
import { pageCitee, reponseDeChamp } from '@/lib/ancre'
import { precharger, abandonner } from '@/services/sources'
import { useVisible } from '@/hooks/useVisible'
import ProgressDisplay, { type StepDescriptor } from '@/components/common/ProgressDisplay'
import { useProgressStream } from '@/hooks/useProgressStream'
import type { Project, ComplianceItem, ComplianceCategory, ProjectDocument } from '@/types'
import { useCompleteStep } from '@/hooks/useProject'
import { messageErreur } from '@/lib/erreurs'
import { phraseDocumentsAnalyses, phraseExigences, repartirDocuments, titresDetailDocuments } from '@/lib/analyseLibelles'
import { PASSAGE_INTROUVABLE, trouverPieceCitee } from '@/lib/pieceCitee'
import { lectureNonDemarree } from '@/lib/lectureNonDemarree'

const ANALYSIS_STEPS: StepDescriptor[] = [
  { key: 'preparation',     label: 'Analyse des documents',      estimated_s: 2 },
  { key: 'analyzing_pass1', label: 'Exigences administratives',  estimated_s: 50 },
  { key: 'analyzing_pass2', label: 'Exigences techniques',       estimated_s: 50 },
  { key: 'finalizing',      label: 'Mise en ordre',              estimated_s: 5 },
]

const CATEGORY_LABELS: Record<ComplianceCategory, string> = {
  candidature:       'Candidature',
  offre:             'Offre',
  technique:         'Technique',
  planning:          'Planning',
  criteres_notation: 'Critères de notation',
}

const CATEGORY_ORDER: ComplianceCategory[] = [
  'candidature', 'offre', 'technique', 'planning', 'criteres_notation',
]

/** Ce que l'écran montrera une fois l'analyse faite (état « analyse non faite »). */
const VIENDRA = ['La décision', 'Ce qui est à vérifier avant de vous engager', 'Le détail des exigences']

interface Props { project: Project }
type FilterCategory = 'all' | ComplianceCategory

export default function StepAnalysis({ project }: Props) {
  const navigate = useNavigate()
  const avisAttente = useAvisAttente('analyse')
  const queryClient = useQueryClient()
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('all')
  const [search, setSearch] = useState('')
  // Toutes les catégories sont repliées à l'arrivée : la page commence par la liste des catégories et leurs comptes (448 exigences
  // dépliées faisaient 12 000 px au téléphone, 7 000 à l'ordinateur).
  const { mutate: completeStep, isPending: isValidating } = useCompleteStep(project.id)

  // Charger les documents du projet pour l'ouverture de la source
  const { data: projectDocs = [], isSuccess: documentsLus } = useQuery({
    queryKey: ['project-documents', project.id],
    queryFn: async () => {
      const { data } = await api.get<ProjectDocument[]>(`/projects/${project.id}/documents`)
      return data
    },
  })

  // « Voir dans le DCE » : le panneau à trois vues (Passage, Page, Document), à côté de la liste
  // sur ordinateur, en feuille qui monte du bas sur téléphone. Le serveur fournit l'ancre.
  const [selection, setSelection] = useState<SelectionSource | null>(null)
  const fermerSelection = useCallback(() => setSelection(null), [])
  // 1.16 — ce qui n'a pas abouti est dit (source introuvable, document qui ne s'ouvre pas, relance)
  const [avis, setAvis] = useState<{ message: string } | null>(null)
  const idDetailLot = useId()
  const [relanceEnCours, setRelanceEnCours] = useState(false)

  const nombrePagesDe = (nomPiece: string | null | undefined): number | null =>
    (nomPiece ? projectDocs.find((d) => d.file_name === nomPiece)?.page_count : null) ?? null

  // C5 — ouvrir la source exacte d'un champ du bandeau critique (ni ancre ni images serveur :
  // la page citée par l'analyse dans le document, et l'extrait tel quel).
  const openFieldSource = async (src: FieldSource) => {
    const doc = projectDocs.find(d => d.file_name === src.document)
    if (!doc) { annoncer(PASSAGE_INTROUVABLE, 'erreur'); return }
    if (doc.file_url.startsWith('http')) { window.open(doc.file_url, '_blank'); return }
    try {
      const origine = await getSignedFileUrl(doc.file_url)
      const pdfRel = [doc.file_url, doc.pdf_preview_url].find((u) => u && u.toLowerCase().endsWith('.pdf')) ?? null
      const pdf = pdfRel === null ? null : pdfRel === doc.file_url ? origine : await getSignedFileUrl(pdfRel)
      setSelection({
        type: 'champ', nombrePages: doc.page_count ?? null,
        reponse: reponseDeChamp(doc, { page: src.page, excerpt: src.excerpt }, { pdf, origine }),
      })
    } catch {
      // 1.16 — ce qui n'a pas abouti est dit, là où l'on regarde (le clic est au milieu d'un long écran)
      annoncer('Le document source n’a pas pu s’ouvrir. Réessayez dans un instant.', 'erreur')
    }
  }

  // Ouvrir la source d'une exigence : le panneau lit l'ancre auprès du serveur (au premier clic
  // pour un ancien AO) ; jamais de repli sur une autre pièce du dossier (1.16).
  const openSourceDocument = (item: ComplianceItem) => {
    if (!item.source_document && !item.source_page) return
    setSelection({
      type: 'exigence', id: item.id, titre: item.source_document,
      nombrePages: nombrePagesDe(trouverPieceCitee(item.source_document, projectDocs)?.file_name),
    })
  }

  // Multi-lots : lots analysés disponibles + lot affiché (défaut : lot sélectionné)
  const [viewLot, setViewLot] = useState<string | null>(null)
  const { data: analyzedLots = [] } = useQuery({
    queryKey: ['compliance-lots', project.id],
    queryFn: async () => {
      const { data } = await api.get<{ lots: string[] }>(`/projects/${project.id}/compliance/lots`)
      return data.lots
    },
  })
  const activeLot = viewLot ?? project.selected_lot ?? analyzedLots[0] ?? null

  const requeteExigences = useQuery({
    queryKey: ['compliance', project.id, activeLot],
    queryFn: async () => {
      const { data } = await api.get<ComplianceItem[]>(
        `/projects/${project.id}/compliance${activeLot ? `?lot=${encodeURIComponent(activeLot)}` : ''}`)
      return data
    },
    refetchInterval: (query) => (query.state.data?.length === 0 ? 3000 : false),
    refetchIntervalInBackground: false,
  })
  const { isLoading } = requeteExigences
  const items = useMemo(() => requeteExigences.data ?? [], [requeteExigences.data])

  const filtered = useMemo(() => {
    let result = items
    if (activeFilter !== 'all') result = result.filter((i) => i.category === activeFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (i) =>
          i.exigence_text.toLowerCase().includes(q) ||
          (i.source_document ?? '').toLowerCase().includes(q) ||
          (i.source_excerpt ?? '').toLowerCase().includes(q),
      )
    }
    return result
  }, [items, activeFilter, search])

  const grouped = useMemo(
    () =>
      CATEGORY_ORDER.reduce<Record<string, ComplianceItem[]>>((acc, cat) => {
        const catItems = filtered.filter((i) => i.category === cat)
        if (catItems.length > 0) acc[cat] = catItems
        return acc
      }, {}),
    [filtered],
  )

  const isStepAlreadyDone = project.completed_steps?.['3'] === true

  const handleValidate = () => {
    completeStep(3, {
      onSuccess: () => navigate(`/projects/${project.id}/verification`),
    })
  }

  // Real-time analysis progress via SSE. Replaces the legacy poll on a
  // dead /analysis-progress endpoint (which was always returning 404 and
  // freezing the bar at 15 %).
  // Le run est détaché : pendant qu'il tourne (processing_status='analyzing'),
  // on RESTE sur l'écran de progression même si la passe 1 a déjà persisté
  // des exigences (fil de l'eau) — sinon la barre « sautait aux résultats »
  // à ~50 % et la 2e passe devenait invisible.
  const analysisRunning = project.processing_status === 'analyzing'
  const relireAnalyse = () => {
    queryClient.invalidateQueries({ queryKey: ['compliance', project.id] })
    queryClient.invalidateQueries({ queryKey: ['projects', project.id] })
  }
  const analysisSse = useProgressStream(project.id, {
    enabled: !isLoading && (items.length === 0 || analysisRunning),
    onComplete: relireAnalyse,
    // Échec : le projet porte la phrase du produit (processing_detail), relue ici ; le détail technique reste au journal.
    onError: relireAnalyse,
    // Lecture finie (ou en échec) avant l'abonnement : l'écran relit l'état final au lieu d'attendre une fin déjà passée.
    onRienEnCours: relireAnalyse,
  })

  // B1 — la lecture a-t-elle réellement démarré ? Le projet est relu après le lancement ; on laisse ce temps (2,5 s) avant
  // de conclure qu'aucune lecture ne tourne, pour ne pas alerter pendant que le lancement se confirme.
  const projetEnRelecture = useIsFetching({ queryKey: ['projects', project.id] }) > 0
  const [delaiDeGracePasse, setDelaiDeGracePasse] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setDelaiDeGracePasse(true), 2500)
    return () => clearTimeout(t)
  }, [])

  // ── Lot filter computation ────────────────────────────────────
  const lotFilterInfo = useMemo(() => {
    if (!project.selected_lot || project.selected_lot === 'all') return null
    const lotNum = project.selected_lot.replace(/^lot/i, '').replace(/^0+/, '') || '0'
    // R16 — même règle que le serveur : pièces communes et du lot analysées ; plans/informations et autres lots écartés.
    const r = repartirDocuments(projectDocs, project.selected_lot, (project.lots_detectes || []).map((l) => l.id))
    return {
      included: r.analyses,
      excluded: [...r.informations, ...r.autresLots],
      informations: r.informations.length,
      autresLots: r.autresLots.length,
      lotLabel: project.selected_lot_name || `Lot ${lotNum}`,
    }
  }, [projectDocs, project.selected_lot, project.selected_lot_name, project.lots_detectes])

  // ── Derived data for redesigned layout ────────────────────────
  const obligatoireCount = useMemo(
    () => items.filter(i => i.priority === 'obligatoire').length,
    [items],
  )

  const [showLotDetails, setShowLotDetails] = useState(false)
  // Le résumé de l'étape et « À vérifier » : faits déjà en base (champs critiques, pièces, analyse), aucun appel IA
  const faits = useFaitsAO(project)
  const { data: critiques } = useQuery<CriticalFieldsPayload>({
    queryKey: ['critical-fields', project.id],
    queryFn: async () => (await api.get<CriticalFieldsPayload>(`/projects/${project.id}/critical-fields`)).data,
    staleTime: 60_000,
    enabled: project.processing_status !== 'analyzing',
  })
  const aVerifier = useMemo(
    () => pointsAVerifier(critiques?.fields, project.infos_marche, items),
    [critiques, project.infos_marche, items],
  )
  const phraseDocuments = lotFilterInfo
    ? phraseDocumentsAnalyses({ analyses: lotFilterInfo.included.length, informations: lotFilterInfo.informations, autresLots: lotFilterInfo.autresLots })
    : null

  const TITRE = 'Décider'
  const UTILITE = 'Ce que le dossier demande, ce qui vous engage et les questions à poser à l’acheteur, avant de décider d’y répondre.'

  // ── Chargement, puis erreur (jamais « Analyse… 0 % » quand le serveur ne répond pas), puis les états de la lecture ──
  if (isLoading) return (
    <GabaritEtape titre={TITRE} utilite={UTILITE}>
      {/* Le squelette du gabarit (une surface au trait, des lignes de longueur de phrase) et ce que Synorix fait : jamais trois pavés muets. */}
      <div role="status" aria-busy="true" className="space-y-4">
        <p className="text-sm text-fg-2">Synorix ouvre l’analyse du dossier.</p>
        <SqueletteCorpsEtape cases={2} />
      </div>
    </GabaritEtape>
  )

  if (requeteExigences.isError && requeteExigences.data === undefined) return (
    <GabaritEtape titre={TITRE} utilite={UTILITE}>
      <EtatErreur
        titre="L’analyse du dossier n’a pas pu se charger"
        detail="Les exigences relevées dans le dossier n’ont pas pu être lues. Votre dossier et son analyse restent en place."
        onReessayer={() => { void requeteExigences.refetch() }}
        enCours={requeteExigences.isFetching}
      />
    </GabaritEtape>
  )

  // Échec du run détaché : statut erreur EXPLICITE + relance — jamais de régression d'étape ni d'attente infinie.
  const analysisFailed = analysisSse.phase === 'error' || project.processing_status === 'error'
  const relancerLecture = async () => {
    setAvis(null)
    setRelanceEnCours(true)
    try {
      await api.post(`/projects/${project.id}/analyze`, {}, { timeout: 60_000 })
      window.location.reload()
    } catch (err) {
      setAvis({ message: await messageErreur(err, 'La relance de l’analyse n’a pas abouti. Réessayez dans un instant.') })
      setRelanceEnCours(false)
    }
  }

  if (items.length === 0 && analysisFailed) return (
    <GabaritEtape titre={TITRE} utilite={UTILITE} message={avis && <Message ton="erreur">{avis.message}</Message>}>
      <Carte>
        <ProgressDisplay
          variant="page"
          steps={ANALYSIS_STEPS}
          currentStep={analysisSse.step}
          progress={analysisSse.progress}
          phase="error"
          erreur={project.processing_detail || analysisSse.detail || 'L’analyse du dossier s’est arrêtée avant la fin.'}
          uniteRendue
          onRelancer={relanceEnCours ? undefined : () => { void relancerLecture() }}
        />
      </Carte>
    </GabaritEtape>
  )

  // Un AO sans dossier déposé : rien à analyser, rien à relancer (jury, tour 1 : un AO neuf affichait un dossier
  // « enregistré » et un bouton pour relancer). Synorix le dit, avec le seul geste juste : déposer le dossier. Sans attendre le délai de grâce.
  const sansDepot = documentsLus && projectDocs.length === 0
  if (items.length === 0 && sansDepot && !analysisRunning) return (
    <GabaritEtape titre={TITRE} utilite={UTILITE}>
      <EtapeSansAnalyse project={project} cas="sans-depot" viendra={VIENDRA}>
        Aucun dossier n’est déposé pour cet appel d’offres. {enumerer(VIENDRA)} s’afficheront ici une fois le dossier analysé.
      </EtapeSansAnalyse>
    </GabaritEtape>
  )

  // B1 — le dossier est déposé, aucune analyse ne tourne : elle n'a pas été lancée (ou son lancement a échoué). Le geste : choisir les lots.
  if (lectureNonDemarree({
    nbExigences: items.length,
    statutTraitement: project.processing_status,
    phaseFlux: analysisSse.phase,
    donneesAJour: delaiDeGracePasse && !projetEnRelecture,
  })) return (
    <GabaritEtape titre={TITRE} utilite={UTILITE}>
      <EtapeSansAnalyse project={project} cas="analyse-non-lancee" viendra={VIENDRA}>
        Le dossier est déposé, son analyse n’est pas encore lancée. {enumerer(VIENDRA)} s’afficheront ici une fois l’analyse faite.
      </EtapeSansAnalyse>
    </GabaritEtape>
  )

  // La lecture tourne : l'écran d'attente est DANS la page (plus de fenêtre par-dessus un écran vide).
  if (items.length === 0 || (analysisRunning && analysisSse.phase !== 'complete')) return (
    <GabaritEtape titre={TITRE} utilite={UTILITE}>
      <Carte>
        <ProgressDisplay
          variant="page"
          title="Synorix analyse votre dossier"
          steps={ANALYSIS_STEPS}
          currentStep={analysisSse.step}
          progress={analysisSse.progress}
          detail={analysisSse.detail || 'Analyse de vos documents : chaque exigence est relevée avec sa source.'}
          phase={analysisSse.phase}
          avis={avisAttente}
          onArrierePlan={() => navigate('/dashboard')}
          libelleArrierePlan="Revenir à l’accueil"
        />
      </Carte>
    </GabaritEtape>
  )

  // ── Barre du bas : le bilan à l'ordinateur ; au téléphone elle porte l'action de l'étape ───────
  const bilan = `${items.length} exigences dont ${obligatoireCount} à respecter impérativement`
  const bottomBar = (
    <BarreEtape>
      <BilanBarre bureau={bilan} tel={`${items.length} exigences`} />
      <ActionsBarre>
        <ActionsBarreTel>
          <BoutonSuite etape="Pièces" onClick={handleValidate} enCours={isValidating} enCoursLibelle="Validation…" />
        </ActionsBarreTel>
      </ActionsBarre>
    </BarreEtape>
  )

  const voirSource = (src: FieldSource) => { void openFieldSource(src) }
  // Les faits du marché, remise des offres et pièces comprises (la bande de quatre cases égales est partie : une date, une
  // phrase, un compteur et un nombre n'ont pas la même nature, et « 448 exigences » n'est pas ce qui décide).
  const marche = faits.filter((f) => ['acheteur', 'objet', 'lots', 'remise', 'criteres', 'delai', 'pieces'].includes(f.id))
  const selectionId = selection?.type === 'exigence' ? selection.id : null

  // ── Main render ───────────────────────────────────────────────

  return (
    <GabaritEtape
      titre="Décider"
      utilite={UTILITE}
      // A1 — l'action de l'écran est la décision : « On y va » (même validation), puis « Passer aux pièces » une fois l'étape faite.
      actionPrincipale={
        <Bouton variante="principal" onClick={handleValidate} enCours={isValidating} libelleEnCours="Validation…">
          {isStepAlreadyDone ? 'Passer aux pièces' : 'On y va'}
        </Bouton>
      }
      // Une lecture en échec se dit, même quand une lecture précédente a laissé des exigences à l'écran.
      message={analysisFailed && (
        <Message ton="attention" titre="La dernière analyse s’est arrêtée avant la fin"
          action={<Bouton variante="secondaire" onClick={() => navigate(`/projects/${project.id}/lots`)}>Relancer l’analyse</Bouton>}>
          La liste des exigences ci-dessous peut être partielle.
        </Message>
      )}
      barre={bottomBar}
    >
      {/* L'ordre de l'écran (jury, tour 1 : la décision était la quatrième section, à 1 700 px du haut) : la décision d'abord,
          avec les faits du marché à côté ; ce qui est à vérifier ; puis ce qui prépare la décision, et le détail replié. */}
      <div className="grid items-start gap-x-6 gap-y-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <SectionEtape titre="Décision">
          <SynorixScoreCard project={project} onOpenSource={openFieldSource} onYAller={handleValidate} enCours={isValidating} />
        </SectionEtape>
        {marche.length > 0 && (
          <SectionEtape titre="Le marché en bref">
            <CarteAO30sVue faits={marche} titre={null} onOpenSource={voirSource} />
          </SectionEtape>
        )}
      </div>

      <AVerifierAvantEngagement points={aVerifier} onVoir={voirSource} onVoirPenalites={voirTresorerie} />

      {/* ── TRÉSORERIE (C19) + RÉTRO-PLANNING (C20) : chacune à sa hauteur ── */}
      <SectionEtape titre="Trésorerie et calendrier" colonnes={2} classeContenu="items-start md:[&>*:only-child]:col-span-2">
        <TresorerieCard projectId={project.id} onOpenSource={openFieldSource} />
        <RetroPlanning projectId={project.id} />
      </SectionEtape>

      <PointsAEclaircir project={project} onOpenSource={voirSource} />

      {/* ── LISTE | PANNEAU « Voir dans le dossier » (ordinateur : côte à côte ; téléphone : feuille) ── */}
      <SectionEtape
        titre="Les exigences du dossier"
        description={
          <>
            {/* Une analyse arrêtée avant la fin : le compte n'est pas affiché comme certain (jury, tour 1) */}
            {analysisFailed && <span className="font-medium text-ambre-ink">Liste peut-être partielle (la dernière analyse s’est arrêtée avant la fin). </span>}
            <span className="font-semibold text-fg">{analysisFailed ? 'Au moins ' : ''}{items.length} exigences identifiées</span>
            {project.selected_lot_name ? ` pour ${project.selected_lot_name}` : ''}. {phraseExigences(items.length, obligatoireCount)}.
            {lotFilterInfo && phraseDocuments && (
              <>
                {' '}{phraseDocuments.principale}.{' '}
                <Bouton variante="lien" aria-expanded={showLotDetails} aria-controls={idDetailLot} onClick={() => setShowLotDetails((v) => !v)}>
                  {showLotDetails ? 'Masquer le détail' : 'Voir le détail'}
                </Bouton>
              </>
            )}
          </>
        }
      >
        {showLotDetails && lotFilterInfo && (
          <div id={idDetailLot} className="grid gap-x-6 gap-y-4 rounded-carte border border-bord bg-surface-0 px-5 py-4 text-sm sm:grid-cols-2">
            {/* Deux listes bornées (elles ajoutaient 1 200 px à la page) : on défile dans la liste, pas dans l'écran. */}
            <div className="min-w-0">
              <p className="font-medium text-fg">{titresDetailDocuments(lotFilterInfo.included.length, lotFilterInfo.excluded.length).analyses}</p>
              <ul className="mt-1.5 max-h-56 divide-y divide-bord overflow-y-auto text-fg-2">{lotFilterInfo.included.map((doc) => <li key={doc.id} className="break-words py-1">{doc.file_name}</li>)}</ul>
            </div>
            {lotFilterInfo.excluded.length > 0 && (
              <div className="min-w-0">
                <p className="font-medium text-fg">{titresDetailDocuments(lotFilterInfo.included.length, lotFilterInfo.excluded.length).ecartes}</p>
                <ul className="mt-1.5 max-h-56 divide-y divide-bord overflow-y-auto text-fg-2">{lotFilterInfo.excluded.map((doc) => <li key={doc.id} className="break-words py-1">{doc.file_name}</li>)}</ul>
              </div>
            )}
          </div>
        )}
        {phraseDocuments?.detail && <p className="max-w-2xl text-xs text-fg-3">{phraseDocuments.detail}</p>}

        <div className={selection ? 'grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]' : undefined}>
          <div className={selection ? 'min-w-0 space-y-3 lg:pb-24' : 'min-w-0 space-y-3'}>
            <div className="flex flex-wrap items-center gap-2">
              <ChampRecherche
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher une clause ou une exigence"
                aria-label="Rechercher une clause ou une exigence"
                className="min-w-0 flex-1 basis-64"
              />
              {/* Sélecteur de lot (multi-lots mutualisé) */}
              {analyzedLots.length > 1 && (
                <ListeDeroulante
                  libelle="Lot affiché"
                  className="w-64 max-w-full"
                  valeur={activeLot ?? undefined}
                  onChange={setViewLot}
                  options={analyzedLots.map((l) => ({ valeur: l, libelle: (project.lots_detectes || []).find((d) => d.id === l)?.nom ?? l }))}
                />
              )}
            </div>

            {/* Les catégories repliables SONT la navigation (jury, tour 1 : cinq puces à compteur juste au-dessus de cinq sections du même
                nom). Reste, quand une recherche est en cours, de quoi l'effacer. */}
            <EffacerFiltres actifs={search.trim() ? 1 : 0} onEffacer={() => setSearch('')} />

            {filtered.length === 0 ? (
              <EtatVide
                titre="Aucune exigence ne correspond"
                phrase="Aucune exigence du dossier ne contient ces mots dans cette catégorie."
                parFiltre={() => { setActiveFilter('all'); setSearch('') }}
              />
            ) : (
              <div className="space-y-3">
                {Object.entries(grouped).map(([cat, catItems]) => (
                  <ExigenceSection
                    key={cat}
                    category={cat as ComplianceCategory}
                    items={catItems}
                    onOpenSource={openSourceDocument}
                    selectionId={selectionId}
                    defaultOpen={search.trim().length > 0}
                  />
                ))}
              </div>
            )}
          </div>
          {selection && (
            <PanneauSource
              key={selection.type === 'exigence' ? selection.id : `champ-${selection.reponse.doc_id}-${selection.reponse.page}`}
              selection={selection}
              onFermer={fermerSelection}
              rendreTableur={(reponse) => selection.type === 'exigence'
                ? <div className="source-vue"><VueTableau exigenceId={selection.id} ancre={enAncreTableur(reponse)} /></div>
                : null}
            />
          )}
        </div>
      </SectionEtape>
    </GabaritEtape>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
//  Les exigences : une section repliable par catégorie (A15), un tableau du système par section (pages de 50)
// ═════════════════════════════════════════════════════════════════════════════

function ExigenceSection({
  category, items, onOpenSource, selectionId, defaultOpen = false,
}: {
  category: ComplianceCategory
  items: ComplianceItem[]
  onOpenSource: (item: ComplianceItem) => void
  selectionId: string | null
  defaultOpen?: boolean
}) {
  // Section REPLIABLE : avec 400 exigences et plus, tout ouvrir rend la page interminable.
  const [open, setOpen] = useState(defaultOpen)
  const idContenu = useId()
  const colonnes: ColonneTableau<ComplianceItem>[] = [
    { cle: 'exigence', titre: 'Exigence', rendu: (item) => <ExigenceTexte item={item} active={item.id === selectionId} /> },
    {
      cle: 'source', titre: 'Source', tel: true, classe: 'md:w-64',
      rendu: (item) => {
        const page = pageCitee(item)
        return aUneSource(item)
          ? <span className="break-words text-accent-text">{item.source_document}{page ? ` · page ${page}` : ''}</span>
          : null
      },
    },
    {
      cle: 'priorite', titre: 'Portée', tel: true, classe: 'md:w-36',
      // Du texte : 443 exigences sur 448 sont obligatoires, une pastille sur chaque ligne ne distingue rien. L'exception
      // (« Souhaitée ») se lit en plus clair.
      rendu: (item) => item.priority === 'obligatoire'
        ? <span className="text-fg">Obligatoire</span>
        : <span className="text-fg-3">Souhaitée</span>,
    },
  ]

  return (
    <section data-categorie={category} className="space-y-2">
      <h3>
        <Bouton variante="discret" aria-expanded={open} aria-controls={idContenu} onClick={() => setOpen((o) => !o)}
          className="w-full justify-between px-2 text-base font-semibold text-fg">
          <span>{CATEGORY_LABELS[category]} <span className="chiffres font-medium text-fg-3">({items.length})</span></span>
          <ChevronDown aria-hidden strokeWidth={1.5} className={cn('transition-transform duration-survol ease-survol', open && 'rotate-180')} />
        </Bouton>
      </h3>
      <div id={idContenu} hidden={!open}>
        {open && (
          <Tableau
            libelle={`Exigences : ${CATEGORY_LABELS[category]}`}
            colonnes={colonnes}
            lignes={items}
            cle={(item) => item.id}
            onLigne={onOpenSource}
            vide={null}
          />
        )}
      </div>
    </section>
  )
}

const aUneSource = (item: ComplianceItem): boolean => Boolean(item.source_document && (item.source_excerpt || item.source_page))

/** Le texte d'une exigence. Visible à l'écran : sa source se prépare avant le clic (file bornée, voir services/sources.ts). */
function ExigenceTexte({ item, active }: { item: ComplianceItem; active: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const entree = useCallback(() => precharger(item.id), [item.id])
  const sortie = useCallback(() => abandonner(item.id), [item.id])
  useVisible(ref, aUneSource(item), entree, sortie)

  return (
    <div ref={ref} className="exigence-ligne -mx-2 rounded-md px-2 py-1" aria-current={active ? 'true' : undefined}>
      <p className="max-w-md break-words text-fg">{item.exigence_text}</p>
      {item.suggestion_ia && <p className="mt-0.5 text-xs text-fg-2">{item.suggestion_ia}</p>}
    </div>
  )
}
