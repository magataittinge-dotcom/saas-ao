import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Plus } from 'lucide-react'
import { api } from '@/services/api'
import { useSourceChamp } from '@/hooks/useSourceChamp'
import {
  BandeResume, EtatElement, GabaritEtape, SectionEtape, SqueletteCorpsEtape,
} from '@/components/etape'
import { recoupements } from '@/lib/planRecoupe'
import PartiePlanCarte from '@/components/plan/PartiePlanCarte'
import PartiesHabituelles from '@/components/plan/PartiesHabituelles'
import { ProposerFiches } from '@/components/plan/ProposerFiches'
import { detailErreur, useFonctionsIA } from '@/lib/fonctionsIA'
import { BarrePlan, BoutonPrincipalPlan, type EtatPlan } from '@/components/plan/ActionsPlan'
import { Bouton } from '@/components/ui/bouton'
import { Carte } from '@/components/ui/carte'
import { Champ, GroupeChamp } from '@/components/ui/champ'
import { EtatErreur } from '@/components/ui/etats'
import { ListeDeroulante } from '@/components/ui/liste-deroulante'
import { Message } from '@/components/ui/message'
import { Sigle } from '@/components/common/Sigle'
import type { CriticalFieldsPayload } from '@/components/project/CriticalBanner'
import type { Project } from '@/types'
import type { PartieId } from '@/lib/memoireSections'
import {
  ETAT_A_VERIFIER, ETAT_PRET, MAX_PARTIES, MAX_TITRE, ajouter, basculerRetrait, changerFiche, corpsPlan, deplacer, libelleFichesRemplies, libelleLongueur, libellePoids,
  numeroDansLaPartie, parGroupe, peutDeplacer, renommer, supprimerAjout, titrePartieLisible, type PartiePlan, type SourcePlan, type VuePlan,
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

const UTILITE = 'Les parties de votre mémoire, avant sa rédaction : retirez, ajoutez, renommez, ordonnez, puis validez.'
const OPTIONS_PARTIE = [
  { valeur: 'partie_a', libelle: 'Partie A' },
  { valeur: 'partie_b', libelle: 'Partie B' },
  { valeur: 'partie_c', libelle: 'Partie C' },
] as const

const MESSAGE_ECHEC = 'Le plan n’a pas pu être enregistré. Vos modifications restent ici ; réessayez dans un instant.'

export default function StepPlan({ project }: { project: Project }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const source = useSourceChamp(project.id)
  const cle = ['plan-memoire', project.id]

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
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

  // C3 (FICHE_PROPOSEE, éteinte par défaut côté serveur) : « Ce que vous voulez dire » proposé pour chaque fiche, à prendre ou non.
  const { fiche_proposee: fichesProposees } = useFonctionsIA()
  const [propositions, setPropositions] = useState<Record<string, string> | null>(null)
  const proposer = useMutation({
    mutationFn: async () =>
      (await api.post<{ propositions: Record<string, string> }>(`/projects/${project.id}/plan-memoire/proposer-voulu`, undefined, { timeout: 120_000 })).data,
    onSuccess: (r) => { setPropositions(r.propositions); setOuvertes((o) => new Set([...o, ...Object.keys(r.propositions)])) },
  })
  const laisserProposition = (c: string) => setPropositions((p) => {
    if (!p) return p
    const reste = { ...p }
    delete reste[c]
    return reste
  })

  const recoupes = useMemo(() => (parties ? recoupements(parties) : new Map<string, { cle: string; titre: string }>()), [parties])

  const groupes = useMemo(
    () => (parties ? parGroupe(parties.filter((p) => !p.retiree)).filter((g) => g.parties.length > 0) : []),
    [parties])

  if (isLoading || (!parties && !isError)) {
    return (
      <GabaritEtape titre="Plan du mémoire" utilite={UTILITE}>
        <div role="status" aria-busy="true">
          <span className="sr-only">Chargement du plan</span>
          <SqueletteCorpsEtape />
        </div>
      </GabaritEtape>
    )
  }
  if (isError || !parties || !vue) {
    return (
      <GabaritEtape titre="Plan du mémoire" utilite={UTILITE}>
        <EtatErreur
          titre="Le plan n’a pas pu s’ouvrir"
          detail="La connexion au serveur a échoué. Votre plan n’est pas touché : il reviendra tel que vous l’avez laissé."
          onReessayer={() => { void refetch() }} enCours={isFetching}
        />
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
  const complet = parties.length >= MAX_PARTIES

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
        // tous servis : la pastille « Prêt » le dit ; une jauge pleine, à la couleur de l'action, le contredisait (jury, tour 1)
        jauge: vue.a_couvrir.length === 0 ? undefined : { rempli: resume.sous_criteres_servis, total: resume.sous_criteres_total },
        detail: vue.a_couvrir.length === 0 ? 'Chaque sous-critère est servi par une partie.' : `${vue.a_couvrir.length} à couvrir`,
      }
      : { libelle: 'Critères du règlement', valeur: 'Non détaillés', detail: 'Le règlement ne détaille pas de sous-critères.' },
    vue.limite_pages
      ? { libelle: 'Longueur', valeur: libelleLongueur(vue.limite_pages.pages), detail: 'Limite relevée dans le dossier.' }
      : { libelle: 'Longueur', valeur: 'Libre', detail: 'Le dossier ne fixe pas de limite de pages.' },
    {
      libelle: 'Fiches remplies', valeur: fiches > 0 ? String(fiches) : libelleFichesRemplies(fiches), rien: 'Aucune' as const,
      detail: 'Facultatif : le plan se valide sans ouvrir une fiche.',
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
        utilite={UTILITE}
        actionPrincipale={actionPrincipale}
        message={erreur ? <Message ton="erreur">{erreur}</Message> : valideEtAJour ? <Message ton="succes">Le plan est validé : la rédaction le suivra, partie par partie.</Message> : undefined}
        resume={<BandeResume cartes={cartes} libelle="Résumé du plan" />}
        barre={<BarrePlan etat={etat} onValider={() => valider.mutate(parties)} onRediger={versRedaction} />}
      >
        {resume.sous_criteres_total > 0 && vue.a_couvrir.length > 0 && (
          <SectionEtape
            titre="Ce que le règlement note"
            description={<>Chaque sous-critère du <Sigle code="RC" /> doit être servi par au moins une partie du plan.</>}
          >
            <Carte sansMarge>
              <ul aria-label="Sous-critères à couvrir">
                {vue.a_couvrir.map((c) => (
                  <li key={c.nom} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-bord px-4 py-3 first:border-t-0 sm:px-5">
                    <div className="min-w-0 flex-1 basis-64">
                      <p className="text-sm font-medium text-fg">{libellePoids(c.nom, c.poids)}</p>
                      <EtatElement
                        etat="a-couvrir" className="mt-1"
                        source={sourceCriteres ? { libelle: `${sourceCriteres.document}${sourceCriteres.page ? ` · page ${sourceCriteres.page}` : ''}`, onVoir: () => source.ouvrir(sourceCriteres) } : undefined}
                      />
                    </div>
                    <Bouton
                      variante="secondaire"
                      disabled={complet}
                      onClick={() => {
                        const suivant = ajouter(parties, c.partie ?? 'partie_c', c.nom)
                        changer(suivant)
                        const nouvelle = suivant.find((p) => !parties.some((q) => q.cle === p.cle))
                        if (nouvelle) setOuvertes((o) => new Set(o).add(nouvelle.cle))
                      }}
                      aria-label={`Ajouter une partie pour ce critère : ${c.nom}`}
                    >
                      <Plus aria-hidden /> Ajouter une partie pour ce critère
                    </Bouton>
                  </li>
                ))}
              </ul>
            </Carte>
          </SectionEtape>
        )}

        {fichesProposees && (
          <SectionEtape titre="Ce que vous voulez dire, partie par partie">
            <ProposerFiches
              enCours={proposer.isPending}
              nombre={propositions ? Object.keys(propositions).length : null}
              erreur={proposer.isError ? detailErreur(proposer.error, 'Les propositions n’ont pas pu se faire. Rien n’a été décompté ; réessayez dans un instant.') : null}
              onProposer={() => proposer.mutate()}
            />
          </SectionEtape>
        )}

        {groupes.map((g, i) => (
          <SectionEtape
            key={g.partie} titre={`${titrePartieLisible(g.partie)} · ${g.parties.length} ${g.parties.length > 1 ? 'parties' : 'partie'}`}
            description={i === 0 ? <>Le plan retient les parties qui servent un sous-critère du <Sigle code="RC" /> et celles que le dossier demande.</> : undefined}
          >
            <Carte sansMarge>
              <ul aria-label={titrePartieLisible(g.partie)}>
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
                    proposition={fichesProposees ? propositions?.[p.cle] ?? null : null}
                    onIgnorerProposition={fichesProposees ? () => laisserProposition(p.cle) : undefined}
                  />
                ))}
              </ul>
            </Carte>
          </SectionEtape>
        ))}

        <PartiesHabituelles parties={habituelles} onAjouter={(cle) => changer(basculerRetrait(parties, cle))} />

        <SectionEtape
          titre="Ajouter une partie"
          description={complet
            ? `Le plan compte ${MAX_PARTIES} parties, le plus qu’il peut porter : retirez-en une pour en ajouter une autre.`
            : 'Une partie de plus, rattachée à la partie A, B ou C. Vous la renseignez ensuite dans sa fiche.'}
        >
          <form
            className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]"
            onSubmit={(e) => {
              e.preventDefault()
              if (!nouveauTitre.trim() || complet) return
              const suivant = ajouter(parties, nouvellePartie, nouveauTitre)
              changer(suivant)
              setOuvertes((o) => new Set(o).add(suivant.find((p) => p.partie === nouvellePartie && p.titre === nouveauTitre.trim().slice(0, MAX_TITRE))?.cle ?? ''))
              setNouveauTitre('')
            }}
          >
            <GroupeChamp libelle="Titre de la nouvelle partie">
              <Champ value={nouveauTitre} maxLength={MAX_TITRE} onChange={(e) => setNouveauTitre(e.target.value)} placeholder="Par exemple : Suivi de chantier connecté" className="h-11" />
            </GroupeChamp>
            <GroupeChamp libelle="Rattachée à la">
              <ListeDeroulante valeur={nouvellePartie} onChange={(v) => setNouvellePartie(v as PartieId)} options={OPTIONS_PARTIE} />
            </GroupeChamp>
            <Bouton type="submit" variante="secondaire" disabled={!nouveauTitre.trim() || complet}>
              <Plus aria-hidden /> Ajouter
            </Bouton>
          </form>
        </SectionEtape>
      </GabaritEtape>
      {source.panneau}
    </>
  )
}
