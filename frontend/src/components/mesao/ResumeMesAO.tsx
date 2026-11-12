import { Link } from 'react-router-dom'
import { classesBouton } from '@/components/ui/bouton'
import { BandeCases, CaseResume } from '@/components/ui/case-resume'
import type { ComptesAO } from '@/lib/etatAO'
import { uniteMois, type ResumeMesAO as Resume } from '@/lib/mesAO'

export type FiltreMesAO = 'tous' | 'urgent' | 'decider'

/**
 * La bande de résumé de Mes AO : une surface, quatre cases du système (étiquette en haut, gros chiffre seul ; rien à compter :
 * « Aucun » ou « Aucune », jamais un gros « 0 » ni l'étiquette redite). Les comptes sont ceux de `comptesAO` (lib/etatAO.ts) :
 * les mêmes que sur l'Accueil, dans la barre et dans Ctrl K. Les cases ne filtrent pas : les filtres sont des puces, au-dessus
 * de la liste.
 */
export function ResumeMesAOCartes({ comptes, resume, quota }: {
  comptes: ComptesAO
  resume: Resume
  quota: Parameters<typeof uniteMois>[0]
}) {
  const unites = uniteMois(quota)
  const lectures = resume.enLecture > 0 ? `dont ${resume.enLecture} dossier${resume.enLecture > 1 ? 's' : ''} en cours d’analyse` : undefined
  // rien en cours, aucune remise proche : une ligne de faits suffit (jury, tour 1 : des cases « Aucun » plus hautes que la liste)
  if (comptes.enCours === 0 && resume.remise7.n === 0) {
    return (
      <div role="group" aria-label="Résumé de mes appels d’offres" data-resume-ligne="" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-2">
        <span>Aucun appel d’offres en cours</span>
        {unites && (
          <>
            <span aria-hidden>·</span>
            <span>Unités du mois{'\u00a0'}: <strong className="font-semibold text-fg">{unites.utilisees} sur {unites.total}</strong></span>
            <span aria-hidden>·</span>
            <Link to="/settings/billing" className={classesBouton('lien', '[@media(pointer:coarse)]:min-h-11')}>Voir l’abonnement</Link>
          </>
        )}
      </div>
    )
  }
  return (
    <BandeCases libelle="Résumé de mes appels d’offres">
      <CaseResume etiquette="En cours" valeur={comptes.enCours} precision={lectures} />
      <CaseResume etiquette="Remise sous 7 jours" valeur={resume.remise7.n} rien="Aucune" precision={resume.remise7.n > 0 ? listeDates(resume.remise7.dates) : undefined} />
      {/* les unités : la case n'apparaît qu'une fois le quota lu (jamais « Aucune » pendant la lecture) */}
      {unites && (
        <CaseResume etiquette="Unités du mois"
          valeur={unites.utilisees}
          unite={`sur ${unites.total}`}
          rien="Aucune"
          precision={unites.utilisees === 0 ? `${unites.total} disponibles ce mois-ci` : `${unites.restantes} restantes`}
          action={<Link to="/settings/billing" className={classesBouton('lien')}>Voir l’abonnement</Link>} />
      )}
    </BandeCases>
  )
}

function listeDates(dates: string[]): string {
  if (dates.length <= 2) return dates.join(' et ')
  return `${dates.slice(0, -1).join(', ')} et ${dates[dates.length - 1]}`
}
