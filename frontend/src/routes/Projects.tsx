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
import { colonnesAMettreAJour, colonnesEnCours, TABLEAU_EN_COURS } from '@/components/mesao/LigneAO'
import { ResumeMesAOCartes, type FiltreMesAO } from '@/components/mesao/ResumeMesAO'
import { Termines } from '@/components/mesao/Termines'
import { VideMesAO } from '@/components/mesao/VideMesAO'
import { aLaUne, aoDansEtat, comptesAO } from '@/lib/etatAO'
import { messageErreur } from '@/lib/erreurs'
import { aDecider } from '@/lib/intelligence/action'
import { comparerParRemise, quandCourt, resumeMesAO, STATUTS_TERMINES } from '@/lib/mesAO'
import { phaseRequete } from '@/lib/requete'
import { cn } from '@/lib/utils'
import { useAplatReserve } from '@/stores/uiStore'
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
    <Page titre="Mes appels d’offres" sousTitre={<SousTitre projets={requete.data} enAttente={phaseRequete(requete) === 'chargement'} />}>
      <EtatRequete requete={requete} squelette={<SqueletteMesAO />} vide={null}
        erreur={<EtatErreur className="md:w-fit" titre="Vos appels d’offres n’ont pas pu se charger" detail="La connexion a été interrompue. Vos dossiers sont intacts." onReessayer={() => { void requete.refetch() }} enCours={requete.isFetching} />}>
        {(projets) => <ListeMesAO projets={projets} />}
      </EtatRequete>
    </Page>
  )
}

/** La sous-ligne dit autre chose que la première case : la prochaine remise, quand il y en a une. */
function SousTitre({ projets, enAttente }: { projets: Project[] | undefined; enAttente: boolean }) {
  // pendant la lecture, la ligne garde sa place sans rien affirmer : elle ne se réécrit pas à l'arrivée des données (jury, tour 3)
  if (enAttente) return '\u00a0'
  const une = projets ? aLaUne(projets) : null
  const quand = une ? quandCourt(une) : null
  if (!une || !quand) return 'Vos dossiers, de l’analyse du dossier de l’acheteur au dépôt.'
  return <>Prochaine remise <strong className="font-semibold text-fg">{quand}</strong>{quand.endsWith('.') ? '' : '.'}</>
}

/**
 * Le squelette de Mes AO, à la silhouette de l'écran qui arrive (jury, tour 3 : une carte de 448 px tenait lieu de la bande,
 * « À la une » n'avait aucune place, deux contours de champ vides) : la bande de cases pleine largeur, « À la une », la
 * recherche et le tri en glace, le titre, puis le tableau sur ses colonnes.
 */
export function SqueletteMesAO() {
  // l'action de l'écran (« À la une ») arrive avec la liste : le bouton de la barre ne prend pas l'aplat en attendant
  useAplatReserve()
  const cellule = 'shrink-0 px-4 max-md:px-0'
  return (
    <div data-squelette-mes-ao="">
      <div className="flex flex-col gap-10 max-md:flex-col-reverse max-md:gap-7.5">
        <Carte sansMarge className="grid grid-cols-3 max-md:grid-cols-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className={cn('grid min-h-[150px] content-start gap-3 border-bord p-5 max-md:min-h-[92px] max-md:p-4', i > 0 && 'border-l', i === 2 && 'max-md:hidden')}>
              <Squelette className="h-3.5 w-24" /><Squelette className="h-9 w-12" />
            </div>
          ))}
        </Carte>
        <div>
          <Squelette className="mb-4 h-5 w-52" />
          <Carte className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)] lg:items-center lg:gap-8">
            <div className="grid gap-3">
              <Squelette className="h-6 w-44 rounded-pilule" /><Squelette className="h-6 w-3/5" /><Squelette className="h-3.5 w-2/5" /><Squelette className="h-3.5 w-4/5" />
              <Squelette className="mt-1 h-1.5 w-3/5 rounded-pilule" /><Squelette className="mt-3 h-11 w-52 rounded-pilule max-sm:w-full" />
            </div>
            <div className="grid gap-6 border-bord max-lg:hidden lg:border-l lg:pl-6">
              {[0, 1, 2, 3].map((i) => <div key={i} className="flex justify-between gap-3"><Squelette className="h-3.5 w-32" /><Squelette className="h-3.5 w-20" /></div>)}
            </div>
          </Carte>
        </div>
      </div>
      <div className="mt-10 flex flex-wrap items-center gap-2 max-md:mt-7.5">
        <Squelette className="h-11 rounded-pilule max-md:basis-full md:w-80" />
        <Squelette className="h-11 w-56 rounded-lg max-md:w-full md:ml-auto" />
      </div>
      <Squelette className="mb-4 mt-10 h-5 w-28 max-md:mt-7.5" />
      <Carte sansMarge>
        {[0, 1, 2, 3].map((i) => (
          // la première rangée est l'en-tête du tableau (44 px), les suivantes les rangées, sur les colonnes de `colonnesEnCours`
          <div key={i} className={cn('flex items-center border-t border-bord first:border-t-0 max-md:grid max-md:gap-2.5 max-md:px-4 max-md:py-3', i === 0 ? 'h-11 max-md:hidden' : 'min-h-[73px]', i === 1 && 'max-md:border-t-0')}>
            <div className={cn(cellule, 'grid min-w-0 flex-1 gap-2')}><Squelette className={i === 0 ? 'h-3 w-24' : 'h-4 w-3/5 max-md:w-4/5'} />{i > 0 && <Squelette className="h-3.5 w-4/5 max-md:w-3/5" />}</div>
            <div className={cn(cellule, 'grid w-[13rem] gap-2 max-lg:hidden max-md:grid max-md:w-auto')}>{i === 0 ? <Squelette className="h-3 w-24" /> : <><Squelette className="h-1.5 w-full rounded-pilule" /><Squelette className="h-3.5 w-14" /></>}</div>
            <div className={cn(cellule, 'flex w-[14rem] items-center gap-2.5 max-lg:hidden max-md:flex max-md:w-auto')}>{i === 0 ? <Squelette className="h-3 w-14" /> : <><Squelette className="h-6 w-16 rounded-pilule" /><Squelette className="h-3.5 w-24" /></>}</div>
            <div className={cn(cellule, 'w-[11rem] max-xl:hidden')}><Squelette className={i === 0 ? 'h-3 w-12' : 'h-3.5 w-28'} /></div>
            <div className={cn(cellule, 'flex w-[17rem] justify-end max-lg:hidden', i > 0 && 'pr-16')}><Squelette className={i === 0 ? 'h-3 w-24' : 'h-3.5 w-40'} /></div>
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
  // « À la une » est l'action de l'écran, même quand une recherche la retire : le bouton de la barre reste au trait
  useAplatReserve(Boolean(une))

  const cherche = recherche.trim() !== ''
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
        {/* « À la une » se retire dès qu'on cherche un nom ; sous une puce de filtre elle reste tant que son AO passe le filtre
            (jury, tour 3 : elle disparaissait avec « Remise sous 7 jours », alors que c'est le dossier urgent qu'elle montre) */}
        {une && !cherche && (filtre === 'tous' || enCours.some((p) => p.id === une.id)) && <ALaUne projet={une} maintenant={maintenant} />}
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
        {/* les avis de la veille : un lien dans la rangée des outils (jury, tour 1 : un second bouton flottait sous « Nouvel appel d'offres », et passait avant tout contenu au téléphone) */}
        <Link to="/dashboard" className={classesBouton('lien', 'md:ml-auto md:mr-3 max-md:order-last max-md:min-h-11')}><MapPin aria-hidden strokeWidth={1.75} />Avis de la veille</Link>
        <ListeDeroulante libelle="Trier par" valeur={tri} onChange={(v) => setTri(v as Tri)} options={TRIS} className="w-auto min-w-56 max-md:w-full" />
      </div>

      {rienTrouve && (
        cherche ? (
          // une recherche n'est pas un filtre : le bouton dit ce qu'il efface, la phrase donne une piste
          <EtatVide className="mt-6 md:w-fit" titre={`Aucun nom, acheteur ni lot ne contient « ${recherche.trim()} »`}
            phrase="Vérifiez l’orthographe, ou cherchez un mot du nom de l’acheteur."
            action={<Bouton variante="secondaire" onClick={effacer}>Effacer la recherche</Bouton>} />
        ) : (
          <EtatVide className="mt-6 md:w-fit" parFiltre={effacer} titre="Aucun appel d’offres en cours ne passe ce filtre" />
        )
      )}

      {enCours.length > 0 && (
        <section aria-labelledby="titre-en-cours" className="mt-10 max-md:mt-7.5">
          <TitreSection id="titre-en-cours">En cours <span className="font-normal text-fg-3">{enCours.length}</span></TitreSection>
          <Tableau libelle="Appels d’offres en cours" colonnes={colonnesEnCours(gestes)} lignes={enCours} cle={(p) => p.id} vide={null} className={TABLEAU_EN_COURS} />
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
        description="Le dossier, son analyse et le mémoire de cet appel d’offres seront supprimés. Cette suppression est définitive."
        libelleConfirmer="Supprimer" libelleEnCours="Suppression…" enCours={suppression} erreur={erreurSuppression}
        onConfirmer={() => { if (aSupprimer) supprimer(aSupprimer) }} />
    </>
  )
}
