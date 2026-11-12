import { lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useQuota } from '@/components/layout/QuotaGauge'
import ZoneDepotAO from '@/components/onboarding/ZoneDepotAO'
import { FilSeptEtapes, PARTAGE_DES_ROLES } from '@/components/onboarding/FilSeptEtapes'
import { Page, TitreSection } from '@/components/ui/page'
import { Carte } from '@/components/ui/carte'
import { classesBouton } from '@/components/ui/bouton'
import { PastilleEtat } from '@/components/ui/pastille'
import { SynorixParle } from '@/components/ui/synorix-parle'
import { Squelette } from '@/components/ui/squelette'

// Les avis de la veille (et leurs données) ne sont chargés que sur cet écran vide, à la demande.
const AvisPourVous = lazy(() => import('@/components/veille/AvisPourVous'))

/** Vrai tant que l'AO d'essai offert à la création du compte (services/quota.py : plan « free », 1 analyse + 1 mémoire à vie) est intact. */
export function premierDossierOffert(plan: string | undefined, essaiAccorde: boolean | undefined, utilisees: number | undefined): boolean {
  return plan === 'free' && essaiAccorde !== false && utilisees === 0
}

/**
 * Mes AO sans aucun AO (P20) : ce qui apparaîtra ici, comment, et un seul geste : déposer le dossier de l'acheteur. À côté,
 * Synorix dit le partage des rôles et les sept étapes (A6), et l'accès à Mon entreprise. Dessous, les avis de la veille pour
 * la zone enregistrée. « Votre premier dossier est offert » : seulement si l'essai offert existe encore pour ce compte.
 */
export function VideMesAO() {
  const { organization } = useAuthStore()
  const { data: quota } = useQuota()
  const offert = premierDossierOffert(organization?.plan, organization?.trial_granted, quota ? quota.analyses.used + quota.memoires.used : undefined)
  return (
    <Page titre="Mes appels d’offres"
      sousTitre="Votre premier dossier se prépare ici. Partez du dossier reçu de l’acheteur, ou d’un avis que la veille a trouvé pour vous.">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <ZoneDepotAO geste
            titre="Déposez le dossier de l’acheteur"
            precision="Le ZIP complet de préférence : Synorix reconnaît chaque pièce et chaque lot. PDF ou ZIP." />
          {offert && <PastilleEtat sens="vert" className="mt-4">Votre premier dossier est offert</PastilleEtat>}
        </div>

        <Carte className="flex min-w-0 flex-col">
          <SynorixParle>{PARTAGE_DES_ROLES}</SynorixParle>
          <FilSeptEtapes className="mt-6" />
          <div className="mt-6 border-t border-bord pt-5">
            <h2 className="text-lg font-semibold text-fg">Mon entreprise</h2>
            <p className="mt-1.5 text-sm text-fg-2">Identité, moyens et certifications : renseignés une fois, repris dans chaque mémoire.</p>
          </div>
          <Link to="/company" className={classesBouton('secondaire', 'mt-5 self-start max-sm:w-full')}>
            Compléter Mon entreprise<ArrowRight aria-hidden strokeWidth={1.75} />
          </Link>
        </Carte>
      </div>

      <TitreSection id="veille-vide" action={<Link to="/dashboard" className={classesBouton('lien')}>Voir la carte des avis</Link>}>
        Trouvés par la veille pour vous
      </TitreSection>
      <section aria-labelledby="veille-vide">
        <Suspense fallback={<Squelette className="h-24 w-full" />}>
          <AvisPourVous />
        </Suspense>
      </section>
    </Page>
  )
}
