import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Check, Plus } from 'lucide-react'
import { api } from '@/services/api'
import { useSourceChamp } from '@/hooks/useSourceChamp'
import {
  BandeResume, EtatElement, GabaritEtape, SectionEtape,
} from '@/components/etape'
import { recoupements } from '@/lib/planRecoupe'
import PartiePlanCarte from '@/components/plan/PartiePlanCarte'
import PartiesHabituelles from '@/components/plan/PartiesHabituelles'
import { BarrePlan, BoutonPrincipalPlan, type EtatPlan } from '@/components/plan/ActionsPlan'
import { Input } from '@/components/ui/input'
import EcranEnChargement from '@/components/common/EcranEnChargement'
import type { CriticalFieldsPayload } from '@/components/project/CriticalBanner'
import type { Project } from '@/types'
import type { PartieId } from '@/lib/memoireSections'
import {
  ETAT_A_VERIFIER, ETAT_PRET, MAX_PARTIES, MAX_TITRE, TITRES_PARTIES_PLAN, ajouter, basculerRetrait, changerFiche, corpsPlan, deplacer, libelleFichesRemplies, libelleLongueur, libellePoids,
  numeroDansLaPartie, parGroupe, peutDeplacer, renommer, supprimerAjout, type PartiePlan, type SourcePlan, type VuePlan,
} from '@/lib/planMemoire'

const DELAI_ENREGISTREMENT_MS = 1200

/** Les champs que le serveur recalcule à chaque lecture : repris de sa réponse, jamais écrasés par l'état local. */
function avecCalculs(locales: PartiePlan[], serveur: PartiePlan[]): PartiePlan[] {
  const parCle = new Map(serveur.map((p) => [p.cle, p]))
  return locales.map((p) => {
    const s = parCle.get(p.cle)
    return s ? { ...p, sous_criteres: s.sous_criteres, attendues: s.attendues, source: s.source, exigences: s.exigences, propose: s.propose, titre_modele: s.titre_modele } : p
  })
}

const MESSAGE_ECHEC = 'Le plan n’a pas pu être enregistré. Vos modifications restent ici ; réessayez dans un instant.'

export default function StepPlan({ project }: { project: Project }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const source = useSourceChamp(project.id)
  const cle = ['plan-memoire', project.id]

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: cle,
    queryFn: async () => (await api.get<VuePlan>(`/projects/${project.id}/plan-memoire`)).data,
    retry: false,
    staleTime: 0,
  })
  const { data: champsCritiques } = useQuery({
    queryKey: ['critical-fields', project.id],
    queryFn: async () => (await api.get<CriticalFieldsPayload>(`/projects/${project.id}/critical-fields`)).data,
    retry: false,
  })
  const sourceCriteres = champsCritiques?.fields.criteres?.source ?? null

  const [parties, setParties] = useState<PartiePlan[] | null>(null)
  const [vue, setVue] = useState<VuePlan | null>(null)
  const [ouvertes, setOuvertes] = useState<Set<string>>(new Set())
  const [modifie, setModifie] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [nouveauTitre, setNouveauTitre] = useState('')
  const [nouvellePartie, setNouvellePartie] = useState<PartieId>('partie_c')
  const versionEnvoi = useRef(0)

  // Première lecture : le plan enregistré, ou celui que le serveur propose.
  useEffect(() => {
    if (data && parties === null) { setParties(data.parties); setVue(data) }
  }, [data, parties])

  const lire = useCallback((reponse: VuePlan, envoyeesVersion: number) => {
    setVue(reponse)
    // Les calculs du serveur (sous-critères, propositions…) rejoignent l'état local sans en changer l'ordre ni les titres.
    setParties((locales) => (locales ? avecCalculs(locales, reponse.parties) : locales))
    if (envoyeesVersion === versionEnvoi.current) setModifie(false)
    queryClient.setQueryData(cle, reponse)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, project.id])

  const enregistrer = useMutation({
    mutationFn: async (envoi: { liste: PartiePlan[]; version: number }) =>
      (await api.put<VuePlan>(`/projects/${project.id}/plan-memoire`, corpsPlan(envoi.liste))).data,
    onSuccess: (reponse, envoi) => { setErreur(null); lire(reponse, envoi.version) },
    onError: () => setErreur(MESSAGE_ECHEC),
  })
  const valider = useMutation({
    mutationFn: async (liste: PartiePlan[]) => (await api.post<VuePlan>(`/projects/${project.id}/plan-memoire/valider`, corpsPlan(liste))).data,
    onSuccess: (reponse) => { setErreur(null); lire(reponse, versionEnvoi.current); setModifie(false) },
    onError: (err) => {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : null
      setErreur(typeof detail === 'string' ? detail : MESSAGE_ECHEC)
    },
  })

  // Enregistrement automatique : quelques instants après le dernier geste.
  useEffect(() => {
    if (!modifie || !parties || valider.isPending) return
    const minuteur = setTimeout(() => enregistrer.mutate({ liste: parties, version: versionEnvoi.current }), DELAI_ENREGISTREMENT_MS)
    return () => clearTimeout(minuteur)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parties, modifie])

  const changer = (suivant: PartiePlan[]) => {
    versionEnvoi.current += 1
    setParties(suivant)
    setModifie(true)
  }
  const basculerFiche = (c: string) =>
    setOuvertes((o) => { const n = new Set(o); if (n.has(c)) n.delete(c); else n.add(c); return n })
  const voir = (s: SourcePlan) => { if (s.document) source.ouvrir({ document: s.document, page: s.page ?? null, excerpt: null }) }

  const recoupes = useMemo(() => (parties ? recoupements(parties) : new Map<string, { cle: string; titre: string }>()), [parties])

  const groupes = useMemo(
    () => (parties ? parGroupe(parties.filter((p) => !p.retiree)).filter((g) => g.parties.length > 0) : []),
    [parties])

  if (isLoading || (!parties && !isError)) return <EcranEnChargement />
  if (isError || !parties || !vue) {
    return (
      <GabaritEtape titre="Plan du mémoire" utilite="Les parties de votre mémoire, avant sa rédaction.">
        <div className="rounded-carte border border-bord-2 bg-surface-1 p-5 text-sm text-fg-2" role="alert">
          <p>Le plan n’a pas pu s’ouvrir pour le moment.</p>
          <button type="button" onClick={() => { void refetch() }} className="mt-2 min-h-9 font-medium text-accent-text hover:underline [@media(pointer:coarse)]:min-h-11">Réessayer</button>
        </div>
      </GabaritEtape>
    )
  }

  const gardees = parties.filter((p) => !p.retiree)
  const habituelles = parties.filter((p) => p.retiree)
  const ajoutees = parties.filter((p) => p.cle.includes('.ajout_') && !p.retiree).length
  const resume = vue.resume
  const fiches = gardees.filter((p) => p.fiche.voulu.trim() || p.fiche.references !== null || p.fiche.personnes !== null || p.fiche.materiel !== null).length
  const valideEtAJour = vue.valide && !modifie && !enregistrer.isPending
  const enCours = valider.isPending || enregistrer.isPending

  const cartes = [
    {
      libelle: 'Parties', valeur: String(gardees.length),
      detail: [ajoutees > 0 ? `${ajoutees} ajoutée${ajoutees > 1 ? 's' : ''}` : null,
        parties.length - gardees.length > 0 ? `${parties.length - gardees.length} habituelle${parties.length - gardees.length > 1 ? 's' : ''} à ajouter si utile` : null]
        .filter(Boolean).join(' · ') || 'Le plan du modèle, sans changement',
    },
    resume.sous_criteres_total > 0
      ? {
        libelle: 'Critères du règlement', valeur: `${resume.sous_criteres_servis} sur ${resume.sous_criteres_total}`,
        etat: vue.a_couvrir.length === 0 ? ETAT_PRET : ETAT_A_VERIFIER,
        jauge: { rempli: resume.sous_criteres_servis, total: resume.sous_criteres_total },
        detail: vue.a_couvrir.length === 0 ? 'Chaque sous-critère est servi par une partie.' : `${vue.a_couvrir.length} à couvrir`,
      }
      : { libelle: 'Critères du règlement', valeur: 'Non détaillés', detail: 'Le règlement ne détaille pas de sous-critères.' },
    vue.limite_pages
      ? { libelle: 'Longueur', valeur: libelleLongueur(vue.limite_pages.pages), detail: 'Limite relevée dans le dossier.' }
      : { libelle: 'Longueur', valeur: 'Non précisée', detail: 'Le dossier ne fixe pas de limite de pages.' },
    {
      libelle: 'Fiches', valeur: libelleFichesRemplies(fiches),
      detail: 'Facultatif : vous pouvez valider le plan sans ouvrir une fiche.',
    },
  ]

  const etat: EtatPlan = {
    valideEtAJour, valideLe: vue.valide_le, enregistre: vue.enregistre, modifie, enCours, enValidation: valider.isPending,
  }
  const versRedaction = () => navigate(`/projects/${project.id}/memoire`)
  const actionPrincipale = <BoutonPrincipalPlan etat={etat} onValider={() => valider.mutate(parties)} onRediger={versRedaction} />

  return (
    <>
      <GabaritEtape
        titre="Plan du mémoire"
        utilite="Les parties de votre mémoire, avant sa rédaction : retirez, ajoutez, renommez, ordonnez, puis validez."
        actionPrincipale={actionPrincipale}
        resume={<BandeResume cartes={cartes} libelle="Résumé du plan" />}
        barre={<BarrePlan etat={etat} onValider={() => valider.mutate(parties)} onRediger={versRedaction} onValiderEtRediger={() => valider.mutate(parties, { onSuccess: versRedaction })} />}
      >
        {erreur && (
          <p role="alert" className="rounded-carte border border-bord-2 bg-surface-1 p-4 text-sm text-fg">{erreur}</p>
        )}

        {resume.sous_criteres_total > 0 && (
          <SectionEtape titre="CE QUE LE RÈGLEMENT NOTE" description="Chaque sous-critère doit être servi par au moins une partie du plan.">
            {vue.a_couvrir.length === 0 ? (
              <EtatElement etat="pret" />
            ) : (
              vue.a_couvrir.map((c) => (
                <div key={c.nom} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 rounded-carte border border-bord-2 bg-surface-1 p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg">{libellePoids(c.nom, c.poids)}</p>
                    <EtatElement
                      etat="a-couvrir" className="mt-1"
                      source={sourceCriteres ? { libelle: `${sourceCriteres.document}${sourceCriteres.page ? ` · page ${sourceCriteres.page}` : ''}`, onVoir: () => source.ouvrir(sourceCriteres) } : undefined}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={parties.length >= MAX_PARTIES}
                    onClick={() => {
                      const suivant = ajouter(parties, c.partie ?? 'partie_c', c.nom)
                      changer(suivant)
                      const nouvelle = suivant.find((p) => !parties.some((q) => q.cle === p.cle))
                      if (nouvelle) setOuvertes((o) => new Set(o).add(nouvelle.cle))
                    }}
                    aria-label={`Ajouter une partie pour ce critère : ${c.nom}`}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-bord-2 px-3.5 text-sm font-medium text-fg hover:bg-surface-0 disabled:opacity-40 [@media(pointer:coarse)]:min-h-11"
                  >
                    <Plus size={15} aria-hidden /> Ajouter une partie pour ce critère
                  </button>
                </div>
              ))
            )}
          </SectionEtape>
        )}

        <p className="text-sm text-fg-2">
          Le plan retient les parties qui servent un sous-critère du règlement et celles que le dossier demande. Les autres
          parties habituelles sont proposées plus bas, à ajouter si elles vous servent.
        </p>

        {groupes.map((g) => (
          <SectionEtape key={g.partie} titre={g.titre}>
            <ul className="space-y-3" aria-label={TITRES_PARTIES_PLAN[g.partie]}>
              {g.parties.map((p) => (
                <PartiePlanCarte
                  key={p.cle}
                  partie={p}
                  numero={numeroDansLaPartie(parties, p.cle)}
                  ouverte={ouvertes.has(p.cle)}
                  peutMonter={peutDeplacer(parties, p.cle, -1)}
                  peutDescendre={peutDeplacer(parties, p.cle, 1)}
                  seulementGardee={gardees.length <= 1}
                  recoupe={recoupes.get(p.cle) ?? null}
                  onBasculerFiche={() => basculerFiche(p.cle)}
                  onRenommer={(t) => changer(renommer(parties, p.cle, t))}
                  onRetirer={() => changer(basculerRetrait(parties, p.cle))}
                  onSupprimer={() => changer(supprimerAjout(parties, p.cle))}
                  onMonter={() => changer(deplacer(parties, p.cle, -1))}
                  onDescendre={() => changer(deplacer(parties, p.cle, 1))}
                  onFiche={(f) => changer(changerFiche(parties, p.cle, f))}
                  onVoirSource={voir}
                />
              ))}
            </ul>
          </SectionEtape>
        ))}

        <PartiesHabituelles parties={habituelles} onAjouter={(cle) => changer(basculerRetrait(parties, cle))} />

        <SectionEtape titre="AJOUTER UNE PARTIE" description="Une partie de plus, rattachée à la partie A, B ou C. Vous la renseignez ensuite dans sa fiche.">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (!nouveauTitre.trim() || parties.length >= MAX_PARTIES) return
              const suivant = ajouter(parties, nouvellePartie, nouveauTitre)
              changer(suivant)
              setOuvertes((o) => new Set(o).add(suivant.find((p) => p.partie === nouvellePartie && p.titre === nouveauTitre.trim().slice(0, MAX_TITRE))?.cle ?? ''))
              setNouveauTitre('')
            }}
          >
            <div className="min-w-0 flex-1 basis-64">
              <label htmlFor="plan-nouveau-titre" className="mb-1 block text-sm font-medium text-fg-2">Titre de la nouvelle partie</label>
              <Input id="plan-nouveau-titre" value={nouveauTitre} maxLength={MAX_TITRE} onChange={(e) => setNouveauTitre(e.target.value)} placeholder="Par exemple : Suivi de chantier connecté" />
            </div>
            <div>
              <label htmlFor="plan-nouvelle-partie" className="mb-1 block text-sm font-medium text-fg-2">Dans la</label>
              <select
                id="plan-nouvelle-partie" value={nouvellePartie} onChange={(e) => setNouvellePartie(e.target.value as PartieId)}
                className="h-10 rounded-md border border-input bg-surface-0 px-3 text-sm text-fg [@media(pointer:coarse)]:h-11"
              >
                <option value="partie_a">Partie A</option>
                <option value="partie_b">Partie B</option>
                <option value="partie_c">Partie C</option>
              </select>
            </div>
            <button
              type="submit" disabled={!nouveauTitre.trim() || parties.length >= MAX_PARTIES}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-bord-2 px-3.5 text-sm font-medium text-fg hover:bg-surface-0 disabled:opacity-40 [@media(pointer:coarse)]:min-h-11"
            >
              <Plus size={15} aria-hidden /> Ajouter
            </button>
          </form>
        </SectionEtape>

        {valideEtAJour && (
          <p className="flex items-center gap-2 text-sm text-fg-2"><Check size={15} className="text-success" aria-hidden /> Le plan est validé : la rédaction le suivra, partie par partie.</p>
        )}
      </GabaritEtape>
      {source.panneau}
    </>
  )
}
