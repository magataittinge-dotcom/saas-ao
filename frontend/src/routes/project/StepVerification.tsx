import { useCallback, useMemo, useRef, useState } from 'react'
import { Sigle } from '@/components/common/Sigle'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import { Lock, Download, Upload, RefreshCw } from 'lucide-react'
import { api } from '@/services/api'
import { useCompleteStep } from '@/hooks/useProject'
import CandidatureSectionVault from '@/components/project/CandidatureSectionVault'
import CandidatureSectionTemplates from '@/components/project/CandidatureSectionTemplates'
import { ActionsBarre, BilanBarre, BoutonSuite } from '@/components/project/BarreEtape'
import { GabaritEtape, BandeResume, BarreEtape, SectionEtape, EtatElement } from '@/components/etape'
import { Bouton } from '@/components/ui/bouton'
import { Carte } from '@/components/ui/carte'
import { EtatErreur, EtatVide } from '@/components/ui/etats'
import { Message } from '@/components/ui/message'
import { PastilleEtat } from '@/components/ui/pastille'
import { Squelette } from '@/components/ui/squelette'
import EntreeFichier from '@/components/depot/EntreeFichier'
import { cn } from '@/lib/utils'
import { cartesPieces, comptesDetailles, phraseComptes, phrasePiecesAutres } from '@/lib/resumePieces'
import VaultPickerModal from '@/components/project/VaultPickerModal'
import PanneauSource, { type SelectionSource } from '@/components/project/source/PanneauSource'
import { piecesComptees } from '@/components/project/NonConcerne'
import { comptesPieces } from '@/lib/statutPiece'
import { echeanceAO } from '@/lib/echeance'
import type { Project, ChecklistItem, Document } from '@/types'
import { messageErreur } from '@/lib/erreurs'
import { messageActualisation, type EtatActualisation } from '@/lib/actualisation'

interface Props { project: Project }

export default function StepVerification({ project }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  // Ouvre le coffre-fort en conservant le chemin de retour vers CETTE étape.
  const openVaultPage = () =>
    navigate(`/vault?returnTo=${encodeURIComponent(location.pathname)}`)
  const completeStep = useCompleteStep(project.id)
  const isAlreadyDone = project.completed_steps?.['4'] === true

  const requetePieces = useQuery({
    queryKey: ['checklist', project.id],
    queryFn: async () => {
      const { data } = await api.get<ChecklistItem[]>(`/projects/${project.id}/checklist`)
      return data
    },
  })
  const { isLoading } = requetePieces
  const items = useMemo(() => requetePieces.data ?? [], [requetePieces.data])

  const [pickerItem, setPickerItem] = useState<ChecklistItem | null>(null)

  // « Voir dans le DCE » : le passage du RC d'où la signature (ou la condition) a été lue.
  // Le panneau est celui de l'analyse : il lit l'ancre de l'exigence d'origine côté serveur.
  const [selection, setSelection] = useState<SelectionSource | null>(null)
  const fermerSelection = useCallback(() => setSelection(null), [])
  const ouvrirSource = useCallback((item: ChecklistItem) => {
    if (!item.source_exigence_id) return
    setSelection({ type: 'exigence', id: item.source_exigence_id, titre: item.source_document ?? undefined })
  }, [])

  // Typologie 4 groupes (document_group) : à fournir / à compléter / produit
  // par Synorix / workflow dédié. Le score ne compte que fournir + completer.
  const groups = useMemo(() => {
    const g: Record<'fournir' | 'completer' | 'synorix' | 'workflow', ChecklistItem[]> = {
      fournir: [], completer: [], synorix: [], workflow: [],
    }
    for (const item of items) {
      const key = (item.document_group as keyof typeof g) in g ? (item.document_group as keyof typeof g) : 'fournir'
      g[key].push(item)
    }
    return g
  }, [items])

  const vaultItems = groups.fournir
  const templateItems = groups.completer

  // Complétion = pièces sous responsabilité de l'entreprise (fournir + completer),
  // hors « Non concerné » (comme le score du serveur).
  const scored = piecesComptees([...vaultItems, ...templateItems])
  // « Prêt » : fait vérifié par le serveur (plan du ZIP), comme à l'Export. Les pièces
  // « Si concerné », « Facultatif » et « Pour l'attribution » ne sont pas à joindre maintenant.
  const echeance = echeanceAO(project)?.date?.slice(0, 10) ?? null
  // UN SEUL calcul des comptes (résumé, barre du bas, liste) : prêtes + à joindre + à renouveler = pièces demandées au dépôt
  const comptes = comptesDetailles(scored, echeance)
  const { aJoindre, pretes } = comptesPieces(scored, echeance)
  const pct = comptes.total > 0 ? Math.round((comptes.pretes / comptes.total) * 100) : 0
  // La pièce facultative (ou pour l'attribution) se nomme, elle ne se cache pas : même décompte qu'à l'Export (14 demandées + 1).
  const phraseAutres = phrasePiecesAutres(comptes)

  // ── Mutations ───────────────────────────────────────────────────
  // Rafraîchit la liste ET recalcule le score, sans quitter l'étape.
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['checklist', project.id] })
    queryClient.invalidateQueries({ queryKey: ['checklist-score', project.id] })
  }

  // R18 — « Actualiser » dit ce qu'il a fait : en cours, à jour, ou combien de pièces au lieu de combien.
  const [actualisation, setActualisation] = useState<EtatActualisation | null>(null)
  const nombreDePieces = (liste: ChecklistItem[]): number => {
    const suivies = liste.filter((i) => ['fournir', 'completer'].includes(i.document_group ?? 'fournir'))
    const c = comptesPieces(piecesComptees(suivies), echeance)
    return c.aJoindre + c.pretes
  }
  const actualiser = async () => {
    const avant = aJoindre + pretes
    setActualisation({ etat: 'en_cours' })
    try {
      await api.post(`/projects/${project.id}/checklist/regenerate`)
      await refresh()
      const apres = nombreDePieces(queryClient.getQueryData<ChecklistItem[]>(['checklist', project.id]) ?? [])
      setActualisation({ etat: 'fait', avant, apres })
    } catch {
      setActualisation({ etat: 'echec' })
    }
  }

  const handleUploadCompleted = async (item: ChecklistItem, file: File) => {
    const form = new FormData()
    form.append('file', file)
    await api.post(
      `/projects/${project.id}/checklist/${item.id}/upload-completed`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
    await refresh()
  }

  const handleLinkVaultDoc = async (doc: Document) => {
    if (!pickerItem) return
    await api.put(
      `/projects/${project.id}/checklist/${pickerItem.id}/link`,
      { document_id: doc.id },
    )
    await refresh()
  }

  // « Choisir » → téléverser un NOUVEAU fichier pour cette pièce : on l'ajoute
  // au coffre-fort (avec le type de la pièce) puis on le rattache à l'exigence.
  const handleUploadNewVaultDoc = async (file: File) => {
    if (!pickerItem) return
    const fd = new FormData()
    fd.append('file', file)
    fd.append('type', pickerItem.document_type_required || 'autre')
    const { data: doc } = await api.post<Document>('/documents', fd)
    await api.put(
      `/projects/${project.id}/checklist/${pickerItem.id}/link`,
      { document_id: doc.id },
    )
    await refresh()
  }

  // Confirmation de signature — seulement pour les pièces où le serveur la
  // demande (signature_required : RC qui l'exige, déclaration sur l'honneur).
  const handleToggleSignature = async (item: ChecklistItem, confirmed: boolean) => {
    await api.patch(`/projects/${project.id}/checklist/${item.id}`, {
      signature_confirmed: confirmed,
    })
    await refresh()
  }

  // « Non concerné » / « Je suis concerné » — persisté, journalisé, réversible
  const handleNonConcerne = async (item: ChecklistItem, nonConcerne: boolean) => {
    await api.post(`/projects/${project.id}/checklist/${item.id}/non-concerne`, {
      non_concerne: nonConcerne,
    })
    await refresh()
  }

  // ── Workflow DPGF/BPU (C12) — SUR la pièce, pas de saut vers Export ──
  const DPGF_FILENAME: Record<string, string> = {
    dpgf_template: 'DPGF.xlsx', bpu_template: 'BPU.xlsx', dqe_template: 'DQE.xlsx',
  }
  const handleDownloadTemplate = async (item: ChecklistItem) => {
    if (!item.template_project_doc_id) return
    const res = await api.get(
      `/projects/${project.id}/documents/${item.template_project_doc_id}/download`,
      { responseType: 'blob' },
    )
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url
    a.download = DPGF_FILENAME[item.document_type_required] || 'bordereau.xlsx'
    a.click()
    window.URL.revokeObjectURL(url)
  }
  // Ré-import de la version remplie → contrôle formel dpgf_checker → ✓/⚠️.
  const handleUploadDpgf = async (item: ChecklistItem, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    await api.post(`/projects/${project.id}/checklist/${item.id}/upload-completed`, fd)
    await refresh()
  }

  const TITRE = 'Réunir les pièces'
  const UTILITE = 'Ce que le règlement demande : les pièces de votre coffre-fort et les formulaires de l’acheteur à compléter. Synorix les range dans le dossier de candidature.'

  // ── Chargement → erreur → rien à montrer → contenu (une erreur n'est jamais « le dossier n'est pas lu ») ──
  if (isLoading) return (
    <GabaritEtape titre={TITRE} utilite={UTILITE}>
      <div aria-busy="true" className="grid gap-6">
        <Squelette className="h-32 w-full rounded-carte" />
        <div className="grid gap-3.5 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <Squelette key={i} className="h-28 rounded-carte" />)}
        </div>
      </div>
    </GabaritEtape>
  )

  if (requetePieces.isError && requetePieces.data === undefined) return (
    <GabaritEtape titre={TITRE} utilite={UTILITE}>
      <EtatErreur
        titre="Les pièces n’ont pas pu se charger"
        detail="La liste des pièces demandées par le règlement n’a pas pu être lue. Vos pièces et votre coffre-fort ne sont pas touchés."
        onReessayer={() => { void requetePieces.refetch() }}
        enCours={requetePieces.isFetching}
      />
    </GabaritEtape>
  )

  // La liste des pièces est établie par Synorix à la fin de la lecture du dossier : vide, c'est que le dossier n'est pas lu.
  if (items.length === 0) return (
    <GabaritEtape titre={TITRE} utilite={UTILITE}>
      <EtatVide
        titre="Les pièces à réunir apparaîtront ici"
        phrase={<>Synorix les relève dans le règlement à la lecture du <Sigle code="DCE" />.</>}
        action={<Bouton variante="secondaire" onClick={() => navigate(`/projects/${project.id}/lots`)}>Lire le dossier</Bouton>}
      />
    </GabaritEtape>
  )

  // ── Barre du bas (composant commun : une ligne au téléphone) ──────
  const jauge = (classe: string) => (
    <div role="progressbar" aria-label="Pièces prêtes" aria-valuemin={0} aria-valuemax={comptes.total} aria-valuenow={comptes.pretes} className={cn('h-1 overflow-hidden rounded-pilule bg-surface-2', classe)}>
      <div className="h-full rounded-pilule bg-accent-ui transition-[width] duration-pop ease-survol motion-reduce:transition-none" style={{ width: `${pct}%` }} />
    </div>
  )
  const bottomBar = (
    <BarreEtape className="flex-wrap gap-x-4 gap-y-2">
      <BilanBarre
        className="gap-3"
        bureau={<>
          {jauge('w-32 shrink-0')}
          <span>{phraseComptes(comptes)}{phraseAutres ? ` · ${phraseAutres}` : ''}</span>
        </>}
        tel={<>
          {jauge('min-w-0 flex-1')}
          <span className="chiffres shrink-0 text-xs">{comptes.pretes} sur {comptes.total}</span>
        </>}
      />
      <ActionsBarre>
        <BoutonSuite
          etape="Plan"
          onClick={() =>
            isAlreadyDone
              ? navigate(`/projects/${project.id}/plan`)
              : completeStep.mutate(4, {
                  onSuccess: () => navigate(`/projects/${project.id}/plan`),
                })
          }
          enCours={completeStep.isPending}
          enCoursLibelle="Validation…"
        />
      </ActionsBarre>
    </BarreEtape>
  )

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className={selection ? 'grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]' : undefined}>
      <div className="min-w-0">
        <GabaritEtape
          titre="Réunir les pièces"
          utilite={UTILITE}
          actionsSecondaires={<>
            {/* La liste se recalcule à la demande (par exemple après l'ajout d'une pièce au coffre-fort). */}
            <Bouton variante="secondaire" onClick={() => { void actualiser() }} enCours={actualisation?.etat === 'en_cours'} libelleEnCours="Actualisation…">
              <RefreshCw aria-hidden size={16} strokeWidth={1.5} />
              Actualiser
            </Bouton>
            <Bouton variante="secondaire" onClick={openVaultPage}>
              <Lock aria-hidden size={16} strokeWidth={1.5} />
              Ouvrir le coffre-fort
            </Bouton>
          </>}
          message={messageActualisation(actualisation) && actualisation?.etat !== 'en_cours' && (
            <Message ton={actualisation?.etat === 'echec' ? 'erreur' : 'succes'} onFermer={() => setActualisation(null)}>
              {messageActualisation(actualisation)}
            </Message>
          )}
          resume={<BandeResume libelle="Les pièces du dossier" cartes={cartesPieces(scored, echeance, { coffre: piecesComptees(vaultItems), formulaires: piecesComptees(templateItems) })} />}
          barre={bottomBar}
        >
          <CandidatureSectionVault
            items={vaultItems}
            onPickFromVault={(item) => setPickerItem(item)}
            onOpenVault={openVaultPage}
            onToggleSignature={handleToggleSignature}
            onOpenSource={ouvrirSource}
            onNonConcerne={handleNonConcerne}
            echeance={echeance}
          />

          <CandidatureSectionTemplates
            projectId={project.id}
            items={templateItems}
            onUploadCompleted={handleUploadCompleted}
            onToggleSignature={handleToggleSignature}
            onOpenSource={ouvrirSource}
            onNonConcerne={handleNonConcerne}
            echeance={echeance}
          />

          <WorkflowSection
            items={groups.workflow}
            onDownload={handleDownloadTemplate}
            onUpload={handleUploadDpgf}
          />

          <SynorixJalonSection items={groups.synorix} />

          {pickerItem && (
            <VaultPickerModal
              item={pickerItem}
              onClose={() => setPickerItem(null)}
              onLink={handleLinkVaultDoc}
              onUploadNew={handleUploadNewVaultDoc}
            />
          )}
        </GabaritEtape>
      </div>
      {selection && (
        <PanneauSource
          key={selection.type === 'exigence' ? selection.id : 'champ'}
          selection={selection}
          onFermer={fermerSelection}
        />
      )}
    </div>
  )
}

const libelleLot = (lot: string) => lot.replace(/^lot/i, 'Lot ')

// ── Tableaux de prix (DPGF, BPU) : télécharger la trame, la remplir, la déposer SUR la pièce ────
// C12 : la trame vient du dossier de l'acheteur ; au dépôt, Synorix vérifie la FORME (aucune ligne sans prix), jamais les prix.
function WorkflowSection({
  items, onDownload, onUpload,
}: {
  items: ChecklistItem[]
  onDownload: (item: ChecklistItem) => Promise<void>
  onUpload: (item: ChecklistItem, file: File) => Promise<void>
}) {
  if (items.length === 0) return null
  return (
    <SectionEtape
      titre="Tableaux de prix à remplir"
      description={<>Le <Sigle code="DPGF" /> ou le <Sigle code="BPU" /> de l’acheteur : téléchargez la trame, remplissez-la, puis déposez-la ici. Synorix vérifie qu’aucune ligne n’est restée sans prix.</>}
      colonnes={2}
    >
      {items.map((i) => <WorkflowRow key={i.id} item={i} onDownload={onDownload} onUpload={onUpload} />)}
    </SectionEtape>
  )
}

function WorkflowRow({
  item, onDownload, onUpload,
}: {
  item: ChecklistItem
  onDownload: (item: ChecklistItem) => Promise<void>
  onUpload: (item: ChecklistItem, file: File) => Promise<void>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'dl' | 'up' | null>(null)
  const done = item.status === 'present'
  const warn = item.status === 'warning'

  // 1.16 — un téléchargement ou un dépôt qui échoue est dit sur la pièce, avec « Réessayer »
  const [echec, setEchec] = useState<{ message: string; relancer: () => void } | null>(null)
  const run = async (kind: 'dl' | 'up', fn: () => Promise<void>, defaut: string) => {
    setBusy(kind)
    setEchec(null)
    try {
      await fn()
    } catch (err) {
      setEchec({ message: await messageErreur(err, defaut), relancer: () => { void run(kind, fn, defaut) } })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Carte data-piece={item.id} className="grid min-w-0 content-start gap-3">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <p className="min-w-0 flex-1 basis-48 break-words text-base font-semibold text-fg">{item.details}</p>
        {item.lot && <PastilleEtat sens="gris" icone={null}>{libelleLot(item.lot)}</PastilleEtat>}
      </div>
      <EtatElement
        etat={done ? 'pret' : warn ? 'a-verifier' : 'a-couvrir'}
        texte={done ? 'Rempli et vérifié' : warn ? 'À corriger : des lignes sont sans prix' : 'À remplir'}
      />
      <EntreeFichier
        ref={inputRef}
        accept=".xlsx,.xls,.xlsm,.ods,.pdf"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void run('up', () => onUpload(item, f), 'Le dépôt du tableau rempli n’a pas abouti.')
          e.target.value = ''
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        {item.template_project_doc_id && (
          <Bouton variante="secondaire" disabled={busy !== null} enCours={busy === 'dl'} libelleEnCours="Téléchargement…"
            onClick={() => { void run('dl', () => onDownload(item), 'Le téléchargement de la trame n’a pas abouti.') }}>
            <Download aria-hidden size={16} strokeWidth={1.5} />
            Télécharger la trame
          </Bouton>
        )}
        <Bouton variante="secondaire" disabled={busy !== null} enCours={busy === 'up'} libelleEnCours="Dépôt en cours…" onClick={() => inputRef.current?.click()}>
          <Upload aria-hidden size={16} strokeWidth={1.5} />
          {done || warn ? 'Remplacer le tableau' : 'Déposer le tableau rempli'}
        </Bouton>
      </div>
      {echec && (
        <Message ton="erreur" onFermer={() => setEchec(null)}
          action={<Bouton variante="secondaire" onClick={() => { const relancer = echec.relancer; setEchec(null); relancer() }}>Réessayer</Bouton>}>
          {echec.message}
        </Message>
      )}
    </Carte>
  )
}

// ── Rédigé avec Synorix (le mémoire technique) : rien à joindre ici ─
function SynorixJalonSection({ items }: { items: ChecklistItem[] }) {
  if (items.length === 0) return null
  return (
    <SectionEtape titre="Rédigé avec Synorix" description="Ces pièces se préparent à l’étape Rédiger : rien à joindre ici.">
      <Carte sansMarge>
        <ul>
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-bord px-5 py-3 last:border-b-0">
              <span className="min-w-0 flex-1 basis-56 break-words text-sm text-fg">{i.details}</span>
              {i.lot && <PastilleEtat sens="gris" icone={null}>{libelleLot(i.lot)}</PastilleEtat>}
              <span className="shrink-0 text-xs text-fg-3">À l’étape Rédiger</span>
            </li>
          ))}
        </ul>
      </Carte>
    </SectionEtape>
  )
}
