import { useCallback, useRef, useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { ChevronDown } from 'lucide-react'
import { api } from '@/services/api'
import { cn } from '@/lib/utils'
import { Bouton } from '@/components/ui/bouton'
import { CaseACocher } from '@/components/ui/case'
import { EntreeFichier } from '@/components/depot/EntreeFichier'
import { Message } from '@/components/ui/message'
import { PastilleEtat } from '@/components/ui/pastille'
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

/** L'état d'une case, en mots : envoi, lecture en cours (bleu), lu (vert, « Vérifier »), déposé, refus dit sans rouge. */
function Etat({ vue, onVerifier }: { vue: VueCase; onVerifier: () => void }) {
  const e = vue.etat
  const libelle = vue.envoi ? 'Envoi en cours…' : e?.libelle_etat ?? null
  const enCours = vue.envoi || e?.etat === 'en_lecture'
  const lu = !vue.envoi && e?.etat === 'lu'
  return (
    <div className="grid gap-1 empty:hidden" role="status" aria-live="polite">
      {libelle && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {enCours || lu
            ? <PastilleEtat sens={lu ? 'vert' : 'bleu'}>{libelle}</PastilleEtat>
            : <span className="text-fg-2">{libelle}</span>}
          {e?.vers_verifier && !vue.envoi && <Bouton variante="lien" className="text-sm" onClick={onVerifier}>Vérifier</Bouton>}
        </p>
      )}
      {/* G6 — « Lecture indisponible » : la phrase qui dit quoi faire se lit, elle n'est pas en petit gris */}
      {!vue.envoi && e?.etat === 'echec' && e.note && <p className="text-sm text-fg-2">{e.note}</p>}
      {!vue.envoi && (e?.plafond || (e?.note && e.etat !== 'echec')) && <p className="text-xs text-fg-3">{[e?.plafond, e?.etat === 'echec' ? null : e?.note].filter(Boolean).join(' · ')}</p>}
      {vue.erreur && <p role="alert" className="text-sm text-ambre-ink">{vue.erreur}</p>}
    </div>
  )
}

/**
 * Une case, en rangée : son nom, ce qu'on y met, ce que Synorix en fera ; à droite, « Déposer un fichier ». Toute la rangée
 * reçoit un fichier glissé (elle se marque alors d'un trait d'accent) ; au repos, aucune zone en pointillés.
 */
export function CaseDepotVue({ vue, onFichiers, onVerifier }: {
  vue: VueCase
  onFichiers: (caseId: string, fichiers: File[]) => void
  onVerifier: () => void
}) {
  const c = vue.definition
  const entree = useRef<HTMLInputElement>(null)
  const [survol, setSurvol] = useState(false)

  const aLaDepose = (e: DragEvent<HTMLElement>) => {
    e.preventDefault()
    setSurvol(false)
    if (e.dataTransfer?.files?.length) onFichiers(c.id, Array.from(e.dataTransfer.files))
  }

  return (
    <article
      data-case={c.id}
      onDragOver={(e) => { e.preventDefault(); setSurvol(true) }}
      onDragLeave={() => setSurvol(false)}
      onDrop={aLaDepose}
      className={cn('flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-t border-bord px-4 py-4 first:border-t-0', survol && 'bg-accent-tint outline-dashed outline-2 -outline-offset-2 outline-accent-ring')}
    >
      <div className="grid min-w-0 flex-1 basis-72 gap-1">
        <h4 className="text-sm font-semibold text-fg">{c.nom}</h4>
        <p className="max-w-prose text-sm text-fg-2">{c.contenu}</p>
        <p className="max-w-prose text-xs text-fg-3">{c.usage}</p>
        <Etat vue={vue} onVerifier={onVerifier} />
      </div>
      <div className="grid shrink-0 justify-items-start gap-1.5">
        <Bouton variante="secondaire" onClick={() => entree.current?.click()} enCours={vue.envoi} libelleEnCours="Envoi en cours…">
          Déposer un fichier<span className="sr-only"> pour « {c.nom} »</span>
        </Bouton>
        <EntreeFichier
          ref={entree}
          multiple={c.plusieurs_fichiers}
          accept={TYPES_ACCEPTES}
          onChange={(e) => {
            const fichiers = Array.from(e.target.files ?? [])
            e.target.value = ''
            if (fichiers.length) onFichiers(c.id, fichiers)
          }}
        />
        <p className="max-w-56 text-xs text-fg-3">{ligneFormats(c)}</p>
      </div>
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
    <section id={ID_ENCART} tabIndex={-1} aria-labelledby={`${ID_ENCART}-titre`} className="grid gap-4 rounded-lg border border-bord bg-surface-0 p-4 sm:p-5">
      <div>
        <h3 id={`${ID_ENCART}-titre`} className="text-base font-semibold text-fg">Voici ce que j'ai compris</h3>
        <p className="mt-1 text-sm text-fg-2">Décochez ce qui n'est pas juste. Rien n'est enregistré dans votre profil avant que vous validiez.</p>
      </div>
      {groupes.map((g) => (
        <fieldset key={g.lecture_id} className="min-w-0 border-0 p-0">
          <legend className="mb-1 text-xs font-medium text-fg-3">{g.case_nom} · {g.source}</legend>
          <ul className="divide-y divide-bord border-y border-bord">
            {g.propositions.map((p) => {
              const confirmer = libelleAConfirmer(p)
              return (
                <li key={p.id} className="py-1.5">
                  <CaseACocher
                    coche={coches.has(p.id)}
                    onChange={() => onBasculer(p.id)}
                    className="items-start py-2"
                    libelle={(
                      <span className="grid">
                        <span className="text-xs font-medium text-fg-3">{p.libelle}</span>
                        <span className="break-words text-sm font-semibold text-fg">{p.affichage}</span>
                        {confirmer && <span className="mt-0.5 text-xs font-medium text-ambre-ink">{confirmer}</span>}
                      </span>
                    )}
                  />
                  {p.extrait ? (
                    <details className="group pl-8">
                      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-0.5 py-1 text-xs text-fg-3">
                        <span>Source : {sourceLisible(p.source)}</span>
                        <span className="inline-flex items-center gap-1 font-medium text-accent-text group-hover:underline">
                          Voir l'extrait d'origine <ChevronDown size={13} className="transition-transform duration-survol ease-survol group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
                        </span>
                      </summary>
                      <blockquote className="mb-2 break-words border-l-2 border-bord-2 pl-3 text-xs italic text-fg-2">{p.extrait}</blockquote>
                    </details>
                  ) : (
                    <p className="pb-2 pl-8 text-xs text-fg-3">Source : {sourceLisible(p.source)}</p>
                  )}
                </li>
              )
            })}
          </ul>
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role={erreur ? 'alert' : 'status'} className={cn('text-sm empty:hidden', erreur ? 'text-ambre-ink' : 'text-fg-2')}>{erreur ?? bilan}</p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Bouton variante="discret" onClick={onTout} disabled={enCours}>Ne rien garder</Bouton>
          <Bouton variante="secondaire" onClick={onValider} disabled={n === 0} enCours={enCours} libelleEnCours="Validation…">{libelleValider(n)}</Bouton>
        </div>
      </div>
    </section>
  )
}

/**
 * Les cases de la rubrique : UNE surface, une rangée par case (plus de cartes de hauteurs inégales). `disposition` est gardée
 * pour la page de fiche (zone étroite) : en rangées, les deux dispositions se lisent de la même façon.
 */
export type DispositionCases = 'grille' | 'colonne'
export function GrilleCases({ rubrique, cases, etats, envoi, erreurs, onFichiers, onVerifier, titre = 'Déposer vos documents', disposition = 'grille' }: {
  rubrique: RubriqueId
  cases: CaseDefinition[]
  etats: CaseEtat[]
  envoi: Record<string, boolean>
  erreurs: Record<string, string | null>
  onFichiers: (caseId: string, fichiers: File[]) => void
  onVerifier: () => void
  titre?: ReactNode
  disposition?: DispositionCases
}) {
  const definitions = casesDeLaRubrique(cases, rubrique)
  return (
    <section aria-label={typeof titre === 'string' ? titre : 'Dépôt de documents'} className="grid gap-3" data-depots={rubrique}>
      <div>
        <h3 className="text-base font-semibold text-fg">{titre}</h3>
        <p className="mt-1 text-sm text-fg-2">Chaque case a son rôle : un fichier déposé ici n'est jamais pris pour autre chose. Il entre dans votre coffre-fort, puis Synorix vous propose ce qu'il y a lu.</p>
      </div>
      <div data-disposition={disposition} className="overflow-hidden rounded-lg border border-bord bg-surface-0">
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
export default function CasesDepot({ rubrique, apresValidation, disposition = 'grille' }: {
  rubrique: RubriqueId
  apresValidation?: () => void
  /** « colonne » : les cases l'une sous l'autre (zone étroite de la page de fiche). */
  disposition?: DispositionCases
}) {
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
    <div className="grid gap-5">
      <GrilleCases
        rubrique={rubrique} cases={definitions.data} etats={etats.data ?? []} envoi={envoi} erreurs={erreurs}
        onFichiers={deposer} onVerifier={verifier} disposition={disposition}
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
        <Message ton="succes">{bilan}</Message>
      ) : null}
    </div>
  )
}
