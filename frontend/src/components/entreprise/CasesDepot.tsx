import { useCallback, useId, useRef, useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { ArrowRight, CheckCircle2, ChevronDown, FileUp, Loader2 } from 'lucide-react'
import { api } from '@/services/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/authStore'
import type { Organization } from '@/types'
import type { RubriqueId } from '@/lib/entreprise/avancement'
import {
  TYPES_ACCEPTES, basculer, casesDeLaRubrique, cochesParDefaut, cochesPresentes, groupesParLecture, lectureEnCours,
  libelleAConfirmer, libelleValider, ligneFormats, messageRefus, phraseBilan, sourceLisible, trierFichiers,
  type CaseDefinition, type CaseEtat, type Proposition,
} from '@/lib/entreprise/depots'

const ID_ENCART = 'voici-ce-que-jai-compris'

/** Lecture seule : la vue d'une case. Séparée du réseau pour se rendre telle quelle (tests, captures). */
export interface VueCase {
  definition: CaseDefinition
  etat?: CaseEtat
  envoi: boolean
  erreur: string | null
}

const ZONE = 'flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-bord-2 bg-surface-0 px-3 py-3 text-center text-sm font-medium text-fg transition-colors duration-base ease-lien hover:border-accent-ui hover:bg-surface-1 focus-within:border-accent-ui'

function Etat({ vue, onVerifier }: { vue: VueCase; onVerifier: () => void }) {
  const e = vue.etat
  const libelle = vue.envoi ? 'Envoi en cours…' : e?.libelle_etat ?? null
  return (
    <div className="min-h-[2.75rem] space-y-1" role="status" aria-live="polite">
      {libelle && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className={cn('inline-flex items-center gap-1.5', e?.etat === 'lu' ? 'font-semibold text-fg' : 'text-fg-2')}>
            {(vue.envoi || e?.etat === 'en_lecture') && <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden />}
            {!vue.envoi && e?.etat === 'lu' && <CheckCircle2 size={14} className="text-accent-text" aria-hidden />}
            {libelle}
          </span>
          {e?.vers_verifier && !vue.envoi && (
            <button type="button" onClick={onVerifier} className="inline-flex min-h-11 items-center gap-1 rounded-xs font-semibold text-accent-text hover:underline">
              Vérifier <ArrowRight size={14} aria-hidden />
            </button>
          )}
        </p>
      )}
      {!vue.envoi && (e?.plafond || e?.note) && <p className="text-xs text-fg-3">{[e?.plafond, e?.note].filter(Boolean).join(' · ')}</p>}
      {vue.erreur && <p role="alert" className="text-xs text-warning">{vue.erreur}</p>}
    </div>
  )
}

/** Une case : son nom, ce qu'on y met, ce que Synorix en fera, la zone de dépôt, l'état. */
export function CaseDepotVue({ vue, onFichiers, onVerifier }: {
  vue: VueCase
  onFichiers: (caseId: string, fichiers: File[]) => void
  onVerifier: () => void
}) {
  const c = vue.definition
  const idChamp = useId()
  const entree = useRef<HTMLInputElement>(null)
  const [survol, setSurvol] = useState(false)

  const aLaDepose = (e: DragEvent<HTMLElement>) => {
    e.preventDefault()
    setSurvol(false)
    if (e.dataTransfer?.files?.length) onFichiers(c.id, Array.from(e.dataTransfer.files))
  }

  return (
    <article data-case={c.id} className="grid min-w-0 content-start gap-3 rounded-carte border border-bord-2 bg-surface-1 p-4">
      <h4 className="font-display text-base font-semibold leading-snug text-fg">{c.nom}</h4>
      <dl className="grid gap-2 text-sm">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-fg-3">Ce que vous y mettez</dt>
          <dd className="mt-0.5 text-fg-2">{c.contenu}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-fg-3">Ce que Synorix en fera</dt>
          <dd className="mt-0.5 text-fg-2">{c.usage}</dd>
        </div>
      </dl>
      <div
        onDragOver={(e) => { e.preventDefault(); setSurvol(true) }}
        onDragLeave={() => setSurvol(false)}
        onDrop={aLaDepose}
      >
        <label htmlFor={idChamp} className={cn(ZONE, survol && 'border-accent-ui bg-surface-2')}>
          <FileUp size={16} aria-hidden />
          <span>Glisser un fichier ici, ou choisir</span>
          <span className="sr-only"> pour « {c.nom} »</span>
        </label>
        <input
          ref={entree}
          id={idChamp}
          type="file"
          multiple={c.plusieurs_fichiers}
          accept={TYPES_ACCEPTES}
          className="sr-only"
          onChange={(e) => {
            const fichiers = Array.from(e.target.files ?? [])
            e.target.value = ''
            if (fichiers.length) onFichiers(c.id, fichiers)
          }}
        />
        <p className="mt-1.5 text-xs text-fg-3">{ligneFormats(c)}</p>
      </div>
      <Etat vue={vue} onVerifier={onVerifier} />
    </article>
  )
}

/**
 * L'encart « Voici ce que j'ai compris » : ce que Synorix propose, avec sa source (fichier, page) et l'extrait d'origine
 * dépliable. Tout est coché au départ ; rien n'entre dans le profil avant un clic sur « Valider ».
 */
export function EncartCompris({ propositions, coches, onBasculer, onValider, onTout, enCours, bilan, erreur }: {
  propositions: Proposition[]
  coches: Set<string>
  onBasculer: (id: string) => void
  onValider: () => void
  onTout: () => void
  enCours: boolean
  bilan: string | null
  erreur: string | null
}) {
  const groupes = groupesParLecture(propositions)
  const n = cochesPresentes(coches, propositions).length
  return (
    <section id={ID_ENCART} tabIndex={-1} aria-labelledby={`${ID_ENCART}-titre`} className="space-y-4 rounded-carte border border-accent-ui bg-surface-1 p-4 sm:p-5">
      <div>
        <h3 id={`${ID_ENCART}-titre`} className="font-display text-lg font-semibold text-fg">Voici ce que j'ai compris</h3>
        <p className="mt-1 text-sm text-fg-2">Décochez ce qui n'est pas juste. Rien n'est enregistré dans votre profil avant que vous validiez.</p>
      </div>
      {groupes.map((g) => (
        <fieldset key={g.lecture_id} className="min-w-0 space-y-1 border-0 p-0">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-[0.06em] text-fg-3">{g.case_nom} · {g.source}</legend>
          <ul className="grid gap-1.5">
            {g.propositions.map((p) => {
              const confirmer = libelleAConfirmer(p)
              const id = `${ID_ENCART}-${p.id}`
              return (
                <li key={p.id} className="rounded-md border border-bord-2 bg-surface-0">
                  <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2.5">
                    <input id={id} type="checkbox" className="mt-0.5 size-5 shrink-0 accent-accent-ui" checked={coches.has(p.id)} onChange={() => onBasculer(p.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium text-fg-3">{p.libelle}</span>
                      <span className="block break-words text-sm font-semibold text-fg">{p.affichage}</span>
                      {confirmer && <span className="mt-0.5 block text-xs font-medium text-accent-text">{confirmer}</span>}
                    </span>
                  </label>
                  {p.extrait ? (
                    <details className="group border-t border-bord-2 px-3">
                      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-0.5 py-1 text-xs text-fg-3">
                        <span>Source : {sourceLisible(p.source)}</span>
                        <span className="inline-flex items-center gap-1 font-medium text-accent-text group-hover:underline">
                          Voir l'extrait d'origine <ChevronDown size={13} className="transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
                        </span>
                      </summary>
                      <blockquote className="mb-2 break-words border-l-2 border-bord-2 pl-3 text-xs italic text-fg-2">{p.extrait}</blockquote>
                    </details>
                  ) : (
                    <p className="border-t border-bord-2 px-3 py-2 text-xs text-fg-3">Source : {sourceLisible(p.source)}</p>
                  )}
                </li>
              )
            })}
          </ul>
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role={erreur ? 'alert' : 'status'} className={cn('text-sm empty:hidden', erreur ? 'text-warning' : 'text-fg-2')}>{erreur ?? bilan}</p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="ghost" className="min-h-11" onClick={onTout} disabled={enCours}>Ne rien garder</Button>
          <Button className="min-h-11" onClick={onValider} disabled={enCours || n === 0}>
            {enCours ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden /> : <CheckCircle2 size={16} aria-hidden />}
            {libelleValider(n)}
          </Button>
        </div>
      </div>
    </section>
  )
}

/** Les cases de la rubrique, côte à côte : trois pour l'identité et les moyens, deux pour les certifications. */
export function GrilleCases({ rubrique, cases, etats, envoi, erreurs, onFichiers, onVerifier, titre = 'Déposer vos documents' }: {
  rubrique: RubriqueId
  cases: CaseDefinition[]
  etats: CaseEtat[]
  envoi: Record<string, boolean>
  erreurs: Record<string, string | null>
  onFichiers: (caseId: string, fichiers: File[]) => void
  onVerifier: () => void
  titre?: ReactNode
}) {
  const definitions = casesDeLaRubrique(cases, rubrique)
  return (
    <section aria-label={typeof titre === 'string' ? titre : 'Dépôt de documents'} className="space-y-3" data-depots={rubrique}>
      <div>
        <h3 className="font-display text-base font-semibold text-fg">{titre}</h3>
        <p className="mt-0.5 text-sm text-fg-2">Chaque case a son rôle : un fichier déposé ici n'est jamais pris pour autre chose. Il entre dans votre coffre-fort, puis Synorix vous propose ce qu'il y a lu.</p>
      </div>
      <div className={cn('grid gap-3.5', definitions.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3')}>
        {definitions.map((d) => (
          <CaseDepotVue
            key={d.id}
            vue={{ definition: d, etat: etats.find((e) => e.id === d.id), envoi: !!envoi[d.id], erreur: erreurs[d.id] ?? null }}
            onFichiers={onFichiers}
            onVerifier={onVerifier}
          />
        ))}
      </div>
    </section>
  )
}

const CLES_PROFIL_A_RECHARGER = ['memoire-config', 'team', 'references', 'documents', 'qualifications']

/**
 * Les cases de dépôt d'UNE rubrique, avec l'encart « Voici ce que j'ai compris ». Ne dépend que de `rubrique` : la page
 * Mon entreprise et la page de la fiche l'emploient telle quelle. `apresValidation` est appelé quand des informations
 * viennent d'entrer dans le profil (le formulaire de la rubrique se recharge de lui-même : ses sources sont rechargées).
 */
export default function CasesDepot({ rubrique, apresValidation }: { rubrique: RubriqueId; apresValidation?: () => void }) {
  const queryClient = useQueryClient()
  const setOrganization = useAuthStore((s) => s.setOrganization)
  const [envoi, setEnvoi] = useState<Record<string, boolean>>({})
  const [erreurs, setErreurs] = useState<Record<string, string | null>>({})
  const [decochees, setDecochees] = useState<Set<string>>(new Set())
  const [bilan, setBilan] = useState<string | null>(null)
  const [erreurValidation, setErreurValidation] = useState<string | null>(null)

  const definitions = useQuery({
    queryKey: ['depots', 'cases'],
    queryFn: async () => (await api.get<{ cases: CaseDefinition[] }>('/entreprise/depots/cases')).data.cases,
    staleTime: Infinity,
  })
  const etats = useQuery({
    queryKey: ['depots', 'etat', rubrique],
    queryFn: async () => (await api.get<{ cases: CaseEtat[] }>('/entreprise/depots/etat', { params: { rubrique } })).data.cases,
    // La lecture est détachée : tant qu'une case lit, on interroge son état toutes les 2 secondes.
    refetchInterval: (q) => (q.state.data && lectureEnCours(q.state.data) ? 2000 : false),
  })
  const propositions = useQuery({
    queryKey: ['depots', 'propositions', rubrique],
    queryFn: async () => (await api.get<{ propositions: Proposition[] }>('/entreprise/depots/propositions', { params: { rubrique } })).data.propositions,
    refetchInterval: () => (etats.data && lectureEnCours(etats.data) ? 2000 : false),
  })

  const liste = propositions.data ?? []
  const coches = new Set([...cochesParDefaut(liste)].filter((id) => !decochees.has(id)))

  const deposer = useCallback(async (caseId: string, fichiers: File[]) => {
    const def = definitions.data?.find((d) => d.id === caseId)
    if (!def) return
    const { acceptes, refus } = trierFichiers(fichiers, def)
    setErreurs((e) => ({ ...e, [caseId]: refus.length ? refus.map((r) => `${r.nom} : ${r.message}`).join(' ') : null }))
    if (acceptes.length === 0) return
    setEnvoi((e) => ({ ...e, [caseId]: true }))
    try {
      const form = new FormData()
      for (const f of acceptes) form.append('fichiers', f as File)
      const { data } = await api.post<{ resultats: { nom: string; accepte: boolean; statut?: number; detail?: string }[] }>(
        `/entreprise/depots/${caseId}`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      const refuses = data.resultats.filter((r) => !r.accepte).map((r) => `${r.nom} : ${messageRefus(r.statut, r.detail)}`)
      setErreurs((e) => ({ ...e, [caseId]: [...refus.map((r) => `${r.nom} : ${r.message}`), ...refuses].join(' ') || null }))
    } catch (e) {
      const statut = axios.isAxiosError(e) ? e.response?.status : undefined
      const detail = axios.isAxiosError(e) ? e.response?.data?.detail : undefined
      setErreurs((x) => ({ ...x, [caseId]: messageRefus(statut, detail) }))
    } finally {
      setEnvoi((e) => ({ ...e, [caseId]: false }))
      queryClient.invalidateQueries({ queryKey: ['depots'] })
      queryClient.invalidateQueries({ queryKey: ['documents'] })
    }
  }, [definitions.data, queryClient])

  const valider = useMutation({
    mutationFn: async (ids: string[]) => {
      const lecture_ids = [...new Set(liste.map((p) => p.lecture_id))]
      return (await api.post<{ validees: number; ecartees: number; erreurs: { libelle: string; message: string }[] }>(
        '/entreprise/depots/propositions/valider', { ids, lecture_ids })).data
    },
    onSuccess: async (b) => {
      setErreurValidation(null)
      setBilan(phraseBilan(b))
      setDecochees(new Set())
      // Le profil a changé : on recharge ce que le formulaire lit (il se remet à jour tout seul).
      try {
        const { data } = await api.get<Organization>('/organizations/me')
        setOrganization(data)
      } catch { /* l'organisation sera relue au prochain chargement */ }
      for (const cle of CLES_PROFIL_A_RECHARGER) queryClient.invalidateQueries({ queryKey: [cle] })
      queryClient.invalidateQueries({ queryKey: ['depots'] })
      apresValidation?.()
    },
    onError: () => setErreurValidation('La validation n\'a pas pu être enregistrée. Réessayez.'),
  })

  const verifier = () => {
    const el = document.getElementById(ID_ENCART)
    el?.scrollIntoView({ block: 'center' })
    el?.focus({ preventScroll: true })
  }

  if (!definitions.data) return null
  return (
    <div className="space-y-5">
      <GrilleCases
        rubrique={rubrique} cases={definitions.data} etats={etats.data ?? []} envoi={envoi} erreurs={erreurs}
        onFichiers={deposer} onVerifier={verifier}
      />
      {liste.length > 0 ? (
        <EncartCompris
          propositions={liste} coches={coches}
          onBasculer={(id) => setDecochees((d) => basculer(d, id))}
          onValider={() => valider.mutate(cochesPresentes(coches, liste))}
          onTout={() => valider.mutate([])}
          enCours={valider.isPending} bilan={bilan} erreur={erreurValidation}
        />
      ) : bilan ? (
        <p role="status" className="text-sm text-fg-2">{bilan}</p>
      ) : null}
    </div>
  )
}
