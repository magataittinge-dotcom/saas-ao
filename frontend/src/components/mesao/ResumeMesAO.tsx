import { Link } from 'react-router-dom'
import { CircleHelp, Clock, FolderOpen } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { tonConsommation } from '@/components/layout/QuotaGauge'
import { uniteMois, type Niveau, type ResumeMesAO as Resume } from '@/lib/mesAO'
import type { TonEtat } from './Etat'
import { TON_TEXTE } from './Etat'

export type FiltreMesAO = 'tous' | 'urgent' | 'decider'

const TON_DU_NIVEAU: Record<Niveau, TonEtat> = { rouge: 'rouge', ambre: 'ambre', neutre: 'gris' }
const POINT: Record<TonEtat, string> = {
  bleu: 'bg-bleu-mark', vert: 'bg-vert-mark', ambre: 'bg-ambre-mark', rouge: 'bg-rouge-mark', turquoise: 'bg-turquoise-mark', gris: 'bg-gris-mark',
}

// Une case de la rangée de faits : le point et le mot portent la couleur (COULEURS.md), le reste est à l'encre. Un gros chiffre
// tabulaire seulement quand il y a quelque chose à compter ; sinon une phrase (DESIGN.md : jamais de gros « 0 »).
const CASE = 'flex min-h-11 min-w-0 flex-col gap-2 border-bord p-4 text-left transition-colors duration-base ease-lien sm:p-5'

function Titre({ ton, icone, children }: { ton: TonEtat; icone: ReactNode; children: ReactNode }) {
  return (
    <span className={cn('flex items-center gap-2 text-[13.5px] font-semibold', TON_TEXTE[ton])}>
      <span aria-hidden className={cn('size-2 shrink-0 rounded-full', POINT[ton])} />{icone}{children}
    </span>
  )
}

function Fait({ ton, icone, titre, n, unite, phrase, detail, actif, onClick }: {
  ton: TonEtat; icone: ReactNode; titre: string; n: number; unite?: string; phrase: string; detail?: ReactNode; actif?: boolean; onClick?: () => void
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={actif} data-carte-resume=""
      className={cn(CASE, actif ? 'bg-surface-1 shadow-[inset_0_-2px_0_var(--accent-ui)]' : 'hover:bg-surface-1')}>
      <Titre ton={ton} icone={icone}>{titre}</Titre>
      {n > 0 ? (
        <>
          <span className="flex items-baseline gap-2"><span className="chiffre-grand">{n}</span>{unite && <span className="text-[15px] font-semibold text-fg-2">{unite}</span>}</span>
          {detail && <span className="text-[13.5px] leading-snug text-fg-2">{detail}</span>}
        </>
      ) : (
        <span className="text-[15px] leading-snug text-fg-2">{phrase}</span>
      )}
    </button>
  )
}

/**
 * La rangée de faits de Mes AO (refonte groupe A, direction B) : une seule surface découpée par des filets, la première case plus
 * large. En cours, remise sous 7 jours et à décider filtrent la liste (un second appui retire le filtre, `aria-pressed`) ; les
 * unités du mois mènent à l'abonnement. La couleur ne tient que sur le point et le mot ; la plus urgente gagne dans une case.
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
    <section aria-label="Résumé" data-resume-surface=""
      className="grid grid-cols-1 overflow-hidden rounded-carte border border-bord bg-surface-0 shadow-card sm:grid-cols-2 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] [&>*+*]:border-t sm:[&>*:nth-child(2)]:border-t-0 sm:[&>*:nth-child(2n)]:border-l lg:[&>*+*]:border-l lg:[&>*+*]:border-t-0">
      <Fait ton="bleu" icone={<FolderOpen size={15} aria-hidden />} titre="En cours" n={resume.enCours} unite="en cours" actif={filtre === 'tous'}
        onClick={() => onFiltre('tous')} phrase="Vos appels d’offres en cours apparaîtront ici."
        detail={resume.enLecture > 0 ? `dont ${resume.enLecture} dossier${resume.enLecture > 1 ? 's' : ''} en cours de lecture` : null} />
      <Fait ton={resume.remise7.n > 0 ? ton7 : 'gris'} icone={<Clock size={15} aria-hidden />} titre="Remise sous 7 jours" n={resume.remise7.n} actif={filtre === 'urgent'}
        onClick={() => bascule('urgent')} phrase="Aucune remise sous 7 jours" detail={listeDates(resume.remise7.dates)} />
      <Fait ton={resume.aDecider.n > 0 ? 'ambre' : 'gris'} icone={<CircleHelp size={15} aria-hidden />} titre="À décider" n={resume.aDecider.n} actif={filtre === 'decider'}
        onClick={() => bascule('decider')} phrase="Rien à décider"
        detail={resume.aDecider.premier ? <span className="line-clamp-2" title={resume.aDecider.premier.name}>{resume.aDecider.n > 1 ? `${resume.aDecider.n} dossiers : on y va ?` : `${resume.aDecider.premier.name} : on y va ?`}</span> : null} />
      <Link to="/settings/billing" data-carte-resume="" className={cn(CASE, 'hover:bg-surface-1')}>
        <Titre ton={tonUnites} icone={null}>Unités du mois</Titre>
        {!unites ? (
          <span className="text-[13.5px] text-fg-3">Lecture en cours…</span>
        ) : unites.illimite ? (
          <span className="text-[15px] leading-snug text-fg-2">Illimité en usage raisonnable</span>
        ) : unites.utilisees === 0 ? (
          <span className="text-[15px] leading-snug text-fg-2">{unites.total} unités disponibles ce mois-ci</span>
        ) : (
          <>
            <span className="flex items-baseline gap-2"><span className="chiffre-grand">{unites.utilisees}</span><span className="chiffres text-[15px] font-semibold text-fg-2">sur {unites.total}</span></span>
            {unites.total !== null && (
              <span role="progressbar" aria-label="Unités consommées" aria-valuemin={0} aria-valuemax={unites.total} aria-valuenow={unites.utilisees} className="block h-1.5 overflow-hidden rounded-full bg-gris-soft">
                <span className={cn('block h-full rounded-full', tonUnites === 'rouge' ? 'bg-rouge-mark' : tonUnites === 'ambre' ? 'bg-ambre-mark' : 'bg-vert-mark')} style={{ width: `${Math.max(2, unites.part * 100)}%` }} />
              </span>
            )}
            <span className="text-[13.5px] leading-snug text-fg-2">
              <strong className={cn('font-semibold', TON_TEXTE[tonUnites])}>{unites.restantes} restantes</strong>{tonUnites === 'rouge' ? ' · plafond proche' : tonUnites === 'ambre' ? ' · à surveiller' : ''}
            </span>
          </>
        )}
      </Link>
    </section>
  )
}

function listeDates(dates: string[]): string {
  if (dates.length <= 2) return dates.join(' et ')
  return `${dates.slice(0, -1).join(', ')} et ${dates[dates.length - 1]}`
}
