import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { MapPin } from 'lucide-react'
import { useMedia } from '@/hooks/useMedia'
import { useProjects } from '@/hooks/useProject'
import { useQuota } from '@/components/layout/QuotaGauge'
import { MettreAJourStatut } from '@/components/common/MettreAJourStatut'
import { Bouton, classesBouton } from '@/components/ui/bouton'
import { Carte } from '@/components/ui/carte'
import { ChampRecherche } from '@/components/ui/champ'
import { DialogueConfirmation } from '@/components/ui/dialogue'
import { EtatErreur, EtatRequete, EtatVide } from '@/components/ui/etats'
import { EffacerFiltres, PuceFiltre } from '@/components/ui/filtre'
import { ListeDeroulante } from '@/components/ui/liste-deroulante'
import { Page, TitreSection } from '@/components/ui/page'
import { Squelette } from '@/components/ui/squelette'
import { Tableau } from '@/components/ui/tableau'
import { annoncer } from '@/components/ui/toast'
import { ALaUne } from '@/components/mesao/ALaUne'
import { colonnesAMettreAJour, colonnesEnCours } from '@/components/mesao/LigneAO'
import { ResumeMesAOCartes, type FiltreMesAO } from '@/components/mesao/ResumeMesAO'
import { Termines } from '@/components/mesao/Termines'
import { VideMesAO } from '@/components/mesao/VideMesAO'
import { aLaUne, aoDansEtat, comptesAO } from '@/lib/etatAO'
import { messageErreur } from '@/lib/erreurs'
import { aDecider } from '@/lib/intelligence/action'
import { comparerParRemise, quandCourt, resumeMesAO, STATUTS_TERMINES } from '@/lib/mesAO'
import { phaseRequete } from '@/lib/requete'
import { api } from '@/services/api'
import type { Project } from '@/types'

type Tri = 'remise' | 'activite' | 'nom'

const TRIS = [
  { valeur: 'remise', libelle: 'Remise la plus proche' },
  { valeur: 'activite', libelle: 'Dernière activité' },
  { valeur: 'nom', libelle: 'Nom' },
] as const

const nombreAO = (n: number) => `${n} appel${n > 1 ? 's' : ''} d’offres`

const sansAccent = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Mes AO : où en sont mes appels d'offres. Trois états, lus dans `lib/etatAO.ts` et nulle part ailleurs : « En cours »,
 * « À mettre à jour » (remise passée : la seule action est de dire ce que le dossier est devenu), « Terminés » (repliés).
 * « À la une » est la prochaine remise à venir ; sans remise à venir, pas de bloc. Lecture des données par le motif du
 * système : chargement (squelette de la liste) → erreur (jamais l'écran vide) → vide (premier dossier) → contenu.
 */
export default function Projects() {
  const requete = useProjects()
  // Aucun AO (et le serveur a répondu) : l'écran du premier dossier, qui porte son propre titre.
  if (phaseRequete(requete) === 'vide') return <VideMesAO />
  return (
    <Page titre="Mes appels d’offres" sousTitre={<SousTitre projets={requete.data} />}
      action={phaseRequete(requete) === 'erreur' ? undefined : <Link to="/dashboard" className={classesBouton('secondaire', 'max-md:w-full')}><MapPin aria-hidden strokeWidth={1.75} />Avis de la veille</Link>}>
      <EtatRequete requete={requete} squelette={<SqueletteMesAO />} vide={null}
        erreur={<EtatErreur titre="Vos appels d’offres n’ont pas pu se charger" detail={'La connexion a été interrompue. Vos dossiers ne\u00a0sont\u00a0pas\u00a0touchés.'} onReessayer={() => { void requete.refetch() }} enCours={requete.isFetching} />}>
        {(projets) => <ListeMesAO projets={projets} />}
      </EtatRequete>
    </Page>
  )
}

/** La sous-ligne dit autre chose que la première case : la prochaine remise, quand il y en a une. */
function SousTitre({ projets }: { projets: Project[] | undefined }) {
  const une = projets ? aLaUne(projets) : null
  const quand = une ? quandCourt(une) : null
  if (!une || !quand) return 'Vos dossiers, de l’analyse du dossier de l’acheteur au dépôt.'
  return <>Prochaine remise <strong className="chiffres font-semibold text-fg">{quand}</strong>.</>
}

/** Le squelette de Mes AO, à la forme de la page réelle : le résumé, la recherche et le tri, le titre, puis les rangées (nom, acheteur, date). */
export function SqueletteMesAO() {
  return (
    <div data-squelette-mes-ao="">
      <Carte sansMarge className="grid gap-3 p-5 md:max-w-md max-md:p-4"><Squelette className="h-3.5 w-24" /><Squelette className="h-6 w-28" /><Squelette className="h-3.5 w-36" /></Carte>
      <div className="mt-10 flex flex-wrap items-center gap-2 max-md:mt-7.5">
        <Squelette className="h-11 rounded-pilule max-md:basis-full md:w-80" />
        <Squelette className="h-11 w-56 rounded-lg max-md:w-full md:ml-auto" />
      </div>
      <Squelette className="mb-4 mt-10 h-5 w-36 max-md:mt-7.5" />
      <Carte sansMarge>
        <div className="h-11 border-b border-bord max-md:hidden" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex min-h-[73px] items-center gap-6 border-t border-bord px-4 py-3 first:border-t-0 max-md:min-h-[92px]">
            <div className="grid flex-1 gap-2"><Squelette className="h-4 w-3/5 max-md:w-4/5" /><Squelette className="h-3.5 w-2/5 max-md:w-3/5" /><Squelette className="h-3.5 w-1/3 md:hidden" /></div>
            <Squelette className="h-3.5 w-28 max-md:hidden" />
            <span aria-hidden className="w-16 max-md:hidden" />
          </div>
        ))}
      </Carte>
    </div>
  )
}

function ListeMesAO({ projets }: { projets: Project[] }) {
  const queryClient = useQueryClient()
  const { data: quota } = useQuota()
  const [aSupprimer, setASupprimer] = useState<Project | null>(null)
  const [erreurSuppression, setErreurSuppression] = useState<string | null>(null)
  const [statutPour, setStatutPour] = useState<Project | null>(null)
  const [recherche, setRecherche] = useState('')
  const [tri, setTri] = useState<Tri>('remise')
  const [filtre, setFiltre] = useState<FiltreMesAO>('tous')
  const maintenant = useMemo(() => new Date(), [projets]) // eslint-disable-line react-hooks/exhaustive-deps
  // au téléphone, des pages de 20 (jury, tour 1 : 9 400 px de haut pour 50 cartes)
  const telephone = useMedia('(max-width: 767px)')

  const { mutate: supprimer, isPending: suppression } = useMutation({
    mutationFn: async (p: Project) => { await api.delete(`/projects/${p.id}`) },
    onSuccess: (_, p) => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      annoncer(`« ${p.name} » est supprimé.`, 'succes')
      setASupprimer(null)
    },
    onError: async (err) => setErreurSuppression(await messageErreur(err, 'La suppression n’a pas pu se faire. Réessayez dans un instant.')),
  })

  const comptes = useMemo(() => comptesAO(projets, maintenant), [projets, maintenant])
  const resume = useMemo(() => resumeMesAO(projets, maintenant), [projets, maintenant])
  const une = useMemo(() => aLaUne(projets, maintenant), [projets, maintenant])
  const nbADecider = resume.aDecider.n

  const cherche = recherche.trim() !== ''
  const filtres = (filtre !== 'tous' ? 1 : 0) + (cherche ? 1 : 0)
  const { enCours, aMettreAJour, termines } = useMemo(() => {
    const q = sansAccent(recherche.trim())
    const garde = (p: Project) => !q || [p.name, p.maitre_ouvrage, p.selected_lot_name].some((t) => t && sansAccent(t).includes(q))
    // l'ordre naturel des nombres (« n° 21 » avant « n° 197 ») ; à remise égale, le nom départage
    const parNom = (a: Project, b: Project) => a.name.localeCompare(b.name, 'fr', { numeric: true, sensitivity: 'base' })
    const trier = (a: Project, b: Project) => tri === 'nom'
      ? parNom(a, b)
      : tri === 'activite' ? new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime() : comparerParRemise(a, b, maintenant) || parNom(a, b)
    let courants = aoDansEtat(projets, 'en_cours', maintenant).filter(garde)
    if (filtre === 'urgent') courants = courants.filter((p) => resume.remise7.ids.includes(p.id))
    if (filtre === 'decider') courants = courants.filter(aDecider)
    // un filtre de puce ne porte que sur les AO en cours : les deux autres groupes se retirent
    const autres = filtre === 'tous'
    return {
      enCours: courants.sort(trier),
      aMettreAJour: autres ? aoDansEtat(projets, 'a_mettre_a_jour', maintenant).filter(garde).sort(trier) : [],
      termines: autres ? aoDansEtat(projets, 'termine', maintenant).filter(garde).sort((a, b) => STATUTS_TERMINES.indexOf(a.status as never) - STATUTS_TERMINES.indexOf(b.status as never) || comparerParRemise(a, b, maintenant)) : [],
    }
  }, [projets, recherche, tri, filtre, resume, maintenant])

  const effacer = () => { setFiltre('tous'); setRecherche('') }
  const gestes = { maintenant, onStatut: setStatutPour, onSupprimer: (p: Project) => { setErreurSuppression(null); setASupprimer(p) } }
  const rienTrouve = enCours.length + aMettreAJour.length + termines.length === 0

  return (
    <>
      {/* Au téléphone, « À la une » passe avant le résumé : l'action de l'écran reste sous le pouce, au premier écran. */}
      <div className="flex flex-col gap-10 max-md:flex-col-reverse max-md:gap-7.5">
        <ResumeMesAOCartes comptes={comptes} resume={resume} quota={quota} />
        {/* « À la une » suit la recherche et les filtres : elle se retire dès qu'on cherche */}
        {une && filtres === 0 && <ALaUne projet={une} maintenant={maintenant} />}
      </div>

      <div role="search" aria-label="Chercher et filtrer mes appels d’offres" className="mt-10 flex flex-wrap items-center gap-2 max-md:mt-7.5">
        <label className="min-w-0 max-md:basis-full md:w-80">
          <span className="sr-only">Rechercher un appel d’offres</span>
          <ChampRecherche placeholder="Nom, acheteur, lot…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        </label>
        {(resume.remise7.n > 0 || filtre === 'urgent') && (
          <PuceFiltre libelle="Remise sous 7 jours" valeur={filtre === 'urgent' ? nombreAO(resume.remise7.n) : null} onOuvrir={() => setFiltre(filtre === 'urgent' ? 'tous' : 'urgent')} onRetirer={() => setFiltre('tous')} />
        )}
        {(nbADecider > 0 || filtre === 'decider') && (
          <PuceFiltre libelle="À décider" valeur={filtre === 'decider' ? nombreAO(nbADecider) : null} onOuvrir={() => setFiltre(filtre === 'decider' ? 'tous' : 'decider')} onRetirer={() => setFiltre('tous')} />
        )}
        {/* « Effacer les filtres » : seulement si une puce est active (la recherche a sa croix ; l'état vide a son bouton) */}
        <EffacerFiltres actifs={rienTrouve || filtre === 'tous' ? 0 : 1} onEffacer={effacer} />
        <ListeDeroulante libelle="Trier par" valeur={tri} onChange={(v) => setTri(v as Tri)} options={TRIS} className="w-auto min-w-56 max-md:w-full md:ml-auto" />
      </div>

      {rienTrouve && (
        cherche ? (
          // une recherche n'est pas un filtre : le bouton dit ce qu'il efface, la phrase donne une piste
          <EtatVide className="mt-6" titre={`Aucun nom, acheteur ni lot ne contient « ${recherche.trim()} »`}
            phrase="Vérifiez l’orthographe, ou cherchez un mot du nom de l’acheteur."
            action={<Bouton variante="secondaire" onClick={effacer}>Effacer la recherche</Bouton>} />
        ) : (
          <EtatVide className="mt-6" parFiltre={effacer} titre="Aucun appel d’offres en cours ne passe ce filtre" />
        )
      )}

      {enCours.length > 0 && (
        <section aria-labelledby="titre-en-cours" className="mt-10 max-md:mt-7.5">
          <TitreSection id="titre-en-cours">En cours <span className="font-normal text-fg-3">{enCours.length}</span></TitreSection>
          <Tableau libelle="Appels d’offres en cours" colonnes={colonnesEnCours(gestes)} lignes={enCours} cle={(p) => p.id} vide={null} />
        </section>
      )}

      {aMettreAJour.length > 0 && (
        <section aria-labelledby="titre-a-mettre-a-jour" className="mt-10 max-md:mt-7.5">
          <TitreSection id="titre-a-mettre-a-jour">À mettre à jour <span className="font-normal text-fg-3">{aMettreAJour.length}</span></TitreSection>
          <p className="-mt-2 mb-4 max-w-[70ch] text-sm text-fg-2">La date de remise est passée. Ouvrez une ligne pour dire ce que le dossier est devenu : il rejoindra les terminés.</p>
          <Tableau libelle="Appels d’offres à mettre à jour" colonnes={colonnesAMettreAJour(gestes)} lignes={aMettreAJour} cle={(p) => p.id} vide={null}
            onLigne={setStatutPour} parPage={telephone ? 20 : undefined} className="[&_tr]:max-md:relative [&_tr]:max-md:pr-14" />
        </section>
      )}

      <Termines projets={termines} ouvertParDefaut={cherche} {...gestes} />

      {statutPour && <MettreAJourStatut projet={statutPour} ouvert onOuvert={(o) => { if (!o) setStatutPour(null) }} />}
      <DialogueConfirmation ouvert={aSupprimer !== null} onOuvert={(o) => { if (!o) setASupprimer(null) }} danger
        titre={aSupprimer ? `Supprimer « ${aSupprimer.name} » ?` : 'Supprimer cet appel d’offres ?'}
        description="Le dossier, son analyse et le mémoire de cet appel d’offres sont supprimés. Cette action ne s’annule pas."
        libelleConfirmer="Supprimer" libelleEnCours="Suppression…" enCours={suppression} erreur={erreurSuppression}
        onConfirmer={() => { if (aSupprimer) supprimer(aSupprimer) }} />
    </>
  )
}
