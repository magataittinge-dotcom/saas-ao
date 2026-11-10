// Les rangées de Mes AO : les colonnes du tableau du système (components/ui/tableau.tsx), une rangée par AO, empilée au
// téléphone (aucune colonne perdue). L'état, le mot et le verbe de chaque AO viennent de `lectureAO` (lib/etatAO.ts) : une
// remise passée ne propose que « Mettre à jour le statut ». Les gestes rares (supprimer) sont dans le menu « … ».
import { Link } from 'react-router-dom'
import { ArrowRight, ExternalLink, HelpCircle, MapPin } from 'lucide-react'
import { Bouton, classesBouton } from '@/components/ui/bouton'
import { MenuElement, MenuPoints } from '@/components/ui/menu'
import { PastilleEtat } from '@/components/ui/pastille'
import type { ColonneTableau } from '@/components/ui/tableau'
import { lectureAO } from '@/lib/etatAO'
import { acheteurCourt, avancementAffiche, enTraitement, filDeLAO, jourCourt, niveauRemise, quandCourt, texteUnites, versAvisOrigine } from '@/lib/mesAO'
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
  p.processing_detail || (p.processing_status === 'generating' ? 'Synorix rédige le mémoire' : 'Synorix lit le dossier')

/** L'AO : son nom (deux lignes au plus), l'acheteur en court et le lot, puis ce qui le distingue (questions, avis d'origine). */
export function CelluleAO({ projet, detail = true, large = false }: { projet: Project; detail?: boolean; /** Tableau à trois colonnes : la colonne de l'AO est plus large. */ large?: boolean }) {
  const origine = detail ? versAvisOrigine(projet) : null
  const questions = detail ? projet.infos_marche?.points_a_eclaircir?.length ?? 0 : 0
  const complement = [acheteurCourt(projet.maitre_ouvrage), projet.selected_lot_name].filter(Boolean).join(' · ')
  return (
    <div data-ligne-ao={projet.id} className={cn('flex min-w-0 flex-col gap-1 py-1.5 max-md:py-0', large ? 'md:max-w-[34rem]' : 'md:max-w-[24rem]')}>
      <Link to={`/projects/${projet.id}`} className="line-clamp-2 break-words text-base font-semibold leading-snug text-fg underline-offset-4 hover:underline">{projet.name}</Link>
      {complement && <span className="truncate text-sm text-fg-2">{complement}</span>}
      {questions > 0 && <PastilleEtat sens="ambre" icone={HelpCircle} className="w-fit">{questions} question{questions > 1 ? 's' : ''} à poser à l’acheteur</PastilleEtat>}
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
      <FilPoints fil={filDeLAO(projet)} className="max-w-[210px]" />
      <span className="text-sm text-fg-2"><strong className="font-semibold text-fg">{nom}</strong> · étape {etape} sur {total}</span>
    </div>
  )
}

function CelluleRemise({ projet, maintenant }: { projet: Project; maintenant: Date }) {
  const { echeance: e, etat } = lectureAO(projet, maintenant)
  const quand = quandCourt(projet)
  if (e.etat === 'sans_date') return <span className="text-sm text-fg-2">Date à préciser</span>
  if (etat === 'a_mettre_a_jour') {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
        <PastilleRemise libelle="Remise passée" niveau="ambre" passee />
        {e.limite && <span className="chiffres text-sm text-fg-2">le {jourCourt(e.limite)} {e.limite.getFullYear()}</span>}
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
      <PastilleRemise libelle={e.libelle} niveau={niveauRemise(projet, maintenant)}
        ariaLibelle={e.etat === 'aujourdhui' ? 'Remise aujourd’hui' : `Remise dans ${e.jours} jour${(e.jours ?? 0) > 1 ? 's' : ''}`} />
      {quand && <span className="chiffres text-sm text-fg-2">{quand}</span>}
    </div>
  )
}

/** Le menu « … » d'une rangée : ouvrir l'AO, changer son statut, le supprimer. */
export function MenuAO({ projet, onStatut, onSupprimer }: { projet: Project } & Pick<GestesAO, 'onStatut' | 'onSupprimer'>) {
  return (
    <MenuPoints libelle={`Autres actions pour « ${projet.name} »`}>
      <MenuElement asChild><Link to={`/projects/${projet.id}`}>Ouvrir l’appel d’offres</Link></MenuElement>
      <MenuElement onSelect={() => onStatut(projet)}>Mettre à jour le statut</MenuElement>
      {onSupprimer && <MenuElement danger onSelect={() => onSupprimer(projet)}>Supprimer</MenuElement>}
    </MenuPoints>
  )
}

/** L'action d'une rangée : le verbe de `lectureAO`. En lecture : rien à faire, la phrase le dit. Remise passée : le dialogue. */
function CelluleAction({ projet, maintenant, onStatut, onSupprimer }: { projet: Project } & GestesAO) {
  const { action } = lectureAO(projet, maintenant)
  return (
    <div className="flex min-w-0 items-center justify-end gap-1 max-md:justify-between max-md:pt-1.5">
      {action.statut ? (
        <Bouton onClick={() => onStatut(projet)} className="max-md:flex-1">{action.verbe}</Bouton>
      ) : enTraitement(projet) ? (
        <span className="text-sm text-fg-2">Synorix s’en occupe</span>
      ) : (
        <Link to={action.segment ? `/projects/${projet.id}/${action.segment}` : `/projects/${projet.id}`} className={classesBouton('secondaire', 'max-md:flex-1')}>
          {action.verbe}<ArrowRight aria-hidden strokeWidth={1.75} />
        </Link>
      )}
      <MenuAO projet={projet} onStatut={onStatut} onSupprimer={onSupprimer} />
    </div>
  )
}

/** Les colonnes d'un AO en cours : l'AO · où vous en êtes · la remise · les unités · la prochaine action. */
export function colonnesEnCours(g: GestesAO): ColonneTableau<Project>[] {
  return [
    { cle: 'ao', titre: 'Appel d’offres', rendu: (p) => <CelluleAO projet={p} />, classe: 'md:w-[32%]' },
    { cle: 'etape', titre: 'Où vous en êtes', tel: true, rendu: (p) => <CelluleEtape projet={p} /> },
    { cle: 'remise', titre: 'Remise', tel: true, rendu: (p) => <CelluleRemise projet={p} maintenant={g.maintenant} /> },
    { cle: 'unites', titre: 'Unités', tel: true, classe: 'max-lg:hidden max-md:block',
      rendu: (p) => { const u = texteUnites(p.avancement); return u ? <span className="text-sm text-fg-2">{u}</span> : <span className="text-fg-3 max-md:hidden">—</span> } },
    { cle: 'action', titre: 'Prochaine action', tel: true, nombre: true, rendu: (p) => <CelluleAction projet={p} {...g} /> },
  ]
}

/** Les colonnes d'un AO à mettre à jour : l'AO · sa remise passée · la seule action, « Mettre à jour le statut ». */
export function colonnesAMettreAJour(g: GestesAO): ColonneTableau<Project>[] {
  return [
    { cle: 'ao', titre: 'Appel d’offres', rendu: (p) => <CelluleAO projet={p} detail={false} large />, classe: 'md:w-[48%]' },
    { cle: 'remise', titre: 'Remise', tel: true, rendu: (p) => <CelluleRemise projet={p} maintenant={g.maintenant} /> },
    { cle: 'action', titre: 'Action', tel: true, nombre: true, rendu: (p) => <CelluleAction projet={p} {...g} /> },
  ]
}
