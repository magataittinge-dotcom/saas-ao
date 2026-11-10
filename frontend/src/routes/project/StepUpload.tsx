import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { Sigle } from '@/components/common/Sigle'
import { useDropzone } from 'react-dropzone'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CloudUpload, Trash2 } from 'lucide-react'
import { api } from '@/services/api'
import { messageErreur } from '@/lib/erreurs'
import { uploadService } from '@/services/upload'
import ProgressDisplay, { type StepDescriptor } from '@/components/common/ProgressDisplay'
import { useProgressStream } from '@/hooks/useProgressStream'
import type { Project, ProjectDocument, ProjectDocumentType } from '@/types'
import { libelleType, optionsType, valeurListe } from '@/lib/typesPieces'
import { tailleFichier, progressionEnvoi } from '@/lib/tailleFichier'
import { cn } from '@/lib/utils'
import BarreEtape, { ActionsBarre, BilanBarre, BoutonSecondaire, BoutonSuite } from '@/components/project/BarreEtape'
import VaultSavePrompt, { type VaultSuggestion } from '@/components/vault/VaultSavePrompt'
import { takePendingUpload } from '@/lib/pendingUpload'
import { GabaritEtape, BandeResume, SectionEtape, ActionsBarreTel } from '@/components/etape'
import { Bouton } from '@/components/ui/bouton'
import { Carte } from '@/components/ui/carte'
import { DialogueConfirmation } from '@/components/ui/dialogue'
import { EtatErreur, EtatRequete, EtatVide } from '@/components/ui/etats'
import { ListeDeroulante } from '@/components/ui/liste-deroulante'
import { MenuElement, MenuPoints } from '@/components/ui/menu'
import { Message } from '@/components/ui/message'
import { Squelette } from '@/components/ui/squelette'
import { Tableau, type ColonneTableau } from '@/components/ui/tableau'
import { cartesDepot, ETATS_LECTURE_SERVEUR } from '@/lib/depotDossier'
import CarteLotUnique from '@/components/depot/CarteLotUnique'
import EntreeFichier from '@/components/depot/EntreeFichier'
import EcransLecture from '@/components/project/EcransLecture'
import { useLancerLecture } from '@/hooks/useLancerLecture'
import { useLotsDuDepot } from '@/hooks/useLotsDuDepot'

const UPLOAD_STEPS: StepDescriptor[] = [
  { key: 'uploading',       label: 'Transfert du dossier',   estimated_s: 30 },
  { key: 'extracting_zip',  label: 'Extraction du ZIP',      estimated_s: 5 },
  { key: 'extracting_text', label: 'Indexation des documents', estimated_s: 60 },
]

const FORMATS_ACCEPTES = 'PDF, Word, Excel, OpenDocument ou ZIP, jusqu’à 2 Go'
const TOUS = 'tous'
// L'ordre des groupes de la liste : les pièces du contrat d'abord, puis les plans et les annexes, « Autre » en dernier.
const ORDRE_TYPES = optionsType('autre').map((o) => o.value)

type Phase = 'idle' | 'uploading' | 'processing' | 'done'

function detectDocType(filename: string): ProjectDocumentType {
  const lower = filename.toLowerCase()
  if (/\brc\b/.test(lower) || /r[eè]glement/.test(lower)) return 'rc'
  if (/\bcctp\b/.test(lower)) return 'cctp'
  if (/\bdpgf\b|\bbpu\b/.test(lower)) return 'dpgf'
  if (/attri/.test(lower) || /acte.{0,6}engagement/i.test(lower)) return 'acte_engagement'
  if (/\bplan\b|\bplans?\b/.test(lower)) return 'plan'
  return 'autre'
}

interface Props { project: Project }

export default function StepUpload({ project }: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [uploading, setUploading] = useState<Record<string, boolean>>({})

  // ─── Simple progress state ─────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('idle')
  const [displayPct, setDisplayPct] = useState(0)
  const [label, setLabel] = useState('')
  const [sublabel, setSublabel] = useState('')
  const [uploadErrors, setUploadErrors] = useState<string[]>([])
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([])
  const [vaultPrompts, setVaultPrompts] = useState<VaultSuggestion[]>([])
  // 1.13 — aucune perte en un clic : chaque suppression est confirmée, nommée
  const [aSupprimer, setASupprimer] = useState<{ tous: true } | { doc: ProjectDocument } | null>(null)
  const [suppression, setSuppression] = useState(false)
  const [erreurSuppression, setErreurSuppression] = useState<string | null>(null)
  const [filtreType, setFiltreType] = useState(TOUS)
  const [largeFileNotice, setLargeFileNotice] = useState<{ message: string; tone: 'cyan' | 'orange' } | null>(null)
  const [nextError, setNextError] = useState<string | null>(null)
  const [isNavigating, setIsNavigating] = useState(false)

  // Interval refs for cleanup
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const doneRef = useRef(false)
  const lastProgressUpdateRef = useRef(0)

  // Le serveur lit le dossier même quand l'utilisateur est parti : à son retour la lecture est encore affichée (statut du projet).
  const lectureServeur = ETATS_LECTURE_SERVEUR.includes(project.processing_status ?? '')
  // Une erreur de chargement n'est jamais un dépôt vide : la requête passe par <EtatRequete> (chargement → erreur → contenu).
  const requeteDocuments = useQuery({
    queryKey: ['project-documents', project.id],
    queryFn: async () => {
      const { data } = await api.get<ProjectDocument[]>(`/projects/${project.id}/documents`)
      return data
    },
    // Pendant la lecture, les pièces reconnues apparaissent au fur et à mesure
    refetchInterval: phase === 'processing' || lectureServeur ? 3000 : false,
  })
  const documents = useMemo(() => requeteDocuments.data ?? [], [requeteDocuments.data])

  const { mutateAsync: deleteDoc } = useMutation({
    mutationFn: (docId: string) => api.delete(`/projects/${project.id}/documents/${docId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project-documents', project.id] }),
  })

  // ─── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (animRef.current) clearInterval(animRef.current)
      if (pollRef.current) clearInterval(pollRef.current)
      if (safetyRef.current) clearTimeout(safetyRef.current)
    }
  }, [])

  const processingStartedRef = useRef(false)

  // De retour sur la page pendant que le serveur lit encore : l'avancement du projet est relu toutes les 3 s
  useEffect(() => {
    if (!lectureServeur || phase !== 'idle') return
    const t = window.setInterval(() => { void queryClient.invalidateQueries({ queryKey: ['projects', project.id] }) }, 3000)
    return () => window.clearInterval(t)
  }, [lectureServeur, phase, project.id, queryClient])

  // ─── Backend extraction tracked via SSE on /progress-stream ──────────────
  // (replaces the legacy 2s polling on /processing-status). The SSE hook
  // handles reconnect + fallback automatically.
  // SSE ouvert dès l'ENVOI : le middleware serveur publie la progression de
  // réception réelle (0-30) pendant que FastAPI lit le multipart — c'était
  // la fenêtre muette responsable du gel à 30 %.
  const sse = useProgressStream(project.id, {
    enabled: phase === 'uploading' || phase === 'processing',
    onComplete: () => {
      doneRef.current = true
      setDisplayPct(100)
      setLabel('Traitement terminé')
      setSublabel('')
      setPhase('done')
      queryClient.invalidateQueries({ queryKey: ['project-documents', project.id] })
      queryClient.invalidateQueries({ queryKey: ['projects', project.id] })
      setLargeFileNotice(null)
      if (safetyRef.current) { clearTimeout(safetyRef.current); safetyRef.current = null }
      setTimeout(() => { setPhase('idle'); setDisplayPct(0) }, 1000)
    },
    onError: () => {
      doneRef.current = true
      setUploadErrors(prev => [...prev, 'La lecture du dossier s’est arrêtée avant la fin. Vos fichiers sont conservés : déposez-les à nouveau pour reprendre.'])
      setPhase('idle')
      if (safetyRef.current) { clearTimeout(safetyRef.current); safetyRef.current = null }
    },
  })

  // Map the SSE progress into the page's display state.
  // Le tracker serveur émet DÉJÀ l'échelle globale 0-100 (transfert 0-30,
  // extraction ZIP 30-40, indexation 40-100) : on l'affiche telle quelle —
  // l'ancien re-mapping 30+p×0,65 faisait sauter la barre de 30 à 49,5.
  useEffect(() => {
    if ((phase !== 'processing' && phase !== 'uploading') || doneRef.current) return
    // Pendant l'envoi, seuls les événements de réception (status uploading)
    // sont pris : un snapshot init d'un pipeline PRÉCÉDENT (progress 100)
    // ne doit pas faire sauter la barre.
    if (phase === 'uploading' && sse.step !== 'uploading') return
    // Cap 99 (pas 95) : les événements réels 96-99 de fin d'extraction
    // s'affichent — l'ancien cap créait un palier artificiel à 95.
    setDisplayPct(prev => Math.max(prev, Math.min(sse.progress, 99)))
    if (sse.detail) setSublabel(sse.detail)
    if (sse.step) setLabel(sse.step)
  }, [sse.progress, sse.detail, sse.step, phase])

  const startProcessing = useCallback(() => {
    if (processingStartedRef.current || doneRef.current) return
    processingStartedRef.current = true

    setPhase('processing')
    setDisplayPct(prev => Math.max(prev, 25))
    setLabel("Extraction de l'archive...")
    setSublabel('')

    // Hard timeout safety net (10 minutes) in case neither SSE nor fallback
    // ever delivers a complete event (network split-brain).
    safetyRef.current = setTimeout(() => {
      if (doneRef.current) return
      doneRef.current = true
      setDisplayPct(100)
      setLabel('Traitement terminé')
      setPhase('done')
      queryClient.invalidateQueries({ queryKey: ['project-documents', project.id] })
      setTimeout(() => { setPhase('idle'); setDisplayPct(0) }, 1000)
    }, 600_000)
  }, [project.id, queryClient])

  // ─── File drop handler ─────────────────────────────────────────────────────
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return
      setUploadErrors([])
      setUploadWarnings([])
      const largestSize = acceptedFiles.reduce((m, f) => Math.max(m, f.size), 0)
      const MB = 1024 * 1024
      const GB = 1024 * MB
      const mb = Math.round(largestSize / MB)
      if (largestSize > 1 * GB) {
        setLargeFileNotice({
          tone: 'orange',
          message: `Dossier très volumineux détecté (${mb} Mo). Envoi jusqu'à 15 minutes selon votre connexion. Restez sur cette page.`,
        })
      } else if (largestSize > 500 * MB) {
        setLargeFileNotice({
          tone: 'cyan',
          message: 'Envoi volumineux, ~3-7 minutes. Ne fermez pas l\'onglet.',
        })
      } else if (largestSize > 100 * MB) {
        setLargeFileNotice({
          tone: 'cyan',
          message: 'Envoi en cours, ~1-3 minutes.',
        })
      } else {
        setLargeFileNotice(null)
      }
      setPhase('uploading')
      setDisplayPct(0)
      setLabel('Envoi des fichiers…')
      setSublabel('')
      processingStartedRef.current = false
      doneRef.current = false
      lastProgressUpdateRef.current = 0

      const errors: string[] = []
      const warnings: string[] = []
      let hasZip = false

      for (let i = 0; i < acceptedFiles.length; i++) {
        const file = acceptedFiles[i]
        setUploading((prev) => ({ ...prev, [file.name]: true }))
        if (file.name.toLowerCase().endsWith('.zip')) hasZip = true
        try {
          const detectedType = detectDocType(file.name)
          const result = await uploadService.uploadProjectDocument(
            project.id, file, detectedType,
            ({ loaded, total }) => {
              const isComplete = total > 0 && loaded >= total
              const now = Date.now()
              if (!isComplete && now - lastProgressUpdateRef.current < 500) return
              lastProgressUpdateRef.current = now

              const filePct = total > 0 ? loaded / total : 0
              const overallPct = ((i + filePct) / acceptedFiles.length) * 100
              const mapped = Math.round(Math.min(overallPct, 100) * 0.25)
              // max : la réception serveur (SSE) peut être devant l'envoi
              // axios throttlé — jamais de retour en arrière.
              setDisplayPct(prev => Math.max(prev, mapped))

              setSublabel(progressionEnvoi(loaded, total, Math.round(overallPct)))

              if (hasZip && isComplete) {
                startProcessing()
              }
            },
          )
          if (result && typeof result === 'object' && 'warnings' in result) {
            const w = (result as { warnings?: string[] }).warnings
            if (w && w.length > 0) warnings.push(...w)
          }
          // C16 — doc perso reconnu → bandeau coffre-fort (non-bloquant)
          if (result && typeof result === 'object' && 'vault_suggestion' in result) {
            const r = result as { id: string; file_name: string; vault_suggestion?: { type: string; category: string } | null }
            if (r.vault_suggestion) {
              const s: VaultSuggestion = {
                docId: r.id, fileName: r.file_name,
                type: r.vault_suggestion.type, category: r.vault_suggestion.category,
              }
              setVaultPrompts((prev) => prev.some(p => p.docId === s.docId) ? prev : [...prev, s])
            }
          }
          queryClient.invalidateQueries({ queryKey: ['project-documents', project.id] })
        } catch (err) {
          errors.push(`${file.name} : ${await messageErreur(err, 'l’envoi n’a pas abouti. Vérifiez votre connexion, puis déposez-le à nouveau.')}`)
        } finally {
          setUploading((prev) => ({ ...prev, [file.name]: false }))
        }
      }

      if (errors.length > 0) {
        setUploadErrors(errors)
        if (animRef.current) { clearInterval(animRef.current); animRef.current = null }
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
        if (safetyRef.current) { clearTimeout(safetyRef.current); safetyRef.current = null }
        processingStartedRef.current = false
        setPhase('idle')
        setDisplayPct(0)
        setLargeFileNotice(null)
      } else if (!hasZip) {
        setPhase('idle')
        setDisplayPct(0)
        setLargeFileNotice(null)
      }

      if (warnings.length > 0) setUploadWarnings(warnings)
    },
    [project.id, queryClient, startProcessing],
  )

  // C15 — fichier déposé sur l'écran d'accueil (premier AO offert) :
  // récupéré une seule fois au montage et uploadé automatiquement.
  useEffect(() => {
    const pending = takePendingUpload()
    if (pending) onDrop([pending])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    onDropRejected: (files) => {
      const msgs = files.map((f) => {
        const name = f.file.name.toLowerCase()
        if (name.endsWith('.rar') || name.endsWith('.7z')) {
          return `${f.file.name} : les archives .rar et .7z ne sont pas lues. Convertissez-la en .zip, puis déposez-la.`
        }
        if (f.errors.some((e) => e.code === 'file-too-large')) return `${f.file.name} : ce fichier dépasse 2 Go.`
        return `${f.file.name} : ce format n’est pas lu. ${FORMATS_ACCEPTES}.`
      })
      setUploadErrors(msgs)
    },
    noClick: true,
    accept: {
      'application/pdf':        ['.pdf'],
      'application/msword':     ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.ms-excel':                                                ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':       ['.xlsx'],
      'application/vnd.ms-excel.sheet.macroEnabled.12':                          ['.xlsm'],
      'application/vnd.oasis.opendocument.spreadsheet': ['.ods'],
      'application/zip':              ['.zip'],
      'application/x-zip-compressed': ['.zip'],
      'application/octet-stream':     ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.xlsm', '.zip', '.ods'],
    },
    maxSize: 2 * 1024 * 1024 * 1024,
  })

  const updateDocType = async (docId: string, type: ProjectDocumentType) => {
    await api.patch(`/projects/${project.id}/documents/${docId}`, { type })
    queryClient.invalidateQueries({ queryKey: ['project-documents', project.id] })
  }

  const hasDocuments = documents.length > 0
  const totalBytes = documents.reduce((s, d) => s + (d.file_size || 0), 0)
  const anyUploading = Object.values(uploading).some(Boolean)
  const isProcessing = phase !== 'idle' || lectureServeur
  const enLecture = phase === 'uploading' || phase === 'processing' || phase === 'done' || lectureServeur

  const handleNext = () => {
    setNextError(null)
    setIsNavigating(true)
    navigate(`/projects/${project.id}/lots`)
  }

  // Un seul lot (ou un marché unique) : l'écran Lots est sauté, mais la lecture ne part qu'au clic (elle décompte 1 unité).
  const lecture = useLancerLecture(project)
  const depotFini = hasDocuments && !anyUploading && !isProcessing && project.status !== 'analyzed' && (project.current_step ?? 1) <= 2
  const { lotUnique, ecartes } = useLotsDuDepot(project, { actif: depotFini, signature: documents.map((d) => d.id).join(',') })
  const lireLeLotUnique = () => {
    if (!lotUnique || lecture.isAnalyzing || lecture.isSuccess) return
    void lecture.lancer(lotUnique.id ? [lotUnique.id] : [], lotUnique.designation)
  }
  const erreurAffichee = nextError ?? lecture.analysisError

  // 1.13 — aucune perte en un clic : chaque suppression est confirmée, nommée ; un échec se dit dans le dialogue.
  const confirmerSuppression = async () => {
    if (!aSupprimer) return
    setSuppression(true)
    setErreurSuppression(null)
    try {
      if ('tous' in aSupprimer) await Promise.all(documents.map((d) => deleteDoc(d.id)))
      else await deleteDoc(aSupprimer.doc.id)
      setASupprimer(null)
    } catch (err) {
      setErreurSuppression(await messageErreur(err, 'La suppression n’a pas abouti. Réessayez.'))
    } finally {
      setSuppression(false)
    }
  }

  // ── La liste des pièces : groupée par type (les pièces du contrat d'abord), filtrable, par pages de 50 ──
  const lignes = useMemo(() => {
    const rang = (d: ProjectDocument) => { const i = ORDRE_TYPES.indexOf(valeurListe(d.type)); return i === -1 ? ORDRE_TYPES.length : i }
    return [...documents]
      .filter((d) => filtreType === TOUS || valeurListe(d.type) === filtreType)
      .sort((a, b) => rang(a) - rang(b) || a.file_name.localeCompare(b.file_name, 'fr', { numeric: true }))
  }, [documents, filtreType])
  const optionsFiltre = useMemo(() => {
    const comptes = new Map<string, number>()
    for (const d of documents) comptes.set(valeurListe(d.type), (comptes.get(valeurListe(d.type)) ?? 0) + 1)
    return [
      { valeur: TOUS, libelle: `Toutes les pièces (${documents.length})` },
      ...ORDRE_TYPES.filter((t) => comptes.has(t)).map((t) => ({ valeur: t, libelle: `${libelleType(t)} (${comptes.get(t)})` })),
    ]
  }, [documents])

  const colonnes: ColonneTableau<ProjectDocument>[] = [
    { cle: 'nom', titre: 'Fichier', rendu: (doc) => <span className="block min-w-0 break-words font-medium">{doc.file_name}</span> },
    {
      cle: 'type', titre: 'Reconnu comme', tel: true, classe: 'md:w-72',
      rendu: (doc) => (
        <ListeDeroulante
          libelle={`Type de ${doc.file_name}`}
          valeur={valeurListe(doc.type)}
          onChange={(v) => { void updateDocType(doc.id, v as ProjectDocumentType) }}
          options={optionsType(doc.type).map(({ value, label: l }) => ({ valeur: value, libelle: l }))}
        />
      ),
    },
    { cle: 'taille', titre: 'Taille', nombre: true, tel: true, classe: 'md:w-28', rendu: (doc) => tailleFichier(doc.file_size) },
    {
      cle: 'menu', titre: '', classe: 'md:w-16 max-md:!block max-md:absolute max-md:right-2 max-md:top-1',
      rendu: (doc) => (
        <MenuPoints libelle={`Autres actions pour ${doc.file_name}`}>
          <MenuElement danger onSelect={() => setASupprimer({ doc })}><Trash2 aria-hidden size={16} strokeWidth={1.5} />Supprimer du dossier</MenuElement>
        </MenuPoints>
      ),
    },
  ]

  // Sans réponse du serveur, on ne sait pas s'il n'y a rien : ni « Aucun fichier », ni invitation à déposer.
  const chargementEchoue = requeteDocuments.isError && requeteDocuments.data === undefined
  const suiteBloquee =!hasDocuments || anyUploading || isProcessing || isNavigating
  // A7 — un seul lot : l'action de l'écran est « Lire ce dossier » (en-tête à l'ordinateur, barre du bas au téléphone).
  const actionLecture = (
    <Bouton variante="principal" onClick={lireLeLotUnique} disabled={lecture.isAnalyzing || lecture.isSuccess}>
      Lire ce dossier
    </Bouton>
  )
  const erreursEnvoi = uploadErrors.length > 0 && (
    <Message ton="erreur" titre={uploadErrors.length > 1 ? 'Ces fichiers n’ont pas été envoyés' : 'Ce fichier n’a pas été envoyé'} onFermer={() => setUploadErrors([])}>
      <ul className="grid gap-0.5">{uploadErrors.map((err, i) => <li key={i} className="break-words">{err}</li>)}</ul>
    </Message>
  )

  return (
    <>
      <DialogueConfirmation
        ouvert={aSupprimer !== null}
        onOuvert={(o) => { if (!o) { setASupprimer(null); setErreurSuppression(null) } }}
        danger
        titre={!aSupprimer ? '' : 'tous' in aSupprimer
          ? `Supprimer les ${documents.length} fichiers du dossier ?`
          : `Supprimer « ${aSupprimer.doc.file_name} » ?`}
        description={aSupprimer && 'tous' in aSupprimer
          ? 'Les fichiers ne seront plus dans le dossier de cet AO.'
          : 'Le fichier ne sera plus dans le dossier de cet AO.'}
        libelleConfirmer="Supprimer"
        libelleEnCours="Suppression…"
        enCours={suppression}
        erreur={erreurSuppression}
        onConfirmer={() => { void confirmerSuppression() }}
      />

      <EcransLecture lecture={lecture} />

      <GabaritEtape
        titre="Dépôt du dossier"
        utilite="Déposez le dossier reçu de l’acheteur : Synorix reconnaît chaque pièce et chaque lot, puis vous choisissez ce que vous lisez."
        actionPrincipale={!hasDocuments ? undefined : lotUnique ? actionLecture : (
          <BoutonSuite etape="Lots" onClick={handleNext} disabled={suiteBloquee} />
        )}
        message={erreurAffichee && <Message ton="erreur" titre="La lecture n’a pas démarré">{erreurAffichee}</Message>}
        resume={hasDocuments ? <BandeResume cartes={cartesDepot(documents, project, lotUnique)} libelle="Le dossier déposé" /> : undefined}
        barre={
          <BarreEtape>
            <BilanBarre
              bureau={chargementEchoue ? null : hasDocuments
                ? `${documents.length} fichier${documents.length > 1 ? 's déposés' : ' déposé'} dans le dossier.`
                : 'Déposez le dossier pour continuer.'}
              tel={chargementEchoue ? null : hasDocuments ? `${documents.length} fichier${documents.length > 1 ? 's' : ''}` : 'Aucun fichier'}
            />
            <ActionsBarre>
              <BoutonSecondaire libelle="Retour" onClick={() => navigate(-1)} />
              <ActionsBarreTel>
                {lotUnique ? actionLecture : <BoutonSuite etape="Lots" onClick={handleNext} disabled={suiteBloquee} />}
              </ActionsBarreTel>
            </ActionsBarre>
          </BarreEtape>
        }
      >
        <EtatRequete
          requete={requeteDocuments}
          squelette={<Squelette className="h-80 w-full rounded-carte" />}
          erreur={(
            <EtatErreur
              titre="Le dossier n’a pas pu se charger"
              detail="La liste des fichiers déposés n’a pas pu être lue. Vos fichiers ne sont pas touchés."
              onReessayer={() => { void requeteDocuments.refetch() }}
              enCours={requeteDocuments.isFetching}
            />
          )}
          estVide={() => false}
          vide={null}
        >
          {() => (
            <div className="space-y-8">
              <SectionEtape titre="Le dossier de l’acheteur">
                <div
                  {...getRootProps()}
                  data-zone-depot={hasDocuments ? 'compacte' : 'grande'}
                  className={cn(
                    'rounded-carte border border-dashed transition-colors duration-survol ease-survol',
                    isDragActive ? 'border-accent-ring bg-accent-tint' : 'border-bord-champ bg-surface-1',
                    hasDocuments ? 'flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4' : 'grid min-h-80 place-items-center px-6 py-12 text-center',
                  )}
                >
                  <EntreeFichier {...getInputProps()} />
                  {hasDocuments ? (
                    <>
                      <CloudUpload aria-hidden size={20} strokeWidth={1.5} className="shrink-0 text-fg-3" />
                      <div className="min-w-0 flex-1 basis-56">
                        <p className="text-sm font-semibold text-fg">{isDragActive ? 'Lâchez les fichiers ici' : 'Une pièce de plus, un additif de l’acheteur ?'}</p>
                        <p className="mt-0.5 text-xs text-fg-3">{FORMATS_ACCEPTES}</p>
                      </div>
                      <Bouton variante="secondaire" onClick={open}>Ajouter des fichiers</Bouton>
                    </>
                  ) : (
                    <div className="grid justify-items-center">
                      <CloudUpload aria-hidden size={28} strokeWidth={1.5} className="text-fg-3" />
                      <p className="mt-4 text-lg font-semibold text-fg">
                        {isDragActive ? 'Lâchez les fichiers ici' : <>Déposez le <Sigle code="DCE" /> complet</>}
                      </p>
                      <p className="mt-1.5 max-w-md text-sm text-fg-2">
                        Le ZIP entier suffit : Synorix reconnaît chaque pièce et chaque lot.
                      </p>
                      <Bouton variante={enLecture ? 'secondaire' : 'principal'} className="mt-6" onClick={open} disabled={anyUploading}>Choisir des fichiers</Bouton>
                      <p className="mt-4 text-xs text-fg-3">{FORMATS_ACCEPTES}</p>
                    </div>
                  )}
                </div>

                {largeFileNotice && phase === 'uploading' && <Message ton="info">{largeFileNotice.message}</Message>}
                {erreursEnvoi}
                {uploadWarnings.length > 0 && (
                  <Message ton="attention" titre="Certains fichiers de l’archive n’ont pas pu être ouverts" onFermer={() => setUploadWarnings([])}>
                    <ul className="grid gap-0.5">{uploadWarnings.map((w, i) => <li key={i} className="break-words">{w}</li>)}</ul>
                  </Message>
                )}

                {/* C16 : une pièce de l'entreprise reconnue dans le dépôt, à ranger au coffre-fort */}
                {vaultPrompts.map((s) => (
                  <VaultSavePrompt
                    key={s.docId}
                    suggestion={s}
                    onDone={(docId) => setVaultPrompts((prev) => prev.filter(p => p.docId !== docId))}
                  />
                ))}
              </SectionEtape>

              {lotUnique && (
                <CarteLotUnique lot={lotUnique} ecartes={ecartes} onOuvrirLots={() => navigate(`/projects/${project.id}/lots`)} />
              )}

              {enLecture && (
                <SectionEtape titre="Lecture du dossier">
                  <Carte>
                    <ProgressDisplay
                      variant="inline"
                      steps={UPLOAD_STEPS}
                      currentStep={phase === 'uploading' ? 'uploading' : 'extracting_text'}
                      progress={Math.round(phase === 'idle' ? (project.processing_progress ?? 0) : displayPct)}
                      detail={phase === 'idle' ? (project.processing_detail || 'Lecture du dossier…') : (sublabel || label)}
                      phase={phase === 'done' ? 'complete' : 'in_progress'}
                      avis={phase === 'uploading'
                        ? 'Gardez cette page ouverte pendant l’envoi. Ensuite, vous pourrez la fermer : la lecture continue.'
                        : 'Vous pouvez fermer cette page : la lecture continue et l’AO reste dans « Mes AO ». Les pièces reconnues apparaissent ci-dessous au fur et à mesure.'}
                    />
                  </Carte>
                </SectionEtape>
              )}

              {hasDocuments && (
                <SectionEtape
                  titre="Pièces reconnues"
                  description={`${documents.length} fichier${documents.length > 1 ? 's' : ''}, ${tailleFichier(totalBytes)}. Les pièces du contrat d’abord, puis les plans et le reste.`}
                  action={(
                    <div className="flex flex-wrap items-center gap-2">
                      <ListeDeroulante libelle="Montrer un type de pièce" className="w-64 max-w-full" valeur={filtreType} onChange={setFiltreType} options={optionsFiltre} />
                      {documents.length > 1 && (
                        <MenuPoints libelle="Autres actions pour le dossier">
                          <MenuElement danger onSelect={() => setASupprimer({ tous: true })}><Trash2 aria-hidden size={16} strokeWidth={1.5} />Tout supprimer</MenuElement>
                        </MenuPoints>
                      )}
                    </div>
                  )}
                >
                  <Tableau
                    libelle="Pièces du dossier"
                    className="[&_tr]:relative max-md:[&_td:first-child]:pr-12"
                    colonnes={colonnes}
                    lignes={lignes}
                    cle={(doc) => doc.id}
                    vide={<EtatVide titre="Aucune pièce de ce type" phrase="Aucun fichier du dossier n’est rangé sous ce type." parFiltre={() => setFiltreType(TOUS)} />}
                  />
                </SectionEtape>
              )}
            </div>
          )}
        </EtatRequete>
      </GabaritEtape>
    </>
  )
}
