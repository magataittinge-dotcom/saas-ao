import { Link } from 'react-router-dom'
import { CircleHelp, Clock, FolderOpen } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { tonConsommation } from '@/components/layout/QuotaGauge'
import { uniteMois, type Niveau, type ResumeMesAO as Resume } from '@/lib/mesAO'
import type { TonEtat } from './Etat'
import { TON_TEXTE } from './Etat'

export type FiltreMesAO = 'tous' | 'urgent' | 'decider'

// Fond teinté de la carte, par ton (jetons `*-soft`) ; le titre prend l'encre du même ton.
const FOND: Record<TonEtat, string> = {
  bleu: 'bg-bleu-soft', vert: 'bg-vert-soft', ambre: 'bg-ambre-soft', rouge: 'bg-rouge-soft', turquoise: 'bg-turquoise-soft', gris: 'bg-gris-soft',
}
const TON_DU_NIVEAU: Record<Niveau, TonEtat> = { rouge: 'rouge', ambre: 'ambre', neutre: 'gris' }

function Carte({ ton, icone, titre, valeur, detail, actif, onClick }: {
  ton: TonEtat; icone: ReactNode; titre: string; valeur: ReactNode; detail: ReactNode; actif?: boolean; onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      data-carte-resume=""
      className={cn(
        'flex min-h-11 min-w-0 flex-col gap-1.5 rounded-carte border p-4 text-left transition-colors duration-base ease-lien sm:p-5',
        FOND[ton], actif ? 'border-bleu-mark shadow-[inset_0_0_0_1px_var(--bleu-mark)]' : 'border-transparent hover:border-bord-2',
      )}
    >
      <span className={cn('flex items-center gap-2 text-[13px] font-semibold', TON_TEXTE[ton])}>{icone}{titre}</span>
      <span className="font-display text-h5 leading-none tabular-nums text-fg">{valeur}</span>
      <span className="text-[13px] leading-snug text-fg-2">{detail}</span>
    </button>
  )
}

/**
 * Les quatre cartes de résumé : en cours, remise sous 7 jours, à décider, unités du mois. Les trois premières filtrent la liste
 * (un second appui retire le filtre) ; la quatrième mène à l'abonnement. La couleur la plus urgente gagne dans une carte.
 */
export function ResumeMesAOCartes({ resume, filtre, onFiltre, quota }: {
  resume: Resume
  filtre: FiltreMesAO
  onFiltre: (f: FiltreMesAO) => void
  quota: Parameters<typeof uniteMois>[0]
}) {
  const unites = uniteMois(quota)
  const bascule = (f: FiltreMesAO) => onFiltre(filtre === f ? 'tous' : f)
  const tonUnites: TonEtat = !unites || unites.illimite ? 'gris' : tonConsommation(unites.part)
  const ton7 = TON_DU_NIVEAU[resume.remise7.niveau]
  return (
    <section aria-label="Résumé" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <Carte
        ton="bleu" icone={<FolderOpen size={15} aria-hidden />} titre="En cours" valeur={resume.enCours} actif={filtre === 'tous'}
        onClick={() => onFiltre('tous')}
        detail={resume.enLecture > 0 ? `dont ${resume.enLecture} dossier${resume.enLecture > 1 ? 's' : ''} en cours de lecture` : 'appels d’offres à préparer'}
      />
      <Carte
        ton={ton7} icone={<Clock size={15} aria-hidden />} titre="Remise sous 7 jours" valeur={resume.remise7.n} actif={filtre === 'urgent'}
        onClick={() => bascule('urgent')}
        detail={resume.remise7.n === 0 ? 'Aucune remise cette semaine' : listeDates(resume.remise7.dates)}
      />
      <Carte
        ton="ambre" icone={<CircleHelp size={15} aria-hidden />} titre="À décider" valeur={resume.aDecider.n} actif={filtre === 'decider'}
        onClick={() => bascule('decider')}
        detail={resume.aDecider.premier ? <span className="line-clamp-3" title={resume.aDecider.premier.name}>{resume.aDecider.n > 1 ? `${resume.aDecider.n} dossiers : on y va ?` : `${resume.aDecider.premier.name} : on y va ?`}</span> : 'Aucune décision en attente'}
      />
      <Link
        to="/settings/billing"
        data-carte-resume=""
        className={cn('flex min-h-11 min-w-0 flex-col gap-1.5 rounded-carte border border-transparent p-4 transition-colors duration-base ease-lien hover:border-bord-2 sm:p-5', FOND.gris)}
      >
        <span className="text-[13px] font-semibold text-fg-2">Unités du mois</span>
        {unites ? (
          <>
            <span className="font-display text-h5 leading-none tabular-nums text-fg">
              {unites.utilisees}{unites.total !== null && <span className="ml-1.5 text-base font-medium text-fg-3"> sur {unites.total}</span>}
            </span>
            {unites.total !== null && (
              <span role="progressbar" aria-label="Unités consommées" aria-valuemin={0} aria-valuemax={unites.total} aria-valuenow={unites.utilisees} className="block h-1.5 overflow-hidden rounded-full bg-gris-mark/40">
                <span className={cn('block h-full rounded-full', tonUnites === 'rouge' ? 'bg-rouge-mark' : tonUnites === 'ambre' ? 'bg-ambre-mark' : 'bg-vert-mark')} style={{ width: `${Math.max(2, unites.part * 100)}%` }} />
              </span>
            )}
            <span className="text-[13px] leading-snug text-fg-2">
              {unites.illimite
                ? 'Offre sans plafond, dans un usage raisonnable'
                : <><strong className={cn('font-semibold', TON_TEXTE[tonUnites])}>{unites.restantes} restantes</strong>{tonUnites === 'rouge' ? ' · plafond proche' : tonUnites === 'ambre' ? ' · à surveiller' : ''}</>}
            </span>
          </>
        ) : (
          <span className="text-[13px] text-fg-3">Lecture en cours…</span>
        )}
      </Link>
    </section>
  )
}

function listeDates(dates: string[]): string {
  if (dates.length <= 2) return dates.join(' et ')
  return `${dates.slice(0, -1).join(', ')} et ${dates[dates.length - 1]}`
}
