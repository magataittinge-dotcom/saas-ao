// Les rangées de Mes AO : les colonnes du tableau du système (components/ui/tableau.tsx), une rangée par AO, empilée au
// téléphone (aucune colonne perdue). L'état, le mot et le verbe de chaque AO viennent de `lectureAO` (lib/etatAO.ts) : une
// remise passée ne propose que « Mettre à jour le statut ». Les gestes rares (supprimer) sont dans le menu « … ».
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronRight, ExternalLink, HelpCircle, MapPin } from 'lucide-react'
import { Bouton, classesBouton } from '@/components/ui/bouton'
import { MenuElement, MenuPoints } from '@/components/ui/menu'
import type { ColonneTableau } from '@/components/ui/tableau'
import { lectureAO } from '@/lib/etatAO'
import { momentParis } from '@/lib/remiseParis'
import { usePrechargementAO } from '@/lib/prechargementAO'
import { acheteurCourt, avancementAffiche, enTraitement, filDeLAO, jourCourt, lierNumero, niveauRemise, quandCourt, texteUnites, versAvisOrigine } from '@/lib/mesAO'
import { cn } from '@/lib/utils'
import type { Project } from '@/types'
import { FilPoints, JaugeLecture, PastilleRemise } from './Etat'

export interface GestesAO {
  maintenant: Date
  /** Ouvre « Mettre à jour le statut » pour cet AO. */
  onStatut: (p: Project) => void
  onSupprimer?: (p: Project) => void
}

const libelleLecture = (p: Project): string =>
  p.processing_detail || (p.processing_status === 'generating' ? 'Synorix rédige le mémoire' : 'Synorix analyse le dossier')

/** L'AO : son nom (deux lignes au plus), l'acheteur en court et le lot, puis ce qui le distingue (questions, avis d'origine). */
export function CelluleAO({ projet, detail = true, large = false, sansLien = false }: { projet: Project; detail?: boolean; /** Tableau à trois colonnes : la colonne de l'AO est plus large. */ large?: boolean; /** La rangée entière est déjà le geste : le nom n'est pas un lien. */ sansLien?: boolean }) {
  const origine = detail ? versAvisOrigine(projet) : null
  const questions = detail ? projet.infos_marche?.points_a_eclaircir?.length ?? 0 : 0
  const acheteur = acheteurCourt(projet.maitre_ouvrage)
  const lot = projet.selected_lot_name
  const precharger = usePrechargementAO()
  return (
    <div data-ligne-ao={projet.id} className={cn('flex min-w-0 flex-col gap-1 py-1.5 max-md:py-0', large ? 'md:max-w-[34rem]' : 'md:max-w-[24rem]')}>
      {sansLien
        ? <span className="block break-words text-base font-semibold leading-snug text-fg"><span className="line-clamp-2">{lierNumero(projet.name)}</span></span>
        : <Link to={`/projects/${projet.id}`} {...precharger(projet)} className="block break-words text-base font-semibold leading-snug text-fg underline-offset-4 hover:underline max-md:-my-3 max-md:py-3 [@media(pointer:coarse)]:-my-3 [@media(pointer:coarse)]:py-3"><span className="line-clamp-2">{lierNumero(projet.name)}</span></Link>}
      {/* l'acheteur se coupe, le lot reste (jury, tour 1 : le lot, ce qui distingue les lignes, disparaissait) ; au téléphone la ligne passe à la ligne */}
      {(acheteur || lot) && (
        <span className="flex min-w-0 text-sm text-fg-2 max-md:flex-wrap max-md:gap-x-1">
          {/* jury, tour 3 : l'acheteur se lit d'abord (jusqu'à la moitié de la ligne), le lot prend le reste et se coupe par « … » */}
          {acheteur && <span className={cn('min-w-0 break-words max-md:line-clamp-1 md:truncate', lot && 'md:max-w-[55%] md:shrink-0')}>{acheteur}</span>}
          {acheteur && lot && <span aria-hidden className="shrink-0 max-md:hidden">&nbsp;·&nbsp;</span>}
          {lot && <span className="min-w-0 break-words max-md:line-clamp-1 md:truncate">{lot}</span>}
        </span>
      )}
      {/* un fait de la rangée, pas une alerte : une icône et un texte à l'ambre, sans fond (jury, tour 3 : 25 pastilles ambre par
          page, l'ambre ne signalait plus rien) ; la pastille reste dans « À la une » */}
      {questions > 0 && (
        <span className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-ambre-ink">
          <HelpCircle size={13} strokeWidth={2} aria-hidden className="shrink-0" />{questions}{'\u00a0'}question{questions > 1 ? 's' : ''} à poser à l’acheteur
        </span>
      )}
      {origine && (
        <a href={origine.url} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit max-w-full items-center gap-1.5 text-xs font-medium text-turquoise-ink underline-offset-4 hover:underline [@media(pointer:coarse)]:min-h-11">
          <MapPin size={13} aria-hidden className="shrink-0" />
          <span className="min-w-0 truncate">Trouvé par la veille{origine.id ? ` · avis ${origine.id}` : ''}</span>
          <ExternalLink size={11} aria-hidden className="shrink-0" /><span className="sr-only"> (s’ouvre dans un nouvel onglet)</span>
        </a>
      )}
    </div>
  )
}

function CelluleEtape({ projet }: { projet: Project }) {
  const { etape, total, nom } = avancementAffiche(projet)
  if (enTraitement(projet)) {
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <JaugeLecture pct={projet.processing_progress ?? 0} />
        <span className="text-sm text-fg-2">{libelleLecture(projet)}</span>
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <FilPoints fil={filDeLAO(projet)} className="max-w-[210px] max-md:max-w-none" />
      {/* le fil montre déjà où en est l'AO : le nom de l'étape seul, le rang est lu (jury, tour 3 : « étape 7 sur 7 » écrit 50 fois) */}
      <span className="whitespace-nowrap text-sm text-fg-2"><strong className="font-semibold text-fg">{nom}</strong><span className="sr-only"> · étape {etape} sur {total}</span></span>
    </div>
  )
}

function CelluleRemise({ projet, maintenant }: { projet: Project; maintenant: Date }) {
  const { echeance: e, etat } = lectureAO(projet, maintenant)
  const quand = quandCourt(projet)
  if (e.etat === 'sans_date') return <span className="text-sm text-fg-2">Date à préciser</span>
  if (etat === 'a_mettre_a_jour') {
    // la section s'appelle déjà « À mettre à jour » : la date seule, en texte (plus de pastille répétée sur chaque ligne)
    return e.limite ? <span className="whitespace-nowrap text-sm text-fg-2"><span className="md:hidden">Remise </span>le {jourCourt(e.limite)} {momentParis(e.limite).an}</span> : null
  }
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
      <PastilleRemise libelle={e.libelle} niveau={niveauRemise(projet, maintenant)}
        ariaLibelle={e.etat === 'aujourdhui' ? 'Remise aujourd’hui' : `Remise dans ${e.jours} jour${(e.jours ?? 0) > 1 ? 's' : ''}`} />
      {quand && <span className="whitespace-nowrap text-sm text-fg-2">{quand}</span>}
    </div>
  )
}

/** Le menu « … » d'une rangée : ouvrir l'AO, changer son statut, le supprimer. */
export function MenuAO({ projet, onStatut, onSupprimer }: { projet: Project } & Pick<GestesAO, 'onStatut' | 'onSupprimer'>) {
  const precharger = usePrechargementAO()
  return (
    <MenuPoints libelle={`Autres actions pour « ${projet.name} »`}>
      <MenuElement asChild><Link to={`/projects/${projet.id}`} {...precharger(projet)}>Ouvrir l’appel d’offres</Link></MenuElement>
      <MenuElement onSelect={() => onStatut(projet)}>Mettre à jour le statut</MenuElement>
      {onSupprimer && <MenuElement danger onSelect={() => onSupprimer(projet)}>Supprimer</MenuElement>}
    </MenuPoints>
  )
}

/** L'action d'une rangée : le verbe de `lectureAO`. En lecture : rien à faire, la phrase le dit. Remise passée : le dialogue. */
function CelluleAction({ projet, maintenant, onStatut, onSupprimer }: { projet: Project } & GestesAO) {
  const { action } = lectureAO(projet, maintenant)
  const precharger = usePrechargementAO()
  const lien = action.segment ? `/projects/${projet.id}/${action.segment}` : `/projects/${projet.id}`
  return (
    <div className="flex min-w-0 items-center justify-end gap-1 max-md:justify-between max-md:pt-1.5">
      {action.statut ? (
        <Bouton onClick={() => onStatut(projet)} className="max-md:flex-1">{action.verbe}</Bouton>
      ) : enTraitement(projet) ? (
        <span className="text-sm text-fg-2">Synorix s’en occupe</span>
      ) : (
        // un lien, pas un bouton : dans une liste, l'aplat et le trait restent à « À la une » (jury, tour 3 : un mur de 50 boutons)
        <Link to={lien} {...precharger(projet, lien)} className={classesBouton('lien', 'min-w-0 text-right max-md:min-h-11 max-md:text-left')}>
          <span className="min-w-0">{action.verbe}</span><ArrowRight aria-hidden strokeWidth={1.75} />
        </Link>
      )}
      <MenuAO projet={projet} onStatut={onStatut} onSupprimer={onSupprimer} />
    </div>
  )
}

/**
 * Le tableau « En cours » garde les mêmes colonnes quel que soit son contenu (jury, tour 3 : il se recalait d'un jeu de
 * données à l'autre, et la colonne « Remise », trop étroite, coupait l'heure) : à partir de 1 024 px, largeurs fixées ici,
 * la colonne de l'AO prend le reste. À passer en `className` du `<Tableau>`.
 */
export const TABLEAU_EN_COURS = 'lg:[&_table]:table-fixed'

/** Les colonnes d'un AO en cours : l'AO · où vous en êtes · la remise · les unités · la prochaine action. */
export function colonnesEnCours(g: GestesAO): ColonneTableau<Project>[] {
  return [
    { cle: 'ao', titre: 'Appel d’offres', rendu: (p) => <CelluleAO projet={p} />, classe: 'md:max-lg:w-[32%]' },
    { cle: 'etape', titre: 'Où vous en êtes', tel: true, rendu: (p) => <CelluleEtape projet={p} />, classe: 'lg:w-[13rem]' },
    { cle: 'remise', titre: 'Remise', tel: true, rendu: (p) => <CelluleRemise projet={p} maintenant={g.maintenant} />, classe: 'lg:w-[14rem]' },
    { cle: 'unites', titre: 'Unités', tel: true, classe: 'max-xl:hidden max-md:block xl:w-[11rem]',
      rendu: (p) => { const u = texteUnites(p.avancement); return u ? <span className="whitespace-nowrap text-sm text-fg-2">{u}</span> : <span className="text-fg-3 max-md:hidden">—</span> } },
    { cle: 'action', titre: 'Prochaine action', tel: true, nombre: true, rendu: (p) => <CelluleAction projet={p} {...g} />, classe: 'lg:w-[17rem]' },
  ]
}

/**
 * Les colonnes d'un AO à mettre à jour : l'AO · la date de sa remise · les autres gestes. La rangée entière ouvre « Mettre à
 * jour le statut » (`onLigne` du tableau) : ni pastille ni bouton répétés sur chaque ligne d'une section qui dit déjà l'état.
 */
export function colonnesAMettreAJour(g: GestesAO): ColonneTableau<Project>[] {
  return [
    { cle: 'ao', titre: 'Appel d’offres', rendu: (p) => <CelluleAO projet={p} detail={false} large sansLien />, classe: 'md:w-[62%]' },
    { cle: 'remise', titre: 'Remise', tel: true, rendu: (p) => <CelluleRemise projet={p} maintenant={g.maintenant} /> },
    { cle: 'action', titre: 'Autres actions', tel: true, nombre: true, classe: 'max-md:absolute max-md:right-2 max-md:top-2', rendu: (p) => (
      // le menu ne déclenche pas le geste de la rangée
      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <MenuAO projet={p} onStatut={g.onStatut} onSupprimer={g.onSupprimer} />
        <ChevronRight aria-hidden size={18} strokeWidth={1.75} className="shrink-0 text-fg-3 max-md:hidden" />
      </div>
    ) },
  ]
}
