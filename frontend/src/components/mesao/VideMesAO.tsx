import { lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useQuota } from '@/components/layout/QuotaGauge'
import ZoneDepotAO from '@/components/onboarding/ZoneDepotAO'

// Les avis de la veille (et leurs données) ne sont chargés que sur cet écran vide, à la demande.
const AvisPourVous = lazy(() => import('@/components/veille/AvisPourVous'))
import { Pastille } from './Etat'
import { VisagePetit } from './VisagePetit'

/** Vrai tant que l'AO d'essai offert à la création du compte (services/quota.py : plan « free », 1 analyse + 1 mémoire à vie) est intact. */
export function premierDossierOffert(plan: string | undefined, essaiAccorde: boolean | undefined, utilisees: number | undefined): boolean {
  return plan === 'free' && essaiAccorde !== false && utilisees === 0
}

/**
 * Mes AO sans aucun AO : jamais une page vide. La zone de dépôt (qui crée l'AO), l'accès à Mon entreprise, et trois avis de la
 * veille pour la zone enregistrée. « Votre premier dossier est offert » : seulement si l'essai offert existe encore pour ce compte.
 */
export function VideMesAO() {
  const { organization } = useAuthStore()
  const { data: quota } = useQuota()
  const offert = premierDossierOffert(organization?.plan, organization?.trial_granted, quota ? quota.analyses.used + quota.memoires.used : undefined)
  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-h5 text-fg">Mes appels d’offres</h1>
        <p className="mt-1.5 max-w-[62ch] text-sm text-fg-2">Votre premier dossier se prépare ici. Partez du dossier reçu de l’acheteur, ou d’un avis que la veille a trouvé pour vous.</p>
      </header>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5 rounded-[22px] border border-bord-2 bg-surface-0 p-5 sm:p-6">
          <ZoneDepotAO
            titre="Déposez le dossier de l’acheteur"
            precision="Le ZIP complet de préférence : Synorix reconnaît chaque pièce et chaque lot. PDF ou ZIP."
          />
          {offert && <Pastille ton="vert" className="self-start">Votre premier dossier est offert</Pastille>}
          <ol className="grid gap-3 text-[13.5px] text-fg-2 sm:grid-cols-3">
            {[
              ['Synorix lit le dossier', 'exigences, dates, critères, chacun avec sa source'],
              ['Vous décidez', 'on y va, ou pas, avec les points à vérifier'],
              ['Le mémoire s’écrit', 'à partir de ce que Synorix sait de votre entreprise'],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-2.5">
                <span aria-hidden className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-bleu-soft text-xs font-bold text-bleu-ink">{i + 1}</span>
                <span><strong className="font-semibold text-fg">{t}</strong><br />{d}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex min-w-0 flex-col gap-4 rounded-[22px] border border-bord-2 bg-surface-0 p-5 sm:p-6">
          <div className="flex items-center gap-4">
            <VisagePetit className="hidden size-[88px] shrink-0 sm:flex [&_img]:h-[132px] [&_img]:w-[88px]" />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[.08em] text-fg-3">Mon entreprise</p>
              <h2 className="mt-1 font-display text-h6 leading-tight text-fg">Plus Synorix vous connaît, plus le mémoire vous ressemble.</h2>
            </div>
          </div>
          <p className="text-sm text-fg-2">Identité, moyens et certifications : renseignés une fois, repris dans chaque mémoire.</p>
          <Link to="/company" className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-bord-2 px-4 text-sm font-semibold text-fg hover:bg-surface-1 max-sm:w-full">
            Compléter Mon entreprise<ArrowRight size={15} aria-hidden />
          </Link>
        </div>
      </section>

      <section aria-labelledby="veille-vide" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="veille-vide" className="font-display text-h6 text-fg">Trouvés par la veille pour vous</h2>
          <Link to="/dashboard" className="inline-flex min-h-11 items-center text-[13.5px] font-semibold text-accent-text hover:underline">Voir la carte des avis</Link>
        </div>
        <Suspense fallback={<p className="rounded-carte border border-bord-2 bg-surface-1 px-5 py-4 text-sm text-fg-2">Recherche des avis…</p>}>
          <AvisPourVous />
        </Suspense>
      </section>
    </div>
  )
}
